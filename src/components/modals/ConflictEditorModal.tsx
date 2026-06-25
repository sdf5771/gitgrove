import { useState } from 'react'
import { CONFLICT_FILES, type ConflictFile } from '../../data/mockData'

interface Props {
  onClose: () => void
  onComplete?: () => void
}

export function ConflictEditorModal({ onClose, onComplete }: Props) {
  const [files, setFiles] = useState<ConflictFile[]>(() =>
    CONFLICT_FILES.map(f => ({ ...f, conflicts: f.conflicts.map(c => ({ ...c })) }))
  )
  const [selFile, setSelFile] = useState(0)

  const resolve = (fi: number, cid: string, choice: string) => {
    setFiles(p => p.map((f, i) => i !== fi ? f : {
      ...f,
      conflicts: f.conflicts.map(c => c.id !== cid ? c : { ...c, resolved: true, choice }),
    }))
  }

  const totalC = files.reduce((s, f) => s + f.conflicts.length, 0)
  const doneC = files.reduce((s, f) => s + f.conflicts.filter(c => c.resolved).length, 0)
  const allDone = doneC === totalC

  const choiceLabel: Record<string, string> = { ours: '내 변경', theirs: '상대 변경', both: '둘 다' }

  return (
    <div className="modal-bd" onClick={onClose}>
      <div style={{ background: 'var(--c-bg-surface)', border: '1px solid var(--c-border)', borderRadius: 8, width: 720, height: 520, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.65)', animation: 'mslide 200ms cubic-bezier(.2,.8,.2,1)' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3>충돌 해결</h3>
            <span style={{ fontSize: 11, color: 'var(--c-text-muted)', marginLeft: 4 }}>{doneC}/{totalC} 해결됨</span>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div className="cfl-files">
            <div style={{ padding: '6px 12px 4px', fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--c-text-faint)', fontFamily: 'var(--font-display)', borderBottom: '1px solid var(--c-divider)' }}>파일</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {files.map((f, fi) => {
                const remaining = f.conflicts.filter(c => !c.resolved).length
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {files[selFile]?.conflicts.map((c, ci) => (
                <div key={c.id} className={`cfl-block${c.resolved ? ' ok' : ''}`}>
                  <div className="cfl-block-hdr">
                    <span>충돌 {ci + 1}</span>
                    {c.resolved && c.choice && <span style={{ color: 'var(--c-success)', fontSize: 10 }}>✓ {choiceLabel[c.choice] ?? c.choice}</span>}
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
                  {!c.resolved && (
                    <div className="cfl-actions">
                      <button className="cfl-btn cfl-btn-ours" onClick={() => resolve(selFile, c.id, 'ours')}>◀ 내 변경 사용</button>
                      <button className="cfl-btn cfl-btn-theirs" onClick={() => resolve(selFile, c.id, 'theirs')}>▶ 상대 변경 사용</button>
                      <button className="cfl-btn cfl-btn-both" onClick={() => resolve(selFile, c.id, 'both')}>둘 다 사용</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="cfl-footer">
              <div className="cfl-progress"><div className="cfl-progress-bar" style={{ width: `${totalC ? Math.round(doneC / totalC * 100) : 0}%` }} /></div>
              <span style={{ fontSize: 11, color: 'var(--c-text-muted)', flexShrink: 0, minWidth: 32 }}>{doneC}/{totalC}</span>
              <button className="mbtn-cancel" onClick={onClose}>취소</button>
              <button className="mbtn-ok" disabled={!allDone} onClick={() => { onComplete?.(); onClose() }}
                style={!allDone ? { opacity: .4, cursor: 'not-allowed' } : {}}>
                {allDone ? '머지 완료 →' : `${totalC - doneC}개 남음`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
