import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { NotificationBell } from './NotificationBell'
import { GithubApiError, type GithubNotification } from '../utils/githubClient'

const getNotificationsMock = vi.fn()
vi.mock('../utils/githubClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/githubClient')>('../utils/githubClient')
  return {
    ...actual,
    getNotifications: (...args: unknown[]) => getNotificationsMock(...args),
  }
})

function notif(over: Partial<GithubNotification> & Pick<GithubNotification, 'id'>): GithubNotification {
  return {
    reason: 'review_requested',
    unread: true,
    updated_at: new Date().toISOString(),
    subject: { title: 'Review me', type: 'PullRequest', url: 'https://api.github.com/repos/octo/repo/pulls/3' },
    repository: { full_name: 'octo/repo' },
    ...over,
  }
}

describe('NotificationBell (B20)', () => {
  beforeEach(() => { getNotificationsMock.mockReset() })
  afterEach(cleanup)

  it('토큰 없으면 렌더하지 않는다', () => {
    const { container } = render(<NotificationBell githubToken="" onOpenUrl={vi.fn()} />)
    expect(container.querySelector('.tb-bell')).toBeNull()
    expect(getNotificationsMock).not.toHaveBeenCalled()
  })

  it('마운트 시 unread 개수만큼 배지를 표시', async () => {
    getNotificationsMock.mockResolvedValue([
      notif({ id: '1', unread: true }),
      notif({ id: '2', unread: true }),
      notif({ id: '3', unread: false }),
    ])
    render(<NotificationBell githubToken="tok" onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy())
  })

  it('벨 클릭 → 패널에 알림 목록(레포 + 제목 + reason)', async () => {
    getNotificationsMock.mockResolvedValue([notif({ id: '1' })])
    render(<NotificationBell githubToken="tok" onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled())

    fireEvent.click(screen.getByLabelText('알림'))
    expect(screen.getByText('Review me')).toBeTruthy()
    expect(screen.getByText('octo/repo')).toBeTruthy()
    expect(screen.getByText('리뷰 요청')).toBeTruthy()
  })

  it('항목 클릭 → API URL을 html_url로 변환해 onOpenUrl 호출', async () => {
    getNotificationsMock.mockResolvedValue([notif({ id: '1' })])
    const onOpenUrl = vi.fn()
    render(<NotificationBell githubToken="tok" onOpenUrl={onOpenUrl} />)
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled())

    fireEvent.click(screen.getByLabelText('알림'))
    fireEvent.click(screen.getByText('Review me'))
    expect(onOpenUrl).toHaveBeenCalledWith('https://github.com/octo/repo/pull/3')
  })

  it('403(notifications 권한 없음) → 토큰 재발급 안내 메시지', async () => {
    getNotificationsMock.mockRejectedValue(new GithubApiError('GitHub API error: 403', 403, false))
    render(<NotificationBell githubToken="tok" onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled())

    fireEvent.click(screen.getByLabelText('알림'))
    expect(screen.getByText(/notifications 권한을 포함해 토큰을 다시 발급/)).toBeTruthy()
  })

  it('알림 없으면 빈 상태 메시지', async () => {
    getNotificationsMock.mockResolvedValue([])
    render(<NotificationBell githubToken="tok" onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getNotificationsMock).toHaveBeenCalled())

    fireEvent.click(screen.getByLabelText('알림'))
    expect(screen.getByText(/읽지 않은 알림이 없습니다/)).toBeTruthy()
  })
})
