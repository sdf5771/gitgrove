import type { ReactNode } from 'react'

interface Props {
  title: string
  icon?: ReactNode
  width?: number
  onClose: () => void
  children: ReactNode
}

export function ModalShell({ title, icon, width = 440, onClose, children }: Props) {
  return (
    <div className="modal-bd" onClick={onClose}>
      <div className="modal-box" style={{ width }} onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {icon}
            <h3>{title}</h3>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function SuccessState({ msg, sub }: { msg: string; sub?: ReactNode }) {
  return (
    <div style={{ padding: '28px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(111,207,124,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--c-success)' }}>✓</div>
      <div style={{ color: 'var(--c-success)', fontFamily: 'var(--font-display)', fontSize: 14 }}>{msg}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>{sub}</div>}
    </div>
  )
}
