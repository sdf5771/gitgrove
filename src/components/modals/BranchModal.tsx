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
      `Branch '${cName}' created${cCheckout ? ' and checked out' : ''}`
    )
  }
  const rename = () => {
    if (!validateName(rNew)) return
    run(
      () => window.gitAPI!.branchRename(repoPath!, rFrom, rNew),
      `Renamed '${rFrom}' → '${rNew}'`
    )
  }
  const del = () => {
    run(
      () => window.gitAPI!.branchDelete(repoPath!, dBranch, dForce),
      `Branch '${dBranch}' deleted`
    )
  }

  const icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold-300)" strokeWidth="2.2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>

  return (
    <ModalShell title="Branch" width={420} onClose={onClose} icon={icon}>
      {isDone ? <SuccessState msg={doneMsg} /> : (
        <>
          <div className="btabs">
            {(['create', 'rename', 'delete'] as Tab[]).map((t, i) => (
              <button key={t} className={`btab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                {['Create', 'Rename', 'Delete'][i]}
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
                <label>Branch name</label>
                <input className="mselect" placeholder="feature/my-branch" value={cName}
                  onChange={e => setCName(e.target.value.toLowerCase().replace(/\s/g, '-'))}
                  style={{ borderColor: cName && !validateName(cName) ? 'var(--c-danger)' : undefined }} />
                {cName && !validateName(cName) && <span style={{ fontSize: 11, color: 'var(--c-danger)' }}>Use letters, numbers, -, _, /</span>}
              </div>
              <div className="mfield">
                <label>Based on</label>
                <select className="mselect" value={cBase} onChange={e => setCBase(e.target.value)}>
                  {allBranches.map(b => <option key={b.name} value={b.name}>{b.name}{b.current ? ' (current)' : ''}</option>)}
                </select>
              </div>
              <div className={`mcheckrow${cCheckout ? ' on' : ''}`} onClick={() => setCCheckout(v => !v)}>
                <div className="mcheckbox">{cCheckout ? '✓' : ''}</div>
                <div><div className="mcheck-lbl">Checkout after create</div><div className="mcheck-sub">Switch to the new branch immediately</div></div>
              </div>
              <div className="modal-footer" style={{ padding: 0, background: 'none', border: 'none', marginTop: 4 }}>
                <button className="mbtn-cancel" onClick={onClose}>Cancel</button>
                <button className="mbtn-ok" onClick={create} disabled={!validateName(cName) || doing}
                  style={!validateName(cName) ? { opacity: .45, cursor: 'not-allowed' } : {}}>
                  {doing ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>Creating…</span> : 'Create Branch →'}
                </button>
              </div>
            </div>
          )}

          {tab === 'rename' && (
            <div className="modal-body">
              <div className="mfield">
                <label>Branch to rename</label>
                <select className="mselect" value={rFrom} onChange={e => setRFrom(e.target.value)}>
                  {allBranches.map(b => <option key={b.name} value={b.name}>{b.name}{b.current ? ' (current)' : ''}</option>)}
                </select>
              </div>
              <div className="mfield">
                <label>New name</label>
                <input className="mselect" placeholder="new-branch-name" value={rNew} onChange={e => setRNew(e.target.value.toLowerCase().replace(/\s/g, '-'))} />
              </div>
              <div className="modal-footer" style={{ padding: 0, background: 'none', border: 'none', marginTop: 4 }}>
                <button className="mbtn-cancel" onClick={onClose}>Cancel</button>
                <button className="mbtn-ok" onClick={rename} disabled={!validateName(rNew) || doing} style={!validateName(rNew) ? { opacity: .45, cursor: 'not-allowed' } : {}}>
                  {doing ? 'Renaming…' : 'Rename →'}
                </button>
              </div>
            </div>
          )}

          {tab === 'delete' && (
            <div className="modal-body">
              <div className="mfield">
                <label>Branch to delete</label>
                <select className="mselect" value={dBranch} onChange={e => { setDBranch(e.target.value); setConfirmDelete(false) }}>
                  {nonCurrent.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
              </div>
              <div className="danger-zone">⚠ <strong>Warning:</strong> Deleting <strong>{dBranch}</strong> is permanent. Unmerged commits will be lost unless backed up.</div>
              <div className={`mcheckrow${dForce ? ' on' : ''}`} onClick={() => setDForce(v => !v)}>
                <div className="mcheckbox">{dForce ? '✓' : ''}</div>
                <div>
                  <div className="mcheck-lbl">Force delete</div>
                  <div className="mcheck-sub"><code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>-D</code> — allows deleting unmerged branches</div>
                </div>
              </div>
              {confirmDelete ? (
                <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 'var(--r2)', fontSize: 12, color: 'var(--c-text)' }}>
                  <div style={{ marginBottom: 8 }}>정말로 <strong>{dBranch}</strong>를 삭제하시겠습니까?</div>
                  <div className="modal-footer" style={{ padding: 0, background: 'none', border: 'none' }}>
                    <button className="mbtn-cancel" onClick={() => setConfirmDelete(false)}>아니오</button>
                    <button className="mbtn-danger" onClick={del} disabled={doing}>{doing ? 'Deleting…' : '예, 삭제합니다'}</button>
                  </div>
                </div>
              ) : (
                <div className="modal-footer" style={{ padding: 0, background: 'none', border: 'none', marginTop: 4 }}>
                  <button className="mbtn-cancel" onClick={onClose}>Cancel</button>
                  <button className="mbtn-danger" onClick={() => setConfirmDelete(true)} disabled={doing}>Delete Branch</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </ModalShell>
  )
}
