import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getSearchIssues,
  parseRepoFromUrl,
  GithubApiError,
  type GithubIssueSearchItem,
} from '../utils/githubClient'

// 세 분류 탭. 각 탭은 본인 login을 넣은 search 쿼리를 만든다.
type InboxTab = 'created' | 'review' | 'assigned'

const TABS: ReadonlyArray<{ id: InboxTab; label: string }> = [
  { id: 'created', label: '내가 연 PR' },
  { id: 'review', label: '리뷰 요청받음' },
  { id: 'assigned', label: '할당된 이슈' },
]

function buildQuery(tab: InboxTab, login: string): string {
  switch (tab) {
    case 'created':
      return `is:open is:pr author:${login}`
    case 'review':
      return `is:open is:pr review-requested:${login}`
    case 'assigned':
      return `is:open is:issue assignee:${login}`
  }
}

interface TabState {
  items: GithubIssueSearchItem[] | null
  loading: boolean
  error: string | null
}
const EMPTY_TAB: TabState = { items: null, loading: false, error: null }

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}일 전`
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

const IconSearchSmall = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6.5" cy="6.5" r="4"/><path d="M10.5 10.5l3 3"/></svg>
)
const IconPR = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="4" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><path d="M4 6v4M12 10V8a2 2 0 0 0-2-2H7"/></svg>
)
const IconIssue = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/></svg>
)

export interface GithubInboxProps {
  githubToken: string
  githubLogin: string | null
  /** 외부 브라우저로 html_url 열기 */
  onOpenUrl: (url: string) => void
}

export function GithubInbox({ githubToken, githubLogin, onOpenUrl }: GithubInboxProps) {
  const [tab, setTab] = useState<InboxTab>('created')
  const [query, setQuery] = useState('')
  const [states, setStates] = useState<Record<InboxTab, TabState>>({
    created: EMPTY_TAB,
    review: EMPTY_TAB,
    assigned: EMPTY_TAB,
  })

  // in-flight 무효화: 탭 전환/새로고침이 겹쳐도 stale 응답이 최신을 덮지 않게.
  const seqRef = useRef(0)

  const load = useCallback(async (target: InboxTab, force: boolean) => {
    if (!githubToken || !githubLogin) return
    const mySeq = ++seqRef.current
    setStates(prev => ({ ...prev, [target]: { ...prev[target], loading: true, error: null } }))
    try {
      const res = await getSearchIssues(githubToken, buildQuery(target, githubLogin), force ? { cache: false } : undefined)
      if (seqRef.current !== mySeq) return
      setStates(prev => ({ ...prev, [target]: { items: res.items, loading: false, error: null } }))
    } catch (err) {
      if (seqRef.current !== mySeq) return
      const msg = err instanceof GithubApiError ? err.message : err instanceof Error ? err.message : String(err)
      setStates(prev => ({ ...prev, [target]: { ...prev[target], loading: false, error: msg } }))
    }
  }, [githubToken, githubLogin])

  // 활성 탭이 아직 로드 안 됐으면 진입/전환 시 로드(첫 진입엔 기본 탭만).
  useEffect(() => {
    const st = states[tab]
    if (st.items === null && !st.loading && !st.error) {
      void load(tab, false)
    }
  }, [tab, states, load])

  if (!githubToken || !githubLogin) {
    return (
      <div className="rm-inbox">
        <div className="rm-gh-status">GitHub 연결이 필요합니다. 설정에서 토큰을 등록하세요.</div>
      </div>
    )
  }

  const current = states[tab]
  const q = query.trim().toLowerCase()
  const filtered = (current.items ?? []).filter(it => {
    if (!q) return true
    const repo = parseRepoFromUrl(it.repository_url)?.fullName ?? ''
    return it.title.toLowerCase().includes(q) || repo.toLowerCase().includes(q)
  })

  return (
    <div className="rm-inbox">
      <div className="rm-inbox-tabs">
        {TABS.map(t => {
          const count = states[t.id].items?.length
          return (
            <button
              key={t.id}
              className={`rm-inbox-tab${tab === t.id ? ' on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {count != null && <span className="rm-inbox-tab-count">{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="rm-filter-bar">
        <div className="rm-search-wrap">
          <IconSearchSmall />
          <input
            type="text"
            placeholder="제목 / owner/name 으로 필터…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <button
          className="pr-refresh-btn"
          title="새로고침"
          disabled={current.loading}
          onClick={() => void load(tab, true)}
        >
          <span style={current.loading ? { display: 'inline-block', animation: 'spin 600ms linear infinite' } : undefined}>⟳</span>
        </button>
      </div>

      <div className="rm-list">
        {current.loading && current.items === null ? (
          <div className="rm-gh-status"><span className="sett-spinner" /> 불러오는 중…</div>
        ) : current.error ? (
          <div className="rm-gh-status rm-gh-error">{current.error}</div>
        ) : filtered.length === 0 ? (
          <div className="rm-empty-section">
            {current.items && current.items.length > 0 ? '검색 결과가 없습니다.' : '표시할 항목이 없습니다.'}
          </div>
        ) : (
          filtered.map(item => {
            const repo = parseRepoFromUrl(item.repository_url)
            const isPR = !!item.pull_request
            return (
              <div
                key={item.id}
                className="rm-inbox-row"
                title="기본 브라우저로 열기"
                onClick={() => onOpenUrl(item.html_url)}
              >
                <span className={`rm-inbox-ic${isPR ? ' pr' : ' issue'}`}>{isPR ? <IconPR /> : <IconIssue />}</span>
                <div className="rm-inbox-info">
                  <div className="rm-inbox-title">
                    <span className="rm-inbox-num">#{item.number}</span>
                    <span className="rm-inbox-text">{item.title}</span>
                  </div>
                  <div className="rm-inbox-sub">
                    <span className="rm-inbox-repo">{repo?.fullName ?? '—'}</span>
                    {item.user && <><span className="rm-gh-dot">·</span><span>{item.user.login}</span></>}
                    <span className="rm-gh-dot">·</span>
                    <span>{relativeTime(item.updated_at)}</span>
                    {item.comments > 0 && <><span className="rm-gh-dot">·</span><span>💬 {item.comments}</span></>}
                    {item.labels.slice(0, 3).map(l => (
                      <span key={l.name} className="rm-inbox-label">{l.name}</span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
