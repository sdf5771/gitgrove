import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

// ──────────────────────────────────────────────────────────────
// 비-Git 디렉토리(.git 없음/삭제됨) 예외처리
//
// loadRepo는 진입 시 isRepo로 검증하여, 빈/.git 삭제된 디렉토리를
// broken 상태로 만들지 않고 에러 토스트로 안내한다.
// ──────────────────────────────────────────────────────────────
describe('비-Git 디렉토리 예외처리', () => {
  beforeEach(() => {
    localStorage.clear()
    installGitApiMock()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('isRepo=false 이면 데이터를 로드하지 않고 에러 토스트를 띄운다', async () => {
    // /repo/a를 마지막 열린 레포로 복원하지만, .git이 삭제된 상태로 가정.
    localStorage.setItem('gitgrove:repos', JSON.stringify([
      { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
    ]))
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')

    const { gitAPI } = installGitApiMock()
    gitAPI.isRepo.mockResolvedValue(false)

    render(<App />)

    // 친절한 에러 토스트가 떠야 한다.
    await waitFor(() => {
      expect(shown('Git 저장소가 아닙니다')).toBe(true)
    }, { timeout: 3000 })

    // 커밋 데이터는 로드되지 않는다.
    expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(false)
    // getLog까지 가지 않아야 한다(검증에서 조기 차단).
    expect(gitAPI.getLog).not.toHaveBeenCalled()
  })

  it('isRepo=true 이면 정상적으로 로드된다 (가드가 정상 경로를 막지 않음)', async () => {
    localStorage.setItem('gitgrove:repos', JSON.stringify([
      { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
    ]))
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')

    render(<App />)

    await waitFor(() => {
      expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true)
    }, { timeout: 3000 })
  })
})
