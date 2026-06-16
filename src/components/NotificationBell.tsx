import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { getNotifications, GithubApiError, type GithubNotification } from '../utils/githubClient'
import { Geuru } from './Geuru'

// 포커스 복귀 시 refetch 최소 간격(rate-limit 보호).
const MIN_REFETCH_MS = 60_000

// subject.url은 REST API URL이다(예: https://api.github.com/repos/o/r/pulls/3).
// 가능한 경우 사람이 볼 수 있는 html_url로 변환한다. 변환 불가하면 레포 페이지로.
function toHtmlUrl(n: GithubNotification): string {
  const apiUrl = n.subject.url
  if (apiUrl) {
    const m = apiUrl.match(/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/(pulls|issues)\/(\d+)/)
    if (m) {
      const kind = m[3] === 'pulls' ? 'pull' : 'issues'
      return `https://github.com/${m[1]}/${m[2]}/${kind}/${m[4]}`
    }
  }
  if (n.repository.html_url) return n.repository.html_url
  if (n.repository.full_name) return `https://github.com/${n.repository.full_name}`
  return 'https://github.com/notifications'
}

const REASON_LABEL: Record<string, string> = {
  review_requested: '리뷰 요청',
  mention: '멘션',
  assign: '할당됨',
  author: '내 스레드',
  comment: '댓글',
  state_change: '상태 변경',
  subscribed: '구독',
  team_mention: '팀 멘션',
  ci_activity: 'CI',
}

// ── reason → 아이콘/색 매핑 (디자인 legend 그대로) ──
type ReasonKind = 'review' | 'mention' | 'ci_fail' | 'ci_pass' | 'merge' | 'comment' | 'assign'
interface ReasonStyle { kind: ReasonKind; icoCls: string; rsCls: string; label: string }

function reasonStyle(reason: string, title: string): ReasonStyle {
  switch (reason) {
    case 'review_requested': return { kind: 'review', icoCls: 'ic-gold', rsCls: 'rs-gold', label: '리뷰 요청' }
    case 'assign': return { kind: 'assign', icoCls: 'ic-gold', rsCls: 'rs-gold', label: '할당됨' }
    case 'mention': return { kind: 'mention', icoCls: 'ic-info', rsCls: 'rs-info', label: '멘션' }
    case 'team_mention': return { kind: 'mention', icoCls: 'ic-info', rsCls: 'rs-info', label: '팀 멘션' }
    case 'comment': return { kind: 'comment', icoCls: 'ic-info', rsCls: 'rs-info', label: '댓글' }
    case 'state_change': return { kind: 'merge', icoCls: 'ic-purple', rsCls: 'rs-purple', label: '상태 변경' }
    case 'ci_activity':
      return /fail|실패|error|broke|❌/i.test(title)
        ? { kind: 'ci_fail', icoCls: 'ic-danger', rsCls: 'rs-danger', label: 'CI 실패' }
        : { kind: 'ci_pass', icoCls: 'ic-success', rsCls: 'rs-success', label: 'CI 통과' }
    case 'security_alert': return { kind: 'ci_fail', icoCls: 'ic-danger', rsCls: 'rs-danger', label: '보안' }
    case 'subscribed': return { kind: 'comment', icoCls: 'ic-muted', rsCls: 'rs-info', label: '구독' }
    case 'author': return { kind: 'comment', icoCls: 'ic-muted', rsCls: 'rs-info', label: '내 스레드' }
    default: return { kind: 'comment', icoCls: 'ic-muted', rsCls: 'rs-info', label: REASON_LABEL[reason] ?? reason }
  }
}

const REASON_ICON: Record<ReasonKind, ReactElement> = {
  review: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="4" r="2" /><circle cx="5" cy="12" r="2" /><circle cx="11" cy="12" r="2" /><path d="M5 6v4M11 10V8a3 3 0 0 0-3-3H6" /></svg>,
  mention: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="3" /><path d="M11 8v1.5a2 2 0 0 0 4 0V8A7 7 0 1 0 9.5 14.7" /></svg>,
  ci_fail: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8" cy="8" r="6" /><path d="M6 6l4 4M10 6l-4 4" /></svg>,
  ci_pass: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8" cy="8" r="6" /><path d="M5.5 8.2l1.8 1.8 3.2-3.6" /></svg>,
  merge: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="5" cy="4" r="2" /><circle cx="5" cy="12" r="2" /><circle cx="12" cy="6" r="2" /><path d="M5 6v4M12 8c0 3-3 3-5 3" /></svg>,
  comment: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6l-3 3v-3H3a1 1 0 0 1-1-1z" /></svg>,
  assign: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5.5" r="2.6" /><path d="M3 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" /></svg>,
}

// ── 상대 시각 (12분 · 1시간 · 어제 · 3일 · 6/14) ──
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const min = Math.floor((Date.now() - t) / 60_000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간`
  const day = Math.floor(hr / 24)
  if (day === 1) return '어제'
  if (day < 7) return `${day}일`
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ── 시간 그룹 (오늘 · 이번 주 · 이전) ──
const GROUP_ORDER = ['오늘', '이번 주', '이전'] as const
function groupKey(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '이전'
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (t >= startToday) return '오늘'
  if (t >= startToday - 6 * 86_400_000) return '이번 주'
  return '이전'
}

const IconBell = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2a4 4 0 0 1 4 4v2.5l1 2H3l1-2V6a4 4 0 0 1 4-4z" /><path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" /></svg>
)

export interface NotificationBellProps {
  githubToken: string
  /** 외부 브라우저로 URL 열기 */
  onOpenUrl: (url: string) => void
}

export function NotificationBell({ githubToken, onOpenUrl }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<GithubNotification[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // notifications 권한이 없어 403이 난 경우 — 에러가 아니라 '유도' 상태로 다룬다.
  const [permDenied, setPermDenied] = useState(false)
  const lastFetchRef = useRef(0)
  const seqRef = useRef(0)

  const load = useCallback(async () => {
    if (!githubToken) return
    const mySeq = ++seqRef.current
    lastFetchRef.current = Date.now()
    setLoading(true)
    setError(null)
    setPermDenied(false)
    try {
      const list = await getNotifications(githubToken, { cache: false })
      if (seqRef.current !== mySeq) return
      setItems(list)
    } catch (err) {
      if (seqRef.current !== mySeq) return
      if (err instanceof GithubApiError && err.status === 403 && !err.rateLimited) {
        // /notifications는 notifications(또는 repo) scope가 필요 — 토큰에 권한이 없으면 403.
        // 사용자에겐 에러(빨간 403)가 아니라 '권한 없음' 유도 상태로 보여준다.
        setPermDenied(true)
      } else {
        const msg = err instanceof GithubApiError ? err.message : err instanceof Error ? err.message : String(err)
        setError(msg)
      }
    } finally {
      if (seqRef.current === mySeq) setLoading(false)
    }
  }, [githubToken])

  // 마운트/토큰 변경 시 1회.
  useEffect(() => {
    if (!githubToken) { setItems(null); return }
    void load()
  }, [githubToken, load])

  // 포커스 복귀 시 throttled refetch(최소 60s 간격).
  useEffect(() => {
    if (!githubToken) return
    const onFocus = () => {
      if (Date.now() - lastFetchRef.current >= MIN_REFETCH_MS) void load()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [githubToken, load])

  // 벨 토글: 패널을 열 때마다 항상 최신을 다시 가져온다.
  // (그렇지 않으면 앱을 계속 띄워둔 채로는 마운트/포커스 시점의 옛 목록이 그대로 보였다.)
  const toggle = useCallback(() => {
    setOpen(o => {
      if (!o) void load()
      return !o
    })
  }, [load])

  if (!githubToken) return null

  const list = items ?? []
  const unreadCount = list.filter(n => n.unread).length
  const groups = GROUP_ORDER
    .map(key => ({ key, items: list.filter(n => groupKey(n.updated_at) === key) }))
    .filter(g => g.items.length > 0)

  const handleItemClick = (n: GithubNotification) => {
    onOpenUrl(toHtmlUrl(n))
    setOpen(false)
  }

  // 헤더 그루: 안 읽은 게 없으면 반가운 얼굴, 있으면 기본.
  const headExpr = list.length > 0 && unreadCount === 0 ? 'happy' : 'idle'

  return (
    <>
      <button
        className={`tb-bell${open ? ' on' : ''}`}
        aria-label="알림"
        title="알림"
        onClick={toggle}
      >
        <IconBell />
        {unreadCount > 0 && <span className="tb-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <>
          <div className="tb-bell-backdrop" onClick={() => setOpen(false)} />
          <div className="nb-panel" role="dialog" aria-label="알림 목록">
            <div className="nb-head">
              <span className="nb-head-geuru"><Geuru expr={headExpr} scale={1.25} /></span>
              <span className="nb-title">알림</span>
              {unreadCount > 0 && <span className="nb-count">{unreadCount}</span>}
              <div className="nb-head-actions">
                <button className="nb-icobtn" title="새로고침" disabled={loading} onClick={() => void load()}>
                  <span style={loading ? { display: 'inline-flex', animation: 'spin 600ms linear infinite' } : undefined}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M13 3v3h-3M3 13v-3h3" /><path d="M12.5 6.5A5 5 0 0 0 4 5M3.5 9.5A5 5 0 0 0 12 11" /></svg>
                  </span>
                </button>
              </div>
            </div>

            <div className="nb-list">
              {loading && items === null ? (
                <div className="nb-status"><span className="sett-spinner" /> 불러오는 중…</div>
              ) : permDenied ? (
                <div className="nb-empty">
                  <Geuru expr="sleepy" scale={3.2} />
                  <b>알림을 띄울 권한이 없어요</b>
                  <span>설정 → GitHub에서 notifications 권한을 포함해 토큰을 다시 발급해 주세요.</span>
                </div>
              ) : error ? (
                <div className="nb-empty">
                  <Geuru expr="conflict" scale={3.2} />
                  <b>불러오지 못했어요</b>
                  <span style={{ color: 'var(--c-danger)' }}>{error}</span>
                </div>
              ) : list.length === 0 ? (
                <div className="nb-empty">
                  <Geuru expr="sleepy" scale={3.2} />
                  <b>읽지 않은 알림이 없어요</b>
                  <span>새 소식이 오면<br />그루가 여기서 알려줄게요.</span>
                </div>
              ) : (
                groups.map(g => (
                  <div key={g.key}>
                    <div className="nb-group">{g.key}</div>
                    {g.items.map(n => {
                      const rs = reasonStyle(n.reason, n.subject.title)
                      return (
                        <div
                          key={n.id}
                          className={`nb-item${n.unread ? ' unread' : ''}`}
                          onClick={() => handleItemClick(n)}
                          title="기본 브라우저로 열기"
                        >
                          <div className={`nb-ico ${rs.icoCls}`}>{REASON_ICON[rs.kind]}</div>
                          <div className="nb-body">
                            <div className="nb-it-title">{n.subject.title}</div>
                            <div className="nb-it-sub">
                              <span className="nb-repo">{n.repository.full_name}</span>
                              <span className="nb-dot">·</span>
                              <span className={`nb-reason ${rs.rsCls}`}>{rs.label}</span>
                              <span className="nb-time">{relativeTime(n.updated_at)}</span>
                            </div>
                          </div>
                          {n.unread && <span className="nb-unread-dot" />}
                        </div>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="nb-foot">
              <button
                className="nb-foot-btn"
                onClick={() => { onOpenUrl('https://github.com/notifications'); setOpen(false) }}
              >
                GitHub에서 모두 보기
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 11L11 5M11 5H6M11 5v5" /></svg>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
