interface Props {
  branch: string
  ahead?: number
  behind?: number
  remote?: string
  onSettings: () => void
  githubUser?: { login: string; avatar_url: string } | null
}

export function StatusBar({ branch, ahead, behind, remote, onSettings, githubUser }: Props) {
  return (
    <div className="sbar">
      <div className="sbranch">
        <span className="sdot" />
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: .7 }}>
          <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/>
        </svg>
        {branch}
      </div>
      {(ahead !== undefined || behind !== undefined) && (
        <>
          <span className="ssep">·</span>
          {ahead !== undefined && ahead > 0 && <span><span className="sahead">↑ {ahead}</span></span>}
          {behind !== undefined && behind > 0 && <span><span style={{ color: 'var(--c-warning)' }}>↓ {behind}</span></span>}
          {(ahead === 0 && behind === 0) && <span style={{ color: 'var(--c-text-faint)', fontSize: 11 }}>up to date</span>}
        </>
      )}
      {remote && (
        <>
          <span className="ssep">·</span>
          <span>{remote}</span>
        </>
      )}
      {githubUser && (
        <button
          onClick={() => window.appAPI?.openReleaseUrl(`https://github.com/${githubUser.login}`)}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, marginRight: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, transition: 'background 120ms' }}
          onMouseOver={e => (e.currentTarget.style.background = 'var(--c-bg-elevated)')}
          onMouseOut={e => (e.currentTarget.style.background = 'none')}
          title={`github.com/${githubUser.login}`}
        >
          <img src={githubUser.avatar_url} style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--c-border)' }} />
          <span style={{ fontSize: 11, color: 'var(--c-text-muted)', fontFamily: 'var(--font-mono)' }}>@{githubUser.login}</span>
        </button>
      )}
      <button onClick={onSettings} style={{ marginLeft: githubUser ? undefined : 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-faint)', fontSize: '11px', padding: '0 4px', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 4, transition: 'color 120ms', fontFamily: 'var(--font-mono)' }}
        onMouseOver={e => (e.currentTarget.style.color = 'var(--c-text)')}
        onMouseOut={e => (e.currentTarget.style.color = 'var(--c-text-faint)')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Settings
      </button>
    </div>
  )
}
