import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getSearchIssues,
  parseRepoFromUrl,
  GithubApiError,
} from '../utils/githubClient'
import {
  getMergeRequests,
  getIssues,
  GitlabApiError,
  type GitlabMergeRequest,
  type GitlabIssue,
} from '../utils/gitlabClient'
import type { GitlabConn } from '../utils/useGitlabConns'
import { ProviderBadge, ProviderFilterChips, type ProviderFilter } from './ProviderMark'

// 세 분류 탭. GitHub=search 쿼리, GitLab=MR scope/이슈 scope.
type InboxTab = 'created' | 'review' | 'assigned'

const TABS: ReadonlyArray<{ id: InboxTab; label: string }> = [
  { id: 'created', label: '내가 연 MR·PR' },
  { id: 'review', label: '리뷰 요청받음' },
  { id: 'assigned', label: '할당된 이슈' },
]

function buildGithubQuery(tab: InboxTab, login: string): string {
  switch (tab) {
    case 'created':
      return `is:open is:pr author:${login}`
    case 'review':
      return `is:open is:pr review-requested:${login}`
    case 'assigned':
      return `is:open is:issue assignee:${login}`
  }
}

// ── 프로바이더 통합 인박스 항목 ──
export interface InboxItem {
  provider: 'github' | 'gitlab'
  /** 안정 키(프로바이더+host+id) */
  key: string
  /** 외부로 열 URL */
  url: string
  /** MR/PR이면 true, 이슈면 false */
  isMr: boolean
  /** #(이슈·GitHub) 또는 !(GitLab MR) */
  num: number
  title: string
  repo: string
  by: string
  /** updated_at ISO */
  updatedAt: string
  comments: number
  labels: string[]
}

interface TabState {
  items: InboxItem[] | null
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
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6.5" cy="6.5" r="4" /><path d="M10.5 10.5l3 3" /></svg>
)
const IconPR = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="4" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><path d="M4 6v4M12 10V8a2 2 0 0 0-2-2H7" /></svg>
)
const IconIssue = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" /></svg>
)

// ── GitLab → InboxItem 매핑 ──
function gitlabMrToItem(host: string, mr: GitlabMergeRequest): InboxItem {
  const repo = mr.web_url.match(/\/([^/]+\/[^/]+(?:\/[^/]+)*)\/-\/merge_requests\//)?.[1]
    ?? String(mr.project_id)
  return {
    provider: 'gitlab',
    key: `gl:${host}:mr:${mr.id}`,
    url: mr.web_url,
    isMr: true,
    num: mr.iid,
    title: mr.title,
    repo,
    by: mr.author?.name ?? mr.author?.username ?? '—',
    updatedAt: mr.updated_at,
    comments: mr.user_notes_count ?? 0,
    labels: mr.labels ?? [],
  }
}

function gitlabIssueToItem(host: string, issue: GitlabIssue): InboxItem {
  const repo = issue.references?.full?.replace(/#\d+$/, '')
    ?? issue.web_url.match(/\/([^/]+\/[^/]+(?:\/[^/]+)*)\/-\/issues\//)?.[1]
    ?? String(issue.project_id)
  return {
    provider: 'gitlab',
    key: `gl:${host}:issue:${issue.id}`,
    url: issue.web_url,
    isMr: false,
    num: issue.iid,
    title: issue.title,
    repo,
    by: issue.author?.name ?? issue.author?.username ?? '—',
    updatedAt: issue.updated_at,
    comments: issue.user_notes_count ?? 0,
    labels: issue.labels ?? [],
  }
}

async function loadGithubItems(tab: InboxTab, token: string, login: string, force: boolean): Promise<InboxItem[]> {
  const res = await getSearchIssues(token, buildGithubQuery(tab, login), force ? { cache: false } : undefined)
  return res.items.map(it => {
    const repo = parseRepoFromUrl(it.repository_url)
    const isPR = !!it.pull_request
    return {
      provider: 'github' as const,
      key: `gh:${it.id}`,
      url: it.html_url,
      isMr: isPR,
      num: it.number,
      title: it.title,
      repo: repo?.fullName ?? '—',
      by: it.user?.login ?? '—',
      updatedAt: it.updated_at,
      comments: it.comments,
      labels: it.labels.map(l => l.name),
    }
  })
}

async function loadGitlabItems(tab: InboxTab, inst: GitlabConn, force: boolean): Promise<InboxItem[]> {
  const opts = force ? { cache: false } : undefined
  if (tab === 'assigned') {
    const issues = await getIssues(inst.host, inst.token, { scope: 'assigned_to_me', state: 'opened', ...opts })
    return issues.map(i => gitlabIssueToItem(inst.host, i))
  }
  const mrs = await getMergeRequests(inst.host, inst.token, {
    state: 'opened',
    ...(tab === 'created' ? { scope: 'created_by_me' } : { reviewerUsername: inst.username }),
    ...opts,
  })
  return mrs.map(mr => gitlabMrToItem(inst.host, mr))
}

export interface GithubInboxProps {
  githubToken: string
  githubLogin: string | null
  /** 연결된 GitLab 인스턴스(host+token+username). 미연결이면 빈 배열 */
  gitlabInstances?: GitlabConn[]
  /** 외부 브라우저로 URL 열기 */
  onOpenUrl: (url: string) => void
}

export function GithubInbox({ githubToken, githubLogin, gitlabInstances = [], onOpenUrl }: GithubInboxProps) {
  const [tab, setTab] = useState<InboxTab>('created')
  const [query, setQuery] = useState('')
  const [provFilter, setProvFilter] = useState<ProviderFilter>('all')
  const [states, setStates] = useState<Record<InboxTab, TabState>>({
    created: EMPTY_TAB,
    review: EMPTY_TAB,
    assigned: EMPTY_TAB,
  })

  const hasGithub = !!githubToken && !!githubLogin
  const hasGitlab = gitlabInstances.length > 0
  // 인스턴스 식별 키(목록 변동 시 재로드 트리거).
  const gitlabKey = gitlabInstances.map(i => i.host).join(',')

  // in-flight 무효화: 탭 전환/새로고침/인스턴스 변경이 겹쳐도 stale 응답이 최신을 덮지 않게.
  const seqRef = useRef(0)

  const load = useCallback(async (target: InboxTab, force: boolean) => {
    if (!hasGithub && !hasGitlab) return
    const mySeq = ++seqRef.current
    setStates(prev => ({ ...prev, [target]: { ...prev[target], loading: true, error: null } }))

    // 각 소스를 독립 수집(한 소스 실패가 다른 소스를 막지 않게 allSettled).
    const sources: Array<Promise<InboxItem[]>> = []
    if (hasGithub && githubLogin) sources.push(loadGithubItems(target, githubToken, githubLogin, force))
    for (const inst of gitlabInstances) sources.push(loadGitlabItems(target, inst, force))

    try {
      const results = await Promise.allSettled(sources)
      if (seqRef.current !== mySeq) return
      const items: InboxItem[] = []
      const errors: string[] = []
      for (const r of results) {
        if (r.status === 'fulfilled') items.push(...r.value)
        else {
          const e = r.reason
          const msg = e instanceof GithubApiError || e instanceof GitlabApiError
            ? e.message
            : e instanceof Error ? e.message : String(e)
          errors.push(msg)
        }
      }
      items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      // 일부라도 성공하면 목록을 보여주고, 전부 실패한 경우에만 에러로 처리.
      const error = items.length === 0 && errors.length > 0 ? errors[0] : null
      setStates(prev => ({ ...prev, [target]: { items, loading: false, error } }))
    } catch (err) {
      if (seqRef.current !== mySeq) return
      const msg = err instanceof Error ? err.message : String(err)
      setStates(prev => ({ ...prev, [target]: { ...prev[target], loading: false, error: msg } }))
    }
  }, [hasGithub, hasGitlab, githubToken, githubLogin, gitlabInstances])

  // 인스턴스/토큰 변경 시 캐시 무효화(다음 진입에서 재로드).
  useEffect(() => {
    setStates({ created: EMPTY_TAB, review: EMPTY_TAB, assigned: EMPTY_TAB })
  }, [githubToken, githubLogin, gitlabKey])

  // 활성 탭이 아직 로드 안 됐으면 진입/전환 시 로드.
  useEffect(() => {
    const st = states[tab]
    if (st.items === null && !st.loading && !st.error) {
      void load(tab, false)
    }
  }, [tab, states, load])

  if (!hasGithub && !hasGitlab) {
    return (
      <div className="rm-inbox">
        <div className="rm-gh-status">GitHub 또는 GitLab 연결이 필요합니다. 설정에서 토큰을 등록하세요.</div>
      </div>
    )
  }

  const current = states[tab]
  const allItems = current.items ?? []

  // 프로바이더별 카운트(필터 칩) — 검색 적용 전 기준.
  const counts = {
    all: allItems.length,
    github: allItems.filter(i => i.provider === 'github').length,
    gitlab: allItems.filter(i => i.provider === 'gitlab').length,
  }

  const q = query.trim().toLowerCase()
  const filtered = allItems.filter(it => {
    if (provFilter === 'github' && it.provider !== 'github') return false
    if (provFilter === 'gitlab' && it.provider !== 'gitlab') return false
    if (!q) return true
    return it.title.toLowerCase().includes(q) || it.repo.toLowerCase().includes(q)
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

      <div className="inbox-filter">
        <div className="tb-prov-filter inbox-prov-filter">
          <ProviderFilterChips
            value={provFilter}
            onChange={setProvFilter}
            counts={counts}
            showGithub={hasGithub}
            showGitlab={hasGitlab}
          />
        </div>
        <div className="rm-search-wrap" style={{ flex: 1 }}>
          <IconSearchSmall />
          <input
            type="text"
            placeholder="제목 / namespace 로 필터…"
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

      <div className="rm-list rm-inbox-scroll">
        {current.loading && current.items === null ? (
          <div className="rm-gh-status"><span className="sett-spinner" /> 불러오는 중…</div>
        ) : current.error ? (
          <div className="rm-gh-status rm-gh-error">{current.error}</div>
        ) : filtered.length === 0 ? (
          <div className="rm-empty-section">
            {allItems.length > 0 ? '검색 결과가 없어요.' : '표시할 항목이 없어요.'}
          </div>
        ) : (
          filtered.map(item => {
            const prefix = item.provider === 'gitlab' && item.isMr ? '!' : '#'
            return (
              <div
                key={item.key}
                className="rm-inbox-row"
                title="기본 브라우저로 열기"
                onClick={() => onOpenUrl(item.url)}
              >
                <span className={`rm-inbox-ic${item.isMr ? ' mr' : ' issue'}`}>
                  {item.isMr ? <IconPR /> : <IconIssue />}
                  <ProviderBadge provider={item.provider} />
                </span>
                <div className="rm-inbox-info">
                  <div className="rm-inbox-title">
                    <span className="rm-inbox-num">{prefix}{item.num}</span>
                    <span className="rm-inbox-text">{item.title}</span>
                  </div>
                  <div className="rm-inbox-sub">
                    <span className="rm-inbox-repo">{item.repo}</span>
                    <span className="rm-gh-dot">·</span>
                    <span>{item.by}</span>
                    <span className="rm-gh-dot">·</span>
                    <span>{relativeTime(item.updatedAt)}</span>
                    {item.comments > 0 && <><span className="rm-gh-dot">·</span><span>💬 {item.comments}</span></>}
                    {item.labels.slice(0, 3).map(l => (
                      <span key={l} className="rm-inbox-label">{l}</span>
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
