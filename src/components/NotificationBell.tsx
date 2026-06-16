import { useCallback, useEffect, useRef, useState } from 'react'
import { getNotifications, GithubApiError, type GithubNotification } from '../utils/githubClient'

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

const IconBell = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2a4 4 0 0 1 4 4v2.5l1 2H3l1-2V6a4 4 0 0 1 4-4z"/><path d="M6.5 12.5a1.5 1.5 0 0 0 3 0"/></svg>
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
  const lastFetchRef = useRef(0)
  const seqRef = useRef(0)

  const load = useCallback(async () => {
    if (!githubToken) return
    const mySeq = ++seqRef.current
    lastFetchRef.current = Date.now()
    setLoading(true)
    setError(null)
    try {
      const list = await getNotifications(githubToken, { cache: false })
      if (seqRef.current !== mySeq) return
      setItems(list)
    } catch (err) {
      if (seqRef.current !== mySeq) return
      let msg: string
      if (err instanceof GithubApiError && err.status === 403 && !err.rateLimited) {
        // /notifications는 notifications(또는 repo) scope가 필요 — 토큰에 권한이 없으면 403.
        msg = '알림 권한이 없는 토큰이에요. 설정 → GitHub에서 notifications 권한을 포함해 토큰을 다시 발급해 주세요.'
      } else {
        msg = err instanceof GithubApiError ? err.message : err instanceof Error ? err.message : String(err)
      }
      setError(msg)
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

  if (!githubToken) return null

  const unreadCount = (items ?? []).filter(n => n.unread).length

  const handleItemClick = (n: GithubNotification) => {
    onOpenUrl(toHtmlUrl(n))
    setOpen(false)
  }

  return (
    <>
      <button
        className={`tb-bell${open ? ' on' : ''}`}
        aria-label="알림"
        title="알림"
        onClick={() => setOpen(o => !o)}
      >
        <IconBell />
        {unreadCount > 0 && <span className="tb-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <>
          <div className="tb-bell-backdrop" onClick={() => setOpen(false)} />
          <div className="tb-bell-panel" role="dialog" aria-label="알림 목록">
            <div className="tb-bell-head">
              <span className="tb-bell-title">알림</span>
              <button
                className="pr-refresh-btn"
                title="새로고침"
                disabled={loading}
                onClick={() => void load()}
              >
                <span style={loading ? { display: 'inline-block', animation: 'spin 600ms linear infinite' } : undefined}>⟳</span>
              </button>
            </div>
            <div className="tb-bell-list">
              {loading && items === null ? (
                <div className="tb-bell-status"><span className="sett-spinner" /> 불러오는 중…</div>
              ) : error ? (
                <div className="tb-bell-status tb-bell-error">{error}</div>
              ) : !items || items.length === 0 ? (
                <div className="tb-bell-status">읽지 않은 알림이 없습니다.</div>
              ) : (
                items.map(n => (
                  <div
                    key={n.id}
                    className={`tb-bell-item${n.unread ? ' unread' : ''}`}
                    onClick={() => handleItemClick(n)}
                    title="기본 브라우저로 열기"
                  >
                    <div className="tb-bell-item-title">{n.subject.title}</div>
                    <div className="tb-bell-item-sub">
                      <span className="tb-bell-repo">{n.repository.full_name}</span>
                      <span className="rm-gh-dot">·</span>
                      <span>{REASON_LABEL[n.reason] ?? n.reason}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
