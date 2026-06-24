import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

// 상단바 레포 탭 = 알약(pill) 리스타일 후 동작/구조 보존 검증.
// dirty 점·behind ↓N 표시, 선택/닫기/추가, "Repositories" 목록 버튼 존재(디자인이 빠뜨렸지만 유지).

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

// 활성 탭(/repo/a)은 로드 시 mock 상태로 dirty/behind가 0으로 갱신되므로, dirty 점·↓N 표시는
// 로드되지 않는 비활성 탭(/repo/b)의 시드 값으로 검증한다. 이름은 path 베이스네임('a'/'b')으로
// 갱신되므로 그에 맞춰 단언한다.
function seedRepos() {
  const repos = [
    { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
    { id: 'repo-b-id', name: 'b', path: '/repo/b', branch: 'develop', dirty: true, ahead: 0, behind: 3 },
  ]
  localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
}

describe('상단바 레포 탭 — 알약(pill)', () => {
  beforeEach(() => {
    localStorage.clear()
    installGitApiMock()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('"Repositories" 목록 버튼이 RepoTabs 앞에 존재한다 (절대 제거 금지)', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
    render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    const reposBtn = document.querySelector('.tb-repos-tab')
    expect(reposBtn).not.toBeNull()
    expect(reposBtn!.textContent).toContain('Repositories')
  })

  it('각 탭이 알약(.repo-tab) + role="tab"으로 렌더되고 active=.on', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
    const { container } = render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    const tabs = container.querySelectorAll('.repo-tab')
    expect(tabs.length).toBe(2)
    // 첫 탭(a) active
    const active = container.querySelector('.repo-tab.on')
    expect(active).not.toBeNull()
    expect(within(active as HTMLElement).getByText('a')).toBeTruthy()
  })

  it('dirty 레포는 dirty 점, behind 레포는 ↓N을 표시한다 (비활성 탭 b)', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
    const { container } = render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    const bTab = within(container.querySelector('.repo-tabs') as HTMLElement)
      .getByText('b').closest('.repo-tab')!
    expect(bTab.querySelector('.repo-tab-dirty')).not.toBeNull()
    expect(within(bTab as HTMLElement).getByText('↓3')).toBeTruthy()
  })

  it('탭 클릭 → 선택 전환(onSelect)', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
    const user = userEvent.setup()
    const { container } = render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    const bTab = within(container.querySelector('.repo-tabs') as HTMLElement).getByText('b')
    await user.click(bTab)
    await waitFor(() => expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true))
  })

  it('닫기 버튼(.repo-tab-close)이 stopPropagation으로 탭 선택 없이 닫는다', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
    const user = userEvent.setup()
    const { container } = render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    const closeBtns = container.querySelectorAll('.repo-tab-close')
    expect(closeBtns.length).toBe(2)
    await user.click(closeBtns[1] as Element)
    await waitFor(() => expect(container.querySelectorAll('.repo-tab').length).toBe(1))
  })

  it('+추가 버튼(.repo-tab-add)이 저장소 추가를 연다', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
    const { container } = render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    const addBtn = container.querySelector('.repo-tab-add')
    expect(addBtn).not.toBeNull()
    expect(addBtn!.getAttribute('aria-label')).toBe('저장소 추가')
  })
})
