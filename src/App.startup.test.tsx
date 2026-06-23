import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

// ──────────────────────────────────────────────────────────────
// 시작 화면: 복원할 레포가 없을 때만 Repository Manager를 랜딩으로.
// ──────────────────────────────────────────────────────────────
describe('앱 시작 화면', () => {
  beforeEach(() => {
    localStorage.clear()
    // 첫 실행 온보딩은 이 시작-화면 테스트의 관심사가 아니므로 본 것으로 표시(오버레이 비노출).
    localStorage.setItem('gitgrove:onboarding-seen', '1')
    installGitApiMock()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('복원할 레포가 전혀 없으면 Repository Manager가 먼저 뜬다', async () => {
    render(<App />)
    await waitFor(() => {
      expect(shown('내 그로브')).toBe(true)
    })
  })

  it('직전 레포가 있으면 매니저 대신 그 레포 화면을 복원한다', async () => {
    localStorage.setItem('gitgrove:repos', JSON.stringify([
      { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
    ]))
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')

    render(<App />)
    await waitFor(() => {
      expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true)
    })
    // 매니저는 랜딩으로 뜨지 않는다.
    expect(shown('내 그로브')).toBe(false)
  })

  it('lastPath가 더 이상 유효한 repo가 아니고 남은 탭도 없으면 매니저로 폴백', async () => {
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/gone')
    const { gitAPI } = installGitApiMock()
    gitAPI.isRepo.mockResolvedValue(false)

    render(<App />)
    await waitFor(() => {
      expect(shown('내 그로브')).toBe(true)
    })
  })
})
