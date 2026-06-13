import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

// ──────────────────────────────────────────────────────────────
// 레포 탭 닫기 회귀 테스트
//
// 버그: 첫 번째(index 0) 탭이 활성일 때 닫기(×)를 누르면, setActiveRepo(0)이
// no-op이라 탭전환 effect가 안 떠서 화면이 안 바뀌고 repoPath가 닫은 레포에
// 남는다 → "첫 탭만 닫기가 안 되는" 증상.
// 픽스: handleCloseRepoTab이 닫은 레포가 표시 중이면 새 활성 레포를 명시 로드.
// ──────────────────────────────────────────────────────────────

function seedRepos() {
  const repos = [
    { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
    { id: 'repo-b-id', name: 'b', path: '/repo/b', branch: 'develop', dirty: false, ahead: 0, behind: 0 },
  ]
  localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
}

describe('레포 탭 닫기', () => {
  beforeEach(() => {
    localStorage.clear()
    installGitApiMock()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('첫 번째(활성) 탭의 닫기(×)를 누르면 그 레포가 닫히고 화면이 두 번째 레포로 전환된다', async () => {
    // repoA가 마지막 열린 레포 → 마운트 시 복원되어 active 탭 0(첫 탭)
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')

    const user = userEvent.setup()
    const { container } = render(<App />)

    await waitFor(() => {
      expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true)
    })

    // 첫 번째 레포 탭의 닫기 버튼 클릭
    const closeBtns = container.querySelectorAll('.repo-tab-close')
    expect(closeBtns.length).toBeGreaterThan(0)
    await user.click(closeBtns[0] as Element)

    // 화면이 repoB로 전환되어야 한다 (버그 시: repoA가 그대로 남음)
    await waitFor(() => {
      expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
    })
    expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(false)
  })
})
