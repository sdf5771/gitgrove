import { useState } from 'react'
import { LOCAL_BRANCHES, type Branch } from '../../data/mockData'
import { ModalShell, SuccessState } from './ModalShell'

interface Props {
  onClose: () => void
  onSuccess?: () => void
  branches?: Branch[]
  repoPath?: string | null
  currentBranch?: string
}

export function MergeModal({ onClose, onSuccess, branches, repoPath, currentBranch }: Props) {
  const opts = (branches ?? LOCAL_BRANCHES).filter(b => !b.current)
  const [from, setFrom] = useState(opts[0]?.name ?? '')
  const [strategy, setStrategy] = useState<'merge' | 'rebase' | 'squash'>('merge')
  const [doing, setDoing] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [error, setError] = useState('')

  const target = currentBranch ?? 'current'

  const execute = async () => {
    setError('')
    setDoing(true)
    try {
      if (repoPath) {
        await window.gitAPI!.merge(repoPath, from, strategy)
      } else {
        await new Promise(r => setTimeout(r, 1300))
      }
      setIsDone(true)
      onSuccess?.()
      setTimeout(() => onClose(), 2100)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDoing(false)
    }
  }

  const strategies = [
    ['merge', 'Merge commit', 'Creates a merge commit · preserves full branch history'],
    ['rebase', 'Rebase', 'Reapplies commits on top of target · linear history'],
    ['squash', 'Squash merge', 'Combines all commits into one · clean trunk history'],
  ] as const

  const icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold-300)" strokeWidth="2.2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 012 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>

  return (
    <ModalShell title="Merge / Rebase" width={440} onClose={onClose} icon={icon}>
      {isDone ? (
        <SuccessState msg={`${strategy.charAt(0).toUpperCase() + strategy.slice(1)} complete`}
          sub={<><strong style={{ color: 'var(--c-text)' }}>{from}</strong> → <strong style={{ color: 'var(--c-text)' }}>{target}</strong></>} />
      ) : (
        <>
          <div className="modal-body">
            {error && (
              <div style={{ marginBottom: 10, padding: '8px 12px', background: 'rgba(255,107,107,.1)', border: '1px solid rgba(255,107,107,.35)', borderRadius: 'var(--r2)', fontSize: 11, color: 'var(--c-danger)' }}>
                {error}
              </div>
            )}
            <div className="mfield">
              <label>Into</label>
              <div className="mval"><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e6a536', flexShrink: 0, display: 'inline-block' }} />{target}</div>
            </div>
            <div className="mfield">
              <label>From</label>
              <select className="mselect" value={from} onChange={e => setFrom(e.target.value)}>
                {opts.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            <div className="mfield">
              <label>Strategy</label>
              <div className="mradio-group">
                {strategies.map(([val, title, desc]) => (
                  <div key={val} className={`mradio${strategy === val ? ' on' : ''}`} onClick={() => setStrategy(val)}>
                    <span className="mradio-bullet">{strategy === val ? '●' : '○'}</span>
                    <div><div className="mradio-title">{title}</div><div className="mradio-desc">{desc}</div></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="minfo">
              <span className="minfo-icon">ℹ</span>
              <span>Commits from <strong style={{ color: 'var(--c-text-strong)' }}>{from}</strong> → <strong style={{ color: 'var(--c-text-strong)' }}>{target}</strong></span>
            </div>
          </div>
          <div className="modal-footer">
            <button className="mbtn-cancel" onClick={onClose}>Cancel</button>
            <button className={`mbtn-ok${doing ? ' doing' : ''}`} onClick={execute} disabled={doing}>
              {doing
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>Running…</span>
                : `${strategy === 'merge' ? 'Merge' : strategy === 'rebase' ? 'Rebase' : 'Squash'} →`}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  )
}
