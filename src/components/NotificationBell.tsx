import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { getNotifications, GithubApiError, type GithubNotification } from '../utils/githubClient'
import { getTodos, GitlabApiError, type GitlabTodo } from '../utils/gitlabClient'
import type { GitlabConn } from '../utils/useGitlabConns'
import { readNotifSoundSettings } from '../utils/notifSettings'
import { Geuru } from './Geuru'
import { ProviderBadge, ProviderFilterChips, type ProviderFilter } from './ProviderMark'

// 포커스 복귀 시 refetch 최소 간격(rate-limit 보호).
const MIN_REFETCH_MS = 60_000
// 백그라운드 주기 폴링 간격(불포커스 중 신규 알림 감지).
const POLL_MS = 60_000
// GitLab(특히 self-host) fetch 타임아웃 — 망 밖이라 도달 불가하면 오래 매달리지
// 않게 짧게 끊는다. AbortError로 떨어지고 '도달 실패'로 소프트 처리된다.
const GITLAB_FETCH_TIMEOUT_MS = 7_000

// 네트워크 도달 실패(인스턴스가 망 밖/다운) 판별. fetch TypeError('Failed to
// fetch')와 타임아웃 AbortError는 401/403 같은 API 응답 에러와 구분해 그 인스턴스만
// '연결 안 됨'으로 소프트 처리한다(패널 전체 에러로 올리지 않음).
function isUnreachableError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof TypeError) return true
  if (err instanceof Error && err.name === 'AbortError') return true
  return false
}

// ── 프로바이더 통합 알림 항목 ──
type ReasonKind = 'review' | 'mention' | 'ci_fail' | 'ci_pass' | 'merge' | 'comment' | 'assign'

export interface NotifItem {
  provider: 'github' | 'gitlab'
  key: string
  url: string
  title: string
  repo: string
  /** updated_at / created_at ISO */
  at: string
  unread: boolean
  icoCls: string
  rsCls: string
  reasonLabel: string
  kind: ReasonKind
}

// subject.url은 REST API URL이다(예: https://api.github.com/repos/o/r/pulls/3).
// 가능한 경우 사람이 볼 수 있는 html_url로 변환한다. 변환 불가하면 레포 페이지로.
function githubHtmlUrl(n: GithubNotification): string {
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

interface ReasonStyle { kind: ReasonKind; icoCls: string; rsCls: string; label: string }

// ── GitHub reason → 아이콘/색 매핑 (디자인 legend 그대로) ──
function githubReasonStyle(reason: string, title: string): ReasonStyle {
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

// ── GitLab todo action_name → 아이콘/색 매핑 ──
// 골드=리뷰요청/할당(인터랙션 요구), info=멘션, danger=파이프라인 실패, purple=머지/승인.
function gitlabTodoStyle(action: string): ReasonStyle {
  switch (action) {
    case 'review_requested': return { kind: 'review', icoCls: 'ic-gold', rsCls: 'rs-gold', label: '리뷰 요청' }
    case 'assigned': return { kind: 'assign', icoCls: 'ic-gold', rsCls: 'rs-gold', label: '할당됨' }
    case 'mentioned':
    case 'directly_addressed': return { kind: 'mention', icoCls: 'ic-info', rsCls: 'rs-info', label: '멘션' }
    case 'build_failed': return { kind: 'ci_fail', icoCls: 'ic-danger', rsCls: 'rs-danger', label: '파이프라인' }
    case 'unmergeable': return { kind: 'ci_fail', icoCls: 'ic-danger', rsCls: 'rs-danger', label: '충돌' }
    case 'approval_required': return { kind: 'merge', icoCls: 'ic-purple', rsCls: 'rs-purple', label: '승인 필요' }
    case 'marked': return { kind: 'comment', icoCls: 'ic-info', rsCls: 'rs-info', label: '표시됨' }
    case 'merge_train_removed': return { kind: 'merge', icoCls: 'ic-purple', rsCls: 'rs-purple', label: '머지 트레인' }
    default: return { kind: 'comment', icoCls: 'ic-info', rsCls: 'rs-info', label: action }
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

// ── 매핑: 원본 → NotifItem ──
function githubToItem(n: GithubNotification): NotifItem {
  const rs = githubReasonStyle(n.reason, n.subject.title)
  return {
    provider: 'github',
    key: `gh:${n.id}`,
    url: githubHtmlUrl(n),
    title: n.subject.title,
    repo: n.repository.full_name,
    at: n.updated_at,
    unread: n.unread,
    icoCls: rs.icoCls,
    rsCls: rs.rsCls,
    reasonLabel: rs.label,
    kind: rs.kind,
  }
}

function gitlabTodoToItem(host: string, t: GitlabTodo): NotifItem {
  const rs = gitlabTodoStyle(t.action_name)
  return {
    provider: 'gitlab',
    key: `gl:${host}:${t.id}`,
    url: t.target_url,
    title: t.target?.title ?? t.body,
    repo: t.project?.path_with_namespace ?? t.project?.name ?? '',
    at: t.created_at,
    // GitLab todos는 pending 만 조회 → 전부 안 읽음으로 간주.
    unread: t.state === 'pending',
    icoCls: rs.icoCls,
    rsCls: rs.rsCls,
    reasonLabel: rs.label,
    kind: rs.kind,
  }
}

export interface NotificationBellProps {
  githubToken: string
  /** 연결된 GitLab 인스턴스(host+token+username). 미연결이면 빈 배열 */
  gitlabInstances?: GitlabConn[]
  /** 외부 브라우저로 URL 열기 */
  onOpenUrl: (url: string) => void
}

export function NotificationBell({ githubToken, gitlabInstances = [], onOpenUrl }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotifItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 일부 인스턴스에 도달하지 못했을 때(망 밖 self-host 등) 패널 하단 소프트 힌트용.
  // 다른 소스가 정상이면 전면 에러로 막지 않고 이 비차단 힌트만 보여준다.
  const [unreachable, setUnreachable] = useState(false)
  const [provFilter, setProvFilter] = useState<ProviderFilter>('all')
  // GitHub notifications 권한이 없어 403이 난 경우 — 에러가 아니라 '유도' 상태.
  const [permDenied, setPermDenied] = useState(false)
  const lastFetchRef = useRef(0)
  const seqRef = useRef(0)
  // 직전까지 본 알림 고유키 집합. 첫 fetch는 시드만 하고 무알림(seededRef로 가드).
  const seenRef = useRef<Set<string>>(new Set())
  const seededRef = useRef(false)

  const hasGithub = !!githubToken
  const hasGitlab = gitlabInstances.length > 0
  const gitlabKey = gitlabInstances.map(i => i.host).join(',')

  const load = useCallback(async () => {
    if (!hasGithub && !hasGitlab) return
    const mySeq = ++seqRef.current
    lastFetchRef.current = Date.now()
    setLoading(true)
    setError(null)
    setPermDenied(false)
    setUnreachable(false)

    const sources: Array<Promise<NotifItem[]>> = []
    if (hasGithub) {
      sources.push(getNotifications(githubToken, { cache: false }).then(list => list.map(githubToItem)))
    }
    // GitLab fetch마다 타임아웃 signal — 망 밖 self-host에 오래 매달리지 않게 끊는다.
    // 타임아웃 시 AbortError로 떨어져 '도달 실패'로 소프트 처리된다.
    const timeouts: ReturnType<typeof setTimeout>[] = []
    for (const inst of gitlabInstances) {
      const ctrl = new AbortController()
      timeouts.push(setTimeout(() => ctrl.abort(), GITLAB_FETCH_TIMEOUT_MS))
      sources.push(
        getTodos(inst.host, inst.token, { state: 'pending', cache: false, signal: ctrl.signal })
          .then(list => list.map(t => gitlabTodoToItem(inst.host, t))),
      )
    }

    const results = await Promise.allSettled(sources)
    for (const id of timeouts) clearTimeout(id)
    if (seqRef.current !== mySeq) return

    const merged: NotifItem[] = []
    let ghPermDenied = false
    // 이번 fetch에서 정상 응답한 소스가 하나라도 있었는지 — 신규감지/시드의 신뢰 기준.
    // (GitHub 403 단독처럼 신뢰할 결과가 전혀 없으면 seen 갱신을 건너뛴다.)
    let hasTrustedSource = false
    // 도달조차 못 한 소스 수(망 밖 self-host 등). 일반 API 에러와 구분해 소프트 처리.
    let unreachableCount = 0
    const errors: string[] = []
    let idx = 0
    for (const r of results) {
      const isGithubSource = hasGithub && idx === 0
      idx++
      if (r.status === 'fulfilled') {
        merged.push(...r.value)
        hasTrustedSource = true
      } else {
        const err = r.reason
        if (isGithubSource && err instanceof GithubApiError && err.status === 403 && !err.rateLimited) {
          // /notifications는 notifications(또는 repo) scope가 필요 — 권한 없으면 403.
          ghPermDenied = true
        } else if (isUnreachableError(err)) {
          // fetch TypeError('Failed to fetch')/타임아웃 AbortError — 도달 실패.
          // 그 인스턴스만 '연결 안 됨'으로 소프트 처리하고 전면 에러로 올리지 않는다.
          unreachableCount++
        } else {
          const msg = err instanceof GithubApiError || err instanceof GitlabApiError
            ? err.message
            : err instanceof Error ? err.message : String(err)
          errors.push(msg)
        }
      }
    }

    merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

    // ── 신규 감지 + OS 네이티브 알림/Dock ──
    // 첫 fetch(시드)에는 알림을 띄우지 않는다 — 쌓여있던 알림이 쏟아지면 안 됨.
    // 신뢰할 결과가 하나도 없을 때(예: GitHub 단독이고 403)만 신규판정/시드 갱신을 건너뛴다
    // — 잘못 비운 seen 집합 때문에 다음 폴링에서 전부 신규로 오인하는 것을 방지.
    // GitLab 소스가 정상 응답했다면 GitHub 403 여부와 무관하게 시드/신규감지를 진행한다
    // (GitLab 단독 사용자도 신규감지·배지·사운드가 동작해야 함).
    // merged는 이번에 실제로 조회 성공한 소스의 항목만 담으므로, 403으로 누락된 소스의
    // 항목을 신규로 오인하지 않는다.
    if (hasTrustedSource) {
      const currentKeys = new Set(merged.map(n => n.key))
      const newItems = seededRef.current
        ? merged.filter(n => !seenRef.current.has(n.key))
        : []

      if (newItems.length > 0) {
        const { enabled, sound } = readNotifSoundSettings()
        const soundOpts = enabled ? { silent: false, sound } : { silent: true }
        const body = newItems.length === 1
          ? `${newItems[0].title} · ${newItems[0].repo}`
          : `새 알림 ${newItems.length}개`
        try { void window.appAPI?.showNotification({ title: 'GitGrove', body, ...soundOpts }) } catch { /* ignore */ }
        try { void window.appAPI?.bounceDock() } catch { /* ignore */ }
      }

      // 현재 보이는 항목 기준으로 seen 집합 갱신(prune) — 무한정 커지지 않게.
      seenRef.current = currentKeys
      seededRef.current = true

      // 미읽음 개수를 Dock 배지에 반영(0이면 제거).
      const unread = merged.filter(n => n.unread).length
      try { void window.appAPI?.setBadgeCount(unread) } catch { /* ignore */ }
    }

    setItems(merged)
    // 전면 에러는 '신뢰할 소스가 하나도 없고(정상 응답 0) 일반 API 에러가 있을 때'만.
    // - 하나라도 정상 응답(0건 포함)했으면 결과/빈 상태를 보여주고 막지 않는다.
    // - 도달 실패(망 밖 self-host)만 있을 땐 전면 에러 대신 하단 소프트 힌트로 안내.
    if (hasTrustedSource) {
      // 정상 소스가 있으면 결과 우선. 도달 실패 인스턴스가 있으면 소프트 힌트만.
      setUnreachable(unreachableCount > 0)
    } else if (errors.length > 0) {
      // 신뢰 소스가 없고 일반 API 에러가 있으면 전면 에러(기존 동작).
      setError(errors[0])
    } else if (ghPermDenied) {
      // GitHub 단독 403 권한 거부(신뢰 소스 없음) → 권한 유도.
      setPermDenied(true)
    } else if (unreachableCount > 0) {
      // 모든 소스가 '도달 실패'만 — API 에러는 없음. 전면 에러로 막지 않고 힌트.
      setUnreachable(true)
    }
    setLoading(false)
  }, [hasGithub, hasGitlab, githubToken, gitlabInstances])

  // 최신 load를 ref에 보관 — 폴링 effect가 load 재생성(부모 리렌더로 gitlabInstances
  // 배열 참조가 바뀌면 useCallback이 재생성됨)에 흔들려 interval을 teardown/재등록하면
  // 60초 카운트다운이 매번 리셋돼 실제 주기가 늘어진다. ref로 끊어 effect를 안정화한다.
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])

  // 마운트/토큰/인스턴스 변경 시 1회.
  useEffect(() => {
    if (!hasGithub && !hasGitlab) { setItems(null); return }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubToken, gitlabKey])

  // 포커스 복귀 시 throttled refetch(최소 60s 간격).
  useEffect(() => {
    if (!hasGithub && !hasGitlab) return
    const onFocus = () => {
      if (Date.now() - lastFetchRef.current >= MIN_REFETCH_MS) void loadRef.current()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [hasGithub, hasGitlab])

  // 백그라운드 60초 주기 폴링 — 불포커스 중에도 신규 알림을 감지.
  // 폴링은 항상 fetch(throttle 미적용); focus 핸들러의 throttle은 그대로 유지.
  // deps는 [hasGithub, hasGitlab]로 고정 — 부모 리렌더로 load가 재생성돼도
  // interval은 재등록되지 않아 60초 주기가 정확히 유지된다.
  useEffect(() => {
    if (!hasGithub && !hasGitlab) return
    const id = setInterval(() => { void loadRef.current() }, POLL_MS)
    return () => clearInterval(id)
  }, [hasGithub, hasGitlab])

  // 벨 토글: 패널을 열 때마다 항상 최신을 다시 가져온다.
  const toggle = useCallback(() => {
    setOpen(o => {
      if (!o) void load()
      return !o
    })
  }, [load])

  if (!hasGithub && !hasGitlab) return null

  const list = items ?? []
  // 안읽음 카운트(합산) — 배지/헤더용. 프로바이더 필터와 무관하게 전체 합산.
  const unreadCount = list.filter(n => n.unread).length

  // 프로바이더별 카운트(필터 칩).
  const counts = {
    all: list.length,
    github: list.filter(n => n.provider === 'github').length,
    gitlab: list.filter(n => n.provider === 'gitlab').length,
  }

  const visible = list.filter(n => {
    if (provFilter === 'github') return n.provider === 'github'
    if (provFilter === 'gitlab') return n.provider === 'gitlab'
    return true
  })

  const groups = GROUP_ORDER
    .map(key => ({ key, items: visible.filter(n => groupKey(n.at) === key) }))
    .filter(g => g.items.length > 0)

  const handleItemClick = (n: NotifItem) => {
    onOpenUrl(n.url)
    setOpen(false)
  }

  const footUrl = provFilter === 'gitlab' && gitlabInstances[0]
    ? `${gitlabInstances[0].host}/dashboard/todos`
    : 'https://github.com/notifications'
  const footLabel = provFilter === 'github' ? 'GitHub 알림' : provFilter === 'gitlab' ? 'GitLab Todos' : '전체 알림'

  // 헤더 그루: 안 읽은 게 없으면 반가운 얼굴, 있으면 기본.
  const headExpr = list.length > 0 && unreadCount === 0 ? 'happy' : 'idle'
  // 필터 칩은 양쪽 다 연결됐을 때만 의미 있음(한쪽만이면 숨김).
  const showFilter = hasGithub && hasGitlab && list.length > 0

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

            {showFilter && (
              <div className="tb-prov-filter">
                <ProviderFilterChips value={provFilter} onChange={setProvFilter} counts={counts} />
              </div>
            )}

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
              ) : groups.length === 0 ? (
                list.length === 0 ? (
                  <div className="nb-empty">
                    <Geuru expr="sleepy" scale={3.2} />
                    <b>읽지 않은 알림이 없어요</b>
                    <span>새 소식이 오면<br />그루가 여기서 알려줄게요.</span>
                  </div>
                ) : (
                  // 전체엔 알림이 있으나 현재 프로바이더 필터에 해당 항목이 없는 경우.
                  <div className="nb-empty">
                    <Geuru expr="sleepy" scale={3.2} />
                    <b>알림이 없어요</b>
                    <span>이 서비스의 새 알림이 없어요.</span>
                  </div>
                )
              ) : (
                groups.map(g => (
                  <div key={g.key}>
                    <div className="nb-group">{g.key}</div>
                    {g.items.map(n => (
                      <div
                        key={n.key}
                        className={`nb-item${n.unread ? ' unread' : ''}`}
                        onClick={() => handleItemClick(n)}
                        title="기본 브라우저로 열기"
                      >
                        <div className={`nb-ico ${n.icoCls}`}>
                          {REASON_ICON[n.kind]}
                          <ProviderBadge provider={n.provider} />
                        </div>
                        <div className="nb-body">
                          <div className="nb-it-title">{n.title}</div>
                          <div className="nb-it-sub">
                            <span className="nb-repo">{n.repo}</span>
                            <span className="nb-dot">·</span>
                            <span className={`nb-reason ${n.rsCls}`}>{n.reasonLabel}</span>
                            <span className="nb-time">{relativeTime(n.at)}</span>
                          </div>
                        </div>
                        {n.unread && <span className="nb-unread-dot" />}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            {unreachable && !error && !permDenied && (
              <div className="nb-soft-hint">일부 인스턴스에 연결하지 못했어요</div>
            )}

            <div className="nb-foot">
              <button
                className="nb-foot-btn"
                onClick={() => { onOpenUrl(footUrl); setOpen(false) }}
              >
                {footLabel} 보기
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 11L11 5M11 5H6M11 5v5" /></svg>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
