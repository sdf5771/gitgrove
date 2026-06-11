import { useState } from 'react'

type SettingsTab = 'git' | 'appearance' | 'remotes' | 'github'

const GITHUB_TOKEN_KEY = 'gitgrove:githubToken'
const SETTINGS_KEY = 'gitgrove:settings'

const loadSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>
  } catch { return {} }
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>('git')
  const [cfg, setCfg] = useState({ name: 'Sarah Kim', email: 'sarah@example.com', defaultBranch: 'main', gpg: false })
  const [remotes, setRemotes] = useState([
    { n: 'origin', url: 'git@github.com:example/gitgrove-project.git' },
    { n: 'upstream', url: 'git@github.com:org/gitgrove-project.git' },
  ])
  const [newRemote, setNewRemote] = useState({ n: '', url: '' })
  const [saved, setSaved] = useState(false)
  const [githubToken, setGithubToken] = useState(() => {
    try { return localStorage.getItem(GITHUB_TOKEN_KEY) ?? '' } catch { return '' }
  })
  const [showToken, setShowToken] = useState(false)

  const _saved = loadSettings()
  const [density, setDensity] = useState<'comfortable' | 'compact'>(
    (_saved.density === 'compact' ? 'compact' : 'comfortable')
  )
  const [fontSize, setFontSize] = useState<string>(
    typeof _saved.fontSize === 'string' ? _saved.fontSize : '12'
  )
  const [tabWidth, setTabWidth] = useState<string>(
    typeof _saved.tabWidth === 'string' ? _saved.tabWidth : '2'
  )
  const [showDiffStats, setShowDiffStats] = useState<boolean>(
    typeof _saved.showDiffStats === 'boolean' ? _saved.showDiffStats : true
  )

  const save = () => {
    const settings = { density, fontSize, tabWidth, showDiffStats }
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch {}
    try { localStorage.setItem(GITHUB_TOKEN_KEY, githubToken) } catch {}
    document.documentElement.style.setProperty('--editor-font-size', `${fontSize}px`)
    window.dispatchEvent(new CustomEvent('gitgrove:settings-changed', { detail: { density, fontSize } }))
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }
  const upCfg = (k: keyof typeof cfg) => (v: string | boolean) => setCfg(p => ({ ...p, [k]: v }))

  return (
    <div className="sett-wrap">
      <div className="sett-bd" onClick={onClose} />
      <div className="sett-panel">
        <div className="pnl-hdr" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold-300)" strokeWidth="2.2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          <h3>Settings</h3>
          <button className="modal-close" style={{ marginLeft: 'auto' }} onClick={onClose}>×</button>
        </div>
        <div className="sett-tabs">
          {([['git', 'Git Config'], ['appearance', 'Appearance'], ['remotes', 'Remotes'], ['github', 'GitHub']] as const).map(([id, label]) => (
            <button key={id} className={`sett-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="sett-body">
          {tab === 'git' && (
            <>
              <div className="sett-section">
                <div className="sett-sec-ttl">Identity</div>
                <div className="sett-field"><div className="sett-lbl">Display name</div><input className="sett-inp" value={cfg.name} onChange={e => upCfg('name')(e.target.value)} /></div>
                <div className="sett-field"><div className="sett-lbl">Email</div><input className="sett-inp" value={cfg.email} onChange={e => upCfg('email')(e.target.value)} /></div>
              </div>
              <div className="sett-section">
                <div className="sett-sec-ttl">Repository</div>
                <div className="sett-field">
                  <div className="sett-lbl">Default branch name</div>
                  <select className="sett-sel" value={cfg.defaultBranch} onChange={e => upCfg('defaultBranch')(e.target.value)}>
                    {['main', 'master', 'develop', 'trunk'].map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div className="sett-section">
                <div className="sett-sec-ttl">Commit signing</div>
                <div className="sett-toggle" onClick={() => upCfg('gpg')(!cfg.gpg)}>
                  <div className="sett-toggle-info"><div className="sett-toggle-lbl">GPG signing</div><div className="sett-toggle-sub">Sign commits with your GPG key</div></div>
                  <button className={`sett-sw ${cfg.gpg ? 'on' : 'off'}`} />
                </div>
                {cfg.gpg && <div className="sett-field"><div className="sett-lbl">GPG Key ID</div><input className="sett-inp" placeholder="0xABCD1234…" style={{ fontFamily: 'var(--font-mono)' }} /></div>}
              </div>
            </>
          )}
          {tab === 'appearance' && (
            <>
              <div className="sett-section">
                <div className="sett-sec-ttl">Graph</div>
                <div className="sett-field"><div className="sett-lbl">Row density</div>
                  <select className="sett-sel" value={density} onChange={e => setDensity(e.target.value as 'comfortable' | 'compact')}>
                    {(['comfortable', 'compact'] as const).map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                  </select>
                </div>
                <div className="sett-toggle" onClick={() => setShowDiffStats(v => !v)}>
                  <div className="sett-toggle-info"><div className="sett-toggle-lbl">Show diff stats per row</div><div className="sett-toggle-sub">+adds / −dels on each commit row</div></div>
                  <button className={`sett-sw ${showDiffStats ? 'on' : 'off'}`} />
                </div>
              </div>
              <div className="sett-section">
                <div className="sett-sec-ttl">Editor</div>
                <div className="sett-field"><div className="sett-lbl">Font size</div>
                  <select className="sett-sel" value={fontSize} onChange={e => setFontSize(e.target.value)}>
                    {['11','12','13','14'].map(v => <option key={v} value={v}>{v}px</option>)}
                  </select>
                </div>
                <div className="sett-field"><div className="sett-lbl">Tab width</div>
                  <select className="sett-sel" value={tabWidth} onChange={e => setTabWidth(e.target.value)}>
                    {['2','4','8'].map(v => <option key={v} value={v}>{v} spaces</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
          {tab === 'remotes' && (
            <>
              <div className="sett-section">
                <div className="sett-sec-ttl">Configured remotes</div>
                {remotes.map(r => (
                  <div key={r.n} className="sett-remote">
                    <span className="sett-remote-name">{r.n}</span>
                    <span className="sett-remote-url">{r.url}</span>
                    <button className="sett-del" onClick={() => setRemotes(p => p.filter(x => x.n !== r.n))}>×</button>
                  </div>
                ))}
              </div>
              <div className="sett-section">
                <div className="sett-sec-ttl">Add remote</div>
                <div className="sett-field"><div className="sett-lbl">Name</div><input className="sett-inp" placeholder="upstream" value={newRemote.n} onChange={e => setNewRemote(p => ({ ...p, n: e.target.value }))} /></div>
                <div className="sett-field"><div className="sett-lbl">URL</div><input className="sett-inp" placeholder="git@github.com:org/repo.git" value={newRemote.url} onChange={e => setNewRemote(p => ({ ...p, url: e.target.value }))} /></div>
                <button className="sallbtn" style={{ alignSelf: 'flex-start', padding: '5px 14px' }}
                  onClick={() => { if (newRemote.n && newRemote.url) { setRemotes(p => [...p, newRemote]); setNewRemote({ n: '', url: '' }) } }}>
                  + Add remote
                </button>
              </div>
            </>
          )}
          {tab === 'github' && (
            <div className="sett-section">
              <div className="sett-sec-ttl">Personal Access Token</div>
              <div className="sett-field">
                <div className="sett-lbl">Token</div>
                <div style={{ position: 'relative' }}>
                  <input
                    className="sett-inp"
                    type={showToken ? 'text' : 'password'}
                    value={githubToken}
                    onChange={e => setGithubToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    style={{ fontFamily: 'var(--font-mono)', paddingRight: 36 }}
                  />
                  <button
                    onClick={() => setShowToken(v => !v)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-faint)', fontSize: 13, padding: 0 }}
                  >
                    {showToken ? '🙈' : '👁'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.4 }}>
                  PR 뷰에서 실제 Pull Request를 조회하는 데 사용됩니다.
                  <br />
                  <span style={{ color: 'var(--c-info)' }}>repo</span> 권한이 필요합니다.
                </div>
              </div>
              <div className="sett-section">
                <div className="sett-sec-ttl">토큰 생성 방법</div>
                <div style={{ fontSize: 11, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>
                  1. GitHub → Settings → Developer settings<br />
                  2. Personal access tokens → Tokens (classic)<br />
                  3. Generate new token → <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--c-bg-inset)', padding: '1px 4px', borderRadius: 2 }}>repo</code> 권한 선택
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="sett-footer">
          <button className="mbtn-cancel" onClick={onClose}>Close</button>
          <button className="mbtn-ok" onClick={save}>{saved ? '✓ Saved' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  )
}
