import { useState } from 'react'
import { type Branch } from '../../data/mockData'
import { ModalShell, SuccessState } from './ModalShell'

type Tab = 'create' | 'rename' | 'delete'

interface Props {
  initialTab?: Tab
  onClose: () => void
  onSuccess?: () => void
  branches?: Branch[]
  repoPath?: string | null
}

export function BranchModal({ initialTab = 'create', onClose, onSuccess, branches, repoPath }: Props) {
  const allBranches = branches ?? []
  const nonCurrent = allBranches.filter(b => !b.current)

  const [tab, setTab] = useState<Tab>(initialTab)
  const [cName, setCName] = useState('')
  const [cBase, setCBase] = useState(allBranches.find(b => b.current)?.name ?? allBranches[0]?.name ?? 'main')
  const [cCheckout, setCCheckout] = useState(true)
  const [rFrom, setRFrom] = useState(nonCurrent[0]?.name ?? '')
  const [rNew, setRNew] = useState('')
  const [dBranch, setDBranch] = useState(nonCurrent[0]?.name ?? '')
  const [dForce, setDForce] = useState(false)
  const [doing, setDoing] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const validateName = (n: string) => /^[a-z0-9_\-/]+$/i.test(n) && n.length > 0

  const run = async (fn: () => Promise<void>, msg: string) => {
    setError('')
    setDoing(true)
    try {
      if (repoPath) {
        await fn()
      } else {
        await new Promise(r => setTimeout(r, 1000))
      }
      setDoneMsg(msg)
      setIsDone(true)
      onSuccess?.()
      setTimeout(() => onClose(), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDoing(false)
    }
  }

  const create = () => {
    if (!validateName(cName)) return
    run(
      () => window.gitAPI!.branchCreate(repoPath!, cName, cBase, cCheckout),
      `'${cName}' 브랜치를 만들었어요${cCheckout ? ' · 전환 완료' : ''}`
    )
  }
  const rename = () => {
    if (!validateName(rNew)) return
    run(
      () => window.gitAPI!.branchRename(repoPath!, rFrom, rNew),
      `'${rFrom}' → '${rNew}' 이름을 바꿨어요`
    )
  }
  const del = () => {
    run(
      () => window.gitAPI!.branchDelete(repoPath!, dBranch, dForce),
      `'${dBranch}' 브랜치를 지웠어요`
    )
  }

  const icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold-300)" strokeWidth="2.2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>

  return (
    <ModalShell title="브랜치" width={420} onClose={onClose} icon={icon}>
      {isDone ? <SuccessState msg={doneMsg} expr="happy" /> : (
        <>
          <div className="btabs">
            {(['create', 'rename', 'delete'] as Tab[]).map((t, i) => (
              <button key={t} className={`btab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                {['만들기', '이름 변경', '삭제'][i]}
              </button>
            ))}
          </div>

          {error && (
            <div style={{ margin: '8px 16px 0', padding: '8px 12px', background: 'rgba(255,107,107,.1)', border: '1px solid rgba(255,107,107,.35)', borderRadius: 'var(--r2)', fontSize: 11, color: 'var(--c-danger)' }}>
              {error}
            </div>
          )}

          {tab === 'create' && (
            <div className="modal-body">
              <div className="mfield">
                <label>브랜치 이름</label>
                <input className="mselect" placeholder="feature/my-branch" value={cName}
                  onChange={e => setCName(e.target.value.toLowerCase().replace(/\s/g, '-'))}
                  style={{ borderColor: cName && !validateName(cName) ? 'var(--c-danger)' : undefined }} />
                {cName && !validateName(cName) && <span style={{ fontSize: 11, color: 'var(--c-danger)' }}>영문·숫자·-·_·/ 만 쓸 수 있어요</span>}
              </div>
              <div className="mfield">
                <label>기준 브랜치</label>
                <select className="mselect" value={cBase} onChange={e => setCBase(e.target.value)}>
                  {allBranches.map(b => <option key={b.name} value={b.name}>{b.name}{b.current ? ' (현재)' : ''}</option>)}
                </select>
              </div>
              <div className={`mcheckrow${cCheckout ? ' on' : ''}`} onClick={() => setCCheckout(v => !v)}>
                <div className="mcheckbox">{cCheckout ? '✓' : ''}</div>
                <div><div className="mcheck-lbl">만들고 바로 전환</div><div className="mcheck-sub">새 브랜치로 곧장 옮겨가요</div></div>
              </div>
              <div className="modal-footer" style={{ padding: 0, background: 'none', border: 'none', marginTop: 4 }}>
                <button className="mbtn-cancel" onClick={onClose}>취소</button>
                <button className="mbtn-ok" onClick={create} disabled={!validateName(cName) || doing}
                  style={!validateName(cName) ? { opacity: .45, cursor: 'not-allowed' } : {}}>
                  {doing ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>만드는 중…</span> : (cCheckout ? '만들고 전환 →' : '만들기 →')}
                </button>
              </div>
            </div>
          )}

          {tab === 'rename' && (
            <div className="modal-body">
              <div className="mfield">
                <label>이름 바꿀 브랜치</label>
                <select className="mselect" value={rFrom} onChange={e => setRFrom(e.target.value)}>
                  {allBranches.map(b => <option key={b.name} value={b.name}>{b.name}{b.current ? ' (현재)' : ''}</option>)}
                </select>
              </div>
              <div className="mfield">
                <label>새 이름</label>
                <input className="mselect" placeholder="new-branch-name" value={rNew} onChange={e => setRNew(e.target.value.toLowerCase().replace(/\s/g, '-'))} />
              </div>
              <div className="modal-footer" style={{ padding: 0, background: 'none', border: 'none', marginTop: 4 }}>
                <button className="mbtn-cancel" onClick={onClose}>취소</button>
                <button className="mbtn-ok" onClick={rename} disabled={!validateName(rNew) || doing} style={!validateName(rNew) ? { opacity: .45, cursor: 'not-allowed' } : {}}>
                  {doing ? '바꾸는 중…' : '이름 변경 →'}
                </button>
              </div>
            </div>
          )}

          {tab === 'delete' && (
            <div className="modal-body">
              <div className="mfield">
                <label>삭제할 브랜치</label>
                <select className="mselect" value={dBranch} onChange={e => { setDBranch(e.target.value); setConfirmDelete(false) }}>
                  {nonCurrent.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
              </div>
              <div className="danger-zone">⚠ <strong>{dBranch}</strong> 삭제는 되돌릴 수 없어요 · 머지 안 된 커밋은 백업이 없으면 사라져요.</div>
              <div className={`mcheckrow${dForce ? ' on' : ''}`} onClick={() => setDForce(v => !v)}>
                <div className="mcheckbox">{dForce ? '✓' : ''}</div>
                <div>
                  <div className="mcheck-lbl">강제 삭제</div>
                  <div className="mcheck-sub"><code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>-D</code> · 머지 안 된 브랜치도 지워요</div>
                </div>
              </div>
              {confirmDelete ? (
                <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 'var(--r2)', fontSize: 12, color: 'var(--c-text)' }}>
                  <div style={{ marginBottom: 8 }}>정말 <strong>{dBranch}</strong>를 삭제할까요?</div>
                  <div className="modal-footer" style={{ padding: 0, background: 'none', border: 'none' }}>
                    <button className="mbtn-cancel" onClick={() => setConfirmDelete(false)}>아니오</button>
                    <button className="mbtn-danger" onClick={del} disabled={doing}>{doing ? '지우는 중…' : '삭제'}</button>
                  </div>
                </div>
              ) : (
                <div className="modal-footer" style={{ padding: 0, background: 'none', border: 'none', marginTop: 4 }}>
                  <button className="mbtn-cancel" onClick={onClose}>취소</button>
                  <button className="mbtn-danger" onClick={() => setConfirmDelete(true)} disabled={doing}>삭제</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </ModalShell>
  )
}
