import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMockWithLatency, FIXTURES } from './test/gitApiMock'

// ──────────────────────────────────────────────────────────────
// 저장소 전환 로딩 인터랙션
//
// 탭 전환은 loadRepo(...,{silent:true, switching:true})로 동작한다.
// silent라 전면 renderLoading은 건너뛰되, switching 플래그로 스켈레톤·코치
// 로딩 배너·상태바 로딩·레포 알약 미니 스피너를 띄운다. 완료 시 모두 해제.
// 레이스 가드(loadSeqRef)로 빠른 연속 전환 시 stale 로딩이 남지 않아야 한다.
// ──────────────────────────────────────────────────────────────

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

function seedRepos() {
  const repos = [
    { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
    { id: 'repo-b-id', name: 'b', path: '/repo/b', branch: 'develop', dirty: false, ahead: 0, behind: 0 },
  ]
  localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
}

describe('저장소 전환 로딩', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

  it('① 전환 시작 → 스켈레톤·코치 로딩·상태바 로딩·알약 미니 스피너가 노출된다', async () => {
    // repoB를 느리게(120ms) 해서 in-flight 로딩 상태를 관찰할 수 있게 한다.
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
    installGitApiMockWithLatency({ '/repo/a': 0, '/repo/b': 120 })

    const user = userEvent.setup({ delay: null })
    render(<App />)

    // 초기: repoA 로드 완료
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    // 탭 b 클릭 → 전환 로딩 시작
    await user.click(screen.getByText('b'))

    // 로딩 중 UI가 모두 떠야 한다(데이터 도착 전).
    await waitFor(() => {
      expect(document.querySelector('.coach.loading')).toBeTruthy()
    })
    expect(screen.getAllByText('저장소를 여는 중…').length).toBeGreaterThan(0)
    expect(document.querySelector('.sk-commits')).toBeTruthy()
    expect(document.querySelector('.sk-detail')).toBeTruthy()
    expect(document.querySelector('.sb-loading')).toBeTruthy()
    // 미니 스피너는 전환 대상 탭(b)에 붙는다.
    const tabBEl = within(document.querySelector('.repo-tabs')!).getByText('b').closest('.repo-tab')!
    expect(tabBEl.querySelector('.mini-spin')).toBeTruthy()
  })

  it('② loadRepo resolve → 실데이터 렌더 + 로딩 UI 전부 해제', async () => {
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
    installGitApiMockWithLatency({ '/repo/a': 0, '/repo/b': 60 })

    const user = userEvent.setup({ delay: null })
    render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    await user.click(screen.getByText('b'))

    // 완료: repoB 실커밋이 보이고 로딩 UI는 모두 사라진다.
    await waitFor(() => {
      expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
    }, { timeout: 2000 })
    await waitFor(() => {
      expect(document.querySelector('.coach.loading')).toBeFalsy()
      expect(document.querySelector('.sk-commits')).toBeFalsy()
      expect(document.querySelector('.sk-detail')).toBeFalsy()
      expect(document.querySelector('.sb-loading')).toBeFalsy()
      expect(document.querySelector('.mini-spin')).toBeFalsy()
    })
    expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(false)
  })

  it('③ 빠른 연속 전환 — 최신만 반영되고 stale 로딩이 남지 않는다', async () => {
    // A(느림 200ms) 로드 중 B(빠름 10ms)로 전환 → 최종은 B, 로딩도 깨끗이 해제.
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
    installGitApiMockWithLatency({ '/repo/a': 200, '/repo/b': 10 })

    const user = userEvent.setup({ delay: null })
    render(<App />)

    const tabB = await screen.findByText('b')
    await user.click(tabB)

    // 늦게 도착하는 A의 응답이 로딩을 다시 켜거나 화면을 덮어쓰면 안 된다.
    await waitFor(() => {
      expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
    }, { timeout: 2000 })

    // A 응답이 도착할 시간을 충분히 준 뒤 stale 로딩이 없는지 확인.
    await new Promise(r => setTimeout(r, 350))
    await waitFor(() => {
      expect(document.querySelector('.coach.loading')).toBeFalsy()
      expect(document.querySelector('.sk-commits')).toBeFalsy()
      expect(document.querySelector('.sb-loading')).toBeFalsy()
      expect(document.querySelector('.mini-spin')).toBeFalsy()
    })
    expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(false)
    expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
  })

  it('④ 진행률은 promise resolve 수에 따라 0%→100%로 정직하게 도달한다', async () => {
    // 전환 중 코치 진행 바(%) 라벨이 노출되고, 완료 시 100%까지 올라간다.
    seedRepos()
    localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
    installGitApiMockWithLatency({ '/repo/a': 0, '/repo/b': 100 })

    const user = userEvent.setup({ delay: null })
    render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    await user.click(screen.getByText('b'))

    // 로딩 중 진행 바 fill 요소가 존재한다(% 텍스트는 0~100 범위).
    await waitFor(() => {
      const fill = document.querySelector('.coach-bar-fill') as HTMLElement | null
      expect(fill).toBeTruthy()
    })
    const pctEl = document.querySelector('.coach-pct')
    expect(pctEl?.textContent).toMatch(/%$/)

    // 완료 시 로딩 코치가 사라지고 실데이터가 보인다(진행률이 100%에 도달해 해제됨).
    await waitFor(() => {
      expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true)
      expect(document.querySelector('.coach.loading')).toBeFalsy()
    }, { timeout: 2000 })
  })
})
