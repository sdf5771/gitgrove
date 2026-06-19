import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { NotificationBell } from './NotificationBell'
import { GithubApiError, type GithubNotification } from '../utils/githubClient'
import { GitlabApiError, type GitlabTodo } from '../utils/gitlabClient'
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
    target_url: 'https://gl.corp.local/platform/api/-/merge_requests/1',
    body: 'GL 리뷰 본문',
    created_at: new Date().toISOString(),
    project: { id: 7, name: 'api', path_with_namespace: 'platform/api' },
    author: { id: 1, username: 'kim', name: '박하늘', avatar_url: null },
    target: { title: 'GL 리뷰' },
    ...over,
  }
}

// 망 밖 self-host: fetch가 'Failed to fetch' TypeError로 실패.
const SELF_HOST: GitlabConn[] = [{ host: 'https://gl.corp.local', token: 'glt', username: 'kim' }]

describe('NotificationBell — self-host 도달 실패 격리 (fix/notif-selfhost-unreachable)', () => {
  beforeEach(() => { getNotificationsMock.mockReset(); getTodosMock.mockReset() })
  afterEach(cleanup)

  it('① GitHub 정상(0건) + self-host GitLab Failed to fetch → 패널 에러 아님 · 빈 상태 + 소프트 힌트', async () => {
    getNotificationsMock.mockResolvedValue([])
    getTodosMock.mockRejectedValue(new TypeError('Failed to fetch'))

    render(<NotificationBell githubToken="tok" gitlabInstances={SELF_HOST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getTodosMock).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('알림'))

    // 도달 실패 소프트 힌트(클릭이 트리거한 재조회 완료까지 대기).
    await waitFor(() => expect(screen.getByText('일부 인스턴스에 연결하지 못했어요')).toBeTruthy())
    // 전면 에러('불러오지 못했어요')가 아니라 빈 상태가 보여야 한다.
    expect(screen.queryByText(/불러오지 못했어요/)).toBeNull()
    expect(screen.getByText(/읽지 않은 알림이 없어요/)).toBeTruthy()
  })

  it('① GitHub 정상(일부 항목) + self-host GitLab Failed to fetch → GitHub 항목 표시 + 소프트 힌트', async () => {
    getNotificationsMock.mockResolvedValue([notif({ id: '1' })])
    getTodosMock.mockRejectedValue(new TypeError('Failed to fetch'))

    render(<NotificationBell githubToken="tok" gitlabInstances={SELF_HOST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getTodosMock).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('알림'))

    await waitFor(() => expect(screen.getByText('일부 인스턴스에 연결하지 못했어요')).toBeTruthy())
    expect(screen.queryByText(/불러오지 못했어요/)).toBeNull()
    expect(screen.getByText('GH 리뷰')).toBeTruthy()
  })

  it('② 모든 소스 실패(API 에러) → 전면 에러 노출', async () => {
    getNotificationsMock.mockRejectedValue(new GithubApiError('GitHub API error: 500', 500, false))
    getTodosMock.mockRejectedValue(new GitlabApiError('GitLab API error: 500', 500, false))

    render(<NotificationBell githubToken="tok" gitlabInstances={SELF_HOST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getTodosMock).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('알림'))

    await waitFor(() => expect(screen.getByText(/불러오지 못했어요/)).toBeTruthy())
    // 전면 에러 시 소프트 힌트는 숨김.
    expect(screen.queryByText('일부 인스턴스에 연결하지 못했어요')).toBeNull()
  })

  it('② 모든 소스가 도달 실패만(망 밖) → 전면 에러 아님 · 빈 상태 + 소프트 힌트', async () => {
    getNotificationsMock.mockRejectedValue(new TypeError('Failed to fetch'))
    getTodosMock.mockRejectedValue(new TypeError('Failed to fetch'))

    render(<NotificationBell githubToken="tok" gitlabInstances={SELF_HOST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getTodosMock).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('알림'))

    await waitFor(() => expect(screen.getByText('일부 인스턴스에 연결하지 못했어요')).toBeTruthy())
    expect(screen.queryByText(/불러오지 못했어요/)).toBeNull()
    expect(screen.getByText(/읽지 않은 알림이 없어요/)).toBeTruthy()
  })

  it('③ GitHub 403(권한 없음) 단독 → 권한 유도 분기 불변', async () => {
    getNotificationsMock.mockRejectedValue(new GithubApiError('GitHub API error: 403', 403, false))

    render(<NotificationBell githubToken="tok" onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('알림'))

    await waitFor(() =>
      expect(screen.getByText(/notifications 권한을 포함해 토큰을 다시 발급/)).toBeTruthy(),
    )
    expect(screen.queryByText('일부 인스턴스에 연결하지 못했어요')).toBeNull()
  })

  it('③ GitHub 403 + GitLab 정상 → GitLab 항목 표시 · 권한유도/에러 아님 · 힌트 없음', async () => {
    getNotificationsMock.mockRejectedValue(new GithubApiError('GitHub API error: 403', 403, false))
    getTodosMock.mockResolvedValue([todo({ id: 11 })])

    render(<NotificationBell githubToken="tok" gitlabInstances={SELF_HOST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getTodosMock).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('알림'))

    await waitFor(() => expect(screen.getByText('GL 리뷰')).toBeTruthy())
    expect(screen.queryByText(/불러오지 못했어요/)).toBeNull()
    expect(screen.queryByText(/notifications 권한을 포함해/)).toBeNull()
    expect(screen.queryByText('일부 인스턴스에 연결하지 못했어요')).toBeNull()
  })

  it('④ 둘 다 정상 → 회귀: 항목 표시 · 힌트 없음', async () => {
    getNotificationsMock.mockResolvedValue([notif({ id: '1' })])
    getTodosMock.mockResolvedValue([todo({ id: 11 })])

    render(<NotificationBell githubToken="tok" gitlabInstances={SELF_HOST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getTodosMock).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('알림'))

    await waitFor(() => expect(screen.getByText('GH 리뷰')).toBeTruthy())
    expect(screen.getByText('GL 리뷰')).toBeTruthy()
    expect(screen.queryByText('일부 인스턴스에 연결하지 못했어요')).toBeNull()
  })

  it('getTodos 호출 시 타임아웃 signal(AbortSignal)을 전달한다', async () => {
    getNotificationsMock.mockResolvedValue([])
    getTodosMock.mockResolvedValue([])

    render(<NotificationBell githubToken="tok" gitlabInstances={SELF_HOST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getTodosMock).toHaveBeenCalled())

    const opts = getTodosMock.mock.calls[0][2] as { signal?: AbortSignal }
    expect(opts.signal).toBeInstanceOf(AbortSignal)
  })
})
