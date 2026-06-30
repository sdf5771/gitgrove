import { useState, useEffect, useCallback, useRef } from 'react'
import { Geuru } from '../Geuru'
import { HL } from '../../utils/syntaxHighlight'

// 스태시 파일 1개의 unified diff를 색칠해 렌더(헤더 라인 제거, @@/+/− 구분).
function StashDiffView({ path, raw, loading, onBack }: { path: string; raw: string; loading: boolean; onBack: () => void }) {
  const lines = raw
    ? raw.split('\n').filter(l => !l.startsWith('diff ') && !l.startsWith('index ') && !l.startsWith('--- ') && !l.startsWith('+++ '))
    : []
  return (
    <div className="stash-diffview">
      <button className="stash-diffback" onClick={onBack}>← 변경 파일</button>
      <span className="stash-diffpath" title={path}>{path}</span>
      <div className="stash-diff">
        {loading && <div className="stash-files-msg">불러오는 중이에요…</div>}
        {!loading && lines.length === 0 && <div className="stash-files-msg">표시할 변경이 없어요</div>}
        {!loading && lines.map((l, i) => {
          const t = l.startsWith('@@') ? 'hunk' : l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : 'ctx'
          return <div key={i} className={`stash-dline ${t}`}>{t === 'hunk' ? l : <HL s={l} />}</div>
        })}
      </div>
    </div>
  )
}

interface Props {
  onClose: () => void
  repoPath?: string | null
  currentBranch?: string
}

type ToastVariant = 'success' | 'warning'
interface ToastState { text: string; variant: ToastVariant }

// repoPath 없을 때(테스트/목업)용 로컬 폴백 데이터.
const MOCK_STASHES: GitStashEntry[] = [
  { index: 0, message: '결제 폼 검증 로직 임시 보관', branch: 'feature/checkout', time: '2시간 전', files: 3, additions: 48, deletions: 12 },
  { index: 1, message: '다크 모드 토큰 실험', branch: 'main', time: '어제', files: 5, additions: 120, deletions: 30 },
  { index: 2, message: '리팩터 중간 저장', branch: 'dev', time: '3일 전', files: 2, additions: 8, deletions: 60 },
]
const MOCK_FILES: GitStashFile[] = [
  { path: 'src/checkout/Form.tsx', status: 'M', additions: 30, deletions: 8 },
  { path: 'src/checkout/validate.ts', status: 'A', additions: 18, deletions: 0 },
  { path: 'src/old/legacy.ts', status: 'D', additions: 0, deletions: 4 },
]

const reindex = (arr: GitStashEntry[]): GitStashEntry[] => arr.map((x, i) => ({ ...x, index: i }))
const errText = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback

// 스태시 메시지로 안전한 브랜치명을 만든다: `stash/` + 소문자 + 공백·특수문자를 `-`로, 비면 `stash-<index>`.
function branchSlug(message: string, index: number): string {
  const slug = (message || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `stash/${slug || `stash-${index}`}`
}

// 변경량 비율을 5칸 막대로 표현(추가=초록, 삭제=빨강).
function diffBars(add: number, del: number) {
  const N = 5
  const total = add + del
  const green = total === 0 ? 0 : Math.min(N, Math.max(add > 0 ? 1 : 0, Math.round((N * add) / total)))
  const red = N - green
  const cells = []
  for (let i = 0; i < green; i++) cells.push(<i key={`g${i}`} className="stash-bar add" />)
  for (let i = 0; i < red; i++) cells.push(<i key={`r${i}`} className="stash-bar del" />)
  return cells
}

export function StashPanel({ onClose, repoPath }: Props) {
  const [stashes, setStashes] = useState<GitStashEntry[]>(() => (repoPath ? [] : MOCK_STASHES))
  const [sel, setSel] = useState<number | null>(null)
  const [files, setFiles] = useState<GitStashFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [keepIndex, setKeepIndex] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [dropConfirm, setDropConfirm] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  // 프리뷰에서 파일 클릭 시: 해당 파일 diff 보기.
  const [selFile, setSelFile] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showToast = useCallback((text: string, variant: ToastVariant = 'success') => {
    setToast({ text, variant })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }, [])

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const reload = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    try {
      const list = await window.gitAPI.stashList(repoPath)
      setStashes(list)
    } catch {
      setStashes([])
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  useEffect(() => { reload() }, [reload])

  // 목록이 바뀌면 선택을 유지하되, 사라진 선택은 첫 항목으로 보정.
  useEffect(() => {
    if (!stashes.length) { setSel(null); return }
    setSel(prev => (prev !== null && stashes.some(s => s.index === prev) ? prev : stashes[0].index))
  }, [stashes])

  // 선택된 스태시의 변경 파일을 lazy 로드. 스태시가 바뀌면 열린 파일 diff는 닫는다.
  useEffect(() => {
    setSelFile(null)
    if (sel === null) { setFiles([]); return }
    if (!repoPath) { setFiles(MOCK_FILES); return }
    let cancelled = false
    setFilesLoading(true)
    window.gitAPI.stashFiles(repoPath, sel)
      .then(f => { if (!cancelled) setFiles(f) })
      .catch(() => { if (!cancelled) setFiles([]) })
      .finally(() => { if (!cancelled) setFilesLoading(false) })
    return () => { cancelled = true }
  }, [sel, repoPath])

  const selStash = sel !== null ? stashes.find(s => s.index === sel) ?? null : null

  // 파일 행 클릭 → 그 파일의 스태시 diff 로드.
  const openFile = useCallback((path: string) => {
    setSelFile(path)
    if (sel === null) return
    if (!repoPath) {
      setFileDiff(`@@ -1,3 +1,4 @@\n const a = 1\n-const b = 2\n+const b = 3\n+const c = 4`)
      return
    }
    setDiffLoading(true)
    setFileDiff('')
    window.gitAPI.stashFileDiff(repoPath, sel, path)
      .then(d => setFileDiff(d))
      .catch(() => setFileDiff(''))
      .finally(() => setDiffLoading(false))
  }, [sel, repoPath])

  const push = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (repoPath) {
        await window.gitAPI.stashPush(repoPath, msg || undefined, keepIndex)
        await reload()
      } else {
        setStashes(prev => reindex([
          { index: 0, message: msg || '보관한 작업', branch: 'local', time: '방금', files: 1, additions: 0, deletions: 0 },
          ...prev,
        ]))
      }
      setMsg('')
      showToast('작업을 보관했어요')
    } catch (e) {
      showToast(errText(e, '보관하지 못했어요'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  const pop = async (index: number) => {
    if (busy) return
    setBusy(true)
    try {
      if (repoPath) {
        await window.gitAPI.stashPop(repoPath, index)
        await reload()
      } else {
        setStashes(prev => reindex(prev.filter(s => s.index !== index)))
      }
      showToast('적용하고 보관함에서 비웠어요')
    } catch (e) {
      showToast(errText(e, '적용하지 못했어요'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  const apply = async (index: number) => {
    if (busy) return
    setBusy(true)
    try {
      if (repoPath) await window.gitAPI.stashApply(repoPath, index)
      showToast('적용했어요 · 보관은 그대로 둬요')
    } catch (e) {
      showToast(errText(e, '적용하지 못했어요'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  const toBranch = async (stash: GitStashEntry) => {
    if (busy) return
    setBusy(true)
    const name = branchSlug(stash.message, stash.index)
    try {
      if (repoPath) {
        // stashBranch 는 호출 후 해당 스태시를 자동 drop 하므로 목록 새로고침이 필요하다.
        await window.gitAPI.stashBranch(repoPath, stash.index, name)
        await reload()
      } else {
        setStashes(prev => reindex(prev.filter(s => s.index !== stash.index)))
      }
      showToast(`${name} 브랜치로 꺼냈어요`)
    } catch (e) {
      showToast(errText(e, '브랜치를 만들지 못했어요'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  const drop = async (index: number) => {
    if (busy) return
    setBusy(true)
    try {
      if (repoPath) {
        await window.gitAPI.stashDrop(repoPath, index)
        await reload()
      } else {
        setStashes(prev => reindex(prev.filter(s => s.index !== index)))
      }
      showToast('보관 항목을 버렸어요')
    } catch (e) {
      showToast(errText(e, '버리지 못했어요'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stash-scrim" onClick={onClose}>
      <div className="stash-dlg" onClick={e => e.stopPropagation()}>
        <div className="stash-hdr">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold-300)" strokeWidth="2.2"><polyline points="8,17 3,12 8,7" /><polyline points="16,17 21,12 16,7" /></svg>
          <h3>Stash 관리</h3>
          <span className="stash-count">{stashes.length}</span>
          <button className="stash-x" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="stash-pushbar">
          <span className="stash-pushlabel">새로 보관</span>
          <input
            className="stash-pushinput"
            placeholder="메시지를 적어 두면 나중에 찾기 쉬워요"
            value={msg}
            onChange={e => setMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') push() }}
          />
          <label className="stash-keep">
            <input type="checkbox" checked={keepIndex} onChange={e => setKeepIndex(e.target.checked)} />
            <span>스테이지 유지</span>
          </label>
          <button className="stash-pushbtn" onClick={push} disabled={busy}>보관</button>
        </div>

        {stashes.length === 0 && !loading ? (
          <div className="stash-empty">
            <Geuru expr="sleepy" scale={3.6} />
            <div className="stash-empty-t">아직 보관한 게 없어요</div>
            <div className="stash-empty-s">작업을 잠시 치워 두고 싶을 때 위에서 보관해 보세요</div>
          </div>
        ) : (
          <div className="stash-body">
            <div className="stash-listpane">
              {loading && !stashes.length && (
                <div className="stash-list-load"><span className="stash-spin">⟳</span></div>
              )}
              {stashes.map(s => (
                <button
                  key={s.index}
                  className={`stash-sitem${sel === s.index ? ' sel' : ''}`}
                  onClick={() => setSel(s.index)}
                >
                  <div className="stash-sitem-top">
                    <span className="stash-badge">{`stash@{${s.index}}`}</span>
                    <span className="stash-smsg">{s.message}</span>
                  </div>
                  <div className="stash-smeta">
                    <span className="stash-sbranch">{s.branch}</span>
                    {s.time && <span>{s.time}</span>}
                    <span>{s.files}f</span>
                    <span className="stash-add">+{s.additions}</span>
                    <span className="stash-del">−{s.deletions}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="stash-preview">
              {selStash ? (
                <>
                  <div className="stash-pv-hd">
                    <span className="stash-badge">{`stash@{${selStash.index}}`}</span>
                    <span className="stash-pv-msg">{selStash.message}</span>
                  </div>
                  <div className="stash-chips">
                    <span className="stash-chip">{selStash.branch}</span>
                    {selStash.time && <span className="stash-chip">{selStash.time}</span>}
                  </div>
                  {selFile !== null ? (
                    <StashDiffView path={selFile} raw={fileDiff} loading={diffLoading} onBack={() => setSelFile(null)} />
                  ) : (
                    <div className="stash-files">
                      {filesLoading && <div className="stash-files-msg">불러오는 중이에요…</div>}
                      {!filesLoading && files.length === 0 && <div className="stash-files-msg">표시할 변경이 없어요</div>}
                      {!filesLoading && files.map(f => (
                        <button key={f.path} className="stash-frow" onClick={() => openFile(f.path)} title={`${f.path} diff 보기`}>
                          <span className={`stash-fst stash-fst-${f.status}`}>{f.status}</span>
                          <span className="stash-fpath">{f.path}</span>
                          <span className="stash-fbars">{diffBars(f.additions, f.deletions)}</span>
                          <span className="stash-fnums">
                            <span className="stash-add">+{f.additions}</span>
                            <span className="stash-del">−{f.deletions}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="stash-actions">
                    <button className="stash-act pop" onClick={() => pop(selStash.index)} disabled={busy}>Pop</button>
                    <button className="stash-act" onClick={() => apply(selStash.index)} disabled={busy}>Apply</button>
                    <button className="stash-act" onClick={() => toBranch(selStash)} disabled={busy}>브랜치로</button>
                    <button className="stash-act drop" onClick={() => setDropConfirm(selStash.index)} disabled={busy}>Drop</button>
                  </div>
                </>
              ) : (
                <div className="stash-pv-empty">왼쪽에서 항목을 골라 주세요</div>
              )}
            </div>
          </div>
        )}

        {toast && <div className={`stash-toast ${toast.variant}`}>{toast.text}</div>}

        {dropConfirm !== null && (
          <div className="stash-confirm-scrim" onClick={() => setDropConfirm(null)}>
            <div className="stash-confirm" onClick={e => e.stopPropagation()}>
              <Geuru expr="conflict" scale={3.6} />
              <div className="stash-confirm-t">이 스태시를 버릴까요?</div>
              <div className="stash-confirm-s">한 번 버리면 되돌릴 수 없어요</div>
              <div className="stash-confirm-btns">
                <button className="stash-cbtn" onClick={() => setDropConfirm(null)}>취소</button>
                <button
                  className="stash-cbtn danger"
                  onClick={() => { const i = dropConfirm; setDropConfirm(null); drop(i) }}
                >버리기</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
