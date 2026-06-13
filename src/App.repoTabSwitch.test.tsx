import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

// 커밋 메시지는 그래프 행과 우측 CommitDetail 패널 양쪽에 렌더된다.
// "화면에 보이는가"만 보면 되므로 존재 여부(>0)로 판단한다.
const shown = (msg: string) => screen.queryAllByText(msg).length > 0

// ──────────────────────────────────────────────────────────────
// 레포 탭 전환 버그 재현 테스트
//
// 버그: 상단 레포 탭을 클릭하면 하이라이트는 바뀌지만 화면(커밋 그래프)이
// 해당 레포 데이터로 전환되지 않는다.
// ──────────────────────────────────────────────────────────────

function seedRepos() {
  // localStorage에 레포 2개를 탭으로 시드한다.
  const repos = [
    { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
    { id: 'repo-b-id', name: 'b', path: '/repo/b', branch: 'develop', dirty: false, ahead: 0, behind: 0 },
  ]
  localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
}

describe('레포 탭 전환', () => {
  beforeEach(() => {
    localStorage.clear()
    installGitApiMock()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('두 번째 탭 클릭 시 repoB 커밋으로 화면이 전환된다 (lastRepoPath=repoA 복원 상태)', async () => {
    // repoA가 마지막 열린 레포 → 마운트 시 복원되어 active 탭 0
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')

    const user = userEvent.setup()
    render(<App />)

    // 초기: repoA 커밋이 보여야 한다.
    await waitFor(() => {
      expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true)
    })

    // 두 번째 탭(b)을 클릭한다.
    const tabB = screen.getByText('b')
    await user.click(tabB)

    // 기대: repoB 커밋으로 전환. 버그가 있으면 repoA 커밋이 그대로 남아 실패(red).
    await waitFor(() => {
      expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
    }, { timeout: 3000 })

    // repoA 커밋은 더 이상 보이면 안 된다.
    expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(false)
  })

  it('두 번째 탭 클릭 시 repoB 커밋으로 화면이 전환된다 (lastRepoPath 없이 — 탭전환 effect만)', async () => {
    // lastRepoPath 미설정 → 마운트 시 탭전환 effect(activeRepo 초기 0)만 repoA 로드.
    seedRepos()

    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true)
    })

    const tabB = screen.getByText('b')
    await user.click(tabB)

    await waitFor(() => {
      expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
    }, { timeout: 3000 })

    expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(false)
  })

  it('탭 클릭 후 다시 첫 번째 탭으로 돌아오면 repoA 커밋이 다시 보인다', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')

    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true)
    })

    await user.click(screen.getByText('b'))
    await waitFor(() => {
      expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
    }, { timeout: 3000 })

    await user.click(screen.getByText('a'))
    await waitFor(() => {
      expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true)
    }, { timeout: 3000 })
  })
})
