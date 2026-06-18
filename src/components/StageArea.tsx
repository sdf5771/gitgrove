import { useState, useEffect } from 'react'
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
}

export function StageArea({ onSelDiffFile, unstaged: unstagedProp, staged: stagedProp, repoPath, onCommitDone, onTreeChanged }: Props) {
  // controlled: props(unstaged/staged)를 단일 소스로 소비하되, stage/unstage 클릭은
  // 즉시 반영(낙관적)을 위해 로컬 state에 담는다. 이후 props가 바뀌면(=loadRepo 확정
  // 결과 도착) 그 값으로 재동기화 → 낙관 → 서버확정 순서가 자연스럽게 이어진다.
  // 포커스 복귀·커밋·머지/리베이스 등 모든 loadRepo 후 prop 변경이 화면에 반영됨.
  const [unstaged, setUnstaged] = useState<FileEntry[]>(unstagedProp ?? [])
  const [staged, setStaged] = useState<FileEntry[]>(stagedProp ?? [])
  const [selU, setSelU] = useState<number | null>(null)
  const [selS, setSelS] = useState<number>(0)
  const [msg, setMsg] = useState('')
  const [committing, setCommitting] = useState(false)

  // 우클릭 컨텍스트 메뉴 (한 번에 하나) + discard 확인 모달
  const [menu, setMenu] = useState<{ x: number; y: number; file: FileEntry } | null>(null)
  const [discardTarget, setDiscardTarget] = useState<FileEntry | null>(null)

  // prop이 바뀌면(authoritative loadRepo 결과) 로컬 state를 동기화한다.
  useEffect(() => { setUnstaged(unstagedProp ?? []) }, [unstagedProp])
  useEffect(() => { setStaged(stagedProp ?? []) }, [stagedProp])

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
          await onTreeChanged?.({ cls: 'success', title: '무시 추가', msg: '.gitignore에 추가했어요' })
        } catch (e) { console.error('addToGitignore failed:', e) }
        break
      case 'ignore-ext': {
        if (!repoPath) return
        const ext = fileExtension(f.p)
        if (!ext) return
        try {
          await window.gitAPI?.addToGitignore(repoPath, ['*.' + ext])
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

  const stageFile = async (f: FileEntry) => {
    if (repoPath) {
      try {
        await window.gitAPI?.stage(repoPath, [f.p])
      } catch (e) {
        console.error('stage failed:', e)
        return
      }
    }
    setUnstaged(p => p.filter(x => x.p !== f.p))
    setStaged(p => [...p, f])
    setSelS(staged.length)
    onSelDiffFile(f, true)
  }

  const unstageFile = async (f: FileEntry) => {
    if (repoPath) {
      try {
        await window.gitAPI?.unstage(repoPath, [f.p])
      } catch (e) {
        console.error('unstage failed:', e)
        return
      }
    }
    setStaged(p => p.filter(x => x.p !== f.p))
    setUnstaged(p => [...p, f])
    onSelDiffFile(f, false)
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
    setStaged(p => [...p, ...unstaged])
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
    setUnstaged(p => [...p, ...staged])
    setStaged([])
  }

  const handleCommit = async () => {
    if (!msg.trim() || staged.length === 0) return
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
      <div className="stage-cols">
        {/* Unstaged */}
        <div className="scol">
          <div className="scol-hdr">
            <span className="scol-ttl">Unstaged</span>
            <span className="scnt">{unstaged.length}</span>
            <button className="sallbtn" onClick={stageAll}>
              Stage All
            </button>
          </div>
          <div className="sfl">
            {unstaged.map((f, i) => (
              <div
                key={f.p}
                className={`sfi${selU === i ? ' on' : ''}`}
                onClick={() => { setSelU(i); onSelDiffFile(f, false) }}
                onContextMenu={e => openMenu(e, f)}
              >
                <button className="sact" onClick={e => { e.stopPropagation(); stageFile(f) }} title="올리기">+</button>
                <span className={`fst fst-${f.s}`}>{f.s}</span>
                <FilePath path={f.p} />
                <span className="fstats">
                  <span className="fadd">+{f.a}</span>
                  <span className="fdel">−{f.d}</span>
                </span>
              </div>
            ))}
            {unstaged.length === 0 && (
              <div style={{ padding:'20px 12px', color:'var(--c-text-faint)', fontSize:12, textAlign:'center' }}>
                No unstaged changes
              </div>
            )}
          </div>
        </div>

        {/* Staged */}
        <div className="scol">
          <div className="scol-hdr">
            <span className="scol-ttl">Staged</span>
            <span className="scnt">{staged.length}</span>
            <button className="sallbtn" onClick={unstageAll}>
              Unstage All
            </button>
          </div>
          <div className="sfl">
            {staged.map((f, i) => (
              <div
                key={f.p}
                className={`sfi${selS === i ? ' on' : ''}`}
                onClick={() => { setSelS(i); onSelDiffFile(f, true) }}
                onContextMenu={e => openMenu(e, f)}
              >
                <button className="sact" onClick={e => { e.stopPropagation(); unstageFile(f) }} title="내리기">−</button>
                <span className={`fst fst-${f.s}`}>{f.s}</span>
                <FilePath path={f.p} />
                <span className="fstats">
                  <span className="fadd">+{f.a}</span>
                  <span className="fdel">−{f.d}</span>
                </span>
              </div>
            ))}
            {staged.length === 0 && (
              <div style={{ padding:'20px 12px', color:'var(--c-text-faint)', fontSize:12, textAlign:'center' }}>
                No staged files
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Commit area */}
      <div className="cmt-area">
        <textarea
          className="cmt-input"
          rows={3}
          placeholder="Commit message (required)…"
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
          }}>↩ Amend</button>
          <button
            className="cmt-btn"
            disabled={staged.length === 0 || !msg.trim() || committing}
            onClick={handleCommit}
          >
            {committing
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>Committing…</span>
              : `Commit ${staged.length} ${staged.length === 1 ? 'file' : 'files'} →`}
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
