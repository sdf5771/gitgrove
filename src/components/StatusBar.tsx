interface Props {
  branch: string
  onSettings: () => void
}

export function StatusBar({ branch, onSettings }: Props) {
  return (
    <div className="sbar">
      <div className="sbranch">
        <span className="sdot" />
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: .7 }}>
          <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/>
        </svg>
        {branch}
      </div>
      <span className="ssep">·</span>
      <span><span className="sahead">↑ 2</span></span>
      <span className="ssep">·</span><span>origin/main</span>
      <span className="ssep">·</span><span>Last fetched just now</span>
      <button onClick={onSettings} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-faint)', fontSize: '11px', padding: '0 4px', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 4, transition: 'color 120ms', fontFamily: 'var(--font-mono)' }}
        onMouseOver={e => (e.currentTarget.style.color = 'var(--c-text)')}
        onMouseOut={e => (e.currentTarget.style.color = 'var(--c-text-faint)')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        gitgrove-project · v1.2.0
      </button>
    </div>
  )
}
