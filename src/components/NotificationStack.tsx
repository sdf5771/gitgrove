import type { Notification } from '../hooks/useNotifications'

const icons = { success: '✓', info: 'ℹ', warning: '⚠', error: '✗' } as const
const colors = { success: 'var(--c-success)', info: 'var(--c-info)', warning: 'var(--c-warning)', error: 'var(--c-danger)' } as const

interface Props {
  notifs: Notification[]
  onDismiss: (id: number) => void
}

export function NotificationStack({ notifs, onDismiss }: Props) {
  return (
    <div className="notif-stack">
      {notifs.map(n => (
        <div key={n.id} className={`notif notif-${n.type}`} style={n.onClick ? { cursor: 'pointer' } : undefined}
          onClick={() => { n.onClick?.(); onDismiss(n.id) }}>
          <span className="notif-icon" style={{ color: colors[n.type] }}>{icons[n.type]}</span>
          <div className="notif-content">
            <div className="notif-title">{n.title}</div>
            {n.msg && <div className="notif-msg">{n.msg}{n.onClick && <span style={{ marginLeft: 6, color: 'var(--c-info)', fontSize: 10 }}>↗ 클릭하여 다운로드</span>}</div>}
          </div>
          <div className="notif-bar" style={{ animationDuration: `${n.dur}ms` }} />
        </div>
      ))}
    </div>
  )
}
