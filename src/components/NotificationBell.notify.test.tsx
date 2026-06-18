import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { NotificationBell } from './NotificationBell'
import { installGitApiMock } from '../test/gitApiMock'
import { GithubApiError, type GithubNotification } from '../utils/githubClient'
import type { GitlabTodo } from '../utils/gitlabClient'
import type { GitlabConn } from '../utils/useGitlabConns'

const getNotificationsMock = vi.fn()
vi.mock('../utils/githubClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/githubClient')>('../utils/githubClient')
  return {
    ...actual,
    getNotifications: (...args: unknown[]) => getNotificationsMock(...args),
  }
})

const getTodosMock = vi.fn()
vi.mock('../utils/gitlabClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/gitlabClient')>('../utils/gitlabClient')
  return {
    ...actual,
    getTodos: (...args: unknown[]) => getTodosMock(...args),
  }
})

function todo(over: Partial<GitlabTodo> & Pick<GitlabTodo, 'id'>): GitlabTodo {
  return {
    action_name: 'review_requested',
    state: 'pending',
    target_type: 'MergeRequest',
    target_url: 'https://gitlab.example.com/g/p/-/merge_requests/1',
    body: 'GitLab todo',
    created_at: new Date().toISOString(),
    project: { id: 1, name: 'p', path_with_namespace: 'g/p' },
    target: { title: 'Review my MR' },
    ...over,
  }
}

const GL_CONN: GitlabConn = { host: 'https://gitlab.example.com', token: 'gltok', username: 'me' }

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
  getTodosMock.mockReset()
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

  // Minor #1 회귀: 부모 리렌더로 gitlabInstances 배열 참조가 매번 바뀌어도(load 재생성)
  // 폴링 interval이 teardown/재등록되지 않아 60초 주기가 정확히 유지되어야 한다.
  it('부모 리렌더(새 gitlabInstances 참조)에도 60초 주기를 유지한다', async () => {
    getNotificationsMock.mockResolvedValue([notif({ id: '1' })])
    getTodosMock.mockResolvedValue([])
    // 매 렌더 새 배열 참조를 넘기는 부모를 흉내 — 같은 host지만 참조가 달라 load가 재생성됨.
    const { rerender } = render(
      <NotificationBell githubToken="tok" gitlabInstances={[{ ...GL_CONN }]} onOpenUrl={vi.fn()} />,
    )
    await flush()
    const afterMount = getNotificationsMock.mock.calls.length

    // interval이 30s만 진행된 시점에 부모가 리렌더(새 배열 참조)를 일으킨다.
    await act(async () => { vi.advanceTimersByTime(30_000) })
    rerender(<NotificationBell githubToken="tok" gitlabInstances={[{ ...GL_CONN }]} onOpenUrl={vi.fn()} />)
    await act(async () => { await Promise.resolve() })
    // 리렌더로 interval이 재생성됐다면 여기서 카운트다운이 리셋돼 폴링이 안 일어난다.
    await act(async () => { vi.advanceTimersByTime(30_000); await Promise.resolve(); await Promise.resolve() })

    // 마운트로부터 정확히 60s 경과 → 폴링 1회 발생해야 한다(리셋됐다면 0회).
    expect(getNotificationsMock.mock.calls.length).toBe(afterMount + 1)
  })

  // Minor #2 회귀: GitLab 단독 + GitHub 403 — 시드 후 신규 GitLab 알림이 네이티브 알림을 띄운다.
  it('GitLab 단독 + GitHub 403: 시드 후 신규 GitLab 알림이 showNotification을 트리거한다', async () => {
    // GitHub는 줄곧 403(notifications scope 없음) — 신뢰 결과 없음.
    getNotificationsMock.mockRejectedValue(new GithubApiError('GitHub API error: 403', 403, false))
    // 첫 fetch(시드)에는 todo 1개.
    getTodosMock.mockResolvedValueOnce([todo({ id: 1 })])
    render(<NotificationBell githubToken="tok" gitlabInstances={[GL_CONN]} onOpenUrl={vi.fn()} />)
    await flush()
    // 시드 시점엔 알림 없음. GitLab 소스가 신뢰 결과이므로 시드는 정상 진행돼야 한다.
    expect(appAPI.showNotification).not.toHaveBeenCalled()

    // 다음 폴링에 신규 todo 등장 → 신규감지가 동작해 알림을 띄워야 한다.
    getTodosMock.mockResolvedValueOnce([
      todo({ id: 1 }),
      todo({ id: 2, target: { title: 'New MR review' }, project: { id: 1, name: 'p', path_with_namespace: 'g/p' } }),
    ])
    await tick()

    expect(appAPI.showNotification).toHaveBeenCalledTimes(1)
    expect(appAPI.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'GitGrove', body: 'New MR review · g/p' }),
    )
  })
})
