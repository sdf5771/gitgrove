import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

// 레포 탭 키보드 접근성(a11y, B10) 회귀 테스트.
// 탭은 role="tab" + tabIndex=0 + Enter/Space 활성화여야 한다(마우스 전용 금지).

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

function seedRepos() {
  const repos = [
    { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
    { id: 'repo-b-id', name: 'b', path: '/repo/b', branch: 'develop', dirty: false, ahead: 0, behind: 0 },
  ]
  localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
}

describe('레포 탭 키보드 접근성', () => {
  beforeEach(() => {
    localStorage.clear()
    installGitApiMock()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('탭이 role="tab"과 aria-selected를 노출한다', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
    render(<App />)

    await waitFor(() => {
      expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true)
    })

    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBe(2)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('두 번째 탭에 포커스 후 Enter로 활성화하면 repoB로 전환된다', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')

    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true)
    })

    const tabB = screen.getAllByRole('tab')[1]
    tabB.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
    }, { timeout: 3000 })
    expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(false)
  })

  it('Space 키로도 탭이 활성화된다', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')

    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true)
    })

    const tabB = screen.getAllByRole('tab')[1]
    tabB.focus()
    await user.keyboard('[Space]')

    await waitFor(() => {
      expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
    }, { timeout: 3000 })
  })
})
