import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMockWithLatency, FIXTURES } from './test/gitApiMock'

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

function seedRepos() {
  const repos = [
    { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
    { id: 'repo-b-id', name: 'b', path: '/repo/b', branch: 'develop', dirty: false, ahead: 0, behind: 0 },
  ]
  localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
}

describe('레포 탭 전환 — IPC 응답 순서 레이스 (실환경 재현)', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

  it('느린 repoA가 빠른 repoB보다 늦게 응답하면 화면이 A로 되돌아간다 (stale-overwrite 버그)', async () => {
    // repoA는 느리고(200ms) repoB는 빠르다(10ms).
    // 사용자가 A 로딩 중에 B를 클릭 → B가 먼저 그려지지만,
    // 뒤늦게 도착한 A의 응답이 setRealCommits로 화면을 덮어쓴다.
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')

    installGitApiMockWithLatency({ '/repo/a': 200, '/repo/b': 10 })

    const user = userEvent.setup({ delay: null })
    render(<App />)

    // repoA 로드가 채 끝나기 전에 곧장 탭 b 클릭
    const tabB = await screen.findByText('b')
    await user.click(tabB)

    // 모든 응답이 도착할 때까지 충분히 대기
    await new Promise(r => setTimeout(r, 500))

    // 최종 화면은 B여야 한다. 버그가 있으면 늦게 온 A가 덮어써서 실패(red).
    await waitFor(() => {
      expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
      expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(false)
    }, { timeout: 2000 })
  })
})

describe('레포 탭 전환 — 레이스 근본원인 계측', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

  it('최종 화면이 무엇으로 끝나는지 + 탭 하이라이트와 desync 확인', async () => {
    const repos = [
      { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
      { id: 'repo-b-id', name: 'b', path: '/repo/b', branch: 'develop', dirty: false, ahead: 0, behind: 0 },
    ]
    localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
    installGitApiMockWithLatency({ '/repo/a': 200, '/repo/b': 10 })

    const user = userEvent.setup({ delay: null })
    render(<App />)
    const tabB = await screen.findByText('b')
    await user.click(tabB)
    await new Promise(r => setTimeout(r, 500))

    const tabBEl = screen.getByText('b').closest('.repo-tab')!
    console.log('RACE_RESULT',
      'tabB_active=', tabBEl.className.includes('on'),
      'showsA=', screen.queryAllByText(FIXTURES['/repo/a'].commitMsg).length > 0,
      'showsB=', screen.queryAllByText(FIXTURES['/repo/b'].commitMsg).length > 0,
    )
    expect(true).toBe(true)
  })
})

describe('레포 탭 전환 — 순수 탭간 레이스 (restore effect 무관)', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

  it('A(느림)→B(빠름) 연타: 먼저 클릭한 A가 늦게 도착해 B를 덮어쓴다', async () => {
    const repos = [
      { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
      { id: 'repo-b-id', name: 'b', path: '/repo/b', branch: 'develop', dirty: false, ahead: 0, behind: 0 },
    ]
    localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
    // lastRepoPath 없음 → restore effect 미발동. 마운트 시 탭전환 effect가 repoB(빠름)부터 가도록
    // activeRepo 초기 0 = repoA. 먼저 A 로드(느림) 걸린 상태에서 B 클릭.
    installGitApiMockWithLatency({ '/repo/a': 150, '/repo/b': 10 })

    const user = userEvent.setup({ delay: null })
    render(<App />)
    // 마운트: activeRepo=0 → repoA(느림) 로드 시작
    const tabB = await screen.findByText('b')
    // A 로드 끝나기 전 B 클릭
    await user.click(tabB)
    await new Promise(r => setTimeout(r, 400))

    console.log('PURE_RACE',
      'showsA=', screen.queryAllByText(FIXTURES['/repo/a'].commitMsg).length > 0,
      'showsB=', screen.queryAllByText(FIXTURES['/repo/b'].commitMsg).length > 0)
    // 기대 B, 버그면 A
    expect(screen.queryAllByText(FIXTURES['/repo/b'].commitMsg).length > 0).toBe(true)
  })
})
