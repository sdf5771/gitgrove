import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { NotificationBell } from './NotificationBell'
import type { GithubNotification } from '../utils/githubClient'
import type { GitlabTodo } from '../utils/gitlabClient'
import type { GitlabConn } from '../utils/useGitlabConns'

const getNotificationsMock = vi.fn()
vi.mock('../utils/githubClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/githubClient')>('../utils/githubClient')
  return { ...actual, getNotifications: (...a: unknown[]) => getNotificationsMock(...a) }
})

const getTodosMock = vi.fn()
vi.mock('../utils/gitlabClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/gitlabClient')>('../utils/gitlabClient')
  return { ...actual, getTodos: (...a: unknown[]) => getTodosMock(...a) }
})

function notif(over: Partial<GithubNotification> & Pick<GithubNotification, 'id'>): GithubNotification {
  return {
    reason: 'review_requested',
    unread: true,
    updated_at: new Date().toISOString(),
    subject: { title: 'GH 리뷰', type: 'PullRequest', url: 'https://api.github.com/repos/octo/repo/pulls/3' },
    repository: { full_name: 'octo/repo' },
    ...over,
  }
}
function todo(over: Partial<GitlabTodo> & Pick<GitlabTodo, 'id'>): GitlabTodo {
  return {
    action_name: 'review_requested',
    state: 'pending',
    target_type: 'MergeRequest',
    target_url: 'https://gitlab.com/platform/api-gateway/-/merge_requests/307',
    body: 'GL 리뷰 본문',
    created_at: new Date().toISOString(),
    project: { id: 7, name: 'api-gateway', path_with_namespace: 'platform/api-gateway' },
    author: { id: 1, username: 'kim', name: '박하늘', avatar_url: null },
    target: { title: 'GL 리뷰' },
    ...over,
  }
}

const INST: GitlabConn[] = [{ host: 'https://gitlab.com', token: 'glt', username: 'kim' }]

describe('NotificationBell — GitLab Todos 통합 (GL10)', () => {
  beforeEach(() => { getNotificationsMock.mockReset(); getTodosMock.mockReset() })
  afterEach(cleanup)

  it('GitHub 알림 + GitLab Todos 안읽음 합산 배지', async () => {
    getNotificationsMock.mockResolvedValue([notif({ id: '1', unread: true })])
    getTodosMock.mockResolvedValue([todo({ id: 11 }), todo({ id: 12 })])

    render(<NotificationBell githubToken="tok" gitlabInstances={INST} onOpenUrl={vi.fn()} />)
    // GH 1 + GL 2(pending=unread) = 3
    await waitFor(() => expect(screen.getByText('3')).toBeTruthy())
  })

  it('패널에 두 프로바이더 항목과 필터 칩이 함께 표시', async () => {
    getNotificationsMock.mockResolvedValue([notif({ id: '1' })])
    getTodosMock.mockResolvedValue([todo({ id: 11 })])

    const { container } = render(<NotificationBell githubToken="tok" gitlabInstances={INST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getTodosMock).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('알림'))

    expect(screen.getByText('GH 리뷰')).toBeTruthy()
    expect(screen.getByText('GL 리뷰')).toBeTruthy()
    // 필터 칩(전체/GitHub/GitLab) — .tb-pf 3개
    const chips = container.querySelectorAll('.tb-prov-filter .tb-pf')
    expect(chips.length).toBe(3)
    expect(chips[0].textContent).toMatch(/전체/)
    expect(chips[1].textContent).toMatch(/GitHub/)
    expect(chips[2].textContent).toMatch(/GitLab/)
  })

  it('GitLab 필터 선택 → GitHub 항목 숨김', async () => {
    getNotificationsMock.mockResolvedValue([notif({ id: '1' })])
    getTodosMock.mockResolvedValue([todo({ id: 11 })])

    const { container } = render(<NotificationBell githubToken="tok" gitlabInstances={INST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getTodosMock).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('알림'))

    const glChip = container.querySelectorAll('.tb-prov-filter .tb-pf')[2]
    fireEvent.click(glChip)
    expect(screen.queryByText('GH 리뷰')).toBeNull()
    expect(screen.getByText('GL 리뷰')).toBeTruthy()
  })

  it('GitLab 미연결이면 getTodos 미호출 · GitHub만 표시', async () => {
    getNotificationsMock.mockResolvedValue([notif({ id: '1' })])

    const { container } = render(<NotificationBell githubToken="tok" gitlabInstances={[]} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('알림'))

    expect(screen.getByText('GH 리뷰')).toBeTruthy()
    expect(getTodosMock).not.toHaveBeenCalled()
    // 한쪽만 연결이면 필터 칩 숨김(.tb-pf 없음)
    expect(container.querySelectorAll('.tb-pf').length).toBe(0)
  })

  it('GitHub 미연결(GitLab만)이어도 Todos 표시 · 합산 배지', async () => {
    getTodosMock.mockResolvedValue([todo({ id: 11 }), todo({ id: 12 })])

    render(<NotificationBell githubToken="" gitlabInstances={INST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getTodosMock).toHaveBeenCalled())
    expect(getNotificationsMock).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy())
  })

  it('항목 클릭 → onOpenUrl(target_url)', async () => {
    getNotificationsMock.mockResolvedValue([])
    getTodosMock.mockResolvedValue([todo({ id: 11 })])
    const onOpenUrl = vi.fn()

    render(<NotificationBell githubToken="tok" gitlabInstances={INST} onOpenUrl={onOpenUrl} />)
    await waitFor(() => expect(getTodosMock).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('알림'))
    fireEvent.click(screen.getByText('GL 리뷰'))
    expect(onOpenUrl).toHaveBeenCalledWith('https://gitlab.com/platform/api-gateway/-/merge_requests/307')
  })
})
