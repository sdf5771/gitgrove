import { useState, useEffect, useCallback } from 'react'
import { Geuru, type GeuruExpr } from '../Geuru'
import { HL } from '../../utils/syntaxHighlight'

// 백엔드 IPC가 주는 충돌 모델(electron-env.d.ts의 ConflictFile/ConflictHunk와 동일).
// ours/theirs choice는 UI 로컬 상태(choices)로 관리한다.
interface Hunk { id: string; ours: string[]; theirs: string[]; startLine: number }
interface CFile { path: string; conflicts: Hunk[] }

type Choice = 'ours' | 'theirs' | 'both'

interface Props {
  repoPath?: string | null
  onClose: () => void
  onComplete?: () => void
}

const CHOICE_LABEL: Record<Choice, string> = { ours: '내 변경', theirs: '들어오는 변경', both: '둘 다' }

function splitPath(p: string): { dir: string; base: string } {
  const i = p.lastIndexOf('/')
  return i < 0 ? { dir: '', base: p } : { dir: p.slice(0, i + 1), base: p.slice(i + 1) }
}

// 한 쪽 코드 블록 — 줄번호 거터 + 구문 하이라이트.
function CodeLines({ lines, startLine }: { lines: string[]; startLine: number }) {
  return (
    <div className="cfl-code">
      {lines.map((l, i) => (
        <div key={i} className="ln">
          <span className="g">{startLine + i}</span>
          <span className="t"><HL s={l || ' '} /></span>
        </div>
      ))}
    </div>
  )
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

  const pick = (id: string, choice: Choice) => { setChoices(p => ({ ...p, [id]: choice })); setConflictRemains(false) }
  const unpick = (id: string) => setChoices(p => { const n = { ...p }; delete n[id]; return n })

  const totalC = files.reduce((s, f) => s + f.conflicts.length, 0)
  const doneC = files.reduce((s, f) => s + f.conflicts.filter(c => choices[c.id]).length, 0)
  const allDone = totalC > 0 && doneC === totalC

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

  // 공통 헤더 — 그루(해결 완료 시 merge)로 conflict→merge 서사를 전한다.
  const header = (expr: GeuruExpr, title: string, done: boolean, sub?: string) => (
    <div className={`modal-hdr cfl-hd${done ? ' done-hd' : ''}`}>
      <span className="hdr-geuru"><Geuru expr={expr} scale={1.6} /></span>
      <h3>{title}</h3>
      {sub && <span className="hdr-sub">{sub}</span>}
      <span className="hdr-src">
        <span className="pill pill-mine">내 변경 · HEAD</span>
        <span className="arr">⇄</span>
        <span className="pill pill-in">들어오는 변경</span>
      </span>
      <button className="modal-close" onClick={onClose}>×</button>
    </div>
  )

  const wrap = (children: React.ReactNode) => (
    <div className="modal-bd" onClick={submitting ? undefined : onClose}>
      <div className="cfl-dlg" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )

  if (loading) {
    return wrap(<>
      {header('conflict', '충돌 확인 중', false)}
      <div className="cfl-center"><span className="cfl-spin" /><span>충돌 불러오는 중…</span></div>
    </>)
  }
  if (loadError) {
    return wrap(<>
      {header('conflict', '충돌 해결', false)}
      <div className="cfl-center">
        <Geuru expr="conflict" scale={3} />
        <b>충돌을 불러오지 못했어요</b>
        <span className="errmsg">{loadError}</span>
        <span>머지가 진행 중일 때만 열 수 있어요.</span>
        <button className="mbtn-cancel" style={{ marginTop: 4 }} onClick={onClose}>닫기</button>
      </div>
    </>)
  }
  if (totalC === 0) {
    return wrap(<>
      {header('happy', '충돌 해결', true)}
      <div className="cfl-center">
        <Geuru expr="happy" scale={3} />
        <b>해결할 충돌이 없어요</b>
        <span>충돌 없이 머지가 깔끔해요.</span>
        <button className="mbtn-ok" style={{ marginTop: 4 }} onClick={onClose}>닫기</button>
      </div>
    </>)
  }

  const f = files[selFile]
  const guideTxt = allDone
    ? <>다 골랐어요 · 아래 <b>머지 완료</b>를 누르면 심을게요.</>
    : doneC === 0
      ? <>블록마다 <b>내 변경</b> · <b>들어오는 변경</b> · 둘 다 중 하나를 골라요.</>
      : <>잘하고 있어요 · 남은 블록도 하나씩 골라 보세요.</>
  const guideExpr: GeuruExpr = allDone ? 'merge' : doneC > 0 ? 'idle' : 'conflict'

  return wrap(<>
    {header(allDone ? 'merge' : 'conflict', '충돌 해결', allDone, `${doneC}/${totalC} 해결됨`)}
    <div className="dlg-body">
      <div className="cfl-files">
        <div className="cfl-files-lbl">파일<span style={{ fontFamily: 'var(--font-mono)' }}>{files.length}</span></div>
        <div className="cfl-files-list">
          {files.map((fl, fi) => {
            const rem = fl.conflicts.filter(c => !choices[c.id]).length
            const ok = rem === 0
            const pct = fl.conflicts.length ? Math.round((fl.conflicts.length - rem) / fl.conflicts.length * 100) : 0
            const { dir, base } = splitPath(fl.path)
            return (
              <div key={fl.path} className={`cfl-fitem${fi === selFile ? ' on' : ''}`} onClick={() => setSelFile(fi)}>
                <span className="fic">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ok ? 'var(--c-success)' : 'var(--c-danger)'} strokeWidth="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
                </span>
                <span className="cfl-fpath">{dir && <span className="dir">{dir}</span>}<span className="base">{base}</span></span>
                <span className={`cfl-badge${ok ? ' ok' : ''}`}>{ok ? '✓' : rem}</span>
                <span className="cfl-fprog"><i style={{ width: `${pct}%` }} /></span>
              </div>
            )
          })}
        </div>
        <div className="cfl-guide"><span className="gg"><Geuru expr={guideExpr} scale={1.3} /></span><p>{guideTxt}</p></div>
      </div>

      <div className="cfl-main">
        {conflictRemains && <div className="cfl-note warn">⚠ 충돌이 아직 남아 있어요 · 남은 블록을 해결해주세요</div>}
        {submitError && <div className="cfl-note err">{submitError}</div>}
        <div className="cfl-blocks">
          {f?.conflicts.map((c, ci) => {
            const choice = choices[c.id]
            const merged = choice === 'both' ? c.ours.concat(c.theirs) : choice === 'ours' ? c.ours : c.theirs
            return (
              <div key={c.id} className={`cfl-block${choice ? ' ok' : ''}`}>
                <div className="cfl-block-hdr">
                  <span className="ttl">충돌 {ci + 1}</span>
                  <span className="loc">@@ {c.startLine}</span>
                  {choice && (
                    <span className="picked">✓ {CHOICE_LABEL[choice]}
                      <button className="undo" onClick={() => unpick(c.id)}>다시 고르기</button>
                    </span>
                  )}
                </div>
                <div className="cfl-sides">
                  <div className={`cfl-side side-ours${choice === 'theirs' ? ' dim' : ''}`}>
                    <div className="cfl-side-hdr"><span className="dot" />내 변경 · HEAD
                      {!choice && <button className="use" onClick={() => pick(c.id, 'ours')}>이걸 사용 ←</button>}
                    </div>
                    <CodeLines lines={c.ours} startLine={c.startLine} />
                  </div>
                  <div className="cfl-vdiv" />
                  <div className={`cfl-side side-theirs${choice === 'ours' ? ' dim' : ''}`}>
                    <div className="cfl-side-hdr"><span className="dot" />들어오는 변경 · origin
                      {!choice && <button className="use" onClick={() => pick(c.id, 'theirs')}>이걸 사용 →</button>}
                    </div>
                    <CodeLines lines={c.theirs} startLine={c.startLine} />
                  </div>
                </div>
                {choice ? (
                  <div className="cfl-resolved">
                    <div className="cfl-resolved-hdr">✓ 해결 결과 · {CHOICE_LABEL[choice]}</div>
                    <CodeLines lines={merged} startLine={c.startLine} />
                  </div>
                ) : (
                  <div className="cfl-bothbar"><button onClick={() => pick(c.id, 'both')}>둘 다 사용 · 내 변경 먼저</button></div>
                )}
              </div>
            )
          })}
        </div>
        <div className="cfl-footer">
          <div className="cfl-progress"><div className={`cfl-progress-bar${allDone ? ' full' : ''}`} style={{ width: `${totalC ? Math.round(doneC / totalC * 100) : 0}%` }} /></div>
          <span className="cfl-count"><span className="d">{doneC}</span>/{totalC}</span>
          <button className="mbtn-cancel" onClick={onClose} disabled={submitting}>취소</button>
          <button className={`mbtn-ok${allDone && !submitting ? ' ready' : ''}`} disabled={!allDone || submitting} onClick={handleComplete}>
            {submitting ? '머지 중…' : allDone ? '머지 완료 →' : `${totalC - doneC}개 남음`}
          </button>
        </div>
      </div>
    </div>
  </>)
}
