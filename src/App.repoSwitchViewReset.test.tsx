import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock } from './test/gitApiMock'

// ──────────────────────────────────────────────────────────────
// 변경1: 리포 전환 시 뷰 선택 리셋 (loadRepo)
//
// (a) 다른 path 리포로 바뀌면 selIdx=0으로 리셋 + 새 리포 커밋0 자동 로드.
// (b) 같은 path silent 갱신(커밋/pull 등)에선 선택 보존(리셋 안 함).
//
// selIdx는 CommitDetail(.cd-msg)에 그려지는 선택 커밋 메시지로 관찰한다.
// 두 리포 모두 3커밋을 주어, index 2를 고른 뒤 전환했을 때 결과가
// index 0(리셋)인지 index 2(비리셋/클램프)인지로 리셋을 확정 구분한다.
// ──────────────────────────────────────────────────────────────

// 선택 커밋 메시지(우측 CommitDetail).
const cdMsg = () => document.querySelector('.cd-msg')?.textContent ?? ''

// path별 3커밋 픽스처(메시지·id 모두 유니크).
function commitsFor(prefix: 'a' | 'b'): GitCommit[] {
  const branch = prefix === 'a' ? 'main' : 'develop'
  return [0, 1, 2].map(i => ({
    id: `${prefix}${i}ccccc`.slice(0, 7),
    fullId: `${prefix}${i}` + '0'.repeat(33),
    msg: `${prefix.toUpperCase()}_MSG_${i}`,
    author: 'Tester',
    time: `${i + 1}h ago`,
    parents: [],
    refs: i === 0 ? [`HEAD -> ${branch}`] : [],
    stats: { files: 1, insertions: 5, deletions: 1 },
  }))
}

function installMulti() {
  const mock = installGitApiMock()
  mock.gitAPI.getLog.mockImplementation(async (path: string) => {
    if (path === '/repo/a') return commitsFor('a')
    if (path === '/repo/b') return commitsFor('b')
    return []
  })
  // 각 커밋마다 파일 1개 → commitFiles 채워짐(자동선택이 실제 로드하는지도 함께 검증).
  // 공용 mock의 getFiles는 0-인자(never[])로 추론되므로 캐스트 후 구현 주입.
  ;(mock.gitAPI.getFiles as unknown as Mock<(p: string, id: string) => Promise<GitFileEntry[]>>).mockImplementation(
    async (_path: string, id: string) => [{ path: `f-${id}.ts`, status: 'M', additions: 1, deletions: 0 }] as unknown as GitFileEntry[]
  )
  return mock
}

function seedRepo(single = false) {
  const repos = single
    ? [{ id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 }]
    : [
        { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
        { id: 'repo-b-id', name: 'b', path: '/repo/b', branch: 'develop', dirty: false, ahead: 0, behind: 0 },
      ]
  localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
  localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
}

describe('리포 전환 시 뷰 선택 리셋 (변경1)', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

  it('(a) 다른 path 리포로 전환 시 selIdx가 0으로 리셋되고 새 리포 커밋0을 로드한다', async () => {
    seedRepo(false)
    installMulti()
    const user = userEvent.setup()
    render(<App />)

    // 리포 A 마운트 → 자동선택으로 커밋0이 선택된다.
    await waitFor(() => expect(cdMsg()).toBe('A_MSG_0'))

    // 세 번째 커밋(index 2)을 골라 selIdx>0 상태를 만든다.
    await user.click(screen.getByText('A_MSG_2'))
    await waitFor(() => expect(cdMsg()).toBe('A_MSG_2'))

    // 리포 B(다른 path)로 전환.
    await user.click(screen.getByText('b'))

    // 리셋되면 B의 커밋0이 선택된다. 리셋이 없거나 클램프만이면 B_MSG_2가 보여야 하므로,
    // B_MSG_0 관찰이 곧 selIdx=0 리셋의 증거(B도 3커밋이라 index 2가 유효).
    await waitFor(() => expect(cdMsg()).toBe('B_MSG_0'), { timeout: 3000 })
    expect(screen.queryByText('A_MSG_0')).toBeNull()
    expect(screen.queryByText('A_MSG_2')).toBeNull()
  })

  it('(b) 같은 path silent 갱신(Pull)에선 선택을 보존한다(리셋 안 함)', async () => {
    seedRepo(true)
    const mock = installMulti()
    mock.gitAPI.pull.mockResolvedValue({ success: true, op: 'pull', summary: '', upToDate: true })
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => expect(cdMsg()).toBe('A_MSG_0'))
    await user.click(screen.getByText('A_MSG_2'))
    await waitFor(() => expect(cdMsg()).toBe('A_MSG_2'))

    // 같은 리포 silent 재로드를 유발(Pull 성공 → loadRepo(repoPath,{silent:true})).
    const before = mock.gitAPI.getLog.mock.calls.length
    await user.click(screen.getByRole('button', { name: /Pull/ }))

    // 재로드가 실제로 일어났는지 확인(테스트가 공허하지 않도록).
    await waitFor(() => expect(mock.gitAPI.getLog.mock.calls.length).toBeGreaterThan(before))
    await waitFor(() => expect(screen.queryAllByText('이미 최신 상태예요').length).toBeGreaterThan(0))

    // 선택은 그대로 index 2 보존(리셋되지 않음).
    expect(cdMsg()).toBe('A_MSG_2')
  })
})
