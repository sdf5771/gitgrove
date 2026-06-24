import { useEffect, useRef, useState } from 'react'
import { Geuru, type GeuruExpr } from './Geuru'

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

interface Props {
  branch: string
  ahead?: number
  behind?: number
  remote?: string
  onSettings: () => void
  githubUser?: GithubUser | null
  repoRole?: string | null
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

export function StatusBar({ branch, ahead, behind, remote, onSettings, githubUser, repoRole, repoSummary, geuruState = 'idle', syncState = 'idle', loading = false }: Props) {
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
      {githubUser && <GithubProfileButton user={githubUser} repoRole={repoRole} />}
      <button onClick={onSettings} style={{ marginLeft: githubUser ? undefined : 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-faint)', fontSize: '11px', padding: '0 4px', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 4, transition: 'color 120ms', fontFamily: 'var(--font-mono)' }}
        onMouseOver={e => (e.currentTarget.style.color = 'var(--c-text)')}
        onMouseOut={e => (e.currentTarget.style.color = 'var(--c-text-faint)')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Settings
      </button>
    </div>
  )
}

function GithubProfileButton({ user, repoRole }: { user: GithubUser; repoRole?: string | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const joinYear = user.created_at ? new Date(user.created_at).getFullYear() : null

  return (
    <div ref={ref} style={{ marginLeft: 'auto', position: 'relative', marginRight: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: open ? 'var(--c-bg-elevated)' : 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, transition: 'background 120ms' }}
        onMouseOver={e => (e.currentTarget.style.background = 'var(--c-bg-elevated)')}
        onMouseOut={e => (e.currentTarget.style.background = open ? 'var(--c-bg-elevated)' : 'none')}
        title={`@${user.login}`}
      >
        <img src={user.avatar_url} style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--c-border)' }} />
        <span style={{ fontSize: 11, color: 'var(--c-text-muted)', fontFamily: 'var(--font-mono)' }}>@{user.login}</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, width: 280,
            background: 'var(--c-bg-elevated)', border: '1px solid var(--c-border)', borderRadius: 8,
            boxShadow: '0 8px 28px rgba(0,0,0,0.4)', padding: 14, zIndex: 1000,
            display: 'flex', flexDirection: 'column', gap: 10, cursor: 'default',
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <img src={user.avatar_url} style={{ width: 48, height: 48, borderRadius: '50%', border: '1px solid var(--c-border)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              {user.name && <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>}
              <div style={{ fontSize: 12, color: 'var(--c-text-muted)', fontFamily: 'var(--font-mono)' }}>@{user.login}</div>
              {repoRole && (
                <span title="현재 저장소에서의 권한" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10, fontWeight: 600, color: 'var(--c-gold-300)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-border)', borderRadius: 4, padding: '1px 6px', lineHeight: 1.5 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
                  {repoRole}
                </span>
              )}
            </div>
          </div>

          {user.bio && <div style={{ fontSize: 12, color: 'var(--c-text)', lineHeight: 1.4 }}>{user.bio}</div>}

          <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--c-text-muted)' }}>
            <span><b style={{ color: 'var(--c-text)' }}>{user.followers ?? 0}</b> followers</span>
            <span><b style={{ color: 'var(--c-text)' }}>{user.following ?? 0}</b> following</span>
            {user.public_repos !== undefined && <span><b style={{ color: 'var(--c-text)' }}>{user.public_repos}</b> repos</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--c-text-muted)' }}>
            {user.company && <MetaRow icon="building">{user.company}</MetaRow>}
            {user.location && <MetaRow icon="pin">{user.location}</MetaRow>}
            {user.blog && <MetaRow icon="link"><a href={user.blog} onClick={e => { e.preventDefault(); window.appAPI?.openReleaseUrl(normalizeUrl(user.blog!)) }} style={{ color: 'var(--c-gold-300)', textDecoration: 'none' }}>{user.blog}</a></MetaRow>}
            {user.twitter_username && <MetaRow icon="twitter">@{user.twitter_username}</MetaRow>}
            {user.email && <MetaRow icon="mail">{user.email}</MetaRow>}
            {joinYear && <MetaRow icon="calendar">Joined {joinYear}</MetaRow>}
          </div>

          <button
            onClick={() => { window.appAPI?.openReleaseUrl(`https://github.com/${user.login}`); setOpen(false) }}
            style={{ marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 6, color: 'var(--c-text)', fontSize: 12, padding: '7px 0', cursor: 'pointer', transition: 'background 120ms' }}
            onMouseOver={e => (e.currentTarget.style.background = 'var(--c-bg-hover, var(--c-border))')}
            onMouseOut={e => (e.currentTarget.style.background = 'var(--c-bg)')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.4 9.4 0 0112 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.02 10.02 0 0022 12.26C22 6.58 17.52 2 12 2z"/></svg>
            GitHub에서 보기
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: .6 }}><path d="M7 17L17 7M17 7H8M17 7v9"/></svg>
          </button>
        </div>
      )}
    </div>
  )
}

function MetaRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      <span style={{ opacity: .65, flexShrink: 0, display: 'flex' }}>{metaIcon(icon)}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
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
