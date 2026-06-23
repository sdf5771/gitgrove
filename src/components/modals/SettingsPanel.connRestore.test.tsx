import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel'
import { installGitApiMock } from '../../test/gitApiMock'
import { GithubApiError } from '../../utils/githubClient'
import { type GitlabUser } from '../../utils/gitlabClient'

// 버그3 — 설정창 마운트 시 저장된 토큰을 자동 검증해 기존 연결을 복원한다.
// githubClient.getUser/getRateLimit, gitlabClient.getCurrentUser만 mock.

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

describe('SettingsPanel — 마운트 시 기존 연결 복원 (버그3)', () => {
  it('저장된 GitHub 토큰이 있으면 자동 검증 후 연결됨 카드를 표시한다', async () => {
    localStorage.setItem('gitgrove:githubToken', 'ghp_saved')
    getUserMock.mockResolvedValue({ data: { login: 'seobi', avatar_url: '' }, headers: ghHeaders() })
    getRateLimitMock.mockResolvedValue({ data: { rate: { remaining: 4999, limit: 5000 } } })

    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="github" />)

    await waitFor(() => expect(screen.getByText('@seobi')).toBeTruthy())
    expect(screen.getByRole('button', { name: '연결 해제' })).toBeTruthy()
  })

  it('GitHub 토큰 검증 실패(401)면 idle 유지 + 토큰은 보존(자동 해제 금지)', async () => {
    localStorage.setItem('gitgrove:githubToken', 'ghp_stale')
    getUserMock.mockRejectedValue(new GithubApiError('unauthorized', 401, false))

    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="github" />)

    // 연결됨 카드는 뜨지 않는다.
    await waitFor(() => expect(screen.queryByRole('button', { name: '연결 해제' })).toBeNull())
    // 토큰은 입력에 유지(자동 해제하지 않음).
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/ghp_/) as HTMLInputElement
      expect(input.value).toBe('ghp_stale')
    })
  })

  it('저장된 GitLab 호스트가 있으면 자동 검증 후 연결됨으로 복원한다', async () => {
    appAPI.gitlabListHosts.mockResolvedValue(['https://gitlab.com'])
    appAPI.gitlabGetToken.mockResolvedValue('glpat-saved')
    getCurrentUserMock.mockResolvedValue(glUser())

    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="gitlab" />)

    await waitFor(() => expect(screen.getByText('@seo-kim')).toBeTruthy())
  })

  it('토큰이 전혀 없으면 자동 검증을 시도하지 않고 미연결 상태', async () => {
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="github" />)

    await waitFor(() => expect(screen.getByPlaceholderText(/ghp_/)).toBeTruthy())
    expect(getUserMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '연결 해제' })).toBeNull()
  })
})
