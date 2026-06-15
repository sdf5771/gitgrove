// 공용 GitHub REST API 클라이언트 (B8)
//
// 목적: 분산돼 있던 GitHub fetch 호출(프로필/권한배지/PR목록/토큰검증/rate-limit)을
// 한 곳으로 모은다. 공통 헤더 구성, 인메모리 TTL 캐시, rate-limit/429 친화 에러를
// 일원화하되 **기존 호출부의 throw/반환 계약은 그대로 유지**한다(회귀 0).
//
// - 토큰은 호출부가 인자로 전달한다(호출부가 이미 token state를 보유). 기존
//   토큰 조달 방식(getGithubToken / state)을 깨지 않는다.
// - 캐시는 GET 전용이며 옵션으로 끌 수 있다(`cache: false`). 항상 최신이어야 하는
//   호출(PR 수동 새로고침, 토큰 검증, rate_limit)은 bypass한다.

const BASE = 'https://api.github.com'

export interface GhResponse<T> {
  data: T
  /** 원본 응답 헤더(X-OAuth-Scopes, X-RateLimit-* 등 접근용) */
  headers: Headers
  /** X-OAuth-Scopes 파싱 결과(없으면 빈 배열). classic 토큰에서만 노출됨 */
  scopes: string[]
  /** X-RateLimit-* 파싱 결과(헤더가 없으면 null) */
  rateLimit: { remaining: number; limit: number; reset: number } | null
  status: number
}

export interface GhRequestOptions {
  token: string
  method?: string
  /** Accept 헤더 override(기본 application/vnd.github+json) */
  accept?: string
  /** GET 캐시 사용 여부(기본 true). 항상 최신이 필요하면 false */
  cache?: boolean
  /** 캐시 TTL(ms). 기본 60s */
  ttl?: number
  signal?: AbortSignal
}

interface CacheEntry {
  expires: number
  value: GhResponse<unknown>
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

function parseRateLimit(headers: Headers): GhResponse<unknown>['rateLimit'] {
  const remaining = headers.get('X-RateLimit-Remaining')
  const limit = headers.get('X-RateLimit-Limit')
  if (remaining === null && limit === null) return null
  return {
    remaining: remaining !== null ? Number(remaining) : NaN,
    limit: limit !== null ? Number(limit) : NaN,
    reset: Number(headers.get('X-RateLimit-Reset') ?? 0),
  }
}

function parseScopes(headers: Headers): string[] {
  const raw = headers.get('X-OAuth-Scopes') ?? ''
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * rate-limit 소진(403/429 + X-RateLimit-Remaining: 0)이면 사용자 친화 에러를
 * 만든다. 그 외 HTTP 에러는 호출부가 기존처럼 status를 파싱할 수 있도록
 * `GitHub API error: <status>` 형식을 유지한다(PRView fetchGitHubPRs 동작 보존).
 */
export class GithubApiError extends Error {
  status: number
  rateLimited: boolean
  constructor(message: string, status: number, rateLimited: boolean) {
    super(message)
    this.name = 'GithubApiError'
    this.status = status
    this.rateLimited = rateLimited
  }
}

function makeHttpError(status: number, rateLimit: GhResponse<unknown>['rateLimit']): GithubApiError {
  if ((status === 403 || status === 429) && rateLimit && rateLimit.remaining === 0) {
    const resetMs = rateLimit.reset * 1000
    const when = resetMs > 0 ? new Date(resetMs).toLocaleTimeString('ko-KR') : '잠시 후'
    return new GithubApiError(`GitHub API rate limit 초과 — ${when}에 재시도하세요.`, status, true)
  }
  return new GithubApiError(`GitHub API error: ${status}`, status, false)
}

/**
 * 제네릭 GitHub 요청. 성공(2xx) 시 GhResponse를 반환, 실패 시 throw.
 * 호출부가 status를 보고 싶으면 try/catch 대신 ok 응답을 쓸 수 있도록
 * 기본은 throw지만, 헤더는 throw 전에 캐시하지 않는다(에러는 캐시 금지).
 */
export async function ghRequest<T>(path: string, opts: GhRequestOptions): Promise<GhResponse<T>> {
  const { token, method = 'GET', accept = 'application/vnd.github+json', signal } = opts
  const useCache = method.toUpperCase() === 'GET' && opts.cache !== false
  const ttl = opts.ttl ?? DEFAULT_TTL
  const key = `${method.toUpperCase()} ${path} ${hashToken(token)}`

  if (useCache) {
    const hit = cache.get(key)
    if (hit && hit.expires > Date.now()) {
      return hit.value as GhResponse<T>
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: accept,
    },
    signal,
  })

  const rateLimit = parseRateLimit(res.headers)
  const scopes = parseScopes(res.headers)

  if (!res.ok) {
    throw makeHttpError(res.status, rateLimit)
  }

  const data = (await res.json()) as T
  const value: GhResponse<T> = { data, headers: res.headers, scopes, rateLimit, status: res.status }

  if (useCache) {
    cache.set(key, { expires: Date.now() + ttl, value })
  }
  return value
}

// ── 얇은 헬퍼들 (B18에서 getUserRepos 등 확장 예정) ──

/** GET /user — 프로필/토큰 검증용 */
export function getUser<T = unknown>(token: string, opts?: Partial<GhRequestOptions>): Promise<GhResponse<T>> {
  return ghRequest<T>('/user', { token, ...opts })
}

/** GET /repos/{owner}/{repo} — 권한 배지용 */
export function getRepo<T = unknown>(owner: string, repo: string, token: string, opts?: Partial<GhRequestOptions>): Promise<GhResponse<T>> {
  return ghRequest<T>(`/repos/${owner}/${repo}`, { token, ...opts })
}

/** GET /repos/{owner}/{repo}/pulls?state=all&per_page=20 — PR 목록 */
export function getPulls<T = unknown>(owner: string, repo: string, token: string, opts?: Partial<GhRequestOptions>): Promise<GhResponse<T>> {
  return ghRequest<T>(`/repos/${owner}/${repo}/pulls?state=all&per_page=20`, { token, ...opts })
}

/** GET /rate_limit — 항상 최신이어야 하므로 호출부에서 cache:false 권장 */
export function getRateLimit<T = unknown>(token: string, opts?: Partial<GhRequestOptions>): Promise<GhResponse<T>> {
  return ghRequest<T>('/rate_limit', { token, ...opts })
}

// ── 내 레포 둘러보기 (B18) ──

/** GET /user/repos 응답 중 UI가 쓰는 필드만 추린 타입 */
export interface GithubRepoSummary {
  id: number
  name: string
  full_name: string
  owner: { login: string }
  private: boolean
  description: string | null
  default_branch: string
  clone_url: string
  ssh_url: string
  html_url: string
  updated_at: string
  language: string | null
  stargazers_count: number
  archived: boolean
  fork: boolean
}

export interface GetUserReposOptions extends Partial<GhRequestOptions> {
  /** 페이지당 항목 수(기본 100, GitHub 상한) */
  perPage?: number
  /** 가져올 최대 페이지 수(기본 3, 약 300개에서 캡) */
  maxPages?: number
}

/**
 * GET /user/repos — 본인 소유 + 협력 + 조직 멤버 레포를 updated 내림차순으로.
 * Link 헤더 `rel="next"`를 따라가며 maxPages 상한까지 페이지네이션한다.
 * `cache: false`로 수동 새로고침 시 bypass 가능(B8 캐시 재사용).
 */
export async function getUserRepos(
  token: string,
  opts?: GetUserReposOptions,
): Promise<GithubRepoSummary[]> {
  const perPage = opts?.perPage ?? 100
  const maxPages = opts?.maxPages ?? 3
  const { perPage: _p, maxPages: _m, ...reqOpts } = opts ?? {}
  void _p; void _m

  const out: GithubRepoSummary[] = []
  for (let page = 1; page <= maxPages; page++) {
    const path =
      `/user/repos?affiliation=owner,collaborator,organization_member` +
      `&sort=updated&per_page=${perPage}&page=${page}`
    const res = await ghRequest<GithubRepoSummary[]>(path, { token, ...reqOpts })
    out.push(...res.data)
    // 다음 페이지 없음(Link 헤더에 rel="next" 부재) 또는 부분 페이지면 종료
    const link = res.headers.get('Link') ?? ''
    const hasNext = /\brel="next"/.test(link)
    if (!hasNext || res.data.length < perPage) break
  }
  return out
}

/** 테스트/연결해제 시 캐시 초기화용 */
export function clearGithubCache(): void {
  cache.clear()
}
