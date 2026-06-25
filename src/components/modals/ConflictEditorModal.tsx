import { useState, useEffect, useCallback } from 'react'
import { Geuru } from '../Geuru'

// 백엔드 IPC가 주는 충돌 모델(electron-env.d.ts의 ConflictFile/ConflictHunk와 동일).
// ours/theirs choice는 UI 로컬 상태(choices)로 관리한다.
interface Hunk { id: string; ours: string[]; theirs: string[] }
interface CFile { path: string; conflicts: Hunk[] }

type Choice = 'ours' | 'theirs' | 'both'

interface Props {
  repoPath?: string | null
  onClose: () => void
  onComplete?: () => void
}

export function ConflictEditorModal({ repoPath, onClose, onComplete }: Props) {
  const [files, setFiles] = useState<CFile[]>([])
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [selFile, setSelFile] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [conflictRemains, setConflictRemains] = useState(false)

  const load = useCallback(async () => {
    if (!repoPath) { setFiles([]); setChoices({}); setLoading(false); return }
    setLoading(true)
    setLoadError(null)
    setConflictRemains(false)
    try {
      const result = (await window.gitAPI?.getConflicts(repoPath)) ?? []
      setFiles(result as CFile[])
      setChoices({})
      setSelFile(0)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  useEffect(() => { void load() }, [load])

  const pick = (id: string, choice: Choice) => setChoices(p => ({ ...p, [id]: choice }))

  const totalC = files.reduce((s, f) => s + f.conflicts.length, 0)
  const doneC = files.reduce((s, f) => s + f.conflicts.filter(c => choices[c.id]).length, 0)
  const allDone = totalC > 0 && doneC === totalC

  const choiceLabel: Record<Choice, string> = { ours: '내 변경', theirs: '상대 변경', both: '둘 다' }

  // 모든 hunk 해결 → 파일별 resolveConflict(순서대로) → 전부 끝나면 continueMerge.
  const handleComplete = async () => {
    if (!repoPath || !allDone || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    setConflictRemains(false)
    try {
      for (const f of files) {
        const ordered = f.conflicts.map(c => choices[c.id]).filter((c): c is Choice => !!c)
        await window.gitAPI?.resolveConflict(repoPath, f.path, ordered)
      }
      const res = (await window.gitAPI?.continueMerge(repoPath)) ?? { ok: false }
      if (res.ok) {
        onComplete?.()
        onClose()
        return
      }
      if (res.conflict) {
        // 충돌이 아직 남음 — 다시 로드해 남은 블록을 보여준다.
        // load()가 conflictRemains를 리셋하므로 재로드 후에 안내를 켠다.
        await load()
        setConflictRemains(true)
        return
      }
      setSubmitError(res.error ?? '머지를 마치지 못했어요')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-bd" onClick={submitting ? undefined : onClose}>
      <div style={{ background: 'var(--c-bg-surface)', border: '1px solid var(--c-border)', borderRadius: 8, width: 720, height: 520, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.65)', animation: 'mslide 200ms cubic-bezier(.2,.8,.2,1)' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3>충돌 해결</h3>
            {totalC > 0 && <span style={{ fontSize: 11, color: 'var(--c-text-muted)', marginLeft: 4 }}>{doneC}/{totalC} 해결됨</span>}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--c-text-muted)' }}>
            <span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite', fontSize: 16 }}>⟳</span>
            충돌 불러오는 중…
          </div>
        ) : loadError ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }}>
            <Geuru expr="conflict" scale={2.6} />
            <div style={{ color: 'var(--c-danger)', fontSize: 13 }}>{loadError}</div>
            <button className="mbtn-cancel" onClick={onClose}>닫기</button>
          </div>
        ) : totalC === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
            <Geuru expr="happy" scale={2.8} />
            <div style={{ color: 'var(--c-text)', fontSize: 14 }}>해결할 충돌이 없어요</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>충돌 없이 머지가 깔끔해요</div>
            <button className="mbtn-ok" onClick={onClose}>닫기</button>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <div className="cfl-files">
              <div style={{ padding: '6px 12px 4px', fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--c-text-faint)', fontFamily: 'var(--font-display)', borderBottom: '1px solid var(--c-divider)' }}>파일</div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {files.map((f, fi) => {
                  const remaining = f.conflicts.filter(c => !choices[c.id]).length
                  const isOk = remaining === 0
                  return (
                    <div key={f.path} className={`cfl-fitem${fi === selFile ? ' on' : ''}`} onClick={() => setSelFile(fi)}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, color: isOk ? 'var(--c-success)' : 'var(--c-danger)' }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                      <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path.split('/').pop()}</span>
                      <span className={`cfl-badge${isOk ? ' ok' : ''}`}>{isOk ? '✓' : remaining}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="cfl-main">
              {conflictRemains && (
                <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--c-warning)', borderBottom: '1px solid var(--c-divider)' }}>충돌이 아직 남아 있어요 · 남은 블록을 해결해주세요</div>
              )}
              {submitError && (
                <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--c-danger)', borderBottom: '1px solid var(--c-divider)' }}>{submitError}</div>
              )}
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {files[selFile]?.conflicts.map((c, ci) => {
                  const choice = choices[c.id]
                  return (
                    <div key={c.id} className={`cfl-block${choice ? ' ok' : ''}`}>
                      <div className="cfl-block-hdr">
                        <span>충돌 {ci + 1}</span>
                        {choice && <span style={{ color: 'var(--c-success)', fontSize: 10 }}>✓ {choiceLabel[choice]}</span>}
                      </div>
                      <div className="cfl-ours">
                        <div className="cfl-side-hdr" style={{ color: 'var(--c-danger)' }}>◀ 내 변경 · HEAD</div>
                        <div className="cfl-code">{c.ours.map((l, i) => <div key={i}>{l || ' '}</div>)}</div>
                      </div>
                      <div className="cfl-divider" />
                      <div className="cfl-theirs">
                        <div className="cfl-side-hdr" style={{ color: 'var(--c-success)' }}>▶ 들어오는 변경 · theirs</div>
                        <div className="cfl-code">{c.theirs.map((l, i) => <div key={i}>{l || ' '}</div>)}</div>
                      </div>
                      {!choice && (
                        <div className="cfl-actions">
                          <button className="cfl-btn cfl-btn-ours" onClick={() => pick(c.id, 'ours')}>◀ 내 변경 사용</button>
                          <button className="cfl-btn cfl-btn-theirs" onClick={() => pick(c.id, 'theirs')}>▶ 상대 변경 사용</button>
                          <button className="cfl-btn cfl-btn-both" onClick={() => pick(c.id, 'both')}>둘 다 사용</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="cfl-footer">
                <div className="cfl-progress"><div className="cfl-progress-bar" style={{ width: `${totalC ? Math.round(doneC / totalC * 100) : 0}%` }} /></div>
                <span style={{ fontSize: 11, color: 'var(--c-text-muted)', flexShrink: 0, minWidth: 32 }}>{doneC}/{totalC}</span>
                <button className="mbtn-cancel" onClick={onClose} disabled={submitting}>취소</button>
                <button className="mbtn-ok" disabled={!allDone || submitting} onClick={handleComplete}
                  style={(!allDone || submitting) ? { opacity: .4, cursor: 'not-allowed' } : {}}>
                  {submitting ? '머지 중…' : allDone ? '머지 완료 →' : `${totalC - doneC}개 남음`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
