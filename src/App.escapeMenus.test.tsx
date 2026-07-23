import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

// ──────────────────────────────────────────────────────────────
// G — 메뉴 Escape stopPropagation
//
// 의도된 동작(코드 주석 명시): RepoTabs 오버플로(▾)·ActionAux 더보기(⋯) 메뉴가
// 열린 상태에서 Escape 를 누르면 "메뉴만" 닫히고 App 전역 Escape(검색어 초기화)로는
// 전파되지 않아 검색어가 유지되어야 한다.
//
// 관찰된 실제 동작(BUG-G): 메뉴는 닫히지만 검색어도 함께 초기화된다.
//   원인 — 메뉴 핸들러와 App 전역 핸들러가 둘 다 `window` 에 addEventListener 로
//   달려 있어, 메뉴 핸들러의 e.stopPropagation() 이 같은 타깃(window)의 형제
//   리스너(App 전역)를 막지 못한다. (stopImmediatePropagation + 캡처 단계라야 막힘)
//
// 처리 방침(QA): 안정적으로 맞는 부분(메뉴 닫힘)은 통과 테스트로 커버하고,
//   의도됐지만 현재 깨진 "검색어 유지"는 it.fails 가드로 문서화한다.
//   → 프론트에서 고치면 it.fails 가 붉게 뒤집혀 가드 제거를 알린다.
// ──────────────────────────────────────────────────────────────

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

// ── RepoTabs 오버플로용 getBoundingClientRect mock (App.repoTabs.test.tsx 패턴) ──
function forceTabOverflow({ containerRight = 300, tabWidth = 100 } = {}) {
  const orig = HTMLElement.prototype.getBoundingClientRect
  const make = (left: number, right: number) => ({
    left, right, top: 0, bottom: 20, width: right - left, height: 20, x: left, y: 0, toJSON: () => ({}),
  }) as DOMRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('repo-tabs')) return make(0, containerRight)
    if (this.classList.contains('repo-tab')) {
      const parent = this.parentElement
      const idx = parent ? Array.prototype.indexOf.call(parent.children, this) : 0
      return make(idx * tabWidth, idx * tabWidth + tabWidth)
    }
    return orig.call(this)
  })
}

// ── ActionAux 오버플로용 레이아웃 프로퍼티 mock ──
const patched: Array<[string, PropertyDescriptor | undefined]> = []
function patchProp(name: string, getter: (this: HTMLElement) => number) {
  patched.push([name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)])
  Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: getter })
}
function forceAuxCollapse() {
  patchProp('clientWidth', function () { return this.classList.contains('action-bar') ? 300 : 0 })
  patchProp('scrollWidth', function () { return this.classList.contains('action-bar') ? 900 : 0 })
  patchProp('offsetWidth', function () {
    if (this.classList.contains('action-aux')) return 400
    if (this.classList.contains('abar-more')) return 50
    return 0
  })
}
function restoreProps() {
  for (const [name, desc] of patched) {
    if (desc) Object.defineProperty(HTMLElement.prototype, name, desc)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]
  }
  patched.length = 0
}

function seedRepos(paths: string[]) {
  const repos = paths.map((p, i) => ({
    id: `id-${i}`, name: p.split('/').pop(), path: p, branch: 'main', dirty: false, ahead: 0, behind: 0,
  }))
  localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
  localStorage.setItem('gitgrove:lastRepoPath', paths[0])
}

async function renderLoaded() {
  render(<App />)
  await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))
}

const searchInput = () => screen.getByPlaceholderText(/Search commits/) as HTMLInputElement

/** 검색어 입력 후 지정 메뉴를 연다. */
async function openMenuWithSearch(user: ReturnType<typeof userEvent.setup>, btnSel: string, menuSel: string) {
  await user.type(searchInput(), 'REPO_A')
  expect(searchInput().value).toBe('REPO_A')
  const btn = await waitFor(() => {
    const b = document.querySelector(btnSel); expect(b).not.toBeNull(); return b as HTMLElement
  })
  await user.click(btn)
  await waitFor(() => expect(document.querySelector(menuSel)).not.toBeNull())
}

describe('G — ActionAux 더보기(⋯) 메뉴 Escape', () => {
  beforeEach(() => { localStorage.clear(); installGitApiMock(); seedRepos(['/repo/a']) })
  afterEach(() => { cleanup(); restoreProps(); vi.restoreAllMocks(); localStorage.clear() })

  it('Escape 로 더보기 메뉴가 닫힌다', async () => {
    forceAuxCollapse()
    await renderLoaded()
    const user = userEvent.setup()
    await openMenuWithSearch(user, '.abar-more-btn', '.abar-more-menu')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.querySelector('.abar-more-menu')).toBeNull())
  })

  // G 수정 완료: 캡처 단계 + stopImmediatePropagation 으로 전역 Escape 도달 차단 → 검색어 유지.
  it('더보기 메뉴 Escape 후에도 검색어가 유지된다(전역 Escape 미전파)', async () => {
    forceAuxCollapse()
    await renderLoaded()
    const user = userEvent.setup()
    await openMenuWithSearch(user, '.abar-more-btn', '.abar-more-menu')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.querySelector('.abar-more-menu')).toBeNull())
    expect(searchInput().value).toBe('REPO_A')
  })
})

describe('G — RepoTabs 오버플로(▾) 메뉴 Escape', () => {
  beforeEach(() => { localStorage.clear(); installGitApiMock(); seedRepos(['/repo/a', '/repo/b', '/repo/c', '/repo/d', '/repo/e', '/repo/f']) })
  afterEach(() => { cleanup(); restoreProps(); vi.restoreAllMocks(); localStorage.clear() })

  it('Escape 로 ▾ 오버플로 메뉴가 닫힌다', async () => {
    forceTabOverflow()
    await renderLoaded()
    const user = userEvent.setup()
    await openMenuWithSearch(user, '.repo-ov-btn', '.repo-ov-menu')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.querySelector('.repo-ov-menu')).toBeNull())
  })

  // G 수정 완료: RepoTabs 오버플로 메뉴도 동일 캡처 단계 차단으로 검색어 유지.
  it('▾ 메뉴 Escape 후에도 검색어가 유지된다(전역 Escape 미전파)', async () => {
    forceTabOverflow()
    await renderLoaded()
    const user = userEvent.setup()
    await openMenuWithSearch(user, '.repo-ov-btn', '.repo-ov-menu')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.querySelector('.repo-ov-menu')).toBeNull())
    expect(searchInput().value).toBe('REPO_A')
  })
})
