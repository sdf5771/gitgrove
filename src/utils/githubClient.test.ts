import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ghRequest,
  getUser,
  getPulls,
  getRateLimit,
  getUserRepos,
  getSearchIssues,
  getNotifications,
  parseRepoFromUrl,
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

  describe('getUserRepos (B18)', () => {
    function repo(id: number, name: string) {
      return { id, name, full_name: `octo/${name}`, owner: { login: 'octo' } }
    }

    it('올바른 쿼리(affiliation/sort/per_page/page)로 /user/repos 호출', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse([repo(1, 'a')]))
      vi.stubGlobal('fetch', fetchMock)

      await getUserRepos('tok')
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('/user/repos?')
      expect(url).toContain('affiliation=owner,collaborator,organization_member')
      expect(url).toContain('sort=updated')
      expect(url).toContain('per_page=100')
      expect(url).toContain('page=1')
    })

    it('Link 헤더 rel="next"를 따라 페이지네이션하고 합쳐서 반환', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => repo(i + 1, `r${i + 1}`))
      const page2 = [repo(101, 'r101'), repo(102, 'r102')]
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          mockResponse(page1, {
            headers: { Link: '<https://api.github.com/user/repos?page=2>; rel="next"' },
          }),
        )
        .mockResolvedValueOnce(mockResponse(page2))
      vi.stubGlobal('fetch', fetchMock)

      const all = await getUserRepos('tok', { cache: false })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(all).toHaveLength(102)
      expect(all[101].name).toBe('r102')
    })

    it('rel="next"가 없으면 한 페이지에서 멈춘다', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse([repo(1, 'only')]))
      vi.stubGlobal('fetch', fetchMock)

      const all = await getUserRepos('tok', { cache: false })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(all).toHaveLength(1)
    })

    it('maxPages 상한에서 캡한다', async () => {
      const full = Array.from({ length: 100 }, (_, i) => repo(i + 1, `r${i + 1}`))
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse(full, {
          headers: { Link: '<https://api.github.com/user/repos?page=99>; rel="next"' },
        }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await getUserRepos('tok', { cache: false, maxPages: 2, perPage: 100 })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('parseRepoFromUrl (B19)', () => {
    it('repository_url에서 owner/repo/fullName을 파싱한다', () => {
      expect(parseRepoFromUrl('https://api.github.com/repos/octo/hello-world')).toEqual({
        owner: 'octo',
        repo: 'hello-world',
        fullName: 'octo/hello-world',
      })
    })

    it('끝 슬래시도 허용한다', () => {
      expect(parseRepoFromUrl('https://api.github.com/repos/a/b/')?.fullName).toBe('a/b')
    })

    it('형식이 안 맞으면 null', () => {
      expect(parseRepoFromUrl('https://api.github.com/user')).toBeNull()
      expect(parseRepoFromUrl('')).toBeNull()
    })
  })

  describe('getSearchIssues (B19)', () => {
    it('q를 인코딩하고 per_page/sort를 붙여 /search/issues를 호출, items를 반환', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({ total_count: 1, incomplete_results: false, items: [{ id: 1, number: 7 }] }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const res = await getSearchIssues('tok', 'is:open is:pr author:octo', { cache: false })
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('/search/issues?q=')
      expect(url).toContain(encodeURIComponent('is:open is:pr author:octo'))
      expect(url).toContain('per_page=50')
      expect(url).toContain('sort=updated')
      expect(res.items).toHaveLength(1)
      expect(res.items[0].number).toBe(7)
    })

    it('짧은 TTL로 캐시를 허용한다(같은 쿼리 재요청은 fetch 1회)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({ total_count: 0, incomplete_results: false, items: [] }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await getSearchIssues('tok', 'q1')
      await getSearchIssues('tok', 'q1')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('getNotifications (B20)', () => {
    it('/notifications?per_page=30 을 호출하고 배열을 반환', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse([
          { id: '1', reason: 'review_requested', unread: true, subject: { title: 'PR', type: 'PullRequest', url: null }, repository: { full_name: 'o/r' } },
        ]),
      )
      vi.stubGlobal('fetch', fetchMock)

      const list = await getNotifications('tok', { cache: false })
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/notifications?per_page=30')
      expect(list).toHaveLength(1)
      expect(list[0].reason).toBe('review_requested')
    })
  })
})
