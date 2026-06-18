import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'
import type { RemoteProgress, GitRemoteResult } from './utils/syncResult'

// SY1+SY2 동기화 인터랙션의 App 레벨 통합 회귀 테스트.
//
// 순수 함수(syncProgress/syncResult)는 별도 단위테스트가 커버하므로, 여기서는
// "결과 객체가 handleRemoteOp 분기를 타고 HUD/토스트/버튼 상태로 흐르는지"와
// onRemoteProgress 리스너 누수 여부 등 통합 동작을 검증한다.
// 진행 이벤트는 mock의 emitRemoteProgress로 수동 발사한다.

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

function seedRepo() {
  localStorage.setItem('gitgrove:repos', JSON.stringify([
    { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
  ]))
  localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
}

const prog = (op: RemoteProgress['op'], stage: string, progress: number, processed?: number, total?: number): RemoteProgress =>
  ({ op, stage, progress, processed, total })

describe('동기화 인터랙션 — App 통합', () => {
  beforeEach(() => {
    localStorage.clear()
    seedRepo()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  async function renderLoaded(mock: ReturnType<typeof installGitApiMock>) {
    render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))
    return mock
  }

  it('Pull 성공: 진행 이벤트 → HUD 노출, 결과 푸터/성공 토스트로 매핑', async () => {
    const mock = installGitApiMock()
    let resolvePull: (v: GitRemoteResult) => void = () => {}
    mock.gitAPI.pull.mockImplementation(() => new Promise(r => { resolvePull = r }))
    const user = userEvent.setup()
    await renderLoaded(mock)

    await user.click(screen.getByRole('button', { name: /Pull/ }))

    // 진행 이벤트 수동 발사 → HUD가 단계/메타를 그린다.
    act(() => {
      mock.emitRemoteProgress(prog('pull', 'remote', 0))
      mock.emitRemoteProgress(prog('pull', 'receiving', 50, 64, 128))
    })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Pull 진행 상황/ })).toBeTruthy())
    expect(shown('객체 받는 중')).toBe(true)

    // 결과 도착.
    await act(async () => {
      resolvePull({ success: true, op: 'pull', summary: '', newCommits: 3, changedFiles: 12, insertions: 340, deletions: 88 })
    })
    await waitFor(() => expect(shown('최신으로 맞췄어요')).toBe(true))
    expect(shown('Pull 완료')).toBe(true)            // 성공 토스트
    expect(screen.getByText('+340')).toBeTruthy()
    expect(screen.getByText('−88')).toBeTruthy()
  })

  it('충돌 분기: conflict 결과는 에러 토스트가 아니라 충돌 HUD + 경고 토스트로 처리', async () => {
    const mock = installGitApiMock()
    mock.gitAPI.pull.mockResolvedValue({
      success: false, op: 'pull', summary: 'Merge conflict — resolve and commit',
      conflict: true, conflictedFiles: ['a.ts', 'b.ts'],
    })
    const user = userEvent.setup()
    await renderLoaded(mock)

    await user.click(screen.getByRole('button', { name: /Pull/ }))

    await waitFor(() => expect(shown('병합 충돌이 생겼어요')).toBe(true))
    // 충돌 전용 버튼이 노출되고, "Pull 실패" 에러 토스트는 뜨지 않는다.
    expect(screen.getByRole('button', { name: /충돌 해결/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: '나중에' })).toBeTruthy()
    expect(shown('Pull 실패')).toBe(false)
    // 경고 토스트(충돌 발생).
    expect(shown('충돌 발생')).toBe(true)
  })

  it('진짜 에러(throw): HUD를 닫고 에러 토스트만 — 충돌 HUD 아님', async () => {
    const mock = installGitApiMock()
    mock.gitAPI.pull.mockRejectedValue(new Error('fatal: Authentication failed'))
    const user = userEvent.setup()
    await renderLoaded(mock)

    await user.click(screen.getByRole('button', { name: /Pull/ }))

    await waitFor(() => expect(shown('Pull 실패')).toBe(true))
    // HUD(진행/충돌)는 노출되지 않는다.
    expect(screen.queryByRole('dialog', { name: /Pull 진행 상황/ })).toBeNull()
    expect(shown('병합 충돌이 생겼어요')).toBe(false)
  })

  it('이미 최신(upToDate): happy 결과 + info 토스트', async () => {
    const mock = installGitApiMock()
    mock.gitAPI.fetch.mockResolvedValue({ success: true, op: 'fetch', summary: '', newCommits: 0, upToDate: true })
    const user = userEvent.setup()
    await renderLoaded(mock)

    await user.click(screen.getByRole('button', { name: /Fetch/ }))

    await waitFor(() => expect(shown('이미 최신 상태예요')).toBe(true))
    expect(shown('이미 최신')).toBe(true)
  })

  it('upstream 없음(newCommits/pushedCommits undefined): 카운트 표기 생략돼도 성공 흐름 유지', async () => {
    const mock = installGitApiMock()
    mock.gitAPI.push.mockResolvedValue({ success: true, op: 'push', summary: 'Pushed to remote' })
    const user = userEvent.setup()
    await renderLoaded(mock)

    await user.click(screen.getByRole('button', { name: /Push/ }))

    await waitFor(() => expect(shown('origin 에 올렸어요')).toBe(true))
    // 커밋 수가 없으면 "n 커밋" 없이 origin 갱신 토스트.
    expect(shown('origin 갱신됨')).toBe(true)
  })

  it('진행 중에는 세 버튼 모두 비활성(busy) — 동시 실행 방지', async () => {
    const mock = installGitApiMock()
    let resolvePull: (v: GitRemoteResult) => void = () => {}
    mock.gitAPI.pull.mockImplementation(() => new Promise(r => { resolvePull = r }))
    const user = userEvent.setup()
    await renderLoaded(mock)

    const pullBtn = screen.getByRole('button', { name: /Pull/ })
    const pushBtn = screen.getByRole('button', { name: /Push/ })
    const fetchBtn = screen.getByRole('button', { name: /Fetch/ })
    await user.click(pullBtn)

    await waitFor(() => {
      expect(pullBtn).toBeDisabled()
      expect(pushBtn).toBeDisabled()
      expect(fetchBtn).toBeDisabled()
    })

    await act(async () => { resolvePull({ success: true, op: 'pull', summary: '', upToDate: true }) })
    // 결과 후 다시 활성화.
    await waitFor(() => expect(pushBtn).not.toBeDisabled())
  })

  it('onRemoteProgress 구독은 1회 등록되고 언마운트 시 정확히 해제된다(리스너 누수 방지)', async () => {
    const mock = installGitApiMock()
    const { unmount } = render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    // 등록 1회, 아직 활성 1.
    expect(mock.remoteProgressStats().subscribed).toBeGreaterThanOrEqual(1)
    expect(mock.remoteProgressStats().active).toBe(1)

    unmount()
    // cleanup에서 해제 → 활성 0.
    expect(mock.remoteProgressStats().active).toBe(0)
    expect(mock.remoteProgressStats().unsubscribed).toBe(mock.remoteProgressStats().subscribed)
  })

  it('결과 표시 중 도착한 늦은 진행 이벤트는 무시(op 종료 후 모델 오염 없음)', async () => {
    const mock = installGitApiMock()
    mock.gitAPI.pull.mockResolvedValue({ success: true, op: 'pull', summary: '', upToDate: true })
    const user = userEvent.setup()
    await renderLoaded(mock)

    await user.click(screen.getByRole('button', { name: /Pull/ }))
    await waitFor(() => expect(shown('이미 최신 상태예요')).toBe(true))

    // op 종료(remoteOp=null) 후 늦게 온 진행 이벤트 — 무시되어 충돌/단계 텍스트로 바뀌지 않아야.
    act(() => { mock.emitRemoteProgress(prog('pull', 'receiving', 50, 10, 20)) })
    expect(shown('이미 최신 상태예요')).toBe(true)
  })
})
