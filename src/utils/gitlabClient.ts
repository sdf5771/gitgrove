// 공용 GitLab REST API 클라이언트 (GL2) — githubClient.ts 미러
//
// 목적: GitLab 호출(프로필/프로젝트/MR/Todos)의 단일 진입점. 공통 헤더 구성,
// 인메모리 TTL 캐시, rate-limit/429 친화 에러를 일원화한다.
//
// githubClient와의 차이:
//   - base URL이 **가변**이다. self-hosted + gitlab.com 다중 인스턴스를 동시에
//     지원하므로 host를 호출부가 주입한다(상수 금지). base = `{정규화host}/api/v4`.
//   - 인증 헤더는 `PRIVATE-TOKEN: <token>` (GitLab PAT).
//   - rate-limit 헤더는 대시 표기 `RateLimit-Remaining`/`RateLimit-Limit`/`RateLimit-Reset`.
//   - 토큰은 호출부가 인자로 전달한다(githubClient와 동일 — 호출부가 token state 보유).
//   - 캐시 키에 host를 포함해 인스턴스 간 충돌을 막는다.

import { normalizeGitlabHost } from './gitlab'

export interface GlResponse<T> {
  data: T
  /** 원본 응답 헤더(RateLimit-*, X-Total 등 접근용) */
  headers: Headers
  /** RateLimit-* 파싱 결과(헤더가 없으면 null) */
  rateLimit: { remaining: number; limit: number; reset: number } | null
  status: number
}

export interface GlRequestOptions {
  token: string
  method?: string
  /** Accept 헤더 override(기본 application/json) */
  accept?: string
  /** GET 캐시 사용 여부(기본 true). 항상 최신이 필요하면 false */
  cache?: boolean
  /** 캐시 TTL(ms). 기본 60s */
  ttl?: number
  signal?: AbortSignal
}

interface CacheEntry {
  expires: number
  value: GlResponse<unknown>
}

const DEFAULT_TTL = 60_000
const cache = new Map<string, CacheEntry>()

// 토큰 전체를 키에 넣지 않도록 가벼운 해시(캐시 분리 목적, 보안용 아님).
function hashToken(token: string): string {
  let h = 0
  for (let i = 0; i < token.length; i++) {
    h = (h * 31 + token.charCodeAt(i)) | 0
  }
  return String(h >>> 0)
}

// GitLab rate-limit 헤더는 대시 표기(RateLimit-Remaining 등). 일부 인스턴스는
// 미설정일 수 있어 헤더가 전부 없으면 null.
export function parseGlRateLimit(headers: Headers): GlResponse<unknown>['rateLimit'] {
  const remaining = headers.get('RateLimit-Remaining')
  const limit = headers.get('RateLimit-Limit')
  if (remaining === null && limit === null) return null
  return {
    remaining: remaining !== null ? Number(remaining) : NaN,
    limit: limit !== null ? Number(limit) : NaN,
    reset: Number(headers.get('RateLimit-Reset') ?? 0),
  }
}

/**
 * rate-limit 소진(429, 또는 403 + RateLimit-Remaining: 0)이면 사용자 친화 에러를
 * 만든다. 그 외 HTTP 에러는 호출부가 status를 파싱할 수 있도록
 * `GitLab API error: <status>` 형식을 유지한다.
 */
export class GitlabApiError extends Error {
  status: number
  rateLimited: boolean
  constructor(message: string, status: number, rateLimited: boolean) {
    super(message)
    this.name = 'GitlabApiError'
    this.status = status
    this.rateLimited = rateLimited
  }
}

export function makeGlHttpError(status: number, rateLimit: GlResponse<unknown>['rateLimit']): GitlabApiError {
  const exhausted = status === 429 || ((status === 403) && !!rateLimit && rateLimit.remaining === 0)
  if (exhausted) {
    const resetMs = rateLimit && rateLimit.reset > 0 ? rateLimit.reset * 1000 : 0
    const when = resetMs > 0 ? new Date(resetMs).toLocaleTimeString('ko-KR') : '잠시 후'
    return new GitlabApiError(`GitLab API rate limit 초과 — ${when}에 재시도하세요.`, status, true)
  }
  return new GitlabApiError(`GitLab API error: ${status}`, status, false)
}

/**
 * base URL을 host에서 구성한다. host는 normalizeGitlabHost로 정규화(상수 금지).
 * 결과: `{정규화host}/api/v4`
 */
export function gitlabApiBase(host: string): string {
  const normalized = normalizeGitlabHost(host)
  if (!normalized) throw new GitlabApiError('GitLab host가 비어 있습니다.', 0, false)
  return `${normalized}/api/v4`
}

/**
 * 제네릭 GitLab 요청. 성공(2xx) 시 GlResponse 반환, 실패 시 throw.
 * 캐시 키에 host를 포함한다(다중 인스턴스 충돌 방지).
 */
export async function glRequest<T>(host: string, path: string, opts: GlRequestOptions): Promise<GlResponse<T>> {
  const { token, method = 'GET', accept = 'application/json', signal } = opts
  const base = gitlabApiBase(host)
  const useCache = method.toUpperCase() === 'GET' && opts.cache !== false
  const ttl = opts.ttl ?? DEFAULT_TTL
  const key = `${method.toUpperCase()} ${base}${path} ${hashToken(token)}`

  if (useCache) {
    const hit = cache.get(key)
    if (hit && hit.expires > Date.now()) {
      return hit.value as GlResponse<T>
    }
  }

  // cache: 'no-store' — 렌더러 HTTP 캐시 우회(githubClient 최신 패턴 동일).
  // 중복 호출 억제는 위 인메모리 TTL 캐시가 담당.
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'PRIVATE-TOKEN': token,
      Accept: accept,
    },
    cache: 'no-store',
    signal,
  })

  const rateLimit = parseGlRateLimit(res.headers)

  if (!res.ok) {
    throw makeGlHttpError(res.status, rateLimit)
  }

  const data = (await res.json()) as T
  const value: GlResponse<T> = { data, headers: res.headers, rateLimit, status: res.status }

  if (useCache) {
    cache.set(key, { expires: Date.now() + ttl, value })
  }
  return value
}

// ── 헬퍼들 (반환 타입은 UI가 쓰는 필드만 추린 interface) ──

/** GET /user 응답 중 UI가 쓰는 필드 */
export interface GitlabUser {
  id: number
  username: string
  name: string
  avatar_url: string | null
  web_url: string
  state?: string
  bio?: string | null
}

/** GET /user — 프로필/토큰 검증용 */
export async function getCurrentUser(
  host: string,
  token: string,
  opts?: Partial<GlRequestOptions>,
): Promise<GitlabUser> {
  const res = await glRequest<GitlabUser>(host, '/user', { token, ...opts })
  return res.data
}

/** GET /projects 응답 중 UI가 쓰는 필드 */
export interface GitlabProjectSummary {
  id: number
  name: string
  path_with_namespace: string
  namespace: { id: number; name: string; path: string; full_path: string }
  visibility: 'private' | 'internal' | 'public'
  star_count: number
  last_activity_at: string
  http_url_to_repo: string
  ssh_url_to_repo: string
  description: string | null
  default_branch?: string
  permissions?: {
    project_access?: { access_level: number } | null
    group_access?: { access_level: number } | null
  }
}

export interface GetProjectsOptions extends Partial<GlRequestOptions> {
  /** 본인이 멤버인 프로젝트만(기본 true) */
  membership?: boolean
  /** 검색어(path/name) */
  search?: string
  /** 페이지(1-base, 기본 1) */
  page?: number
  /** 페이지당 항목 수(기본 30) */
  perPage?: number
}

/**
 * GET /projects?membership=true&order_by=last_activity_at — 내가 멤버인 프로젝트를
 * 최근 활동순으로. self-hosted/gitlab.com 공통. `cache:false`로 수동 새로고침 bypass.
 */
export async function getProjects(
  host: string,
  token: string,
  opts?: GetProjectsOptions,
): Promise<GitlabProjectSummary[]> {
  const membership = opts?.membership ?? true
  const page = opts?.page ?? 1
  const perPage = opts?.perPage ?? 30
  const search = opts?.search
  const { membership: _mb, search: _s, page: _pg, perPage: _pp, ...reqOpts } = opts ?? {}
  void _mb; void _s; void _pg; void _pp

  const params = new URLSearchParams()
  params.set('membership', String(membership))
  params.set('order_by', 'last_activity_at')
  params.set('per_page', String(perPage))
  params.set('page', String(page))
  if (search) params.set('search', search)

  const res = await glRequest<GitlabProjectSummary[]>(host, `/projects?${params.toString()}`, { token, ...reqOpts })
  return res.data
}

/** GET /merge_requests 응답 중 UI가 쓰는 필드 */
export interface GitlabMergeRequest {
  id: number
  iid: number
  project_id: number
  title: string
  description: string | null
  state: 'opened' | 'closed' | 'merged' | 'locked'
  web_url: string
  source_branch: string
  target_branch: string
  author: { id: number; username: string; name: string; avatar_url: string | null } | null
  created_at: string
  updated_at: string
  draft?: boolean
  merge_status?: string
  user_notes_count?: number
  labels?: string[]
}

export interface GetMergeRequestsOptions extends Partial<GlRequestOptions> {
  /** 프로젝트 한정 시 project id(없으면 계정 전역 /merge_requests) */
  projectId?: number | string
  /** created_by_me / assigned_to_me / all 등 (전역 호출용) */
  scope?: 'created_by_me' | 'assigned_to_me' | 'all'
  /** opened / closed / merged / all */
  state?: 'opened' | 'closed' | 'merged' | 'all'
  /** 페이지당 항목 수(기본 30) */
  perPage?: number
}

/**
 * MR 목록.
 * projectId 있으면 `GET /projects/:id/merge_requests`, 없으면 계정 전역 `GET /merge_requests`.
 */
export async function getMergeRequests(
  host: string,
  token: string,
  opts?: GetMergeRequestsOptions,
): Promise<GitlabMergeRequest[]> {
  const projectId = opts?.projectId
  const scope = opts?.scope
  const state = opts?.state ?? 'opened'
  const perPage = opts?.perPage ?? 30
  const { projectId: _pid, scope: _sc, state: _st, perPage: _pp, ...reqOpts } = opts ?? {}
  void _pid; void _sc; void _st; void _pp

  const params = new URLSearchParams()
  if (state) params.set('state', state)
  if (scope) params.set('scope', scope)
  params.set('per_page', String(perPage))

  const path = projectId != null
    ? `/projects/${encodeURIComponent(String(projectId))}/merge_requests?${params.toString()}`
    : `/merge_requests?${params.toString()}`

  const res = await glRequest<GitlabMergeRequest[]>(host, path, { token, ...reqOpts })
  return res.data
}

// ── 단일 MR 상세/변경/노트/파이프라인 (GL7 — MRView 상세 탭용) ──

/** GET /projects/:id/merge_requests/:iid 응답 중 UI가 쓰는 필드(목록 + 승인/diff 통계) */
export interface GitlabMergeRequestDetail extends GitlabMergeRequest {
  /** changes_count는 "3" 또는 "3+" 문자열 */
  changes_count?: string
  /** approvals 요건이 활성화돼 있으면 별도 호출(getMergeRequestApprovals) */
}

/** GET /projects/:id/merge_requests/:iid — 단일 MR 상세 */
export async function getMergeRequest(
  host: string,
  token: string,
  projectId: number | string,
  iid: number,
  opts?: Partial<GlRequestOptions>,
): Promise<GitlabMergeRequestDetail> {
  const path = `/projects/${encodeURIComponent(String(projectId))}/merge_requests/${iid}`
  const res = await glRequest<GitlabMergeRequestDetail>(host, path, { token, ...opts })
  return res.data
}

/** GET /projects/:id/merge_requests/:iid/approvals 응답 중 UI가 쓰는 필드 */
export interface GitlabMrApprovals {
  approvals_required: number
  approvals_left: number
  approved?: boolean
  approved_by?: Array<{ user: { id: number; username: string; name: string; avatar_url: string | null } }>
}

/**
 * GET /projects/:id/merge_requests/:iid/approvals — 승인 요건/현황.
 * Approval 기능이 비활성(예: gitlab.com 무료 self-managed)이면 404/403일 수 있어
 * 호출부에서 catch해 graceful 처리한다.
 */
export async function getMergeRequestApprovals(
  host: string,
  token: string,
  projectId: number | string,
  iid: number,
  opts?: Partial<GlRequestOptions>,
): Promise<GitlabMrApprovals> {
  const path = `/projects/${encodeURIComponent(String(projectId))}/merge_requests/${iid}/approvals`
  const res = await glRequest<GitlabMrApprovals>(host, path, { token, ...opts })
  return res.data
}

/** GET /projects/:id/merge_requests/:iid/changes 의 changes[] 원소 중 UI가 쓰는 필드 */
export interface GitlabMrChange {
  old_path: string
  new_path: string
  new_file: boolean
  renamed_file: boolean
  deleted_file: boolean
  /** unified diff 텍스트(라인 수 집계용) */
  diff?: string
}

/** GET /projects/:id/merge_requests/:iid/changes — 변경 파일 목록 */
export async function getMergeRequestChanges(
  host: string,
  token: string,
  projectId: number | string,
  iid: number,
  opts?: Partial<GlRequestOptions>,
): Promise<GitlabMrChange[]> {
  const path = `/projects/${encodeURIComponent(String(projectId))}/merge_requests/${iid}/changes`
  const res = await glRequest<{ changes?: GitlabMrChange[] }>(host, path, { token, ...opts })
  return res.data.changes ?? []
}

/** GET /projects/:id/merge_requests/:iid/notes 의 note 원소 중 UI가 쓰는 필드 */
export interface GitlabMrNote {
  id: number
  body: string
  /** 시스템 노트(상태변경 등)는 제외 권장 */
  system: boolean
  created_at: string
  author: { id: number; username: string; name: string; avatar_url: string | null } | null
}

/** GET /projects/:id/merge_requests/:iid/notes — 토론/코멘트(시스템 노트 포함) */
export async function getMergeRequestNotes(
  host: string,
  token: string,
  projectId: number | string,
  iid: number,
  opts?: Partial<GlRequestOptions>,
): Promise<GitlabMrNote[]> {
  const path = `/projects/${encodeURIComponent(String(projectId))}/merge_requests/${iid}/notes?per_page=50&sort=asc&order_by=created_at`
  const res = await glRequest<GitlabMrNote[]>(host, path, { token, ...opts })
  return res.data
}

/** GET /projects/:id/pipelines 의 원소 중 UI가 쓰는 필드 */
export interface GitlabPipeline {
  id: number
  iid?: number
  /** running/pending/success/failed/canceled/skipped 등 */
  status: string
  ref: string
  sha: string
  web_url: string
  created_at: string
  updated_at: string
}

/**
 * GET /projects/:id/merge_requests/:iid/pipelines — 해당 MR의 파이프라인 목록(최신순).
 * 첫 원소가 가장 최근 실행.
 */
export async function getMergeRequestPipelines(
  host: string,
  token: string,
  projectId: number | string,
  iid: number,
  opts?: Partial<GlRequestOptions>,
): Promise<GitlabPipeline[]> {
  const path = `/projects/${encodeURIComponent(String(projectId))}/merge_requests/${iid}/pipelines`
  const res = await glRequest<GitlabPipeline[]>(host, path, { token, ...opts })
  return res.data
}

/** GET /todos 응답 중 UI가 쓰는 필드 */
export interface GitlabTodo {
  id: number
  action_name: string
  state: 'pending' | 'done'
  target_type: string
  target_url: string
  body: string
  created_at: string
  project?: { id: number; name: string; path_with_namespace?: string } | null
  author?: { id: number; username: string; name: string; avatar_url: string | null } | null
  target?: { title?: string } | null
}

export interface GetTodosOptions extends Partial<GlRequestOptions> {
  /** pending / done (기본 pending) */
  state?: 'pending' | 'done'
  /** 페이지당 항목 수(기본 30) */
  perPage?: number
}

/**
 * GET /todos — GitLab 알림(멘션/리뷰요청/할당 등). 기본 pending.
 * 폴링 빈도가 낮아도 최신을 보고 싶으므로 호출부에서 cache:false 권장.
 */
export async function getTodos(
  host: string,
  token: string,
  opts?: GetTodosOptions,
): Promise<GitlabTodo[]> {
  const state = opts?.state ?? 'pending'
  const perPage = opts?.perPage ?? 30
  const { state: _st, perPage: _pp, ...reqOpts } = opts ?? {}
  void _st; void _pp

  const params = new URLSearchParams()
  params.set('state', state)
  params.set('per_page', String(perPage))

  const res = await glRequest<GitlabTodo[]>(host, `/todos?${params.toString()}`, { token, ...reqOpts })
  return res.data
}

/** 테스트/연결해제 시 캐시 초기화용 */
export function clearGitlabCache(): void {
  cache.clear()
}
