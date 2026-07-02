import { useEffect, useRef, useState } from 'react'
import { Geuru, type GeuruExpr } from './Geuru'
import { GhMark, GlMark } from './ProviderMark'

export interface GithubUser {
  login: string
  avatar_url: string
  name?: string | null
  bio?: string | null
  company?: string | null
  location?: string | null
  blog?: string | null
  twitter_username?: string | null
  email?: string | null
  followers?: number
  following?: number
  public_repos?: number
  created_at?: string
}

// 프로바이더 공통으로 정규화한 계정 프로필 — 하단바 칩 + 프로필 카드가 함께 쓴다.
export interface AccountProfile {
  provider: 'github' | 'gitlab'
  login: string                 // @seobisback / @s.kim (앞의 @ 제외한 값)
  name?: string | null
  avatarUrl?: string | null     // 없으면 이니셜로 대체
  bio?: string | null
  role?: string | null          // 현재 저장소/프로젝트 권한 (예: 이 저장소 · admin)
  stats?: Array<{ value: string; label: string }>
  company?: string | null
  location?: string | null
  blog?: string | null          // 링크(외부 열기)
  joined?: string | null        // 가입 표기 (예: Joined 2019 / 가입 2021)
  profileUrl: string            // "…에서 보기"로 열 웹 URL
}

interface Props {
  branch: string
  ahead?: number
  behind?: number
  remote?: string
  onSettings: () => void
  // 연결된 프로바이더별 계정 — 있는 것만 칩으로 나란히 뜬다(GitHub 골드 · GitLab 주황).
  accounts?: AccountProfile[]
  // Repository Manager 표시 중에는 브랜치 대신 레포 요약을 보여준다(자체 상태바 통합).
  repoSummary?: { total: number; dirty: number } | null
  // 좌측 끝 그루 표정 — 저장소 상태에 1:1 매핑. clean→sleepy, syncing→think, conflict→conflict.
  geuruState?: GeuruExpr
  // 동기화 신호등(SY2). running=골드 펄스 / done=녹색 / err=빨강 / idle=평시.
  syncState?: 'running' | 'done' | 'err' | 'idle'
  // 저장소 전환 로딩 — "불러오는 중…" + sync dot + 그루 think로 대체한다.
  loading?: boolean
}

const SYNC_STATE_TEXT: Record<'running' | 'done' | 'err', { txt: string; color: string }> = {
  running: { txt: '동기화 중…', color: 'var(--c-gold-300)' },
  done: { txt: '방금 동기화됨', color: 'var(--c-grove)' },
  err: { txt: '충돌 · 해결 필요', color: 'var(--c-danger)' },
}

const GEURU_TITLE: Partial<Record<GeuruExpr, string>> = {
  idle: '그루 — 대기 중',
  sleepy: '그루 — 변경사항 없음',
  think: '그루 — 동기화 중',
  merge: '그루 — 동기화 완료',
  conflict: '그루 — 충돌 해결 필요',
}

export function StatusBar({ branch, ahead, behind, remote, onSettings, accounts, repoSummary, geuruState = 'idle', syncState = 'idle', loading = false }: Props) {
  // 전환 로딩 중에는 그루 think + sync dot으로 통일(상태 신호등은 로딩이 우선).
  const effGeuru: GeuruExpr = loading ? 'think' : geuruState
  // 신호등 dot 수식어 — 로딩/running=골드 펄스, err=빨강, 그 외(done/idle)=녹색 기본.
  const dotClass = (loading || syncState === 'running') ? 'sdot sync' : syncState === 'err' ? 'sdot err' : 'sdot'
  const stateText = syncState !== 'idle' ? SYNC_STATE_TEXT[syncState] : null
  if (loading) {
    return (
      <div className="sbar sb-loading">
        <span className="geuru-status" title="그루 — 저장소를 여는 중">
          <Geuru expr="think" scale={1.3} title="그루 — 저장소를 여는 중" />
        </span>
        <div className="sbranch">
          <span className={dotClass} />
          <span className="sb-spin" aria-hidden="true" />
          <span aria-live="polite">불러오는 중…</span>
        </div>
        <button onClick={onSettings} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-faint)', fontSize: '11px', padding: '0 4px', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          Settings
        </button>
      </div>
    )
  }
  return (
    <div className="sbar">
      <span className="geuru-status" title={GEURU_TITLE[effGeuru]}>
        <Geuru expr={effGeuru} scale={1.3} title={GEURU_TITLE[effGeuru]} />
      </span>
      {repoSummary ? (
        <div className="sbranch">
          <span className="sdot" />
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: .7 }}>
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          {repoSummary.total} repositories
          {repoSummary.dirty > 0 && (
            <>
              <span className="ssep">·</span>
              <span style={{ color: 'var(--c-warning)' }}>{repoSummary.dirty} with changes</span>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="sbranch">
            <span className={dotClass} />
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
        </>
      )}
      {stateText && (
        <>
          <span className="ssep">·</span>
          <span className="sstate" aria-live="polite">
            <span style={{ color: stateText.color }}>{stateText.txt}</span>
          </span>
        </>
      )}
      {accounts && accounts.length > 0 && <AccountChips accounts={accounts} />}
      <button onClick={onSettings} style={{ marginLeft: (accounts && accounts.length > 0) ? undefined : 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-faint)', fontSize: '11px', padding: '0 4px', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 4, transition: 'color 120ms', fontFamily: 'var(--font-mono)' }}
        onMouseOver={e => (e.currentTarget.style.color = 'var(--c-text)')}
        onMouseOut={e => (e.currentTarget.style.color = 'var(--c-text-faint)')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Settings
      </button>
    </div>
  )
}

// 하단바 계정 칩 — 연결된 프로바이더별로 나란히. 하나를 누르면 그 프로필 카드가 열리고,
// 다른 칩을 누르면 그 칩 카드로 전환된다. 바깥 클릭·Escape로 닫힘.
function AccountChips({ accounts }: { accounts: AccountProfile[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="sb-accts" ref={ref}>
      {accounts.map(a => {
        const cls = a.provider === 'gitlab' ? 'gl' : 'gh'
        const isOpen = open === a.provider
        const initial = (a.name || a.login || '?').trim().charAt(0).toUpperCase()
        return (
          <div key={a.provider} style={{ position: 'relative' }}>
            <button
              className={`acct-chip ${cls}${isOpen ? ' active' : ''}`}
              onClick={() => setOpen(o => (o === a.provider ? null : a.provider))}
              title={`@${a.login}`}
            >
              <span className="av">{a.avatarUrl ? <img src={a.avatarUrl} alt="" /> : initial}</span>
              <span className="pm">{a.provider === 'gitlab' ? <GlMark size={11} /> : <GhMark size={11} />}</span>
              <span className="lg">@{a.login}</span>
            </button>
            {isOpen && <ProfileCard account={a} onClose={() => setOpen(null)} />}
          </div>
        )
      })}
    </div>
  )
}

function roleIcon(provider: 'github' | 'gitlab') {
  return provider === 'gitlab'
    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z"/></svg>
    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
}

function ProfileCard({ account: a, onClose }: { account: AccountProfile; onClose: () => void }) {
  const cls = a.provider === 'gitlab' ? 'gl' : 'gh'
  const providerName = a.provider === 'gitlab' ? 'GitLab' : 'GitHub'
  const initial = (a.name || a.login || '?').trim().charAt(0).toUpperCase()
  return (
    <div className={`pcard ${cls}`} onMouseDown={e => e.stopPropagation()}>
      <div className="pc-banner">
        <span className="pc-provider">{a.provider === 'gitlab' ? <GlMark size={11} /> : <GhMark size={11} />}{providerName}</span>
        <span className="pc-geuru"><Geuru expr="happy" scale={1.7} /></span>
      </div>
      <div className="pc-head">
        <div className="pc-avatar">{a.avatarUrl ? <img src={a.avatarUrl} alt="" /> : initial}</div>
        <div className="pc-id">
          {a.name && <div className="pc-name">{a.name}</div>}
          <div className="pc-login">@{a.login}</div>
        </div>
      </div>
      <div className="pc-body">
        {a.role && <span className="pc-role" title="현재 저장소·프로젝트에서의 권한">{roleIcon(a.provider)}{a.role}</span>}
        {a.bio && <div className="pc-bio">{a.bio}</div>}
        {a.stats && a.stats.length > 0 && (
          <div className="pc-stats">
            {a.stats.map(s => (
              <div key={s.label} className="pc-stat"><b>{s.value}</b><span>{s.label}</span></div>
            ))}
          </div>
        )}
        <div className="pc-meta">
          {a.company && <MetaRow icon="building">{a.company}</MetaRow>}
          {a.location && <MetaRow icon="pin">{a.location}</MetaRow>}
          {a.blog && <MetaRow icon="link"><a href={a.blog} onClick={e => { e.preventDefault(); window.appAPI?.openReleaseUrl(normalizeUrl(a.blog!)) }}>{a.blog}</a></MetaRow>}
          {a.joined && <MetaRow icon="calendar">{a.joined}</MetaRow>}
        </div>
        <button className="pc-visit" onClick={() => { window.appAPI?.openReleaseUrl(a.profileUrl); onClose() }}>
          {a.provider === 'gitlab' ? <GlMark size={14} /> : <GhMark size={14} />}
          {providerName}에서 보기
          <svg className="ext" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M17 7H8M17 7v9"/></svg>
        </button>
      </div>
    </div>
  )
}

function MetaRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="pc-mrow">
      {metaIcon(icon)}
      <span className="v">{children}</span>
    </div>
  )
}

function metaIcon(name: string) {
  const p = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const
  switch (name) {
    case 'building': return <svg {...p}><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/></svg>
    case 'pin': return <svg {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
    case 'link': return <svg {...p}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
    case 'twitter': return <svg {...p}><path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/></svg>
    case 'mail': return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>
    case 'calendar': return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
    default: return null
  }
}

function normalizeUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}
