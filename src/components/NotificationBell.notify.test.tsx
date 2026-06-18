import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { NotificationBell } from './NotificationBell'
import { installGitApiMock } from '../test/gitApiMock'
import type { GithubNotification } from '../utils/githubClient'

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

let appAPI: ReturnType<typeof installGitApiMock>['appAPI']

beforeEach(() => {
  getNotificationsMock.mockReset()
  localStorage.clear()
  vi.useFakeTimers()
  appAPI = installGitApiMock().appAPI
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

// fake timer 환경에서 마운트 직후 첫 load()의 비동기 fetch를 완료시킨다.
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}
// 폴링 한 틱(60s) 경과 + 후속 비동기 fetch 완료.
async function tick() {
  await act(async () => { vi.advanceTimersByTime(60_000); await Promise.resolve(); await Promise.resolve() })
}

describe('NotificationBell — 신규 감지 + 네이티브 알림 (기능 B)', () => {
  it('첫 폴링(시드)에는 알림을 띄우지 않는다', async () => {
    getNotificationsMock.mockResolvedValue([notif({ id: '1' }), notif({ id: '2' })])
    render(<NotificationBell githubToken="tok" onOpenUrl={vi.fn()} />)
    await flush()
    expect(appAPI.showNotification).not.toHaveBeenCalled()
    // 시드 시점에도 배지는 미읽음 개수로 반영된다.
    expect(appAPI.setBadgeCount).toHaveBeenCalledWith(2)
  })

  it('다음 폴링에서 신규 1개 등장 → 제목·repo 본문으로 showNotification', async () => {
    getNotificationsMock.mockResolvedValueOnce([notif({ id: '1' })])
    render(<NotificationBell githubToken="tok" onOpenUrl={vi.fn()} />)
    await flush()
    expect(appAPI.showNotification).not.toHaveBeenCalled()

    getNotificationsMock.mockResolvedValueOnce([
      notif({ id: '1' }),
      notif({ id: '2', subject: { title: 'New PR', type: 'PullRequest', url: 'https://api.github.com/repos/octo/repo/pulls/4' }, repository: { full_name: 'octo/repo' } }),
    ])
    await tick()

    expect(appAPI.showNotification).toHaveBeenCalledTimes(1)
    expect(appAPI.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'GitGrove', body: 'New PR · octo/repo' }),
    )
  })

  it('신규 2개 이상 → 요약 본문', async () => {
    getNotificationsMock.mockResolvedValueOnce([notif({ id: '1' })])
    render(<NotificationBell githubToken="tok" onOpenUrl={vi.fn()} />)
    await flush()

    getNotificationsMock.mockResolvedValueOnce([
      notif({ id: '1' }), notif({ id: '2' }), notif({ id: '3' }),
    ])
    await tick()

    expect(appAPI.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'GitGrove', body: '새 알림 2개' }),
    )
  })

  it('같은 항목이 반복돼도 재알림하지 않는다', async () => {
    getNotificationsMock.mockResolvedValueOnce([notif({ id: '1' })])
    render(<NotificationBell githubToken="tok" onOpenUrl={vi.fn()} />)
    await flush()

    getNotificationsMock.mockResolvedValueOnce([notif({ id: '1' }), notif({ id: '2' })])
    await tick() // id 2 신규 → 1회 알림

    getNotificationsMock.mockResolvedValueOnce([notif({ id: '1' }), notif({ id: '2' })])
    await tick() // 동일 → 추가 알림 없음

    expect(appAPI.showNotification).toHaveBeenCalledTimes(1)
  })

  it('미읽음 개수를 배지로 호출, 0이면 배지 제거', async () => {
    getNotificationsMock.mockResolvedValueOnce([notif({ id: '1', unread: true }), notif({ id: '2', unread: true })])
    render(<NotificationBell githubToken="tok" onOpenUrl={vi.fn()} />)
    await flush()
    expect(appAPI.setBadgeCount).toHaveBeenLastCalledWith(2)

    getNotificationsMock.mockResolvedValueOnce([])
    await tick()
    expect(appAPI.setBadgeCount).toHaveBeenLastCalledWith(0)
  })

  it('사운드 on → silent:false + sound, off → silent:true', async () => {
    localStorage.setItem('gitgrove:settings', JSON.stringify({ notificationSoundEnabled: true, notificationSound: 'Ping' }))
    getNotificationsMock.mockResolvedValueOnce([notif({ id: '1' })])
    render(<NotificationBell githubToken="tok" onOpenUrl={vi.fn()} />)
    await flush()

    getNotificationsMock.mockResolvedValueOnce([notif({ id: '1' }), notif({ id: '2' })])
    await tick()
    expect(appAPI.showNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ silent: false, sound: 'Ping' }),
    )

    // off로 바꾸면 무음으로 호출.
    localStorage.setItem('gitgrove:settings', JSON.stringify({ notificationSoundEnabled: false, notificationSound: 'Ping' }))
    getNotificationsMock.mockResolvedValueOnce([notif({ id: '1' }), notif({ id: '2' }), notif({ id: '3' })])
    await tick()
    expect(appAPI.showNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ silent: true }),
    )
    const calls = appAPI.showNotification.mock.calls
    const lastArg = calls[calls.length - 1][0]
    expect(lastArg.sound).toBeUndefined()
  })

  it('60초 주기로 getNotifications를 폴링한다', async () => {
    getNotificationsMock.mockResolvedValue([notif({ id: '1' })])
    render(<NotificationBell githubToken="tok" onOpenUrl={vi.fn()} />)
    await flush()
    const afterMount = getNotificationsMock.mock.calls.length // 마운트 1회
    await tick()
    await tick()
    expect(getNotificationsMock.mock.calls.length).toBe(afterMount + 2)
  })
})
