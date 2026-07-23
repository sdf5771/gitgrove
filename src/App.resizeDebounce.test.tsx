import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, act, fireEvent } from '@testing-library/react'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

// ──────────────────────────────────────────────────────────────
// 리사이즈/스크롤 측정 트레일링 디바운스 (App.tsx / RepoTabs · ActionAux)
//
// [핵심 회귀 방어 2가지]
//  ① 리사이즈/스크롤 경로는 반드시 디바운스돼야 한다(연속 이벤트 동안 측정 0,
//     멈춘 뒤 ~120ms에 1회만) — "리사이즈 경로가 여전히 매 이벤트 즉시 측정"이면 회귀.
//  ② 데이터 경로([repos]/[active] 변화, 마운트)는 절대 디바운스되면 안 된다(즉시 측정)
//     — "디바운스가 데이터 경로까지 늦추면" 회귀.
//
// [관측 방법] 측정은 rAF 콜백 안에서
//   - RepoTabs: 컨테이너(.repo-tabs)의 getBoundingClientRect 를 1회 읽는다.
//   - ActionAux: 바(.action-bar)의 clientWidth 를 1회 읽는다.
//   → 이 읽기 횟수를 카운트하면 "측정이 몇 번 돌았는가"를 정확히 셀 수 있다.
//
// [타이머] vi.useFakeTimers() 는 setTimeout(디바운스 120ms) 과
//   requestAnimationFrame(측정) 을 모두 가짜로 만든다. 마운트/레포 로드는 실제
//   타이머·프로미스가 필요하므로 renderLoaded() 는 실타이머로 끝낸 뒤, 그 다음에
//   useFakeTimers 로 전환해 디바운스 타이밍만 정밀 제어한다.
//
// ⚠️ jsdom 한계: 실제 픽셀 레이아웃/CSS 오버플로는 재현 불가. 측정이 "언제 몇 번
//   도는가"(디바운스 타이밍)만 검증한다. 시각 확인은 Electron/실기기 영역.
// ──────────────────────────────────────────────────────────────

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

// 모든 탭을 동일 픽스처 경로(/repo/a)로 → 탭 클릭이 레포 재로드를 유발하지 않아
// (탭전환 effect가 repoPath 동일 시 loadRepo 스킵) 데이터-경로 측정만 순수 격리된다.
function seedSamePath(n: number) {
  const repos = Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`, name: `r${i}`, path: '/repo/a',
    branch: 'main', dirty: false, ahead: 0, behind: 0,
  }))
  localStorage.setItem('gitgrove:repos', JSON.stringify(repos))
  localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
}

async function renderLoaded() {
  const utils = render(<App />)
  await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))
  return utils
}

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const dispatchResize = () => act(() => { window.dispatchEvent(new Event('resize')) })

// 실타이머 구간에서 아직 대기 중인 rAF(예: ActionAux의 접힘 후 [collapsed] 재측정)를
// 모두 발화시켜 컴포넌트의 rafRef를 정리한다. 이 정리 없이 fake timer로 전환하면
// 남은 실-rAF id가 sinon fake id 공간과 충돌해 이후 측정 rAF가 오취소될 수 있다.
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 40)) })

// ────────────────────────────── RepoTabs ──────────────────────────────

describe('RepoTabs — 리사이즈/스크롤 측정 디바운스', () => {
  // 컨테이너(.repo-tabs) rect 읽기 횟수 = 측정 횟수.
  const counter = { measures: 0 }
  let origRect: typeof HTMLElement.prototype.getBoundingClientRect

  function forceOverflowAndCount({ containerRight = 300, tabWidth = 100 } = {}) {
    origRect = HTMLElement.prototype.getBoundingClientRect
    const make = (left: number, right: number) => ({
      left, right, top: 0, bottom: 20, width: right - left, height: 20, x: left, y: 0,
      toJSON: () => ({}),
    }) as DOMRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('repo-tabs')) {
        counter.measures++ // 컨테이너 rect 읽기 = 측정 1회
        return make(0, containerRight)
      }
      if (this.classList.contains('repo-tab')) {
        const parent = this.parentElement
        const idx = parent ? Array.prototype.indexOf.call(parent.children, this) : 0
        return make(idx * tabWidth, idx * tabWidth + tabWidth)
      }
      return origRect.call(this)
    })
  }

  beforeEach(() => { localStorage.clear(); installGitApiMock(); counter.measures = 0 })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear() })

  it('(a) window resize → 120ms 경과 전엔 측정 0, 120ms 후 정확히 1회 측정', async () => {
    seedSamePath(6)
    forceOverflowAndCount()               // 탭 3·4·5 오버플로 → ▾ 3
    const { container } = await renderLoaded()
    // 마운트 측정으로 ▾ 가 이미 떠 있음(데이터 경로 = 즉시).
    await waitFor(() => expect(container.querySelector('.repo-ov-btn')).not.toBeNull())

    await settle()
    vi.useFakeTimers()
    const before = counter.measures

    dispatchResize()
    advance(119)                          // 디바운스 만료 직전
    expect(counter.measures).toBe(before) // 아직 측정 없음(리사이즈 즉시 측정 아님)

    advance(200)                          // 120ms setTimeout 만료 → rAF → 측정
    expect(counter.measures).toBe(before + 1) // 정확히 1회
  })

  it('(b) 연속 resize 여러 번 → 마지막 이후 120ms에 단 1회만 측정(coalesce)', async () => {
    seedSamePath(6)
    forceOverflowAndCount()
    const { container } = await renderLoaded()
    await waitFor(() => expect(container.querySelector('.repo-ov-btn')).not.toBeNull())

    await settle()
    vi.useFakeTimers()
    const before = counter.measures

    // 매 resize 가 이전 타이머를 clear+set → 120ms 도달 전 계속 리셋되어 측정 0.
    dispatchResize(); advance(50)
    dispatchResize(); advance(50)
    dispatchResize(); advance(50)         // 누적 150ms지만 마지막 resize 후 50ms뿐
    expect(counter.measures).toBe(before) // 3번 리사이즈에도 측정 0

    advance(200)                          // 마지막 이후 정지 → 1회만
    expect(counter.measures).toBe(before + 1)
  })

  it('(c) 스크롤 경로도 디바운스된다(120ms 전 0, 후 1회)', async () => {
    seedSamePath(6)
    forceOverflowAndCount()
    const { container } = await renderLoaded()
    const strip = await waitFor(() => {
      const s = container.querySelector('.repo-tabs'); expect(s).not.toBeNull(); return s as HTMLElement
    })

    await settle()
    vi.useFakeTimers()
    const before = counter.measures

    act(() => { fireEvent.scroll(strip) })
    advance(119)
    expect(counter.measures).toBe(before)
    advance(200)
    expect(counter.measures).toBe(before + 1)
  })

  it('(d) 데이터 경로(active 변화)는 디바운스 없이 즉시 측정(120ms 대기 불필요)', async () => {
    seedSamePath(6)
    forceOverflowAndCount()
    const { container } = await renderLoaded()
    await waitFor(() => expect(container.querySelector('.repo-ov-btn')).not.toBeNull())

    await settle()
    vi.useFakeTimers()
    const before = counter.measures

    // 탭1 클릭 → activeRepo 변경(같은 경로라 재로드 없음) → [repos,active] effect 즉시 측정.
    const tabs = container.querySelectorAll('.repo-tab')
    act(() => { fireEvent.click(tabs[1]) })
    advance(30)                           // rAF 만큼만(디바운스 120ms 미만)
    expect(counter.measures).toBeGreaterThan(before) // 이미 측정됨 = 즉시 경로
  })
})

// ────────────────────────────── ActionAux ──────────────────────────────

describe('ActionAux — 리사이즈 측정 디바운스', () => {
  // 바(.action-bar) clientWidth 읽기 횟수 = 측정 횟수.
  const counter = { measures: 0 }
  const patched: Array<[string, PropertyDescriptor | undefined]> = []
  function patchProp(name: string, getter: (this: HTMLElement) => number) {
    patched.push([name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)])
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: getter })
  }
  // 좁은 창 강제 접힘 + clientWidth 읽기 카운트.
  function forceCollapseAndCount({ clientWidth = 300, scrollWidth = 900, auxWidth = 400 } = {}) {
    patchProp('clientWidth', function () {
      if (this.classList.contains('action-bar')) { counter.measures++; return clientWidth }
      return 0
    })
    patchProp('scrollWidth', function () { return this.classList.contains('action-bar') ? scrollWidth : 0 })
    patchProp('offsetWidth', function () {
      if (this.classList.contains('action-aux')) return auxWidth
      if (this.classList.contains('abar-more')) return 50
      return 0 // spacer 여유 0 → 접힘 유지(측정이 다시 펼치지 않음)
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

  beforeEach(() => { localStorage.clear(); installGitApiMock(); seedOne(); counter.measures = 0 })
  afterEach(() => { cleanup(); vi.useRealTimers(); restoreProps(); vi.restoreAllMocks(); localStorage.clear() })

  it('(a) 마운트 측정은 즉시(접힘 결정) — ▾ 더보기 버튼이 120ms 대기 없이 뜬다', async () => {
    forceCollapseAndCount()
    const { container } = await renderLoaded()
    // 마운트 즉시 측정으로 접힘 결정 → 더보기 버튼 등장(데이터 경로 = 즉시).
    await waitFor(() => expect(container.querySelector('.abar-more-btn')).not.toBeNull())
    expect(counter.measures).toBeGreaterThan(0)
  })

  it('(b) window resize → 120ms 전엔 재측정 0, 120ms 후 1회', async () => {
    forceCollapseAndCount()
    const { container } = await renderLoaded()
    await waitFor(() => expect(container.querySelector('.abar-more-btn')).not.toBeNull())

    await settle()
    vi.useFakeTimers()
    const before = counter.measures

    dispatchResize()
    advance(119)
    expect(counter.measures).toBe(before)   // 리사이즈 즉시 측정 아님
    advance(200)
    expect(counter.measures).toBe(before + 1)
  })

  it('(c) 연속 resize → 마지막 이후 120ms에 단 1회만 측정(coalesce)', async () => {
    forceCollapseAndCount()
    const { container } = await renderLoaded()
    await waitFor(() => expect(container.querySelector('.abar-more-btn')).not.toBeNull())

    await settle()
    vi.useFakeTimers()
    const before = counter.measures

    dispatchResize(); advance(40)
    dispatchResize(); advance(40)
    dispatchResize(); advance(40)
    expect(counter.measures).toBe(before)   // 3번에도 측정 0
    advance(200)
    expect(counter.measures).toBe(before + 1)
  })
})
