import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

// 부팅 복원 로딩(빈 상태 깜박임 방지) 회귀.
//
// 앱이 완전히 종료되지 않은 상태에서 창을 다시 열면 렌더러가 재마운트되고,
// 마지막 레포 복원이 silent loadRepo라 isLoading=false인데 repoPath는 아직 null이다.
// 이때 '레포지토리를 열어주세요'(빈 상태)가 깜박이던 것을 booting 상태로 막아,
// 복원이 끝날 때까지 로딩 화면을 보여준다.

function seedRepo() {
  localStorage.setItem('gitgrove:repos', JSON.stringify([
    { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
  ]))
  localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
}

describe('App — 부팅 복원 로딩', () => {
  beforeEach(() => { localStorage.clear(); seedRepo() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

  it('마지막 레포 복원 중에는 빈 상태 대신 로딩 화면을 보여준다', async () => {
    const mock = installGitApiMock()
    // 로드를 보류시켜 "복원 진행 중" 상태를 고정한다.
    let release: () => void = () => {}
    mock.gitAPI.getStatus.mockImplementation(
      () => new Promise(r => { release = () => r({ staged: [], unstaged: [] }) }),
    )

    render(<App />)

    // 복원이 끝나기 전: 로딩 화면 노출, 빈 상태('레포지토리를 열어주세요') 미노출.
    await waitFor(() => expect(screen.queryByText('Loading repository…')).not.toBeNull())
    expect(screen.queryByText('레포지토리를 열어주세요')).toBeNull()

    // 로드 완료 → 메인 뷰(커밋 메시지) 노출.
    release()
    await waitFor(() =>
      expect(screen.queryAllByText(FIXTURES['/repo/a'].commitMsg).length).toBeGreaterThan(0),
    )
  })

  it('복원할 레포가 없으면(빈 상태 정상 경로) 로딩에 갇히지 않는다', async () => {
    localStorage.clear() // lastRepoPath·repos 없음
    installGitApiMock()

    render(<App />)

    // booting=false로 시작 → 로딩에 갇히지 않고 매니저/빈 상태 경로로 진행.
    await waitFor(() => expect(screen.queryByText('Loading repository…')).toBeNull())
  })
})
