import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  glRequest,
  gitlabApiBase,
  parseGlRateLimit,
  makeGlHttpError,
  GitlabApiError,
  getCurrentUser,
  getProjects,
  getMergeRequests,
  getMergeRequest,
  getMergeRequestChanges,
  getMergeRequestNotes,
  getMergeRequestPipelines,
  getMergeRequestApprovals,
  getTodos,
  clearGitlabCache,
} from './gitlabClient'

// fetch mock 헬퍼: 응답 본문 + 헤더 + status 구성
function mockFetchOnce(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  const status = init?.status ?? 200
  const headers = new Headers(init?.headers ?? {})
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => body,
  } as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  clearGitlabCache()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('gitlabApiBase', () => {
  it('정규화 host + /api/v4', () => {
    expect(gitlabApiBase('gitlab.com')).toBe('https://gitlab.com/api/v4')
    expect(gitlabApiBase('https://gl.internal:8443/')).toBe('https://gl.internal:8443/api/v4')
  })

  it('빈 host는 GitlabApiError', () => {
    expect(() => gitlabApiBase('')).toThrow(GitlabApiError)
  })
})

describe('parseGlRateLimit', () => {
  it('대시 표기 헤더 파싱', () => {
    const h = new Headers({
      'RateLimit-Remaining': '5',
      'RateLimit-Limit': '600',
      'RateLimit-Reset': '1700000000',
    })
    expect(parseGlRateLimit(h)).toEqual({ remaining: 5, limit: 600, reset: 1700000000 })
  })

  it('헤더 전부 없으면 null', () => {
    expect(parseGlRateLimit(new Headers())).toBeNull()
  })
})

describe('makeGlHttpError', () => {
  it('429는 rateLimited 친화 메시지', () => {
    const err = makeGlHttpError(429, { remaining: 0, limit: 600, reset: 0 })
    expect(err.rateLimited).toBe(true)
    expect(err.status).toBe(429)
    expect(err.message).toContain('rate limit')
  })

  it('403 + remaining 0도 rateLimited', () => {
    const err = makeGlHttpError(403, { remaining: 0, limit: 600, reset: 0 })
    expect(err.rateLimited).toBe(true)
  })

  it('403 + remaining > 0은 일반 에러', () => {
    const err = makeGlHttpError(403, { remaining: 10, limit: 600, reset: 0 })
    expect(err.rateLimited).toBe(false)
    expect(err.message).toBe('GitLab API error: 403')
  })

  it('rateLimit null인 일반 404', () => {
    const err = makeGlHttpError(404, null)
    expect(err.rateLimited).toBe(false)
    expect(err.message).toBe('GitLab API error: 404')
  })
})

describe('glRequest — 요청 구성', () => {
  it('base URL = host/api/v4 + path, PRIVATE-TOKEN 헤더, cache:no-store', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce({ ok: 1 }))
    await glRequest('gitlab.com', '/user', { token: 'glpat-xyz' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://gitlab.com/api/v4/user')
    expect((opts as RequestInit).cache).toBe('no-store')
    const headers = (opts as RequestInit).headers as Record<string, string>
    expect(headers['PRIVATE-TOKEN']).toBe('glpat-xyz')
    expect(headers.Accept).toBe('application/json')
  })

  it('self-hosted host도 주입식 base로 구성', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce([]))
    await glRequest('https://gl.internal:8443', '/projects', { token: 't' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://gl.internal:8443/api/v4/projects')
  })

  it('GET 응답을 TTL 캐시(동일 host/path/token은 fetch 1회)', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce({ v: 1 }))
    const a = await glRequest('gitlab.com', '/user', { token: 't' })
    const b = await glRequest('gitlab.com', '/user', { token: 't' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(b.data).toEqual(a.data)
  })

  it('cache:false면 캐시 bypass', async () => {
    fetchMock.mockResolvedValue(mockFetchOnce({ v: 1 }))
    await glRequest('gitlab.com', '/user', { token: 't', cache: false })
    await glRequest('gitlab.com', '/user', { token: 't', cache: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('캐시 키에 host 포함(다른 인스턴스는 별도 캐시)', async () => {
    fetchMock.mockResolvedValue(mockFetchOnce({ v: 1 }))
    await glRequest('gitlab.com', '/user', { token: 't' })
    await glRequest('gl.internal', '/user', { token: 't' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('비-2xx면 GitlabApiError throw(에러는 캐시 안 함)', async () => {
    fetchMock.mockResolvedValue(mockFetchOnce({ message: 'no' }, { status: 401 }))
    await expect(glRequest('gitlab.com', '/user', { token: 'bad' })).rejects.toThrow(GitlabApiError)
    await expect(glRequest('gitlab.com', '/user', { token: 'bad' })).rejects.toThrow('GitLab API error: 401')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('429 rate-limit은 친화 에러', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchOnce({}, { status: 429, headers: { 'RateLimit-Remaining': '0', 'RateLimit-Limit': '600' } }),
    )
    await expect(glRequest('gitlab.com', '/user', { token: 't' })).rejects.toMatchObject({ rateLimited: true })
  })
})

describe('헬퍼 — 경로/파라미터 구성', () => {
  it('getCurrentUser → GET /user', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce({ id: 1, username: 'u', name: 'U', avatar_url: null, web_url: 'x' }))
    const u = await getCurrentUser('gitlab.com', 't')
    expect(fetchMock.mock.calls[0][0]).toBe('https://gitlab.com/api/v4/user')
    expect(u.username).toBe('u')
  })

  it('getProjects → membership=true & order_by=last_activity_at', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce([]))
    await getProjects('gitlab.com', 't')
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/v4/projects?')
    expect(url).toContain('membership=true')
    expect(url).toContain('order_by=last_activity_at')
    expect(url).toContain('per_page=30')
    expect(url).toContain('page=1')
  })

  it('getProjects search 인코딩', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce([]))
    await getProjects('gitlab.com', 't', { search: 'my repo', page: 2, perPage: 50 })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('search=my+repo')
    expect(url).toContain('page=2')
    expect(url).toContain('per_page=50')
  })

  it('getMergeRequests projectId 있으면 /projects/:id/merge_requests', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce([]))
    await getMergeRequests('gitlab.com', 't', { projectId: 42, state: 'opened' })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/v4/projects/42/merge_requests?')
    expect(url).toContain('state=opened')
  })

  it('getMergeRequests raw 경로 projectId는 단일 인코딩(group/repo → group%2Frepo)', async () => {
    // 호출부는 raw 경로를 넘기고, 인코딩은 여기서 1회만 해야 한다.
    // (호출부에서 미리 인코딩하면 group%252Frepo가 되어 GitLab 404)
    fetchMock.mockResolvedValueOnce(mockFetchOnce([]))
    await getMergeRequests('gitlab.com', 't', { projectId: 'platform/web-client', state: 'all' })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/v4/projects/platform%2Fweb-client/merge_requests?')
    expect(url).not.toContain('platform%252Fweb-client')
  })

  it('getMergeRequests projectId 없으면 계정 전역 /merge_requests + scope', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce([]))
    await getMergeRequests('gitlab.com', 't', { scope: 'created_by_me' })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/v4/merge_requests?')
    expect(url).toContain('scope=created_by_me')
    expect(url).not.toContain('/projects/')
  })

  it('getTodos → GET /todos?state=pending', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce([]))
    await getTodos('gitlab.com', 't')
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/v4/todos?')
    expect(url).toContain('state=pending')
  })

  // ── GL7: MR 상세/변경/노트/파이프라인/승인 헬퍼 ──
  it('getMergeRequest → GET /projects/:id/merge_requests/:iid', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce({ id: 1, iid: 128 }))
    await getMergeRequest('gitlab.com', 't', 'platform%2Fweb-client', 128)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/v4/projects/platform%252Fweb-client/merge_requests/128')
  })

  it('getMergeRequestChanges → /changes 의 changes[] 추출', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce({ changes: [{ old_path: 'a', new_path: 'a', new_file: false, renamed_file: false, deleted_file: false }] }))
    const res = await getMergeRequestChanges('gitlab.com', 't', 7, 128)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/v4/projects/7/merge_requests/128/changes')
    expect(res).toHaveLength(1)
  })

  it('getMergeRequestChanges → changes 없으면 빈 배열', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce({}))
    const res = await getMergeRequestChanges('gitlab.com', 't', 7, 1)
    expect(res).toEqual([])
  })

  it('getMergeRequestNotes → /notes?per_page&sort=asc', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce([]))
    await getMergeRequestNotes('gitlab.com', 't', 7, 128)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/v4/projects/7/merge_requests/128/notes?')
    expect(url).toContain('sort=asc')
  })

  it('getMergeRequestPipelines → /pipelines', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce([]))
    await getMergeRequestPipelines('gitlab.com', 't', 7, 128)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/v4/projects/7/merge_requests/128/pipelines')
  })

  it('getMergeRequestApprovals → /approvals', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce({ approvals_required: 2, approvals_left: 1 }))
    const res = await getMergeRequestApprovals('gitlab.com', 't', 7, 128)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/v4/projects/7/merge_requests/128/approvals')
    expect(res.approvals_required).toBe(2)
  })
})
