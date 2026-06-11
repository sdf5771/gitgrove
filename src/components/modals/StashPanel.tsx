import { useState } from 'react'
import { COMMITS, INIT_STASHES, type Stash } from '../../data/mockData'

export function StashPanel({ onClose }: { onClose: () => void }) {
  const [stashes, setStashes] = useState<Stash[]>(INIT_STASHES)
  const [msg, setMsg] = useState('')
  const [toast, setToast] = useState('')

  const showToast = (t: string) => { setToast(t); setTimeout(() => setToast(''), 1800) }

  const push = () => {
    const s: Stash = { idx: 0, msg: msg || `WIP on main: ${COMMITS[0].id.slice(0, 7)} ${COMMITS[0].msg.slice(0, 28)}…`, branch: 'main', files: 3, time: 'just now' }
    setStashes(p => [s, ...p.map((x, i) => ({ ...x, idx: i + 1 }))])
    setMsg(''); showToast('Stash pushed')
  }
  const pop = (idx: number) => {
    setStashes(p => p.filter(x => x.idx !== idx).map((x, i) => ({ ...x, idx: i })))
    showToast('Stash applied & dropped')
    setTimeout(() => onClose(), 1500)
  }
  const drop = (idx: number) => {
    setStashes(p => p.filter(x => x.idx !== idx).map((x, i) => ({ ...x, idx: i })))
    showToast('Stash dropped')
  }

  return (
    <div className="stash-overlay">
      <div className="stash-bd" onClick={onClose} />
      <div className="stash-panel">
        <div className="pnl-hdr" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold-300)" strokeWidth="2.2"><polyline points="8,17 3,12 8,7"/><polyline points="16,17 21,12 16,7"/></svg>
          <h3>Stash</h3>
          <span style={{ marginLeft: 5, fontSize: 10, fontFamily: 'var(--font-display)', color: 'var(--c-text-faint)' }}>({stashes.length})</span>
          <button className="modal-close" style={{ marginLeft: 'auto' }} onClick={onClose}>×</button>
        </div>
        <div className="stash-push">
          <div className="stash-push-title">Push stash</div>
          <input className="stash-input" placeholder="Optional message…" value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && push()} />
          <button className="stash-push-btn" onClick={push}>↓ Push stash</button>
        </div>
        <div style={{ padding: '5px 12px 3px', fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--c-text-faint)', fontFamily: 'var(--font-display)', borderBottom: '1px solid var(--c-divider)' }}>Saved stashes</div>
        <div className="stash-list">
          {!stashes.length && (
            <div className="stash-empty">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
              No stashes
            </div>
          )}
          {stashes.map(s => (
            <div key={s.idx} className="stash-item">
              <div className="stash-item-hd">
                <span className="stash-idx">stash@{'{' + s.idx + '}'}</span>
                <span className="stash-msg">{s.msg}</span>
              </div>
              <div className="stash-meta"><span>{s.branch}</span><span>·</span><span>{s.files}f</span><span>·</span><span>{s.time}</span></div>
              <div className="stash-actions">
                <button className="stash-act pop" onClick={() => pop(s.idx)}>↑ Pop</button>
                <button className="stash-act" onClick={() => showToast('Applied (kept)')}>Apply</button>
                <button className="stash-act drop" onClick={() => drop(s.idx)}>Drop</button>
              </div>
            </div>
          ))}
        </div>
        {toast && (
          <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, padding: '7px 12px', background: 'var(--c-bg-elevated)', border: '1px solid var(--c-gold-border)', borderRadius: 'var(--r2)', fontSize: 12, color: 'var(--c-text-strong)', textAlign: 'center', animation: 'mslide 200ms ease', boxShadow: '0 4px 16px rgba(0,0,0,.5)' }}>{toast}</div>
        )}
      </div>
    </div>
  )
}
