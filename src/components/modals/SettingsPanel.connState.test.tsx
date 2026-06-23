import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel'
import { installGitApiMock } from '../../test/gitApiMock'
import { GithubApiError } from '../../utils/githubClient'
import { GitlabApiError, type GitlabUser } from '../../utils/gitlabClient'

// 버그2 — 마운트 자동 검증 결과를 미연결/연결됨/지금 닿지 않음/연결 끊김으로 구분.
// 도달 실패(TypeError/AbortError)는 토큰을 신뢰해 연결 유지, 401/403은 끊김.

const getUserMock = vi.fn()
const getRateLimitMock = vi.fn()
vi.mock('../../utils/githubClient', async () => {
  const actual = await vi.importActual<typeof import('../../utils/githubClient')>('../../utils/githubClient')
  return {
    ...actual,
    getUser: (...args: unknown[]) => getUserMock(...args),
    getRateLimit: (...args: unknown[]) => getRateLimitMock(...args),
  }
})

const getCurrentUserMock = vi.fn()
vi.mock('../../utils/gitlabClient', async () => {
  const actual = await vi.importActual<typeof import('../../utils/gitlabClient')>('../../utils/gitlabClient')
  return {
    ...actual,
    getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  }
})

function ghHeaders(scopes = 'repo, read:user'): Headers {
  return new Headers({ 'X-OAuth-Scopes': scopes })
}

function glUser(over: Partial<GitlabUser> = {}): GitlabUser {
  return {
    id: 1,
    username: 'seo-kim',
    name: 'Seo Kim',
    avatar_url: null,
    web_url: 'https://gitlab.com/seo-kim',
    ...over,
  }
}

let appAPI: ReturnType<typeof installGitApiMock>['appAPI']

beforeEach(() => {
  getUserMock.mockReset()
  getRateLimitMock.mockReset()
  getCurrentUserMock.mockReset()
  localStorage.clear()
  appAPI = installGitApiMock().appAPI
})
afterEach(cleanup)

describe('SettingsPanel — 연결 3상태 구분 (버그2)', () => {
  it('GitHub: 토큰 있음 + verify 도달 실패(TypeError)면 "지금 닿지 않아요" + 토큰 보존', async () => {
    localStorage.setItem('gitgrove:githubToken', 'ghp_offline')
    getUserMock.mockRejectedValue(new TypeError('Failed to fetch'))

    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="github" />)

    await waitFor(() => expect(screen.getByText(/지금 닿지 않아요/)).toBeTruthy())
    // GitHub 카드가 "미연결"로 강등되지 않는다(GitLab은 토큰 없어 미연결일 수 있음).
    const ghCard = screen.getByText(/지금 닿지 않아요/).closest('.set2-conn') as HTMLElement
    expect(within(ghCard).queryByText('미연결')).toBeNull()
    expect(within(ghCard).getByText(/GitHub/)).toBeTruthy()
    // 토큰은 보존(자동 해제 금지).
    const input = screen.getByPlaceholderText(/ghp_/) as HTMLInputElement
    expect(input.value).toBe('ghp_offline')
  })

  it('GitHub: 토큰 있음 + verify 401이면 "연결이 끊겼어요" + 토큰 보존', async () => {
    localStorage.setItem('gitgrove:githubToken', 'ghp_stale')
    getUserMock.mockRejectedValue(new GithubApiError('unauthorized', 401, false))

    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="github" />)

    await waitFor(() => expect(screen.getByText(/연결이 끊겼어요/)).toBeTruthy())
    const input = screen.getByPlaceholderText(/ghp_/) as HTMLInputElement
    expect(input.value).toBe('ghp_stale')
  })

  it('GitHub: verify 성공이면 연결됨', async () => {
    localStorage.setItem('gitgrove:githubToken', 'ghp_ok')
    getUserMock.mockResolvedValue({ data: { login: 'seobi', avatar_url: '' }, headers: ghHeaders() })
    getRateLimitMock.mockResolvedValue({ data: { rate: { remaining: 4999, limit: 5000 } } })

    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="github" />)

    await waitFor(() => expect(screen.getByText('@seobi')).toBeTruthy())
    expect(screen.getByRole('button', { name: '연결 해제' })).toBeTruthy()
  })

  it('GitHub: 토큰 없으면 미연결', async () => {
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="github" />)

    // GitHub·GitLab 둘 다 토큰 없어 미연결 — 두 카드 모두 "미연결".
    await waitFor(() => expect(screen.getAllByText('미연결').length).toBe(2))
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it('GitLab: self-host 사내망 밖(AbortError 도달 실패)이면 "지금 닿지 않아요" + 토큰 보존', async () => {
    appAPI.gitlabListHosts.mockResolvedValue(['https://gitlab.internal.corp'])
    appAPI.gitlabGetToken.mockResolvedValue('glpat-saved')
    getCurrentUserMock.mockRejectedValue(new DOMException('timeout', 'AbortError'))

    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="gitlab" />)

    await waitFor(() => expect(screen.getByText(/지금 닿지 않아요/)).toBeTruthy())
    // 토큰 해제 호출이 일어나지 않는다(보존).
    expect(appAPI.gitlabRemoveToken).not.toHaveBeenCalled()
  })

  it('GitLab: verify 403이면 "연결이 끊겼어요"', async () => {
    appAPI.gitlabListHosts.mockResolvedValue(['https://gitlab.com'])
    appAPI.gitlabGetToken.mockResolvedValue('glpat-stale')
    getCurrentUserMock.mockRejectedValue(new GitlabApiError('forbidden', 403, false))

    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="gitlab" />)

    await waitFor(() => expect(screen.getByText(/연결이 끊겼어요/)).toBeTruthy())
  })

  it('GitLab: verify 성공이면 연결됨', async () => {
    appAPI.gitlabListHosts.mockResolvedValue(['https://gitlab.com'])
    appAPI.gitlabGetToken.mockResolvedValue('glpat-ok')
    getCurrentUserMock.mockResolvedValue(glUser())

    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="gitlab" />)

    await waitFor(() => expect(screen.getByText('@seo-kim')).toBeTruthy())
  })
})
