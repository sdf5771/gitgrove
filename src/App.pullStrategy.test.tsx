import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

// Pull 스플릿 버튼(전략 3택) App 통합 — 핵심만.
// 순수 로직(loadPullStrategy/savePullStrategy)은 remoteWorkflow.test 가 커버하므로
// 여기서는 "캐럿 → 전략 선택 시 pull(repoPath, 전략) 호출 + localStorage 저장"과
// 마운트 시 저장된 전략 복원(기본 Pull 이 그 전략으로 실행) 배선만 검증한다.

const shown = (msg: string) => screen.queryAllByText(msg).length > 0
const STRAT_KEY = 'gitgrove:pullStrategy'

function seedRepo() {
  localStorage.setItem('gitgrove:repos', JSON.stringify([
    { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
  ]))
  localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
}

async function renderLoaded() {
  const mock = installGitApiMock()
  render(<App />)
  await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))
  return mock
}

describe('Pull 전략 스플릿 버튼 — App 통합', () => {
  beforeEach(() => { localStorage.clear(); seedRepo() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

  it('기본(저장값 없음): 메인 Pull 클릭은 merge 전략으로 pull 호출', async () => {
    const mock = await renderLoaded()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Pull/ }))
    await waitFor(() => expect(mock.gitAPI.pull).toHaveBeenCalledWith('/repo/a', 'merge'))
  })

  it('캐럿 → 리베이스 선택: pull(repoPath, "rebase") 호출 + 전략 저장', async () => {
    const mock = await renderLoaded()
    const user = userEvent.setup()

    // 캐럿 버튼으로 전략 메뉴 열기.
    await user.click(screen.getByRole('button', { name: '받기 전략 선택' }))
    await user.click(await screen.findByRole('menuitemradio', { name: /리베이스/ }))

    await waitFor(() => expect(mock.gitAPI.pull).toHaveBeenCalledWith('/repo/a', 'rebase'))
    // 선택은 localStorage 에 즉시 저장.
    expect(localStorage.getItem(STRAT_KEY)).toBe('rebase')
  })

  it('캐럿 → 빨리 감기만 선택: pull(repoPath, "ff-only") 호출 + 저장', async () => {
    const mock = await renderLoaded()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '받기 전략 선택' }))
    await user.click(await screen.findByRole('menuitemradio', { name: /빨리 감기만/ }))

    await waitFor(() => expect(mock.gitAPI.pull).toHaveBeenCalledWith('/repo/a', 'ff-only'))
    expect(localStorage.getItem(STRAT_KEY)).toBe('ff-only')
  })

  it('저장된 전략(ff-only) 복원: 마운트 후 메인 Pull 이 저장 전략으로 실행', async () => {
    localStorage.setItem(STRAT_KEY, 'ff-only')
    const mock = await renderLoaded()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /Pull/ }))
    await waitFor(() => expect(mock.gitAPI.pull).toHaveBeenCalledWith('/repo/a', 'ff-only'))
  })
})
