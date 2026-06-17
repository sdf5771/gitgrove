import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
import { RepoManager, type RepoManagerProps } from './RepoManager'
import type { GitlabProjectSummary } from '../utils/gitlabClient'

// gitlabClient.getProjects를 모킹 (네트워크 없이 목록 주입)
const getProjectsMock = vi.fn()
vi.mock('../utils/gitlabClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/gitlabClient')>('../utils/gitlabClient')
  return {
    ...actual,
    getProjects: (...args: unknown[]) => getProjectsMock(...args),
  }
})

function glProject(
  over: Partial<GitlabProjectSummary> & Pick<GitlabProjectSummary, 'id' | 'name' | 'path_with_namespace'>,
): GitlabProjectSummary {
  const ns = over.path_with_namespace.split('/').slice(0, -1).join('/')
  return {
    namespace: { id: 1, name: ns, path: ns, full_path: ns },
    visibility: 'private',
    star_count: 0,
    last_activity_at: '2026-06-15T00:00:00Z',
    http_url_to_repo: `https://gitlab.com/${over.path_with_namespace}.git`,
    ssh_url_to_repo: `git@gitlab.com:${over.path_with_namespace}.git`,
    description: null,
    default_branch: 'main',
    ...over,
  }
}

function baseProps(over?: Partial<RepoManagerProps>): RepoManagerProps {
  return {
    repos: [],
    activeRepo: 0,
    githubConnected: false,
    githubToken: '',
    githubLogin: null,
    gitlabConnected: true,
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
    onOpenUrl: vi.fn(),
    onOpenGitlabSettings: vi.fn(),
    notify: vi.fn(),
    ...over,
  }
}

/** window.appAPI(gitlab*) + window.gitAPI(getRemotes) 셋업 */
function installApi(opts: {
  hosts?: string[]
  tokens?: Record<string, string | null>
  remotes?: Array<{ name: string; url: string }>
}) {
  const hosts = opts.hosts ?? ['https://gitlab.com']
  const tokens = opts.tokens ?? { 'https://gitlab.com': 'gl-tok' }
  Object.defineProperty(window, 'appAPI', {
    configurable: true,
    value: {
      gitlabListHosts: vi.fn(async () => hosts),
      gitlabGetToken: vi.fn(async (h: string) => tokens[h] ?? tokens[h.replace(/\/$/, '')] ?? null),
    },
  })
  Object.defineProperty(window, 'gitAPI', {
    configurable: true,
    value: { getRemotes: vi.fn(async () => opts.remotes ?? []) },
  })
}

function openGitlab() {
  fireEvent.click(screen.getByTitle('내 GitLab 프로젝트 둘러보기'))
}

describe('RepoManager — GitLab 프로젝트 브라우저 (GL5·GL6)', () => {
  beforeEach(() => {
    getProjectsMock.mockReset()
  })
  afterEach(cleanup)

  it('미연결이면 사이드바 GitLab 항목이 비활성(rm-disabled), 클릭 시 설정 유도', () => {
    installApi({ hosts: [], tokens: {} })
    const onOpenGitlabSettings = vi.fn()
    render(<RepoManager {...baseProps({ gitlabConnected: false, onOpenGitlabSettings })} />)
    const item = screen.getByTitle('GitLab 연결 필요 (설정 → GitLab 탭에서 인스턴스 등록)')
    expect(item.className).toContain('rm-disabled')
    fireEvent.click(item)
    expect(onOpenGitlabSettings).toHaveBeenCalled()
  })

  it('GitLab 클릭 → 활성 인스턴스의 projects를 fetch해 렌더한다', async () => {
    installApi({})
    getProjectsMock.mockResolvedValue([
      glProject({ id: 1, name: 'web-client', path_with_namespace: 'platform/web-client', star_count: 42 }),
      glProject({ id: 2, name: 'api-gateway', path_with_namespace: 'platform/api-gateway' }),
    ])
    render(<RepoManager {...baseProps()} />)
    openGitlab()

    await waitFor(() => expect(screen.getByText('platform/web-client')).toBeTruthy())
    expect(screen.getByText('platform/api-gateway')).toBeTruthy()
    expect(getProjectsMock).toHaveBeenCalledWith(
      'https://gitlab.com', 'gl-tok',
      expect.objectContaining({ membership: true, page: 1 }),
    )
  })

  it('인스턴스 전환 → 그 host의 토큰으로 다시 fetch한다 (다중 인스턴스)', async () => {
    installApi({
      hosts: ['https://gitlab.com', 'https://gitlab.mycompany.com'],
      tokens: { 'https://gitlab.com': 'saas-tok', 'https://gitlab.mycompany.com': 'self-tok' },
    })
    getProjectsMock.mockImplementation(async (host: string) =>
      host === 'https://gitlab.com'
        ? [glProject({ id: 1, name: 'web-client', path_with_namespace: 'platform/web-client' })]
        : [glProject({ id: 9, name: 'core-service', path_with_namespace: 'backend/core-service' })],
    )
    render(<RepoManager {...baseProps()} />)
    openGitlab()

    await waitFor(() => expect(screen.getByText('platform/web-client')).toBeTruthy())
    // Self-hosted 인스턴스로 전환
    fireEvent.click(screen.getByTitle('gitlab.mycompany.com (Self-hosted)'))
    await waitFor(() => expect(screen.getByText('backend/core-service')).toBeTruthy())
    expect(getProjectsMock).toHaveBeenCalledWith(
      'https://gitlab.mycompany.com', 'self-tok', expect.anything(),
    )
  })

  it('로컬 미보유 → Clone 버튼, 클릭 시 onClone(http_url_to_repo)', async () => {
    installApi({})
    getProjectsMock.mockResolvedValue([
      glProject({ id: 1, name: 'web-client', path_with_namespace: 'platform/web-client' }),
    ])
    const onClone = vi.fn(async () => true)
    render(<RepoManager {...baseProps({ onClone })} />)
    openGitlab()
    await waitFor(() => expect(screen.getByText('platform/web-client')).toBeTruthy())

    const action = document.querySelector('.rm-gh-action .rm-action-btn') as HTMLButtonElement
    expect(action.textContent).toBe('Clone')
    expect(action.className).toContain('clone')
    fireEvent.click(action)
    await waitFor(() =>
      expect(onClone).toHaveBeenCalledWith('https://gitlab.com/platform/web-client.git'),
    )
  })

  it('로컬 보유 → 열기 버튼, 클릭 시 onOpenPath(로컬 path)', async () => {
    // 열린 레포의 origin이 gitlab.com/platform/web-client → 매칭되어 "열기"
    installApi({
      remotes: [{ name: 'origin', url: 'https://gitlab.com/platform/web-client.git' }],
    })
    getProjectsMock.mockResolvedValue([
      glProject({ id: 1, name: 'web-client', path_with_namespace: 'platform/web-client' }),
    ])
    const onOpenPath = vi.fn()
    const props = baseProps({
      onOpenPath,
      repos: [{ name: 'web-client', path: '/local/web-client', branch: 'main', dirty: false } as never],
    })
    render(<RepoManager {...props} />)
    openGitlab()

    await waitFor(() => expect(screen.getByRole('button', { name: '열기' })).toBeTruthy())
    const openBtn = screen.getByRole('button', { name: '열기' })
    expect(openBtn.className).toContain('open')
    fireEvent.click(openBtn)
    expect(onOpenPath).toHaveBeenCalledWith('/local/web-client', 'web-client', 'main')
  })

  it('빈 결과면 그루 빈 상태를 표시한다', async () => {
    installApi({})
    getProjectsMock.mockResolvedValue([])
    render(<RepoManager {...baseProps()} />)
    openGitlab()
    await waitFor(() => expect(screen.getByText('프로젝트가 없어요')).toBeTruthy())
  })

  it('에러면 에러 상태 + 다시 시도 버튼을 표시한다', async () => {
    installApi({})
    getProjectsMock.mockRejectedValue(new Error('GitLab API error: 401'))
    render(<RepoManager {...baseProps()} />)
    openGitlab()
    await waitFor(() => expect(screen.getByText('불러오지 못했어요')).toBeTruthy())
    expect(screen.getByText(/401/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeTruthy()
  })

  it('검색 입력 시 search 파라미터로 재조회한다', async () => {
    installApi({})
    getProjectsMock.mockResolvedValue([
      glProject({ id: 1, name: 'web-client', path_with_namespace: 'platform/web-client' }),
    ])
    render(<RepoManager {...baseProps()} />)
    openGitlab()
    await waitFor(() => expect(screen.getByText('platform/web-client')).toBeTruthy())

    fireEvent.change(screen.getByPlaceholderText('GitLab 프로젝트 검색 (namespace/name)…'), {
      target: { value: 'gateway' },
    })
    await waitFor(() =>
      expect(getProjectsMock).toHaveBeenCalledWith(
        'https://gitlab.com', 'gl-tok',
        expect.objectContaining({ search: 'gateway' }),
      ),
    )
  })

  it('visibility 태그(private)가 priv 클래스로 렌더된다', async () => {
    installApi({})
    getProjectsMock.mockResolvedValue([
      glProject({ id: 1, name: 'web-client', path_with_namespace: 'platform/web-client', visibility: 'private' }),
    ])
    render(<RepoManager {...baseProps()} />)
    openGitlab()
    const row = await screen.findByText('platform/web-client')
    const tag = within(row.closest('.rm-gh-row') as HTMLElement).getByText('private')
    expect(tag.className).toContain('priv')
  })
})
