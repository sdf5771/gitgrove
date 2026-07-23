import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, within, fireEvent } from '@testing-library/react'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

// ──────────────────────────────────────────────────────────────
// B — 반응형 액션바 오버플로 (App.tsx / ActionAux)
//
// 부가 git-op 버튼(Branch·Merge·Rebase·Stash·Tags·Conflicts)이 좁은 창에서
// "⋯ 더보기" 메뉴로 접힌다. jsdom 은 레이아웃이 0이라 자연 오버플로가 없으므로
// (기본=펼침 유지가 정상) 레이아웃 프로퍼티를 mock 해 오버플로를 강제한다.
//
// ⚠️ ActionAux 측정은 getBoundingClientRect 가 아니라 clientWidth/scrollWidth/
//    offsetWidth(bar/spacer/aux/more) 를 읽는다 → 이 프로퍼티들을 prototype
//    레벨에서 className 기준으로 mock한다(RepoTabs 의 rect mock 과는 다른 축).
// ⚠️ jsdom 한계: 실제 픽셀 오버플로/CSS 는 재현 불가. 측정 로직(scrollWidth>
//    clientWidth 이면 접기)만 근사 검증한다. 시각 확인은 Electron/CDP 영역.
// ──────────────────────────────────────────────────────────────

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

/**
 * ActionAux 측정용 레이아웃 프로퍼티를 className 기준으로 mock.
 * - .action-bar: clientWidth < scrollWidth → 오버플로(접기)
 * - .action-aux: offsetWidth(부가버튼 실측폭) 크게 → 접힘 유지에 필요
 * - .ab-spacer: offsetWidth(여유폭)=0 → 다시 펼치지 않음
 * afterEach 에서 원복(원 descriptor 복원 / 없으면 삭제).
 */
const patched: Array<[string, PropertyDescriptor | undefined]> = []
function patchProp(name: string, getter: (this: HTMLElement) => number) {
  patched.push([name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)])
  Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: getter })
}
function forceCollapse({ clientWidth = 300, scrollWidth = 900, auxWidth = 400 } = {}) {
  patchProp('clientWidth', function () { return this.classList.contains('action-bar') ? clientWidth : 0 })
  patchProp('scrollWidth', function () { return this.classList.contains('action-bar') ? scrollWidth : 0 })
  patchProp('offsetWidth', function () {
    if (this.classList.contains('action-aux')) return auxWidth
    if (this.classList.contains('abar-more')) return 50
    return 0 // spacer 포함 나머지는 0(여유 없음 → 접힘 유지)
  })
}
function restoreProps() {
  for (const [name, desc] of patched) {
    if (desc) Object.defineProperty(HTMLElement.prototype, name, desc)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]
  }
  patched.length = 0
}

function seedOne() {
  localStorage.setItem('gitgrove:repos', JSON.stringify([
    { id: 'id-a', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
  ]))
  localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
}

async function renderLoaded() {
  const utils = render(<App />)
  await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))
  return utils
}

const AUX_LABELS = ['Branch', 'Merge', 'Rebase', 'Stash', 'Tags', 'Conflicts']

describe('B — 액션바 오버플로 접힘 (레이아웃 mock)', () => {
  beforeEach(() => { localStorage.clear(); installGitApiMock(); seedOne() })
  afterEach(() => { cleanup(); restoreProps(); vi.restoreAllMocks(); localStorage.clear() })

  it('(a) 여유폭<필요폭이면 부가 버튼이 "⋯ 더보기" 버튼으로 접힌다', async () => {
    forceCollapse()
    const { container } = await renderLoaded()

    const moreBtn = await waitFor(() => {
      const b = container.querySelector('.abar-more-btn')
      expect(b).not.toBeNull()
      return b as HTMLElement
    })
    // 인라인 부가버튼 묶음은 사라지고 더보기 버튼만 남는다
    expect(container.querySelector('.action-aux')).toBeNull()
    expect(moreBtn.getAttribute('aria-haspopup')).toBe('menu')
    expect(moreBtn.getAttribute('aria-expanded')).toBe('false')
    // aria-label 에 부가 작업 개수(6) 노출
    expect(moreBtn.getAttribute('aria-label')).toBe('추가 작업 6개 더보기')
  })

  it('(b) 더보기 메뉴를 열면 6개 부가 항목이 모두 나오고, 항목 클릭 시 해당 액션이 실행되고 메뉴가 닫힌다', async () => {
    forceCollapse()
    const { container } = await renderLoaded()

    const moreBtn = await waitFor(() => {
      const b = container.querySelector('.abar-more-btn'); expect(b).not.toBeNull(); return b as HTMLElement
    })
    fireEvent.click(moreBtn)

    const menu = await waitFor(() => {
      const m = container.querySelector('.abar-more-menu'); expect(m).not.toBeNull(); return m as HTMLElement
    })
    expect(menu.getAttribute('role')).toBe('menu')
    // 6개 부가 항목 전부 렌더
    for (const label of AUX_LABELS) expect(within(menu).getByText(label)).toBeTruthy()
    expect(menu.querySelectorAll('.abar-more-item').length).toBe(6)
    expect(moreBtn.getAttribute('aria-expanded')).toBe('true')

    // 'Branch' 항목 클릭 → BranchModal 이 열리고(액션 실행) 메뉴는 닫힌다
    fireEvent.click(within(menu).getByText('Branch'))
    expect(await screen.findByText('브랜치 이름')).toBeInTheDocument()
    expect(container.querySelector('.abar-more-menu')).toBeNull()
  })

  it('(b-2) 바깥(backdrop) 클릭으로 더보기 메뉴가 닫힌다', async () => {
    forceCollapse()
    const { container } = await renderLoaded()
    const moreBtn = await waitFor(() => {
      const b = container.querySelector('.abar-more-btn'); expect(b).not.toBeNull(); return b as HTMLElement
    })
    fireEvent.click(moreBtn)
    await waitFor(() => expect(container.querySelector('.abar-more-menu')).not.toBeNull())
    fireEvent.click(container.querySelector('.abar-more-backdrop')!)
    await waitFor(() => expect(container.querySelector('.abar-more-menu')).toBeNull())
  })

  it('(c) 접힘 상태에서도 Pull/Push/Fetch 와 뷰 토글(History·Stage·Diff·Blame·PR)은 항상 존재한다', async () => {
    forceCollapse()
    const { container } = await renderLoaded()
    await waitFor(() => expect(container.querySelector('.abar-more-btn')).not.toBeNull())

    const bar = container.querySelector('.action-bar') as HTMLElement
    for (const t of ['Pull', 'Push', 'Fetch']) expect(within(bar).getByText(t)).toBeTruthy()
    const toggle = container.querySelector('.view-toggle') as HTMLElement
    for (const t of ['History', 'Stage', 'Diff', 'Blame', 'PR']) expect(within(toggle).getByText(t)).toBeTruthy()
  })
})

describe('B — 폴백(레이아웃 mock 없음: 오탐 없음·무회귀)', () => {
  beforeEach(() => { localStorage.clear(); installGitApiMock(); seedOne() })
  afterEach(() => { cleanup(); restoreProps(); vi.restoreAllMocks(); localStorage.clear() })

  it('기본 jsdom(레이아웃 0)에선 접히지 않고 부가 버튼이 인라인으로 펼쳐진다', async () => {
    const { container } = await renderLoaded()
    // 측정 rAF 가 돌 시간을 준 뒤에도 더보기 버튼 미표시(오탐 없음)
    await waitFor(() => expect(container.querySelector('.action-aux')).not.toBeNull())
    expect(container.querySelector('.abar-more-btn')).toBeNull()
    // 인라인 부가버튼 6개가 그대로 접근 가능
    const aux = container.querySelector('.action-aux') as HTMLElement
    for (const label of AUX_LABELS) expect(within(aux).getByText(label)).toBeTruthy()
  })

  it('펼침 상태에서 부가 버튼 클릭이 정상 동작한다(Tags → 태그 패널)', async () => {
    const { container } = await renderLoaded()
    const aux = await waitFor(() => {
      const a = container.querySelector('.action-aux'); expect(a).not.toBeNull(); return a as HTMLElement
    })
    fireEvent.click(within(aux).getByText('Branch'))
    expect(await screen.findByText('브랜치 이름')).toBeInTheDocument()
  })
})
