import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ghRequest,
  getUser,
  getPulls,
  getRateLimit,
  clearGithubCache,
  GithubApiError,
} from './githubClient'

// fetch mock 헬퍼: 주어진 응답을 돌려주는 Response-유사 객체를 만든다.
function mockResponse(
  body: unknown,
  init?: { status?: number; ok?: boolean; headers?: Record<string, string> },
) {
  const status = init?.status ?? 200
  const headers = new Headers(init?.headers ?? {})
  return {
    ok: init?.ok ?? (status >= 200 && status < 300),
    status,
    headers,
    json: async () => body,
  }
}

describe('githubClient', () => {
  beforeEach(() => {
    clearGithubCache()
    vi.restoreAllMocks()
  })
  afterEach(() => {
    clearGithubCache()
  })

  it('공통 헤더(Authorization: token, Accept)와 베이스 URL을 구성한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ login: 'octocat' }))
    vi.stubGlobal('fetch', fetchMock)

    await getUser('tok123')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.github.com/user')
    expect(opts.method).toBe('GET')
    expect(opts.headers.Authorization).toBe('token tok123')
    expect(opts.headers.Accept).toBe('application/vnd.github+json')
  })

  it('헬퍼들이 올바른 경로를 만든다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await getPulls('o', 'r', 't')
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/o/r/pulls?state=all&per_page=20',
    )

    await getRateLimit('t', { cache: false })
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.github.com/rate_limit')
  })

  it('GET 캐시 hit: 같은 키 재요청 시 fetch를 다시 호출하지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ login: 'octocat' }))
    vi.stubGlobal('fetch', fetchMock)

    const a = await getUser('tok')
    const b = await getUser('tok')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(b.data).toEqual(a.data)
  })

  it('캐시 bypass(cache:false): 매번 fetch를 호출한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ login: 'octocat' }))
    vi.stubGlobal('fetch', fetchMock)

    await getUser('tok', { cache: false })
    await getUser('tok', { cache: false })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('토큰이 다르면 캐시 키가 분리된다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ login: 'octocat' }))
    vi.stubGlobal('fetch', fetchMock)

    await getUser('tokA')
    await getUser('tokB')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('TTL 만료 후에는 다시 fetch한다', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ login: 'octocat' }))
    vi.stubGlobal('fetch', fetchMock)

    await getUser('tok', { ttl: 1000 })
    vi.advanceTimersByTime(1500)
    await getUser('tok', { ttl: 1000 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('429 + X-RateLimit-Remaining:0 → 친화적 rate limit 에러로 매핑', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(null, {
        status: 429,
        ok: false,
        headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '0' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getUser('tok', { cache: false })).rejects.toMatchObject({
      rateLimited: true,
      status: 429,
    })
    await expect(getUser('tok', { cache: false })).rejects.toThrow(/rate limit/)
  })

  it('403 + X-RateLimit-Remaining:0 → rate limit 에러', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(null, {
        status: 403,
        ok: false,
        headers: { 'X-RateLimit-Remaining': '0' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getUser('tok', { cache: false })).rejects.toMatchObject({ rateLimited: true })
  })

  it('일반 HTTP 에러(401)는 status를 보존한 GithubApiError로 throw', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(null, { status: 401, ok: false }))
    vi.stubGlobal('fetch', fetchMock)

    const err = await getUser('tok', { cache: false }).catch(e => e)
    expect(err).toBeInstanceOf(GithubApiError)
    expect(err.status).toBe(401)
    expect(err.rateLimited).toBe(false)
    expect(err.message).toBe('GitHub API error: 401')
  })

  it('에러 응답은 캐시하지 않는다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(null, { status: 500, ok: false }))
      .mockResolvedValueOnce(mockResponse({ login: 'octocat' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getUser('tok')).rejects.toThrow()
    const ok = await getUser('tok')
    expect(ok.data).toEqual({ login: 'octocat' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('응답 헤더(X-OAuth-Scopes / X-RateLimit-*)를 파싱해 노출한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        { login: 'octocat' },
        {
          headers: {
            'X-OAuth-Scopes': 'repo, gist, read:org',
            'X-RateLimit-Remaining': '57',
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Reset': '1700000000',
          },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await ghRequest<{ login: string }>('/user', { token: 'tok' })
    expect(res.scopes).toEqual(['repo', 'gist', 'read:org'])
    expect(res.rateLimit).toEqual({ remaining: 57, limit: 60, reset: 1700000000 })
    expect(res.headers.get('X-OAuth-Scopes')).toBe('repo, gist, read:org')
  })

  it('rate-limit 헤더가 없으면 rateLimit는 null, scopes는 빈 배열', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ login: 'octocat' }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await getUser('tok')
    expect(res.rateLimit).toBeNull()
    expect(res.scopes).toEqual([])
  })
})
