import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

// ──────────────────────────────────────────────────────────────
// 타이틀바 탭 오버플로 회귀 테스트 (fix/titlebar-tabs-overflow)
//
// 버그: RepoTabs 래퍼 div가 .title-bar(flex)의 직접 자식인데 flex/min-width:0이
// 없어 max-content(전체 탭 너비)로 팽창 → 우측 고정 그룹 .tb-right(브랜치/업데이트/
// 알림)를 뷰포트 밖으로 밀어냄.
// 픽스: 래퍼에 .repo-tabs-wrap(flex:1 1 auto; min-width:0; overflow:hidden) 부여로
// 가용폭만 점유하고 축소 가능하게 함. 탭이 넘치면 내부 .repo-tabs의 overflow-x:auto가
// 스크롤을 담당하고, .tb-right는 margin-left:auto로 항상 우측 끝에 핀됨.
//
// jsdom은 실제 픽셀 폭을 계산 못 하므로 "레이아웃 계약"(클래스/스타일/DOM 존재)을
// 검증한다. 실제 오버플로우 시각 확인은 Electron 수동확인으로 남긴다.
// ──────────────────────────────────────────────────────────────

function seedManyRepos(n: number) {
  const repos = Array.from({ length: n }, (_, i) => ({
    id: `repo-${i}-id`,
    name: `repo-${i}`,
    path: `/repo/a`, // 모두 동일 픽스처 경로 → 마운트/전환 안정
    branch: 'main',
    dirty: false,
    ahead: 0,
    behind: 0,
  }))
  localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
  localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
}

describe('타이틀바 탭 오버플로', () => {
  beforeEach(() => {
    localStorage.clear()
    installGitApiMock()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('탭이 많아도 우측 고정 그룹(.tb-right)이 타이틀바 안에 유지되고 래퍼 뒤에 핀된다', async () => {
    seedManyRepos(16)
    const { container } = render(<App />)

    await waitFor(() => {
      expect(screen.getAllByText(FIXTURES['/repo/a'].commitMsg).length).toBeGreaterThan(0)
    })

    // 16개 탭이 렌더됨
    expect(container.querySelectorAll('.repo-tab').length).toBe(16)

    // 우측 고정 그룹이 .title-bar의 직접 자식으로 DOM에 존재 (뷰포트 밖으로 제거되지 않음)
    const titleBar = container.querySelector('.title-bar')
    const right = titleBar?.querySelector(':scope > .tb-right')
    expect(right).not.toBeNull()

    // 구조 계약: 탭 래퍼(.repo-tabs-wrap)가 .tb-right보다 앞에 온다 (margin-left:auto로 우측 핀)
    const children = Array.from(titleBar?.children ?? [])
    const wrapIdx = children.findIndex(c => c.classList.contains('repo-tabs-wrap'))
    const rightIdx = children.findIndex(c => c.classList.contains('tb-right'))
    expect(wrapIdx).toBeGreaterThanOrEqual(0)
    expect(rightIdx).toBeGreaterThan(wrapIdx)
  })

  it('탭 래퍼가 축소 가능한 .repo-tabs-wrap 클래스를 가지고 내부 .repo-tabs가 스크롤을 담당한다', async () => {
    seedManyRepos(16)
    const { container } = render(<App />)

    await waitFor(() => {
      expect(screen.getAllByText(FIXTURES['/repo/a'].commitMsg).length).toBeGreaterThan(0)
    })

    // 래퍼가 새 클래스를 가지며 .title-bar의 직접 자식이다 (인라인 팽창 div 아님)
    const wrap = container.querySelector('.title-bar > .repo-tabs-wrap')
    expect(wrap).not.toBeNull()

    // 탭 스트립과 '+' 버튼이 래퍼 안에 있다 (구조 불변)
    expect(wrap?.querySelector('.repo-tabs')).not.toBeNull()
    expect(wrap?.querySelector('.repo-tab-add')).not.toBeNull()
  })
})
