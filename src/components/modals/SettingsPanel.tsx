import { useState, useEffect } from 'react'
import { getUser, getRateLimit, GithubApiError } from '../../utils/githubClient'
import { getCurrentUser, GitlabApiError, type GitlabUser } from '../../utils/gitlabClient'
import { normalizeGitlabHost } from '../../utils/gitlab'
import { NOTIFICATION_SOUNDS } from '../../utils/notifSettings'
import { Geuru } from '../Geuru'
import { GhMark, GlMark } from '../ProviderMark'

// ── 외부 계약 (불변) ────────────────────────────────────────────────
// SettingsTab은 App.tsx / 온보딩 / RepoManager의 호출(setSettingsTab('github') 등)이
// 의존하는 외부 계약이라 그대로 유지한다. 내부 nav id(NavId)로 매핑해 사용한다.
export type SettingsTab = 'git' | 'appearance' | 'remotes' | 'github' | 'gitlab'

// 좌측 사이드바 nav 내부 식별자. 'conn'은 GitHub+GitLab 통합 탭.
type NavId = 'git' | 'look' | 'remote' | 'conn' | 'about'

// 외부 탭 → 내부 nav 매핑. github/gitlab은 모두 'conn'(서비스 연결)로 라우팅하고
// 해당 provider 연결 흐름에 포커스한다.
function navIdForTab(tab: SettingsTab): NavId {
  switch (tab) {
    case 'appearance': return 'look'
    case 'remotes': return 'remote'
    case 'github':
    case 'gitlab': return 'conn'
    default: return 'git'
  }
}

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

// 외부 링크 (About 탭)
const REPO_URL = 'https://github.com/sdf5771/gitgrove'
const ISSUES_URL = 'https://github.com/sdf5771/gitgrove/issues'
const RELEASES_URL = 'https://github.com/sdf5771/gitgrove/releases'

const GITHUB_SCOPES = ['repo', 'read:user', 'notifications']
const GITLAB_SCOPES = ['api', 'read_user', 'read_repository']

type VerifyState = 'idle' | 'verifying' | 'success' | 'error'

interface VerifyResult {
  login: string
  avatarUrl: string
  scopes: string[]
  rate: { remaining: number; limit: number } | null
}

// 토큰 영속화 추상화: safeStorage(메인) 우선, 미가용 시에만 localStorage 평문 fallback.
async function persistToken(token: string): Promise<void> {
  let encrypted = false
  try {
    if (await window.appAPI?.githubIsEncryptionAvailable()) {
      encrypted = await window.appAPI.githubSetToken(token)
    }
  } catch { encrypted = false }
  try {
    if (encrypted) {
      localStorage.removeItem(GITHUB_TOKEN_KEY)
    } else if (token) {
      localStorage.setItem(GITHUB_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(GITHUB_TOKEN_KEY)
    }
  } catch { /* ignore */ }
}

// 초기 토큰 로드 + 1회 마이그레이션
async function loadInitialToken(): Promise<string> {
  let plain = ''
  try { plain = localStorage.getItem(GITHUB_TOKEN_KEY) ?? '' } catch { plain = '' }
  try {
    if (await window.appAPI?.githubIsEncryptionAvailable()) {
      const stored = await window.appAPI.githubGetToken()
      if (stored) {
        try { localStorage.removeItem(GITHUB_TOKEN_KEY) } catch { /* ignore */ }
        return stored
      }
      if (plain) {
        const ok = await window.appAPI.githubSetToken(plain)
        if (ok) { try { localStorage.removeItem(GITHUB_TOKEN_KEY) } catch { /* ignore */ } }
      }
    }
  } catch { /* fallback: plain 사용 */ }
  return plain
}

// GitLab PAT 발급 딥링크 — host-상대.
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

type DlState = 'idle' | 'downloading' | 'done'

interface UpdateInfo {
  updateAvailable: boolean
  version?: string
  dmgUrl?: string
  current: string
}

const NAV: Array<{ id: NavId; label: string }> = [
  { id: 'git', label: 'Git 정보' },
  { id: 'look', label: '모양' },
  { id: 'remote', label: '원격' },
  { id: 'conn', label: '서비스 연결' },
  { id: 'about', label: '정보 · 업데이트' },
]

const HEADS: Record<NavId, [string, string]> = {
  git: ['Git 정보', '커밋에 남을 이름과 이메일, 기본 브랜치를 정해요'],
  look: ['모양', 'GitGrove는 다크모드 전용이에요 · 폰트와 코드 표시를 맞춰요'],
  remote: ['원격', '이 저장소가 연결된 원격을 관리해요'],
  conn: ['서비스 연결', 'GitHub · GitLab을 연결해 PR · 이슈를 앱 안에서 봐요'],
  about: ['정보 · 업데이트', '버전 확인과 새 버전 받기'],
}

// nav 아이콘 (디자인 I.* 포팅)
function NavIcon({ id }: { id: NavId }) {
  switch (id) {
    case 'git':
      return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="5" cy="4" r="2" /><circle cx="5" cy="12" r="2" /><circle cx="11" cy="4" r="2" /><path d="M5 6v4M5 6c0 2 6 2 6-2" /></svg>
    case 'look':
      return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8" cy="8" r="6" /><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" stroke="none" opacity=".5" /></svg>
    case 'remote':
      return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" /></svg>
    case 'conn':
      return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6.5 9.5l3-3M6 4l1-1a2.8 2.8 0 0 1 4 4l-1 1M10 12l-1 1a2.8 2.8 0 0 1-4-4l1-1" /></svg>
    case 'about':
      return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8" cy="8" r="6.2" /><path d="M8 7.2v3.6M8 5v.01" /></svg>
  }
}

const ICON_DL = <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 2v8M5 7l3 3 3-3M3 13h10" /></svg>
const ICON_EXT = <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 11L11 5M11 5H6M11 5v5" /></svg>
const ICON_BUG = <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="6" width="6" height="7" rx="3" /><path d="M5 9H2M11 9h3M5 6l-1.5-1.5M11 6l1.5-1.5M8 3v3" /></svg>

interface Props {
  onClose: () => void
  repoPath?: string | null
  /** 처음 표시할 탭 (예: GitLab 미연결 유도 시 'gitlab') */
  initialTab?: SettingsTab
}

export function SettingsPanel({ onClose, repoPath, initialTab }: Props) {
  // 좌측 nav 활성 항목. 외부 initialTab을 내부 nav id로 매핑.
  const [nav, setNav] = useState<NavId>(() => navIdForTab(initialTab ?? 'git'))
  // 서비스 연결 탭에서 인라인 연결 흐름이 열린 provider (null | 'github' | 'gitlab').
  // initialTab이 github/gitlab이면 해당 흐름을 바로 연다.
  const [connFlow, setConnFlow] = useState<'github' | 'gitlab' | null>(
    initialTab === 'github' ? 'github' : initialTab === 'gitlab' ? 'gitlab' : null
  )

  const [cfg, setCfg] = useState({ name: '', email: '', defaultBranch: 'main', gpg: false })
  const [remotes, setRemotes] = useState<Array<{ n: string; url: string }>>([])
  const [newRemote, setNewRemote] = useState({ n: '', url: '' })
  const [cfgLoading, setCfgLoading] = useState(false)
  const [githubToken, setGithubToken] = useState(() => {
    try { return localStorage.getItem(GITHUB_TOKEN_KEY) ?? '' } catch { return '' }
  })
  const [showToken, setShowToken] = useState(false)

  // GitHub 토큰 검증 상태
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [verifyError, setVerifyError] = useState<string>('')

  // GitLab 상태
  const [glKind, setGlKind] = useState<GitlabKind>('com')
  const [glHostInput, setGlHostInput] = useState('')
  const [glToken, setGlToken] = useState('')
  const [glShowToken, setGlShowToken] = useState(false)
  const [glVerifyState, setGlVerifyState] = useState<VerifyState>('idle')
  const [glVerifyResult, setGlVerifyResult] = useState<GitlabVerifyResult | null>(null)
  const [glVerifyError, setGlVerifyError] = useState('')

  const glActiveHost = glKind === 'com' ? GITLAB_COM_HOST : normalizeGitlabHost(glHostInput)

  const _saved = loadSettings()
  // density / showDiffStats는 디자인에서 UI가 빠졌지만 값은 보존·계속 저장(회귀 방지).
  const [density] = useState<'comfortable' | 'compact'>(
    (_saved.density === 'compact' ? 'compact' : 'comfortable')
  )
  const [fontSize, setFontSize] = useState<string>(
    typeof _saved.fontSize === 'string' ? _saved.fontSize : '12'
  )
  const [tabWidth, setTabWidth] = useState<string>(
    typeof _saved.tabWidth === 'string' ? _saved.tabWidth : '2'
  )
  const [showDiffStats] = useState<boolean>(
    typeof _saved.showDiffStats === 'boolean' ? _saved.showDiffStats : true
  )
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState<boolean>(
    typeof _saved.notificationSoundEnabled === 'boolean' ? _saved.notificationSoundEnabled : true
  )
  const [notificationSound, setNotificationSound] = useState<string>(
    typeof _saved.notificationSound === 'string' && _saved.notificationSound ? _saved.notificationSound : 'Glass'
  )

  // About 탭 상태
  const [version, setVersion] = useState('')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [dlState, setDlState] = useState<DlState>('idle')
  const [dlPct, setDlPct] = useState(0)

  // 자동 저장 표시(디자인의 "자동 저장됨" 점). 변경이 한 번이라도 일어나면 노출.
  const [touched, setTouched] = useState(false)

  // 사운드 미리듣기
  const previewNotificationSound = () => {
    window.appAPI?.previewSound(notificationSound).then(res => {
      if (!res?.ok) console.warn('사운드 미리듣기 실패 ·', res?.error)
    }).catch(() => {})
  }

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

  // 마운트 시 safeStorage 우선 로드 + 1회 마이그레이션 + 기존 연결 복원.
  // 저장된 토큰이 있으면 자동 검증해 "연결됨" 상태를 복원한다(마운트당 1회).
  // 검증 실패(401 등)·네트워크 오류는 graceful — idle 유지, 토큰은 보존(자동 해제 금지).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let token = ''
      try { token = await loadInitialToken() } catch { token = '' }
      if (cancelled) return
      setGithubToken(token)
      if (!token.trim()) return
      try {
        const { data: user, headers } = await getUser<{ login: string; avatar_url: string }>(token, { cache: true })
        if (cancelled) return
        const scopesHeader = headers.get('X-OAuth-Scopes') ?? ''
        const scopes = scopesHeader.split(',').map(s => s.trim()).filter(Boolean)
        let rate: VerifyResult['rate'] = null
        try {
          const { data } = await getRateLimit<{ rate?: { remaining: number; limit: number } }>(token, { cache: true })
          if (data.rate) rate = { remaining: data.rate.remaining, limit: data.rate.limit }
        } catch { /* rate 조회 실패 무시 */ }
        if (cancelled) return
        setVerifyResult({ login: user.login, avatarUrl: user.avatar_url, scopes, rate })
        setVerifyState('success')
      } catch {
        // 저장 토큰이 더 이상 유효하지 않거나 네트워크 오류 — idle 유지, 토큰 보존.
      }
    })()
    return () => { cancelled = true }
  }, [])

  // 마운트 시 GitLab 기존 연결 복원
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const hosts = await window.appAPI?.gitlabListHosts()
        if (!hosts || hosts.length === 0) return
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
          // 저장 토큰이 더 이상 유효하지 않을 수 있음 — idle 유지.
        }
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [])

  // 마운트 시 버전 로드
  useEffect(() => {
    let cancelled = false
    window.appAPI?.getVersion().then(v => { if (!cancelled) setVersion(v) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // About 탭을 처음 열 때 업데이트 자동 확인 (1회).
  // deps에 checking/updateInfo를 넣으면 setChecking으로 effect가 재실행되며
  // cleanup이 in-flight 호출을 취소해버린다 → nav만 의존하고 updateInfo로 1회 가드.
  useEffect(() => {
    if (nav !== 'about' || updateInfo) return
    let cancelled = false
    setChecking(true)
    window.appAPI?.checkUpdates()
      .then(info => { if (!cancelled && info) setUpdateInfo(info) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav])

  // 다운로드 진행률 구독 (받는 중일 때만)
  useEffect(() => {
    if (dlState !== 'downloading') return
    const cleanup = window.appAPI?.onUpdateDownloadProgress(p => {
      const pct = typeof p.pct === 'number'
        ? p.pct
        : p.total ? Math.round((p.received / p.total) * 100) : 0
      setDlPct(Math.max(0, Math.min(100, pct)))
    })
    return () => { cleanup?.() }
  }, [dlState])

  // 저장: 6필드 전부 보존 저장 + CSS 변수 적용 + 이벤트 dispatch + git config.
  // "완료" 버튼은 저장 후 onClose. (디자인: 자동 저장됨 + 완료)
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
  }

  const done = async () => {
    await save()
    onClose()
  }

  const upCfg = (k: keyof typeof cfg) => (v: string | boolean) => { setCfg(p => ({ ...p, [k]: v })); setTouched(true) }

  // ── GitHub 핸들러 ──
  const onTokenChange = (v: string) => {
    setGithubToken(v)
    if (verifyState !== 'idle') { setVerifyState('idle'); setVerifyResult(null); setVerifyError('') }
  }

  const verifyToken = async () => {
    const token = githubToken.trim()
    if (!token) { setVerifyState('error'); setVerifyError('토큰을 입력하세요.'); return }
    setVerifyState('verifying'); setVerifyError(''); setVerifyResult(null)
    try {
      const { data: user, headers } = await getUser<{ login: string; avatar_url: string }>(token, { cache: false })

      const scopesHeader = headers.get('X-OAuth-Scopes') ?? ''
      const scopes = scopesHeader.split(',').map(s => s.trim()).filter(Boolean)

      const hasScopeHeader = scopesHeader.length > 0
      if (hasScopeHeader && !scopes.includes('repo')) {
        setVerifyState('error')
        setVerifyError(`scope가 부족해요 · 'repo' 권한이 필요해요 · 현재: ${scopes.join(', ') || '없음'}`)
        return
      }

      let rate: VerifyResult['rate'] = null
      try {
        const { data } = await getRateLimit<{ rate?: { remaining: number; limit: number } }>(token, { cache: false })
        if (data.rate) rate = { remaining: data.rate.remaining, limit: data.rate.limit }
      } catch { /* rate 조회 실패 무시 */ }

      setVerifyResult({ login: user.login, avatarUrl: user.avatar_url, scopes, rate })
      setVerifyState('success')
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

  const disconnect = async () => {
    setGithubToken('')
    setVerifyState('idle'); setVerifyResult(null); setVerifyError('')
    await persistToken('')
    window.dispatchEvent(new CustomEvent('gitgrove:settings-changed'))
  }

  // ── GitLab 핸들러 ──
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

  const disconnectGitlab = async () => {
    const host = glVerifyResult?.host ?? glActiveHost
    setGlVerifyState('idle'); setGlVerifyResult(null); setGlVerifyError('')
    if (host) { try { await window.appAPI?.gitlabRemoveToken(host) } catch { /* ignore */ } }
    window.dispatchEvent(new CustomEvent('gitgrove:settings-changed'))
  }

  // ── About: 업데이트 받기 ──
  const startDownload = async () => {
    const dmgUrl = updateInfo?.dmgUrl
    if (!dmgUrl) {
      // dmgUrl 없으면 릴리스 페이지 브라우저 폴백.
      window.appAPI?.openReleaseUrl(updateInfo?.version ? RELEASES_URL : RELEASES_URL)
      return
    }
    setDlState('downloading'); setDlPct(0)
    try {
      await window.appAPI?.downloadUpdate(dmgUrl)
      setDlState('done'); setDlPct(100)
    } catch {
      setDlState('idle'); setDlPct(0)
    }
  }

  // ── 렌더 ──
  const ghConnected = verifyState === 'success' && verifyResult
  const glConnected = glVerifyState === 'success' && glVerifyResult

  const [headTitle, headDesc] = HEADS[nav]

  function navBadge(id: NavId): 'ok' | 'warn' | null {
    if (id === 'conn') return (ghConnected || glConnected) ? 'ok' : 'warn'
    if (id === 'remote') return remotes.length === 0 && !cfgLoading ? 'warn' : null
    if (id === 'git') return !cfg.name && !cfgLoading ? 'warn' : null
    return null
  }

  return (
    <div className="set2-overlay">
      <div className="set2-scrim" onClick={onClose} />
      <div className="set2-win" role="dialog" aria-label="설정">
        <div className="set2-titlebar">
          <div className="set2-tb-title">
            <Geuru expr="idle" scale={1} />
            설정 <span className="set2-k">⌘,</span>
          </div>
          <button className="set2-tb-close" aria-label="닫기" onClick={onClose}>×</button>
        </div>

        <div className="set2-body">
          {/* ── 좌측 nav ── */}
          <nav className="set2-nav">
            <div className="set2-nav-head">
              <Geuru expr="idle" scale={1.3} />
              <div>
                <div className="set2-nm">GitGrove</div>
                <div className="set2-ver">{version ? `v${version}` : ''}</div>
              </div>
            </div>
            <div className="set2-nav-label">설정</div>
            {NAV.map(n => {
              const badge = navBadge(n.id)
              return (
                <button
                  key={n.id}
                  className={`set2-nav-item${nav === n.id ? ' on' : ''}`}
                  onClick={() => setNav(n.id)}
                >
                  <NavIcon id={n.id} />
                  {n.label}
                  {badge && <span className={`set2-badge ${badge}`} />}
                </button>
              )
            })}
            <div className="set2-nav-foot">
              <Geuru expr="happy" scale={1.2} className="geu" />
              <span>막히면 ⌘K로<br />그루를 불러요</span>
            </div>
          </nav>

          {/* ── 우측 content ── */}
          <div className="set2-content">
            <div className="set2-chead">
              <h2>{headTitle}</h2>
              <p>{headDesc}</p>
            </div>
            <div className="set2-cbody" key={nav}>
              {nav === 'git' && (
                <>
                  {!cfg.name && !cfgLoading && (
                    <div className="set2-empty">
                      <Geuru expr="sleepy" scale={3.4} />
                      <b>아직 이름이 없어요</b>
                      <span>커밋에 남길 이름과 이메일을 정하면 그루가 그로브에 기록해요.</span>
                    </div>
                  )}
                  <div className="set2-group">
                    <div className="set2-group-ttl">사용자</div>
                    <div className="set2-row2">
                      <div className="set2-field">
                        <div className="set2-flabel">이름</div>
                        <input className="set2-inp" value={cfg.name} onChange={e => upCfg('name')(e.target.value)} placeholder="예: seobisback" />
                      </div>
                      <div className="set2-field">
                        <div className="set2-flabel">이메일</div>
                        <input className="set2-inp mono" value={cfg.email} onChange={e => upCfg('email')(e.target.value)} placeholder="you@example.com" />
                      </div>
                    </div>
                    <div className="set2-field">
                      <div className="set2-flabel">기본 브랜치<span className="set2-hint">새 저장소를 만들 때 쓰는 이름</span></div>
                      <input className="set2-inp mono" value={cfg.defaultBranch} onChange={e => upCfg('defaultBranch')(e.target.value)} placeholder="main" />
                    </div>
                  </div>
                  <div className="set2-group">
                    <div className="set2-group-ttl">커밋</div>
                    <div className="set2-toggle" onClick={() => upCfg('gpg')(!cfg.gpg)}>
                      <div className="set2-toggle-info"><b>GPG 서명</b><span>커밋에 서명을 붙여요 · git config commit.gpgsign</span></div>
                      <button type="button" className={`set2-sw ${cfg.gpg ? 'on' : 'off'}`} aria-pressed={cfg.gpg} aria-label="GPG 서명" />
                    </div>
                  </div>
                </>
              )}

              {nav === 'look' && (
                <>
                  <div className="set2-group">
                    <div className="set2-group-ttl">테마</div>
                    <div className="set2-theme-lock">
                      <div className="set2-sw-faux" />
                      <div className="set2-theme-lock-info">
                        <b>다크모드 <span className="lock">· 고정</span></b>
                        <span>레트로 아케이드 무드는 어둠 속에서 가장 빛나요 · 라이트모드는 앞으로도 없어요.</span>
                      </div>
                    </div>
                  </div>
                  <div className="set2-group">
                    <div className="set2-group-ttl">코드 표시</div>
                    <div className="set2-row2">
                      <div className="set2-field">
                        <div className="set2-flabel">폰트 크기</div>
                        <select className="set2-sel" value={fontSize} onChange={e => { setFontSize(e.target.value); setTouched(true) }}>
                          {['11', '12', '13', '14'].map(v => <option key={v} value={v}>{v}px</option>)}
                        </select>
                      </div>
                      <div className="set2-field">
                        <div className="set2-flabel">탭 너비</div>
                        <select className="set2-sel" value={tabWidth} onChange={e => { setTabWidth(e.target.value); setTouched(true) }}>
                          {['2', '4', '8'].map(v => <option key={v} value={v}>{v} spaces</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="set2-font-prev" style={{ fontSize: `${fontSize}px` }}>
                      <div><span className="kw">function</span> <span className="gd">plant</span>(commit) {'{'}</div>
                      <div>&nbsp;&nbsp;<span className="kw">return</span> <span className="st">'새싹 하나'</span></div>
                      <div>{'}'}</div>
                    </div>
                  </div>
                  <div className="set2-group">
                    <div className="set2-group-ttl">알림 소리</div>
                    <div className="set2-toggle" onClick={() => { setNotificationSoundEnabled(v => !v); setTouched(true) }}>
                      <div className="set2-toggle-info"><b>소리 켜기</b><span>새 알림이 오면 소리로 알려줘요</span></div>
                      <button type="button" className={`set2-sw ${notificationSoundEnabled ? 'on' : 'off'}`} aria-pressed={notificationSoundEnabled} aria-label="알림 소리" />
                    </div>
                    <div className={`set2-snd-block${notificationSoundEnabled ? '' : ' off'}`}>
                      <div className="set2-field">
                        <div className="set2-flabel">사운드<span className="set2-hint">macOS 시스템 사운드</span></div>
                        <div className="set2-snd-row">
                          <select
                            className="set2-sel"
                            aria-label="알림 사운드"
                            value={notificationSound}
                            disabled={!notificationSoundEnabled}
                            onChange={e => { setNotificationSound(e.target.value); setTouched(true) }}
                          >
                            {NOTIFICATION_SOUNDS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button
                            type="button"
                            className="set2-snd-play"
                            disabled={!notificationSoundEnabled}
                            onClick={previewNotificationSound}
                          >
                            ▶ 들어보기
                          </button>
                        </div>
                      </div>
                      <div className="set2-snd-note">
                        <Geuru expr="idle" scale={1.05} />
                        <span>알림은 종류와 상관없이 <b>알림창에 뜨면</b> 이 소리로 울려요 · 소리 목록은 macOS <span className="mono">시스템 설정 · 사운드</span>를 따라요.</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {nav === 'remote' && (
                <>
                  {remotes.length === 0 && !cfgLoading ? (
                    <div className="set2-empty">
                      <Geuru expr="sleepy" scale={3.4} />
                      <b>연결된 원격이 없어요</b>
                      <span>로컬에서만 자라는 나무예요 · 원격을 더하면 다른 곳과도 주고받을 수 있어요.</span>
                    </div>
                  ) : (
                    <div className="set2-group">
                      <div className="set2-group-ttl">연결된 원격</div>
                      {remotes.map(r => (
                        <div key={r.n} className="set2-remote">
                          <span className="set2-remote-name">{r.n}</span>
                          <span className="set2-remote-url">{r.url}</span>
                          <button className="set2-remote-del" aria-label={`${r.n} 삭제`} onClick={() => { setRemotes(p => p.filter(x => x.n !== r.n)); setTouched(true) }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="set2-group">
                    <div className="set2-group-ttl">원격 추가</div>
                    <div className="set2-field">
                      <div className="set2-flabel">이름</div>
                      <input className="set2-inp mono" placeholder="origin" value={newRemote.n} onChange={e => setNewRemote(p => ({ ...p, n: e.target.value }))} />
                    </div>
                    <div className="set2-field">
                      <div className="set2-flabel">URL</div>
                      <div className="set2-token-row">
                        <input className="set2-inp mono" placeholder="https://github.com/…" value={newRemote.url} onChange={e => setNewRemote(p => ({ ...p, url: e.target.value }))} />
                        <button
                          className="set2-verify-btn"
                          onClick={() => { if (newRemote.n && newRemote.url) { setRemotes(p => [...p, newRemote]); setNewRemote({ n: '', url: '' }); setTouched(true) } }}
                        >추가</button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {nav === 'conn' && (
                <>
                  <div className="set2-group">
                    <div className="set2-group-ttl">계정</div>

                    {/* GitHub 카드 */}
                    {ghConnected ? (
                      <div className="set2-conn connected">
                        <img className="set2-conn-avatar" src={verifyResult.avatarUrl} alt="" />
                        <div className="set2-conn-info">
                          <b>GitHub <span className="set2-conn-status cs-on">연결됨</span></b>
                          <span className="set2-conn-acct">
                            <span>@{verifyResult.login}</span>
                            {verifyResult.scopes.length > 0 && <span className="dotsep">·</span>}
                            {verifyResult.scopes.map(s => <span key={s} className="set2-scope mini">{s}</span>)}
                          </span>
                        </div>
                        <button className="set2-conn-btn ghost" onClick={disconnect}>연결 해제</button>
                      </div>
                    ) : (
                      <div className="set2-conn">
                        <div className="set2-conn-mark"><GhMark size={20} /></div>
                        <div className="set2-conn-info">
                          <b>GitHub <span className="set2-conn-status cs-off">미연결</span></b>
                          <span>PR · 이슈 · 내 저장소 가져오기</span>
                        </div>
                        <button
                          className={`set2-conn-btn ${connFlow === 'github' ? 'ghost' : 'gold'}`}
                          onClick={() => setConnFlow(connFlow === 'github' ? null : 'github')}
                        >{connFlow === 'github' ? '닫기' : '연결'}</button>
                      </div>
                    )}

                    {/* GitLab 카드 */}
                    {glConnected ? (
                      <div className="set2-conn connected">
                        {glVerifyResult.avatarUrl
                          ? <img className="set2-conn-avatar" src={glVerifyResult.avatarUrl} alt="" />
                          : <div className="set2-conn-mark"><GlMark size={20} /></div>}
                        <div className="set2-conn-info">
                          <b>GitLab <span className="set2-conn-status cs-on">연결됨</span></b>
                          <span className="set2-conn-acct">
                            <span>@{glVerifyResult.username}</span>
                            <span className="dotsep">·</span>
                            <span>{glVerifyResult.host}</span>
                          </span>
                        </div>
                        <button className="set2-conn-btn ghost" onClick={disconnectGitlab}>연결 해제</button>
                      </div>
                    ) : (
                      <div className="set2-conn">
                        <div className="set2-conn-mark"><GlMark size={20} /></div>
                        <div className="set2-conn-info">
                          <b>GitLab <span className="set2-conn-status cs-off">미연결</span></b>
                          <span>GitLab.com · Self-hosted</span>
                        </div>
                        <button
                          className={`set2-conn-btn ${connFlow === 'gitlab' ? 'ghost' : 'gold'}`}
                          onClick={() => setConnFlow(connFlow === 'gitlab' ? null : 'gitlab')}
                        >{connFlow === 'gitlab' ? '닫기' : '연결'}</button>
                      </div>
                    )}
                  </div>

                  {/* GitHub 연결 흐름 */}
                  {!ghConnected && connFlow === 'github' && (
                    <div className="set2-group set2-cflow">
                      <div className="set2-group-ttl">GitHub 연결</div>
                      <div className="set2-cstep">
                        <span className="set2-cstep-num">1</span>
                        <div className="set2-cstep-body">
                          <b>권한이 미리 선택된 발급 페이지를 열어요</b>
                          <span className="set2-cstep-sub">아래 버튼을 누르면 브라우저에서 GitHub 토큰 생성창이 열려요 · 필요한 권한이 이미 체크돼 있어요.</span>
                          <div className="set2-cstep-actions">
                            <button className="set2-flow-btn gold" onClick={() => window.appAPI?.openReleaseUrl(CLASSIC_TOKEN_URL)}>
                              GitHub에서 토큰 발급 <span className="ext">↗</span>
                            </button>
                            <button className="set2-flow-btn ghost" onClick={() => window.appAPI?.openReleaseUrl(FINEGRAINED_TOKEN_URL)}>
                              세밀한 권한 토큰
                            </button>
                          </div>
                          <div className="set2-scope-chips">{GITHUB_SCOPES.map(s => <span key={s} className="set2-scope">{s}</span>)}</div>
                          <div className="set2-url-mono">{CLASSIC_TOKEN_URL}</div>
                        </div>
                      </div>
                      <div className="set2-cstep">
                        <span className="set2-cstep-num">2</span>
                        <div className="set2-cstep-body">
                          <b>받은 토큰을 붙여넣고 검증해요</b>
                          <span className="set2-cstep-sub">발급된 토큰은 한 번만 보여요 · 복사해서 여기에 붙여넣어 주세요.</span>
                          <div className="set2-token-row" style={{ marginTop: 8 }}>
                            <div className="set2-token-wrap">
                              <input
                                className="set2-inp mono"
                                type={showToken ? 'text' : 'password'}
                                value={githubToken}
                                onChange={e => onTokenChange(e.target.value)}
                                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                style={{ paddingRight: 38 }}
                              />
                              <button
                                type="button"
                                className="set2-token-eye"
                                title={showToken ? '토큰 숨기기' : '토큰 보기'}
                                aria-label={showToken ? '토큰 숨기기' : '토큰 보기'}
                                onClick={() => setShowToken(v => !v)}
                              >
                                <Geuru expr={showToken ? 'idle' : 'blink'} scale={1.05} />
                              </button>
                            </div>
                            <button
                              className="set2-verify-btn"
                              onClick={verifyToken}
                              disabled={verifyState === 'verifying' || !githubToken.trim()}
                            >
                              {verifyState === 'verifying' ? '검증 중…' : '검증'}
                            </button>
                          </div>

                          {verifyState === 'verifying' && (
                            <div className="set2-vr vr-wait"><span className="set2-spinner" /><span>GitHub에 토큰을 확인하는 중…</span></div>
                          )}
                          {verifyState === 'error' && (
                            <div className="set2-vr vr-err">
                              <Geuru expr="conflict" scale={1.1} className="geu" />
                              <div><b>검증에 실패했어요</b><span>{verifyError}</span></div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* GitLab 연결 흐름 — com/self 선택 + host 입력 보존 */}
                  {!glConnected && connFlow === 'gitlab' && (
                    <div className="set2-group set2-cflow">
                      <div className="set2-group-ttl">GitLab 연결</div>
                      <div className="set2-cstep">
                        <span className="set2-cstep-num">1</span>
                        <div className="set2-cstep-body">
                          <b>호스트를 고르고 발급 페이지를 열어요</b>
                          <span className="set2-cstep-sub">GitLab.com이나 사내 인스턴스를 골라요 · 발급 페이지가 호스트에 맞춰 열려요.</span>
                          <div className="set2-gl-type">
                            <button
                              type="button"
                              className={`set2-gl-type-opt${glKind === 'com' ? ' on' : ''}`}
                              aria-pressed={glKind === 'com'}
                              onClick={() => onGlKindChange('com')}
                            >
                              <span className="set2-gl-radio" />
                              <span className="set2-gl-type-txt"><b>GitLab.com</b><span>gitlab.com</span></span>
                            </button>
                            <button
                              type="button"
                              className={`set2-gl-type-opt${glKind === 'self' ? ' on' : ''}`}
                              aria-pressed={glKind === 'self'}
                              onClick={() => onGlKindChange('self')}
                            >
                              <span className="set2-gl-radio" />
                              <span className="set2-gl-type-txt"><b>Self-hosted</b><span>사내 인스턴스</span></span>
                            </button>
                          </div>
                          {glKind === 'self' && (
                            <div className="set2-field" style={{ marginTop: 2 }}>
                              <div className="set2-flabel">Host URL</div>
                              <input
                                className="set2-inp mono"
                                value={glHostInput}
                                onChange={e => onGlHostChange(e.target.value)}
                                placeholder="https://gitlab.mycompany.com"
                                spellCheck={false}
                              />
                            </div>
                          )}
                          <div className="set2-cstep-actions">
                            <button
                              className="set2-flow-btn gold"
                              disabled={!glActiveHost}
                              onClick={() => { if (glActiveHost) window.appAPI?.openReleaseUrl(gitlabTokenUrl(glActiveHost)) }}
                            >
                              GitLab에서 토큰 발급 <span className="ext">↗</span>
                            </button>
                          </div>
                          <div className="set2-scope-chips">{GITLAB_SCOPES.map(s => <span key={s} className="set2-scope">{s}</span>)}</div>
                          {glActiveHost && <div className="set2-url-mono">{gitlabTokenUrl(glActiveHost)}</div>}
                        </div>
                      </div>
                      <div className="set2-cstep">
                        <span className="set2-cstep-num">2</span>
                        <div className="set2-cstep-body">
                          <b>받은 토큰을 붙여넣고 검증해요</b>
                          <span className="set2-cstep-sub">발급된 토큰은 한 번만 보여요 · 복사해서 여기에 붙여넣어 주세요.</span>
                          <div className="set2-token-row" style={{ marginTop: 8 }}>
                            <div className="set2-token-wrap">
                              <input
                                className="set2-inp mono"
                                type={glShowToken ? 'text' : 'password'}
                                value={glToken}
                                onChange={e => onGlTokenChange(e.target.value)}
                                placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                                style={{ paddingRight: 38 }}
                              />
                              <button
                                type="button"
                                className="set2-token-eye"
                                title={glShowToken ? '토큰 숨기기' : '토큰 보기'}
                                aria-label={glShowToken ? '토큰 숨기기' : '토큰 보기'}
                                onClick={() => setGlShowToken(v => !v)}
                              >
                                <Geuru expr={glShowToken ? 'idle' : 'blink'} scale={1.05} />
                              </button>
                            </div>
                            <button
                              className="set2-verify-btn"
                              onClick={verifyGitlab}
                              disabled={glVerifyState === 'verifying' || !glToken.trim()}
                            >
                              {glVerifyState === 'verifying' ? '검증 중…' : '검증'}
                            </button>
                          </div>

                          {glVerifyState === 'verifying' && (
                            <div className="set2-vr vr-wait"><span className="set2-spinner" /><span>{glActiveHost || '호스트'}에 토큰을 확인하는 중…</span></div>
                          )}
                          {glVerifyState === 'error' && (
                            <div className="set2-vr vr-err">
                              <Geuru expr="conflict" scale={1.1} className="geu" />
                              <div><b>검증에 실패했어요</b><span>{glVerifyError}</span></div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {nav === 'about' && (
                <>
                  <div className="set2-about-hero">
                    <Geuru expr="happy" scale={3} />
                    <div className="info">
                      <b>GitGrove</b>
                      <div className="v">{version ? `v${version}` : '…'} · Apple Silicon · macOS</div>
                      <div className="tag">커밋 하나, 새싹 하나.</div>
                      <div className="by">developed by <b>seobisback</b> · Seoul, Republic of Korea</div>
                    </div>
                  </div>

                  <div className="set2-group">
                    <div className="set2-group-ttl">업데이트</div>
                    {checking ? (
                      <div className="set2-update-row"><span className="ic"><span className="set2-spinner" /></span><div className="txt"><b>업데이트 확인 중…</b></div></div>
                    ) : dlState === 'downloading' ? (
                      <div className="set2-update-row dl">
                        <span className="ic"><span className="set2-spinner" /></span>
                        <div className="txt"><b>받는 중… {dlPct}%</b><div className="set2-dlbar"><i style={{ width: `${dlPct}%` }} /></div></div>
                      </div>
                    ) : dlState === 'done' ? (
                      <div className="set2-update-row done">
                        <span className="ic geu"><Geuru expr="merge" scale={1.2} /></span>
                        <div className="txt"><b>{`다운로드 완료${updateInfo?.version ? ` · v${updateInfo.version}` : ''}`}</b><span>설치 창이 열렸어요 · 안내대로 교체해 주세요</span></div>
                      </div>
                    ) : updateInfo?.updateAvailable ? (
                      <div className="set2-update-row">
                        <span className="ic">{ICON_DL}</span>
                        <div className="txt"><b>{`새 버전이 있어요${updateInfo.version ? ` · v${updateInfo.version}` : ''}`}</b></div>
                        <button className="go" onClick={startDownload}>받기</button>
                      </div>
                    ) : (
                      <div className="set2-update-row done">
                        <span className="ic geu"><Geuru expr="happy" scale={1.2} /></span>
                        <div className="txt"><b>최신 상태예요</b>{version && <span>{`v${version} · 지금이 가장 최신이에요`}</span>}</div>
                      </div>
                    )}
                  </div>

                  <div className="set2-group">
                    <div className="set2-group-ttl">링크</div>
                    <div className="set2-links">
                      <button className="set2-link-btn" onClick={() => window.appAPI?.openReleaseUrl(REPO_URL)}>{ICON_EXT} GitHub 저장소</button>
                      <button className="set2-link-btn" onClick={() => window.appAPI?.openReleaseUrl(ISSUES_URL)}>{ICON_BUG} 이슈 · 제안</button>
                      <button className="set2-link-btn" onClick={() => window.appAPI?.openReleaseUrl(RELEASES_URL)}>{ICON_DL} 릴리스 노트</button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="set2-cfoot">
              <span className="set2-saved">
                <span className="dot" style={{ opacity: touched ? 1 : 0.45 }} />
                자동 저장됨
              </span>
              <button className="set2-btn set2-btn-gold" onClick={done}>완료</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
