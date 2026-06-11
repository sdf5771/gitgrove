import { useState } from 'react'
import { LOCAL_BRANCHES, type Branch } from '../../data/mockData'
import { ModalShell, SuccessState } from './ModalShell'

interface Props {
  onClose: () => void
  branches?: Branch[]
}

export function MergeModal({ onClose, branches }: Props) {
  const opts = (branches ?? LOCAL_BRANCHES).filter(b => !b.current)
  const [from, setFrom] = useState(opts[0]?.name ?? '')
  const [strategy, setStrategy] = useState('merge')
  const [doing, setDoing] = useState(false)
  const [isDone, setIsDone] = useState(false)

  const execute = () => {
    setDoing(true)
    setTimeout(() => { setDoing(false); setIsDone(true) }, 1300)
    setTimeout(() => onClose(), 2100)
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
          sub={<><strong style={{ color: 'var(--c-text)' }}>{from}</strong> → <strong style={{ color: 'var(--c-text)' }}>main</strong></>} />
      ) : (
        <>
          <div className="modal-body">
            <div className="mfield">
              <label>Into</label>
              <div className="mval"><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e6a536', flexShrink: 0, display: 'inline-block' }} />main</div>
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
              <span>3 commits from <strong style={{ color: 'var(--c-text-strong)' }}>{from}</strong> → <strong style={{ color: 'var(--c-text-strong)' }}>main</strong></span>
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
