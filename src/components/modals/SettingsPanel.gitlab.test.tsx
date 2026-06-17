import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel'
import { installGitApiMock } from '../../test/gitApiMock'
import { GitlabApiError, type GitlabUser } from '../../utils/gitlabClient'

// gitlabClient.getCurrentUser만 mock(나머지 export는 실제 사용 — GitlabApiError 등).
const getCurrentUserMock = vi.fn()
vi.mock('../../utils/gitlabClient', async () => {
  const actual = await vi.importActual<typeof import('../../utils/gitlabClient')>('../../utils/gitlabClient')
  return {
    ...actual,
    getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  }
})

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
  getCurrentUserMock.mockReset()
  localStorage.clear()
  appAPI = installGitApiMock().appAPI
})
afterEach(cleanup)

function openGitlabTab() {
  render(<SettingsPanel onClose={vi.fn()} repoPath={null} />)
  fireEvent.click(screen.getByRole('button', { name: 'GitLab' }))
}

describe('SettingsPanel — GitLab 탭 (GL4)', () => {
  it('GitLab.com 기본 선택 시 Host URL 입력이 숨겨지고, Self-hosted 전환 시 노출된다', () => {
    openGitlabTab()
    // com 기본: Host URL 입력 없음
    expect(screen.queryByPlaceholderText(/gitlab.mycompany.com/)).toBeNull()
    // self 전환
    fireEvent.click(screen.getByRole('button', { name: /Self-hosted/ }))
    expect(screen.getByPlaceholderText(/gitlab.mycompany.com/)).toBeTruthy()
    // 다시 com 전환 시 숨김
    fireEvent.click(screen.getByRole('button', { name: /GitLab\.com/ }))
    expect(screen.queryByPlaceholderText(/gitlab.mycompany.com/)).toBeNull()
  })

  it('검증 성공 시 연결됨 카드 표시 + host-키로 토큰 저장', async () => {
    getCurrentUserMock.mockResolvedValue(glUser())
    openGitlabTab()

    fireEvent.change(screen.getByPlaceholderText(/glpat-/), { target: { value: 'glpat-abc' } })
    fireEvent.click(screen.getByRole('button', { name: '검증' }))

    await waitFor(() => expect(screen.getByText('@seo-kim')).toBeTruthy())
    expect(screen.getByText('연결됨 · GitLab 계정 확인 완료')).toBeTruthy()
    // host-키 저장 호출(GitLab.com → https://gitlab.com)
    expect(appAPI.gitlabSetToken).toHaveBeenCalledWith('https://gitlab.com', 'glpat-abc')
    // 연결 해제 버튼 노출
    expect(screen.getByRole('button', { name: '연결 해제' })).toBeTruthy()
  })

  it('검증 실패(401) 시 에러 메시지를 표시하고 토큰을 저장하지 않는다', async () => {
    getCurrentUserMock.mockRejectedValue(new GitlabApiError('GitLab API error: 401', 401, false))
    openGitlabTab()

    fireEvent.change(screen.getByPlaceholderText(/glpat-/), { target: { value: 'glpat-bad' } })
    fireEvent.click(screen.getByRole('button', { name: '검증' }))

    await waitFor(() => expect(screen.getByText(/401/)).toBeTruthy())
    expect(appAPI.gitlabSetToken).not.toHaveBeenCalled()
    expect(screen.queryByText('@seo-kim')).toBeNull()
  })

  it('연결 해제 시 host-키 토큰을 제거하고 idle 상태로 돌아간다', async () => {
    getCurrentUserMock.mockResolvedValue(glUser())
    openGitlabTab()

    fireEvent.change(screen.getByPlaceholderText(/glpat-/), { target: { value: 'glpat-abc' } })
    fireEvent.click(screen.getByRole('button', { name: '검증' }))
    await waitFor(() => expect(screen.getByText('@seo-kim')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: '연결 해제' }))
    await waitFor(() => expect(appAPI.gitlabRemoveToken).toHaveBeenCalledWith('https://gitlab.com'))
    expect(screen.queryByText('@seo-kim')).toBeNull()
    expect(screen.getByText(/아직 연결되지 않았어요/)).toBeTruthy()
  })

  it('Self-hosted 검증 시 정규화된 host로 getCurrentUser·저장을 호출한다', async () => {
    getCurrentUserMock.mockResolvedValue(glUser({ username: 'corp-user', web_url: 'https://gitlab.corp.com/corp-user' }))
    openGitlabTab()

    fireEvent.click(screen.getByRole('button', { name: /Self-hosted/ }))
    fireEvent.change(screen.getByPlaceholderText(/gitlab.mycompany.com/), { target: { value: 'GitLab.Corp.com/' } })
    fireEvent.change(screen.getByPlaceholderText(/glpat-/), { target: { value: 'glpat-corp' } })
    fireEvent.click(screen.getByRole('button', { name: '검증' }))

    await waitFor(() => expect(screen.getByText('@corp-user')).toBeTruthy())
    expect(getCurrentUserMock).toHaveBeenCalledWith('https://gitlab.corp.com', 'glpat-corp', { cache: false })
    expect(appAPI.gitlabSetToken).toHaveBeenCalledWith('https://gitlab.corp.com', 'glpat-corp')
  })

  it('마운트 시 기존 연결 host가 있으면 연결됨 상태로 복원한다', async () => {
    appAPI.gitlabListHosts.mockImplementation(async () => ['https://gitlab.com'])
    appAPI.gitlabGetToken.mockImplementation(async () => 'glpat-saved')
    getCurrentUserMock.mockResolvedValue(glUser())

    render(<SettingsPanel onClose={vi.fn()} repoPath={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'GitLab' }))

    await waitFor(() => expect(screen.getByText('@seo-kim')).toBeTruthy())
    expect(appAPI.gitlabGetToken).toHaveBeenCalledWith('https://gitlab.com')
  })

  it('토큰 발급 링크는 host-상대 딥링크를 외부로 연다', () => {
    openGitlabTab()
    fireEvent.click(screen.getByRole('button', { name: /토큰 발급/ }))
    expect(appAPI.openReleaseUrl).toHaveBeenCalledWith(
      'https://gitlab.com/-/user_settings/personal_access_tokens?scopes=api,read_user',
    )
  })
})
