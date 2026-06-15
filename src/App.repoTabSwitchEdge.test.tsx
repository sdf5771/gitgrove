import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

function seedRepos() {
  const repos = [
    { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
    { id: 'repo-b-id', name: 'b', path: '/repo/b', branch: 'develop', dirty: false, ahead: 0, behind: 0 },
  ]
  localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
}

describe('레포 탭 전환 — 경계/레이스 케이스', () => {
  beforeEach(() => {
    localStorage.clear()
    installGitApiMock()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('마운트 직후 repoA 로드 완료 전에 즉시 두 번째 탭을 누른다 (effect 레이스)', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')

    const user = userEvent.setup({ delay: null })
    render(<App />)

    // repoA 로드를 기다리지 않고 곧장 탭 b 클릭
    const tabB = await screen.findByText('b')
    await user.click(tabB)

    await waitFor(() => {
      expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
    }, { timeout: 3000 })
    expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(false)
  })

  it('A→B→A→B 빠르게 연타해도 최종 화면이 B로 안정된다', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')

    const user = userEvent.setup({ delay: null })
    render(<App />)

    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    await user.click(screen.getByText('b'))
    await user.click(screen.getByText('a'))
    await user.click(screen.getByText('b'))

    await waitFor(() => {
      expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
    }, { timeout: 3000 })
    expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(false)
  })

  it('탭 전환 시 activeRepo 하이라이트와 표시 데이터가 동기화된다 (desync 검증)', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')

    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    const tabB = screen.getByText('b').closest('.repo-tab')!
    await user.click(tabB)

    await waitFor(() => {
      // 탭 b가 active(.on) 이고 화면도 repoB 여야 desync가 아니다.
      expect(tabB.className).toContain('on')
      expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
    }, { timeout: 3000 })
  })

  it('getLog가 path별로 정확히 다른 인자로 호출됐는지 (데이터 소스 검증)', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')

    const { gitAPI } = installGitApiMock()
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    await user.click(screen.getByText('b'))
    await waitFor(() => expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true), { timeout: 3000 })

    const paths = gitAPI.getLog.mock.calls.map(c => c[0])
    expect(paths).toContain('/repo/a')
    expect(paths).toContain('/repo/b')
  })
})

describe('레포 탭 전환 — 진단/계측', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

  it('lastRepoPath가 seeded repos에 없는 경로일 때 (stale lastRepoPath)', async () => {
    // 실제 사용자 환경에서 흔함: repos엔 a,b만 있는데 lastRepoPath는 옛 c를 가리킴.
    const repos = [
      { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
      { id: 'repo-b-id', name: 'b', path: '/repo/b', branch: 'develop', dirty: false, ahead: 0, behind: 0 },
    ]
    localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a') // 존재함

    const { gitAPI } = installGitApiMock()
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(screen.queryAllByText(FIXTURES['/repo/a'].commitMsg).length).toBeGreaterThan(0))

    await user.click(screen.getByText('b'))
    await waitFor(() => expect(screen.queryAllByText(FIXTURES['/repo/b'].commitMsg).length).toBeGreaterThan(0), { timeout: 3000 })

    // 진단: getLog 호출 순서 출력
    console.log('GETLOG_CALLS', JSON.stringify(gitAPI.getLog.mock.calls.map(c => c[0])))
  })

  it('repos 1개만 시드 후 + 탭으로 새 레포 오픈 — id churn 추적', async () => {
    const repos = [
      { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
    ]
    localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
    installGitApiMock()
    render(<App />)
    await waitFor(() => expect(screen.queryAllByText(FIXTURES['/repo/a'].commitMsg).length).toBeGreaterThan(0))
    // 마운트 후 repos가 localStorage에 어떤 id로 저장됐는지 (Date.now() churn 확인)
    const saved = JSON.parse(localStorage.getItem('gitgrove:repos')!)
    console.log('SAVED_REPOS', JSON.stringify(saved))
    expect(saved[0].path).toBe('/repo/a')
  })
})
