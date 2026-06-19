import { useState, useEffect } from 'react'
import { getUser, getRateLimit, GithubApiError } from '../../utils/githubClient'
import { getCurrentUser, GitlabApiError, type GitlabUser } from '../../utils/gitlabClient'
import { normalizeGitlabHost } from '../../utils/gitlab'
import { NOTIFICATION_SOUNDS } from '../../utils/notifSettings'
import { Geuru } from '../Geuru'

export type SettingsTab = 'git' | 'appearance' | 'remotes' | 'github' | 'gitlab'

const GITLAB_COM_HOST = 'https://gitlab.com'
type GitlabKind = 'com' | 'self'

const GITHUB_TOKEN_KEY = 'gitgrove:githubToken'
const SETTINGS_KEY = 'gitgrove:settings'

const loadSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>
  } catch { return {} }
}

// PAT 발급 딥링크 (scope/description 사전세팅)
const CLASSIC_TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=repo,read:user,notifications&description=GitGrove'
const FINEGRAINED_TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new'

type VerifyState = 'idle' | 'verifying' | 'success' | 'error'

interface VerifyResult {
  login: string
  avatarUrl: string
  scopes: string[]
  rate: { remaining: number; limit: number } | null
}

// 토큰 영속화 추상화: safeStorage(메인) 우선, 미가용 시에만 localStorage 평문 fallback.
// 소비자(App.tsx / PRView.tsx)가 async IPC 조회로 이관됐으므로(v1.7.0),
// safeStorage 사용 가능 시 평문 미러를 남기지 않고 오히려 삭제해 보안을 마무리한다.
async function persistToken(token: string): Promise<void> {
  let encrypted = false
  try {
    if (await window.appAPI?.githubIsEncryptionAvailable()) {
      encrypted = await window.appAPI.githubSetToken(token)
    }
  } catch { encrypted = false }
  try {
    if (encrypted) {
      // safeStorage에 저장 성공 → 평문 미러 제거 (보안)
      localStorage.removeItem(GITHUB_TOKEN_KEY)
    } else if (token) {
      // safeStorage 미가용 → 평문 fallback
      localStorage.setItem(GITHUB_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(GITHUB_TOKEN_KEY)
    }
  } catch { /* ignore */ }
}

// 초기 토큰 로드 + 1회 마이그레이션: localStorage 평문 토큰이 있으면 safeStorage로 이관 후 평문 삭제.
async function loadInitialToken(): Promise<string> {
  let plain = ''
  try { plain = localStorage.getItem(GITHUB_TOKEN_KEY) ?? '' } catch { plain = '' }
  try {
    if (await window.appAPI?.githubIsEncryptionAvailable()) {
      const stored = await window.appAPI.githubGetToken()
      if (stored) {
        // 암호화 저장본 우선. 남아 있을 수 있는 평문 미러 제거.
        try { localStorage.removeItem(GITHUB_TOKEN_KEY) } catch { /* ignore */ }
        return stored
      }
      if (plain) {
        // 마이그레이션: 평문 → safeStorage 이관 후 평문 삭제
        const ok = await window.appAPI.githubSetToken(plain)
        if (ok) { try { localStorage.removeItem(GITHUB_TOKEN_KEY) } catch { /* ignore */ } }
      }
    }
  } catch { /* fallback: plain 사용 */ }
  return plain
}

// GitLab PAT 발급 딥링크 — host-상대. self-hosted 인스턴스에서도 같은 경로를 연다.
function gitlabTokenUrl(host: string): string {
  const base = normalizeGitlabHost(host) || GITLAB_COM_HOST
  return `${base}/-/user_settings/personal_access_tokens?scopes=api,read_user`
}

interface GitlabVerifyResult {
  username: string
  name: string
  avatarUrl: string | null
  webUrl: string
  host: string
}

function glResultFromUser(user: GitlabUser, host: string): GitlabVerifyResult {
  return {
    username: user.username,
    name: user.name,
    avatarUrl: user.avatar_url,
    webUrl: user.web_url,
    host,
  }
}

interface Props {
  onClose: () => void
  repoPath?: string | null
  /** 처음 표시할 탭 (예: GitLab 미연결 유도 시 'gitlab') */
  initialTab?: SettingsTab
}

export function SettingsPanel({ onClose, repoPath, initialTab }: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'git')
  const [cfg, setCfg] = useState({ name: '', email: '', defaultBranch: 'main', gpg: false })
  const [remotes, setRemotes] = useState<Array<{ n: string; url: string }>>([])
  const [newRemote, setNewRemote] = useState({ n: '', url: '' })
  const [saved, setSaved] = useState(false)
  const [cfgLoading, setCfgLoading] = useState(false)
  const [githubToken, setGithubToken] = useState(() => {
    try { return localStorage.getItem(GITHUB_TOKEN_KEY) ?? '' } catch { return '' }
  })
  const [showToken, setShowToken] = useState(false)

  // GitHub 토큰 검증 상태
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [verifyError, setVerifyError] = useState<string>('')

  // GitLab 탭 상태 (GL4)
  const [glKind, setGlKind] = useState<GitlabKind>('com')
  const [glHostInput, setGlHostInput] = useState('') // self-hosted Host URL 입력
  const [glToken, setGlToken] = useState('')
  const [glShowToken, setGlShowToken] = useState(false)
  const [glVerifyState, setGlVerifyState] = useState<VerifyState>('idle')
  const [glVerifyResult, setGlVerifyResult] = useState<GitlabVerifyResult | null>(null)
  const [glVerifyError, setGlVerifyError] = useState('')

  // 현재 선택된 종류로부터 사용할 host (정규화 후). com이면 고정.
  const glActiveHost = glKind === 'com' ? GITLAB_COM_HOST : normalizeGitlabHost(glHostInput)

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
  // 알림 사운드 설정 (NotificationBell이 소비) — 기본 on / 'Glass'.
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState<boolean>(
    typeof _saved.notificationSoundEnabled === 'boolean' ? _saved.notificationSoundEnabled : true
  )
  const [notificationSound, setNotificationSound] = useState<string>(
    typeof _saved.notificationSound === 'string' && _saved.notificationSound ? _saved.notificationSound : 'Glass'
  )

  useEffect(() => {
    if (!repoPath) return
    setCfgLoading(true)
    Promise.all([
      window.gitAPI?.getConfig(repoPath),
      window.gitAPI?.getRemotes(repoPath),
    ]).then(([gitCfg, gitRemotes]) => {
      if (gitCfg) {
        setCfg(p => ({ ...p, name: gitCfg.name, email: gitCfg.email, defaultBranch: gitCfg.defaultBranch }))
      }
      if (gitRemotes) {
        setRemotes(gitRemotes.map(r => ({ n: r.name, url: r.url })))
      }
    }).catch(() => {}).finally(() => setCfgLoading(false))
  }, [repoPath])

  // 마운트 시 safeStorage 우선 로드 + 1회 마이그레이션
  useEffect(() => {
    let cancelled = false
    loadInitialToken().then(t => { if (!cancelled) setGithubToken(t) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // 마운트 시 GitLab 기존 연결 복원: 연결된 host가 있으면 종류/host/토큰을 반영하고
  // 연결됨(success) 상태로 표시. (GitHub 탭 토큰 복원 패턴 미러)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const hosts = await window.appAPI?.gitlabListHosts()
        if (!hosts || hosts.length === 0) return
        // gitlab.com을 우선, 없으면 첫 self-hosted host.
        const host = hosts.find(h => normalizeGitlabHost(h) === GITLAB_COM_HOST) ?? hosts[0]
        const token = await window.appAPI?.gitlabGetToken(host)
        if (cancelled || !token) return
        const normalized = normalizeGitlabHost(host)
        const isCom = normalized === GITLAB_COM_HOST
        setGlKind(isCom ? 'com' : 'self')
        if (!isCom) setGlHostInput(normalized)
        setGlToken(token)
        try {
          const user = await getCurrentUser(normalized, token, { cache: false })
          if (cancelled) return
          setGlVerifyResult(glResultFromUser(user, normalized))
          setGlVerifyState('success')
        } catch {
          // 저장된 토큰이 더 이상 유효하지 않을 수 있음 — idle 유지(연결됨으로 단정 금지).
        }
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [])

  const save = async () => {
    const settings = { density, fontSize, tabWidth, showDiffStats, notificationSoundEnabled, notificationSound }
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* ignore */ }
    await persistToken(githubToken)
    document.documentElement.style.setProperty('--editor-font-size', `${fontSize}px`)
    window.dispatchEvent(new CustomEvent('gitgrove:settings-changed', { detail: { density, fontSize } }))

    if (repoPath) {
      try {
        await window.gitAPI?.setConfig(repoPath, { name: cfg.name, email: cfg.email, defaultBranch: cfg.defaultBranch })
      } catch { /* ignore */ }
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  const upCfg = (k: keyof typeof cfg) => (v: string | boolean) => setCfg(p => ({ ...p, [k]: v }))

  // 토큰 입력 변경 시 검증 결과 초기화
  const onTokenChange = (v: string) => {
    setGithubToken(v)
    if (verifyState !== 'idle') { setVerifyState('idle'); setVerifyResult(null); setVerifyError('') }
  }

  // GitHub 토큰 검증: GET /user → scope/rate 조회
  const verifyToken = async () => {
    const token = githubToken.trim()
    if (!token) { setVerifyState('error'); setVerifyError('토큰을 입력하세요.'); return }
    setVerifyState('verifying'); setVerifyError(''); setVerifyResult(null)
    try {
      // 공용 클라이언트로 일원화(B8). 토큰 검증은 항상 최신이어야 하므로 cache:false.
      // 비-ok 응답은 GithubApiError로 throw → 아래 catch에서 status별 메시지 매핑.
      const { data: user, headers } = await getUser<{ login: string; avatar_url: string }>(token, { cache: false })

      const scopesHeader = headers.get('X-OAuth-Scopes') ?? ''
      const scopes = scopesHeader.split(',').map(s => s.trim()).filter(Boolean)

      // scope 부족 점검 (classic 토큰은 X-OAuth-Scopes 노출, fine-grained는 비어있을 수 있음)
      const hasScopeHeader = scopesHeader.length > 0
      if (hasScopeHeader && !scopes.includes('repo')) {
        setVerifyState('error')
        setVerifyError(`scope 부족: 'repo' 권한이 필요합니다. (현재: ${scopes.join(', ') || '없음'})`)
        return
      }

      // rate limit 조회 (실패해도 검증 자체는 성공으로 취급). 항상 최신 → cache:false.
      let rate: VerifyResult['rate'] = null
      try {
        const { data } = await getRateLimit<{ rate?: { remaining: number; limit: number } }>(token, { cache: false })
        if (data.rate) rate = { remaining: data.rate.remaining, limit: data.rate.limit }
      } catch { /* rate 조회 실패 무시 */ }

      setVerifyResult({ login: user.login, avatarUrl: user.avatar_url, scopes, rate })
      setVerifyState('success')
      // 검증 성공 토큰은 즉시 영속화 + 구독부 갱신
      await persistToken(token)
      window.dispatchEvent(new CustomEvent('gitgrove:settings-changed'))
    } catch (err) {
      setVerifyState('error')
      if (err instanceof GithubApiError) {
        if (err.status === 401) {
          setVerifyError('토큰이 유효하지 않아요 · 401 · 만료되었거나 잘못된 토큰이에요')
        } else if (err.status === 403) {
          setVerifyError('접근이 거부됐어요 · 403 · 사용 한도 또는 권한 부족일 수 있어요')
        } else {
          setVerifyError(`검증에 실패했어요 · HTTP ${err.status}`)
        }
      } else {
        setVerifyError('네트워크 오류 · 검증에 실패했어요')
      }
    }
  }

  // 연결 해제: 토큰 제거 + safeStorage/localStorage 삭제 + 이벤트 dispatch
  const disconnect = async () => {
    setGithubToken('')
    setVerifyState('idle'); setVerifyResult(null); setVerifyError('')
    await persistToken('')
    window.dispatchEvent(new CustomEvent('gitgrove:settings-changed'))
  }

  // ── GitLab 탭 핸들러 (GL4) ──

  // 종류 전환: com↔self. 전환 시 진행 중 검증 상태 초기화(host가 바뀌므로).
  const onGlKindChange = (kind: GitlabKind) => {
    if (kind === glKind) return
    setGlKind(kind)
    if (glVerifyState !== 'idle') { setGlVerifyState('idle'); setGlVerifyResult(null); setGlVerifyError('') }
  }

  const onGlHostChange = (v: string) => {
    setGlHostInput(v)
    if (glVerifyState !== 'idle') { setGlVerifyState('idle'); setGlVerifyResult(null); setGlVerifyError('') }
  }

  const onGlTokenChange = (v: string) => {
    setGlToken(v)
    if (glVerifyState !== 'idle') { setGlVerifyState('idle'); setGlVerifyResult(null); setGlVerifyError('') }
  }

  // GitLab 토큰 검증: GET /user → 성공 시 host-키로 토큰 저장 + 연결됨 카드.
  const verifyGitlab = async () => {
    const token = glToken.trim()
    const host = glActiveHost
    if (!host) { setGlVerifyState('error'); setGlVerifyError('Host URL을 입력하세요.'); return }
    if (!token) { setGlVerifyState('error'); setGlVerifyError('토큰을 입력하세요.'); return }
    setGlVerifyState('verifying'); setGlVerifyError(''); setGlVerifyResult(null)
    try {
      const user = await getCurrentUser(host, token, { cache: false })
      setGlVerifyResult(glResultFromUser(user, host))
      setGlVerifyState('success')
      // 검증 성공 토큰을 host-키로 안전 저장(safeStorage, IPC 내부에서 host 정규화).
      try { await window.appAPI?.gitlabSetToken(host, token) } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('gitgrove:settings-changed'))
    } catch (err) {
      setGlVerifyState('error')
      if (err instanceof GitlabApiError) {
        if (err.status === 401) {
          setGlVerifyError('토큰이 유효하지 않아요 · 401 · 만료되었거나 api scope가 없는 토큰이에요. 위 링크에서 새로 발급해요')
        } else if (err.rateLimited) {
          setGlVerifyError(err.message)
        } else if (err.status === 403) {
          setGlVerifyError('접근이 거부됐어요 · 403 · 토큰 권한(api, read_user)을 확인해요')
        } else if (err.status === 0) {
          setGlVerifyError('Host URL이 올바른지 확인하세요.')
        } else {
          setGlVerifyError(`검증에 실패했어요 · HTTP ${err.status} · 토큰 또는 호스트를 확인하세요`)
        }
      } else {
        setGlVerifyError('네트워크 오류 · 검증에 실패했어요 · 호스트에 연결할 수 있는지 확인하세요')
      }
    }
  }

  // GitLab 연결 해제: host-키 토큰 제거.
  const disconnectGitlab = async () => {
    const host = glVerifyResult?.host ?? glActiveHost
    setGlVerifyState('idle'); setGlVerifyResult(null); setGlVerifyError('')
    if (host) { try { await window.appAPI?.gitlabRemoveToken(host) } catch { /* ignore */ } }
    window.dispatchEvent(new CustomEvent('gitgrove:settings-changed'))
  }

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
          {([['git', 'Git Config'], ['appearance', 'Appearance'], ['remotes', 'Remotes'], ['github', 'GitHub'], ['gitlab', 'GitLab']] as const).map(([id, label]) => (
            <button
              key={id}
              className={`sett-tab${id === 'gitlab' ? ' gl' : ''}${tab === id ? ' on' : ''}`}
              onClick={() => setTab(id)}
            >{label}</button>
          ))}
        </div>
        <div className="sett-body">
          {tab === 'git' && (
            <>
              {cfgLoading && <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--c-text-faint)' }}>Loading git config…</div>}
              <div className="sett-section">
                <div className="sett-sec-ttl">Identity</div>
                <div className="sett-field"><div className="sett-lbl">Display name</div><input className="sett-inp" value={cfg.name} onChange={e => upCfg('name')(e.target.value)} placeholder="Your Name" /></div>
                <div className="sett-field"><div className="sett-lbl">Email</div><input className="sett-inp" value={cfg.email} onChange={e => upCfg('email')(e.target.value)} placeholder="you@example.com" /></div>
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
              <div className="sett-section">
                <div className="sett-sec-ttl">알림</div>
                <div className="sett-toggle" onClick={() => setNotificationSoundEnabled(v => !v)}>
                  <div className="sett-toggle-info"><div className="sett-toggle-lbl">알림 소리</div><div className="sett-toggle-sub">새 알림이 오면 소리로 알려줘요</div></div>
                  <button className={`sett-sw ${notificationSoundEnabled ? 'on' : 'off'}`} />
                </div>
                <div className="sett-field"><div className="sett-lbl">사운드</div>
                  <select
                    className="sett-sel"
                    aria-label="알림 사운드"
                    value={notificationSound}
                    disabled={!notificationSoundEnabled}
                    onChange={e => setNotificationSound(e.target.value)}
                  >
                    {NOTIFICATION_SOUNDS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
          {tab === 'remotes' && (
            <>
              <div className="sett-section">
                <div className="sett-sec-ttl">Configured remotes</div>
                {remotes.length === 0 && !cfgLoading && (
                  <div style={{ fontSize: 12, color: 'var(--c-text-faint)', padding: '4px 0' }}>No remotes configured</div>
                )}
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
                <div className="sett-token-row">
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      className="sett-inp"
                      type={showToken ? 'text' : 'password'}
                      value={githubToken}
                      onChange={e => onTokenChange(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      style={{ fontFamily: 'var(--font-mono)', paddingRight: 42 }}
                    />
                    <button
                      type="button"
                      className="tok-eye"
                      title={showToken ? '토큰 숨기기' : '토큰 보기'}
                      aria-label={showToken ? '토큰 숨기기' : '토큰 보기'}
                      onClick={() => setShowToken(v => !v)}
                    >
                      <Geuru expr={showToken ? 'idle' : 'blink'} scale={1.15} />
                    </button>
                  </div>
                  <button
                    className="sett-verify-btn"
                    onClick={verifyToken}
                    disabled={verifyState === 'verifying' || !githubToken.trim()}
                  >
                    {verifyState === 'verifying'
                      ? (<><span className="sett-spinner" />Verifying…</>)
                      : 'Verify'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.4 }}>
                  PR 뷰에서 실제 Pull Request를 조회하는 데 써요.
                  <br />
                  필요 scope: <span className="sett-scope-chip">repo</span>{' '}
                  <span className="sett-scope-chip">read:user</span>{' '}
                  <span className="sett-scope-chip">notifications</span>
                </div>
              </div>

              {/* 검증 결과 */}
              {verifyState === 'success' && verifyResult && (
                <div className="sett-verify-ok">
                  <div className="sett-verify-acct">
                    <img className="sett-verify-avatar" src={verifyResult.avatarUrl} alt="" />
                    <div className="sett-verify-acct-info">
                      <div className="sett-verify-acct-login">@{verifyResult.login}</div>
                      <div className="sett-verify-acct-sub">연결됨 · GitHub 계정 확인 완료</div>
                    </div>
                  </div>
                  <div className="sett-verify-meta">
                    <span className="sett-verify-meta-lbl">Scopes</span>
                    <span className="sett-verify-meta-val">
                      {verifyResult.scopes.length > 0
                        ? verifyResult.scopes.join(', ')
                        : '(fine-grained 또는 미노출)'}
                    </span>
                  </div>
                  {verifyResult.scopes.length > 0 && !verifyResult.scopes.includes('notifications') && (
                    <div className="sett-verify-meta" style={{ color: 'var(--c-warning)' }}>
                      <span className="sett-verify-meta-lbl">알림</span>
                      <span className="sett-verify-meta-val">
                        notifications 권한이 없어 알림 벨이 동작하지 않아요. 위 링크로 토큰을 다시 발급하세요.
                      </span>
                    </div>
                  )}
                  {verifyResult.rate && (
                    <div className="sett-verify-meta">
                      <span className="sett-verify-meta-lbl">Rate limit</span>
                      <span className="sett-verify-meta-val">
                        {verifyResult.rate.remaining} / {verifyResult.rate.limit} 남음
                      </span>
                    </div>
                  )}
                  <button className="sett-disconnect-btn" onClick={disconnect}>Disconnect</button>
                </div>
              )}

              {verifyState === 'error' && (
                <div className="sett-verify-err">{verifyError}</div>
              )}

              <div className="sett-section">
                <div className="sett-sec-ttl">토큰 발급</div>
                <div style={{ fontSize: 11, color: 'var(--c-text-muted)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--c-text)' }}>Classic</strong>: 계정 전체에 적용되는 단순 토큰. 빠르게 시작할 때 권장.
                  <br />
                  <strong style={{ color: 'var(--c-text)' }}>Fine-grained</strong>: 특정 repo/권한만 허용하는 세분화 토큰. 더 안전하지만 설정 단계가 많음.
                </div>
                <div className="sett-token-links">
                  <button
                    className="sett-token-link-btn"
                    onClick={() => window.appAPI?.openReleaseUrl(CLASSIC_TOKEN_URL)}
                  >
                    Classic 토큰 생성 ↗
                  </button>
                  <button
                    className="sett-token-link-btn"
                    onClick={() => window.appAPI?.openReleaseUrl(FINEGRAINED_TOKEN_URL)}
                  >
                    Fine-grained 토큰 생성 ↗
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.5 }}>
                  Classic 링크에는 <code className="sett-code-inline">repo</code>,{' '}
                  <code className="sett-code-inline">read:user</code>,{' '}
                  <code className="sett-code-inline">notifications</code> scope와 설명이 미리 채워져 있어요.
                  <br />
                  알림 벨은 <code className="sett-code-inline">notifications</code> 권한이 있어야 동작해요.
                  {' '}이미 토큰을 발급해 쓰고 있다면, 알림 벨을 쓰려면 위 링크로{' '}
                  <strong style={{ color: 'var(--c-text)' }}>새로 발급</strong>해야 해요 — scope는 발급 후 바꿀 수 없어요.
                </div>
              </div>
            </div>
          )}
          {tab === 'gitlab' && (
            <>
              <div className="sett-section">
                <div className="sett-sec-ttl" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Geuru expr="idle" scale={1.4} className="geuru-mini" /> GitLab 연결
                </div>
                {glVerifyState === 'idle' && (
                  <div className="conn-status cs-idle">
                    <Geuru expr="idle" scale={1.1} className="geuru-mini" />
                    아직 연결되지 않았어요 · 토큰을 입력하고 검증하세요
                  </div>
                )}
                {glVerifyState === 'verifying' && (
                  <div className="conn-status cs-verify">
                    <span className="sett-spinner gl" />
                    {glActiveHost || '호스트'} 에 연결 확인 중…
                  </div>
                )}
                {glVerifyState === 'success' && glVerifyResult && (
                  <div className="conn-status cs-ok">
                    <Geuru expr="happy" scale={1.1} className="geuru-mini" />
                    연결됨 · @{glVerifyResult.username} · {glVerifyResult.host}
                  </div>
                )}
                {glVerifyState === 'error' && (
                  <div className="conn-status cs-err">
                    <Geuru expr="conflict" scale={1.1} className="geuru-mini" />
                    연결 실패 · 토큰 또는 호스트를 확인하세요
                  </div>
                )}
              </div>

              <div className="sett-section">
                <div className="sett-sec-ttl">종류</div>
                <div className="gl-type">
                  <button
                    type="button"
                    className={`gl-type-opt${glKind === 'com' ? ' on' : ''}`}
                    aria-pressed={glKind === 'com'}
                    onClick={() => onGlKindChange('com')}
                  >
                    <span className="gl-radio" />
                    <span className="gl-type-txt"><b>GitLab.com</b><span>gitlab.com</span></span>
                  </button>
                  <button
                    type="button"
                    className={`gl-type-opt${glKind === 'self' ? ' on' : ''}`}
                    aria-pressed={glKind === 'self'}
                    onClick={() => onGlKindChange('self')}
                  >
                    <span className="gl-radio" />
                    <span className="gl-type-txt"><b>Self-hosted</b><span>사내 인스턴스</span></span>
                  </button>
                </div>
                {glKind === 'self' && (
                  <div className="sett-field" style={{ marginTop: 2 }}>
                    <div className="sett-lbl">Host URL</div>
                    <input
                      className="sett-inp"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      value={glHostInput}
                      onChange={e => onGlHostChange(e.target.value)}
                      placeholder="https://gitlab.mycompany.com"
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>

              <div className="sett-section">
                <div className="sett-sec-ttl">Personal Access Token</div>
                <div className="sett-field">
                  <div className="sett-lbl">Token</div>
                  <div className="sett-token-row">
                    <div className="tok-wrap">
                      <input
                        className="sett-inp"
                        type={glShowToken ? 'text' : 'password'}
                        value={glToken}
                        onChange={e => onGlTokenChange(e.target.value)}
                        placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                        style={{ fontFamily: 'var(--font-mono)', paddingRight: 42 }}
                      />
                      <button
                        type="button"
                        className="tok-eye"
                        title={glShowToken ? '토큰 숨기기' : '토큰 보기'}
                        aria-label={glShowToken ? '토큰 숨기기' : '토큰 보기'}
                        onClick={() => setGlShowToken(v => !v)}
                      >
                        <Geuru expr={glShowToken ? 'idle' : 'blink'} scale={1.15} />
                      </button>
                    </div>
                    <button
                      className="sett-verify-btn"
                      onClick={verifyGitlab}
                      disabled={glVerifyState === 'verifying' || !glToken.trim()}
                    >
                      {glVerifyState === 'verifying'
                        ? (<><span className="sett-spinner" />검증중…</>)
                        : '검증'}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.5 }}>
                    MR 뷰·인박스에서 실제 Merge Request와 이슈를 조회하는 데 써요.
                    <br />
                    필요 scope: <span className="sett-scope-chip">api</span>{' '}
                    <span className="sett-scope-chip">read_user</span>{' '}
                    <span className="sett-scope-chip">read_repository</span>
                  </div>
                </div>

                {/* 검증 결과 — 연결됨 카드(GitLab 주황 식별 보더) */}
                {glVerifyState === 'success' && glVerifyResult && (
                  <div className="sett-verify-ok gl">
                    <div className="sett-verify-acct">
                      {glVerifyResult.avatarUrl
                        ? <img className="sett-verify-avatar" src={glVerifyResult.avatarUrl} alt="" />
                        : <div className="sett-verify-avatar gl-fallback">{(glVerifyResult.name || glVerifyResult.username).charAt(0).toUpperCase()}</div>}
                      <div className="sett-verify-acct-info">
                        <div className="sett-verify-acct-login">@{glVerifyResult.username}</div>
                        <div className="sett-verify-acct-sub">연결됨 · GitLab 계정 확인 완료</div>
                      </div>
                    </div>
                    <div className="sett-verify-meta">
                      <span className="sett-verify-meta-lbl">Host</span>
                      <span className="sett-verify-meta-val">{glVerifyResult.host}</span>
                    </div>
                    {glVerifyResult.name && (
                      <div className="sett-verify-meta">
                        <span className="sett-verify-meta-lbl">Name</span>
                        <span className="sett-verify-meta-val">{glVerifyResult.name}</span>
                      </div>
                    )}
                    <button className="sett-disconnect-btn" onClick={disconnectGitlab}>연결 해제</button>
                  </div>
                )}

                {glVerifyState === 'error' && (
                  <div className="sett-verify-err">
                    <Geuru expr="conflict" scale={1.1} className="geuru-mini" />
                    <div>{glVerifyError}</div>
                  </div>
                )}
              </div>

              <div className="sett-section">
                <div className="sett-sec-ttl">토큰 발급</div>
                <div style={{ fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.5 }}>
                  {glKind === 'self' ? '사내 GitLab 인스턴스' : 'GitLab.com'}의 설정에서 토큰을 발급하세요. 아래 링크는 호스트에 맞춰 열립니다.
                </div>
                <div className="sett-token-links">
                  <button
                    className="sett-token-link-btn gl"
                    disabled={!glActiveHost}
                    onClick={() => { if (glActiveHost) window.appAPI?.openReleaseUrl(gitlabTokenUrl(glActiveHost)) }}
                  >
                    {glActiveHost || '호스트'} 토큰 발급 ↗
                  </button>
                </div>
                {glActiveHost && (
                  <div style={{ fontSize: 11, color: 'var(--c-text-faint)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', lineHeight: 1.5 }}>
                    {gitlabTokenUrl(glActiveHost)}
                  </div>
                )}
              </div>
            </>
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
