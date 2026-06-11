interface Props {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ title, message, confirmLabel = '확인', danger = false, onConfirm, onCancel }: Props) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--c-bg-panel)',
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r3)',
        padding: 24,
        maxWidth: 380,
        width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text-strong)', marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--c-text)', lineHeight: 1.6, marginBottom: 20 }}>{message}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="mbtn-cancel" onClick={onCancel}>Cancel</button>
          <button
            className={danger ? 'mbtn-danger' : 'mbtn-ok'}
            style={danger ? { background: 'var(--c-danger)', borderColor: 'var(--c-danger)' } : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
