import { useState, useEffect, useMemo, useRef } from 'react'
import { FileEntry } from '../data/mockData'
import { FilePath } from './FilePath'
import { FileContextMenu, type FileMenuAction } from './FileContextMenu'
import { fileExtension } from '../utils/fileExtension'
import { ConfirmModal } from './modals/ConfirmModal'

interface Props {
  onSelDiffFile: (f: FileEntry, staged: boolean) => void
  unstaged?: FileEntry[]
  staged?: FileEntry[]
  repoPath?: string | null      // 실제 IPC 호출에 사용
  onCommitDone?: () => void     // 커밋/amend 완료 후 콜백 ('Committed' 토스트 포함)
  // 컨텍스트 메뉴의 워킹트리 변경(discard/ignore) 후 git 상태만 갱신하는 콜백.
  // onCommitDone과 달리 'Committed' 토스트를 띄우지 않는다. 액션별 토스트는 액션 인자로 전달.
  onTreeChanged?: (toast?: { cls: 'success' | 'error' | 'warning'; title: string; msg: string }) => void | Promise<void>
  // 컨텍스트 메뉴 '파일 히스토리' — App이 파일 이력 모달을 띄운다.
  onFileHistory?: (filePath: string) => void
}

// 한 파일 = 한 행. 같은 path가 unstaged·staged 양쪽에 있으면 부분 스테이지(partial).
type StageState = 'unstaged' | 'staged' | 'partial'

interface MergedRow {
  p: string
  s: 'M' | 'A' | 'D'   // 상태 글리프(부분이면 working 기준)
  a: number            // 추가 라인(부분이면 working 기준)
  d: number            // 삭제 라인(부분이면 working 기준)
  state: StageState
  /** working-tree 쪽 엔트리 (미스테이지/부분일 때 존재) — diff·stage 대상 */
  unstagedEntry?: FileEntry
  /** index 쪽 엔트리 (스테이지/부분일 때 존재) — staged diff·unstage 대상 */
  stagedEntry?: FileEntry
}

// unstaged + staged를 path 기준으로 병합해 단일 행 목록을 만든다.
// - unstaged만 → 'unstaged', staged만 → 'staged', 둘 다 → 'partial'.
// - 표시용 s/a/d는 working(unstaged) 우선, 없으면 staged.
// - path 안정 정렬(상태 무관 한 목록).
function mergeRows(unstaged: FileEntry[], staged: FileEntry[]): MergedRow[] {
  const byPath = new Map<string, MergedRow>()

  const ensure = (p: string): MergedRow => {
    let row = byPath.get(p)
    if (!row) {
      row = { p, s: 'M', a: 0, d: 0, state: 'unstaged' }
      byPath.set(p, row)
    }
    return row
  }

  for (const f of staged) {
    const row = ensure(f.p)
    row.stagedEntry = f
    row.s = f.s; row.a = f.a; row.d = f.d
    row.state = 'staged'
  }
  for (const f of unstaged) {
    const row = ensure(f.p)
    row.unstagedEntry = f
    // working 기준 표시를 우선한다.
    row.s = f.s; row.a = f.a; row.d = f.d
    row.state = row.stagedEntry ? 'partial' : 'unstaged'
  }

  return [...byPath.values()].sort((a, b) => a.p.localeCompare(b.p))
}

// 행 → diff 표시에 쓸 (FileEntry, staged) 계약. App.onSelDiffFile 시그니처 유지.
// 미스테이지/부분 → 작업트리(staged=false), 스테이지만 → staged(true).
function diffTargetOf(row: MergedRow): { file: FileEntry; staged: boolean } {
  if (row.state === 'staged') return { file: row.stagedEntry as FileEntry, staged: true }
  return { file: (row.unstagedEntry ?? row.stagedEntry) as FileEntry, staged: false }
}

export function StageArea({ onSelDiffFile, unstaged: unstagedProp, staged: stagedProp, repoPath, onCommitDone, onTreeChanged, onFileHistory }: Props) {
  // controlled: props(unstaged/staged)를 단일 소스로 소비하되, stage/unstage 클릭은
  // 즉시 반영(낙관적)을 위해 로컬 state에 담는다. 이후 props가 바뀌면(=loadRepo 확정
  // 결과 도착) 그 값으로 재동기화 → 낙관 → 서버확정 순서가 자연스럽게 이어진다.
  // 포커스 복귀·커밋·머지/리베이스 등 모든 loadRepo 후 prop 변경이 화면에 반영됨.
  const [unstaged, setUnstaged] = useState<FileEntry[]>(unstagedProp ?? [])
  const [staged, setStaged] = useState<FileEntry[]>(stagedProp ?? [])
  const [selPath, setSelPath] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [committing, setCommitting] = useState(false)

  // 우클릭 컨텍스트 메뉴 (한 번에 하나) + discard 확인 모달
  const [menu, setMenu] = useState<{ x: number; y: number; file: FileEntry } | null>(null)
  const [discardTarget, setDiscardTarget] = useState<FileEntry | null>(null)

  // prop이 바뀌면(authoritative loadRepo 결과) 로컬 state를 동기화한다.
  useEffect(() => { setUnstaged(unstagedProp ?? []) }, [unstagedProp])
  useEffect(() => { setStaged(stagedProp ?? []) }, [stagedProp])

  const rows = useMemo(() => mergeRows(unstaged, staged), [unstaged, staged])

  // 커밋 카운트 = 스테이지된 파일 수(완전 스테이지 + 부분). 병합 모델 기준.
  const stagedCount = useMemo(
    () => rows.filter(r => r.state === 'staged' || r.state === 'partial').length,
    [rows],
  )
  // 전체 토글(master) 상태: 모두 스테이지면 checked, 하나도 없으면 unchecked, 섞이면 indeterminate.
  const allState: StageState =
    stagedCount === 0 ? 'unstaged'
      : stagedCount === rows.length && rows.every(r => r.state === 'staged') ? 'staged'
        : 'partial'

  const openMenu = (e: React.MouseEvent, f: FileEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, file: f })
  }

  const absPath = (f: FileEntry) => `${repoPath ?? ''}/${f.p}`

  const handleMenuAction = async (action: FileMenuAction, f: FileEntry) => {
    switch (action) {
      case 'discard':
        // 파괴적 → ConfirmModal로 확인
        setDiscardTarget(f)
        break
      case 'ignore-file':
        if (!repoPath) return
        try {
          await window.gitAPI?.addToGitignore(repoPath, [f.p])
          // 이미 추적 중인 파일은 .gitignore만으로 status에서 사라지지 않으므로 추적 해제까지 한다.
          await window.gitAPI?.untrack(repoPath, [f.p])
          await onTreeChanged?.({ cls: 'success', title: '무시 추가', msg: '.gitignore에 추가했어요' })
        } catch (e) { console.error('addToGitignore failed:', e) }
        break
      case 'ignore-ext': {
        if (!repoPath) return
        const ext = fileExtension(f.p)
        if (!ext) return
        try {
          await window.gitAPI?.addToGitignore(repoPath, ['*.' + ext])
          // 우클릭한 파일이 추적 중이면 추적 해제해 status에서 실제로 빠지게 한다.
          await window.gitAPI?.untrack(repoPath, [f.p])
          await onTreeChanged?.({ cls: 'success', title: '무시 추가', msg: '.gitignore에 추가했어요' })
        } catch (e) { console.error('addToGitignore failed:', e) }
        break
      }
      case 'copy-abs-path':
        try { await navigator.clipboard.writeText(absPath(f)) }
        catch (e) { console.error('clipboard write failed:', e) }
        break
      case 'copy-rel-path':
        try { await navigator.clipboard.writeText(f.p) }
        catch (e) { console.error('clipboard write failed:', e) }
        break
      case 'reveal':
        try { await window.gitAPI?.revealInFinder(absPath(f)) }
        catch (e) { console.error('revealInFinder failed:', e) }
        break
      case 'open-default':
        try {
          const r = await window.gitAPI?.openPath(absPath(f))
          if (r && !r.ok) console.warn('openPath failed:', r.error)
        } catch (e) { console.error('openPath failed:', e) }
        break
      case 'file-history':
        onFileHistory?.(f.p)
        break
    }
  }

  const confirmDiscard = async () => {
    const f = discardTarget
    setDiscardTarget(null)
    if (!f || !repoPath) return
    try {
      await window.gitAPI?.discardChanges(repoPath, [f.p])
      await onTreeChanged?.({ cls: 'success', title: '되돌림', msg: '변경사항을 되돌렸어요' })
    } catch (e) { console.error('discardChanges failed:', e) }
  }

  // 한 파일 전체 스테이지(미스테이지·부분 모두 working 변경을 index로 올림).
  const stageRow = async (row: MergedRow) => {
    if (repoPath) {
      try {
        await window.gitAPI?.stage(repoPath, [row.p])
      } catch (e) {
        console.error('stage failed:', e)
        return
      }
    }
    // working 엔트리를 staged로 합치고, 부분이면 기존 staged 엔트리는 그대로 둔다.
    setUnstaged(p => p.filter(x => x.p !== row.p))
    setStaged(p => {
      const next = p.filter(x => x.p !== row.p)
      const merged = row.unstagedEntry ?? row.stagedEntry
      if (merged) next.push(merged)
      return next
    })
    const t = row.unstagedEntry ?? row.stagedEntry
    if (t) onSelDiffFile(t, true)
  }

  // 한 파일 전체 언스테이지(index 변경을 working으로 내림).
  const unstageRow = async (row: MergedRow) => {
    if (repoPath) {
      try {
        await window.gitAPI?.unstage(repoPath, [row.p])
      } catch (e) {
        console.error('unstage failed:', e)
        return
      }
    }
    setStaged(p => p.filter(x => x.p !== row.p))
    setUnstaged(p => {
      const next = p.filter(x => x.p !== row.p)
      const merged = row.stagedEntry ?? row.unstagedEntry
      if (merged) next.push(merged)
      return next
    })
    const t = row.stagedEntry ?? row.unstagedEntry
    if (t) onSelDiffFile(t, false)
  }

  // 3상태 체크박스 토글:
  //  - 미스테이지 → stage(전체) → 체크
  //  - 부분 → stage(나머지까지) → 완전 스테이지(한 행으로 합쳐짐)
  //  - 스테이지됨 → unstage → 해제
  const toggleRow = (row: MergedRow) => {
    if (row.state === 'staged') unstageRow(row)
    else stageRow(row)
  }

  const stageAll = async () => {
    if (repoPath && unstaged.length > 0) {
      try {
        await window.gitAPI?.stage(repoPath, unstaged.map(f => f.p))
      } catch (e) {
        console.error('stage all failed:', e)
        return
      }
    }
    // path 기준 병합: working 변경을 모두 index로 올림(부분 → 완전).
    setStaged(prev => {
      const byPath = new Map(prev.map(f => [f.p, f] as const))
      for (const f of unstaged) byPath.set(f.p, f)
      return [...byPath.values()]
    })
    setUnstaged([])
  }

  const unstageAll = async () => {
    if (repoPath && staged.length > 0) {
      try {
        await window.gitAPI?.unstage(repoPath, staged.map(f => f.p))
      } catch (e) {
        console.error('unstage all failed:', e)
        return
      }
    }
    setUnstaged(prev => {
      const byPath = new Map(prev.map(f => [f.p, f] as const))
      for (const f of staged) if (!byPath.has(f.p)) byPath.set(f.p, f)
      return [...byPath.values()]
    })
    setStaged([])
  }

  // master 토글: 하나라도 스테이지 안 됐으면(미스테이지/부분 존재) 전체 스테이지, 아니면 전체 해제.
  const toggleAll = () => {
    if (allState === 'staged') unstageAll()
    else stageAll()
  }

  const handleCommit = async () => {
    if (!msg.trim() || stagedCount === 0) return
    setCommitting(true)
    try {
      if (repoPath) {
        await window.gitAPI?.commit(repoPath, msg)
      }
      setMsg('')
      setStaged([])
      setUnstaged([])
      onCommitDone?.()
    } catch (e) {
      console.error('commit failed:', e)
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="stage-wrap">
      <div className="slist">
        <div className="slist-hdr">
          <Checkbox state={allState} onClick={toggleAll} label="전체 스테이지 토글" />
          <span className="slist-ttl">변경 파일</span>
          <span className="scnt">{rows.length}</span>
          <button className="sallbtn" onClick={toggleAll}>
            {allState === 'staged' ? '전체 해제' : '전체 스테이지'}
          </button>
        </div>
        <div className="sfl">
          {rows.map(row => {
            const target = diffTargetOf(row)
            return (
              <div
                key={row.p}
                className={`sfi${selPath === row.p ? ' on' : ''}${row.state === 'partial' ? ' partial' : ''}`}
                onClick={() => { setSelPath(row.p); onSelDiffFile(target.file, target.staged) }}
                onContextMenu={e => openMenu(e, target.file)}
              >
                <Checkbox
                  state={row.state}
                  onClick={() => toggleRow(row)}
                  label={`${row.p} 스테이지 토글`}
                />
                <span className={`fst fst-${row.s}`}>{row.s}</span>
                <FilePath path={row.p} />
                {row.state === 'partial' && <span className="spart" title="부분 스테이지">부분</span>}
                <span className="fstats">
                  <span className="fadd">+{row.a}</span>
                  <span className="fdel">−{row.d}</span>
                </span>
              </div>
            )
          })}
          {rows.length === 0 && (
            <div className="sfl-empty">
              <div>변경된 파일이 없어요</div>
              <div className="sfl-empty-sub">파일을 고쳐 커밋을 심어 보세요</div>
            </div>
          )}
        </div>
      </div>

      {/* Commit area */}
      <div className="cmt-area">
        <textarea
          className="cmt-input"
          rows={3}
          placeholder="커밋 메시지 (필수)…"
          value={msg}
          onChange={e => setMsg(e.target.value)}
        />
        <div className="cmt-btns">
          <button className="amnd" onClick={async () => {
            if (!repoPath) return
            setCommitting(true)
            try {
              await window.gitAPI?.commitAmend(repoPath, msg.trim() || undefined)
              setMsg('')
              onCommitDone?.()
            } catch (e) { console.error('amend failed:', e) }
            finally { setCommitting(false) }
          }}>↩ 수정 커밋</button>
          <button
            className="cmt-btn"
            disabled={stagedCount === 0 || !msg.trim() || committing}
            onClick={handleCommit}
          >
            {committing
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>커밋 중…</span>
              : `${stagedCount}개 파일 커밋 →`}
          </button>
        </div>
      </div>

      {menu && repoPath && (
        <FileContextMenu
          x={menu.x}
          y={menu.y}
          file={menu.file}
          repoPath={repoPath}
          onClose={() => setMenu(null)}
          onAction={handleMenuAction}
        />
      )}

      {discardTarget && (
        <ConfirmModal
          title="변경 되돌리기"
          message={`"${discardTarget.p}"의 변경사항을 되돌려요. 이 작업은 되돌릴 수 없어요.`}
          confirmLabel="되돌리기"
          danger
          onConfirm={confirmDiscard}
          onCancel={() => setDiscardTarget(null)}
        />
      )}
    </div>
  )
}

// 3상태 체크박스: 'staged'=체크, 'unstaged'=해제, 'partial'=indeterminate.
// 네이티브 input의 indeterminate는 prop으로 못 줘서 ref로 설정한다.
function Checkbox({ state, onClick, label }: { state: StageState; onClick: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'partial'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      className="scheck"
      checked={state === 'staged'}
      aria-label={label}
      aria-checked={state === 'partial' ? 'mixed' : state === 'staged'}
      readOnly
      onClick={e => { e.stopPropagation(); onClick() }}
    />
  )
}
