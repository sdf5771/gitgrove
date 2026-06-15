import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { RepoManager, type RepoManagerProps } from './RepoManager'
import type { GithubRepoSummary } from '../utils/githubClient'

// githubClient.getUserRepos를 모킹 (네트워크 없이 목록 주입)
const getUserReposMock = vi.fn()
vi.mock('../utils/githubClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/githubClient')>('../utils/githubClient')
  return {
    ...actual,
    getUserRepos: (...args: unknown[]) => getUserReposMock(...args),
  }
})

function ghRepo(over: Partial<GithubRepoSummary> & Pick<GithubRepoSummary, 'id' | 'name' | 'full_name'>): GithubRepoSummary {
  return {
    owner: { login: over.full_name.split('/')[0] },
    private: false,
    description: null,
    default_branch: 'main',
    clone_url: `https://github.com/${over.full_name}.git`,
    ssh_url: `git@github.com:${over.full_name}.git`,
    html_url: `https://github.com/${over.full_name}`,
    updated_at: '2026-06-01T00:00:00Z',
    language: null,
    stargazers_count: 0,
    archived: false,
    fork: false,
    ...over,
  }
}

function baseProps(over?: Partial<RepoManagerProps>): RepoManagerProps {
  return {
    repos: [],
    activeRepo: 0,
    githubConnected: true,
    githubToken: 'tok',
    recents: [],
    favorites: [],
    workspaces: [],
    onToggleFavorite: vi.fn(),
    onOpenPath: vi.fn(),
    onRemoveRepo: vi.fn(),
    onCreateWorkspace: vi.fn(() => 'ws1'),
    onRenameWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onToggleRepoInWorkspace: vi.fn(),
    onClone: vi.fn(async () => true),
    onBrowse: vi.fn(),
    notify: vi.fn(),
    ...over,
  }
}

describe('RepoManager — GitHub 레포 브라우저 (B18)', () => {
  beforeEach(() => {
    getUserReposMock.mockReset()
    // getRemotes: 기본은 origin 없음(빈 배열)
    Object.defineProperty(window, 'gitAPI', {
      configurable: true,
      value: { getRemotes: vi.fn(async () => []) },
    })
  })
  afterEach(cleanup)

  it('미연결이면 사이드바 GitHub 항목이 비활성(rm-disabled)', () => {
    render(<RepoManager {...baseProps({ githubConnected: false })} />)
    const item = screen.getByTitle('GitHub 연결 필요 (설정에서 토큰 등록)')
    expect(item.className).toContain('rm-disabled')
  })

  it('연결 시 GitHub 클릭 → 목록을 fetch해 렌더하고 검색이 동작한다', async () => {
    getUserReposMock.mockResolvedValue([
      ghRepo({ id: 1, name: 'alpha', full_name: 'octo/alpha' }),
      ghRepo({ id: 2, name: 'beta', full_name: 'octo/beta' }),
    ])
    render(<RepoManager {...baseProps()} />)

    fireEvent.click(screen.getByTitle('내 GitHub 레포 둘러보기'))

    await waitFor(() => expect(screen.getByText('alpha')).toBeTruthy())
    expect(screen.getByText('beta')).toBeTruthy()
    expect(getUserReposMock).toHaveBeenCalled()

    // 검색 필터
    fireEvent.change(screen.getByPlaceholderText('GitHub 레포 검색 (이름 / owner/name)…'), {
      target: { value: 'alph' },
    })
    expect(screen.getByText('alpha')).toBeTruthy()
    expect(screen.queryByText('beta')).toBeNull()
  })

  it('로컬에 없으면 Clone 버튼, 클릭 시 onClone(clone_url) 호출', async () => {
    getUserReposMock.mockResolvedValue([ghRepo({ id: 1, name: 'alpha', full_name: 'octo/alpha' })])
    const onClone = vi.fn(async () => true)
    render(<RepoManager {...baseProps({ onClone })} />)

    fireEvent.click(screen.getByTitle('내 GitHub 레포 둘러보기'))
    await waitFor(() => expect(screen.getByText('alpha')).toBeTruthy())

    // 행의 Clone 버튼(.rm-gh-action 내부). 상단 액션바 Clone과 구분.
    const rowAction = document.querySelector('.rm-gh-action .rm-action-btn') as HTMLButtonElement
    expect(rowAction.textContent).toBe('Clone')
    fireEvent.click(rowAction)
    await waitFor(() =>
      expect(onClone).toHaveBeenCalledWith('https://github.com/octo/alpha.git'),
    )
  })

  it('로컬에 이미 있으면 열기 버튼, 클릭 시 onOpenPath(로컬 path) 호출', async () => {
    // 열린 레포의 origin이 octo/alpha → 매칭되어 "열기"가 떠야 함
    Object.defineProperty(window, 'gitAPI', {
      configurable: true,
      value: {
        getRemotes: vi.fn(async () => [
          { name: 'origin', url: 'https://github.com/octo/alpha.git' },
        ]),
      },
    })
    getUserReposMock.mockResolvedValue([ghRepo({ id: 1, name: 'alpha', full_name: 'octo/alpha' })])
    const onOpenPath = vi.fn()
    const props = baseProps({
      onOpenPath,
      repos: [{ name: 'alpha', path: '/local/alpha', branch: 'main', dirty: false } as never],
    })
    render(<RepoManager {...props} />)

    fireEvent.click(screen.getByTitle('내 GitHub 레포 둘러보기'))
    await waitFor(() => expect(screen.getByRole('button', { name: '열기' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: '열기' }))
    expect(onOpenPath).toHaveBeenCalledWith('/local/alpha', 'alpha', 'main')
  })

  it('에러 시 에러 메시지를 표시', async () => {
    getUserReposMock.mockRejectedValue(new Error('GitHub API error: 401'))
    render(<RepoManager {...baseProps()} />)
    fireEvent.click(screen.getByTitle('내 GitHub 레포 둘러보기'))
    await waitFor(() => expect(screen.getByText('GitHub API error: 401')).toBeTruthy())
  })
})
