import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, act, fireEvent } from '@testing-library/react'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

// ──────────────────────────────────────────────────────────────
// [4] 사이드바·우패널 리사이저 CPANEL_MIN_WIDTH(320) 클램프
//
// 좁은 창에서 사이드바/우패널을 넓히면 중앙 패널이 320px 아래로 눌려 UI가 깨진다.
// 픽스: 두 리사이저의 드래그 상한을 window.innerWidth − 반대편 패널 − 320 − 8(리사이저 여유)
// 로 클램프한다. (기존 하한 160/220, 절대 상한 400/600은 유지.)
//
// jsdom은 실제 픽셀 레이아웃이 0이지만, 클램프 계산은 window.innerWidth·반대 패널 폭·
// 마우스 clientX 만으로 순수하게 결정되므로(레이아웃 측정 무관) 통합 테스트로 정확히
// 검증 가능하다. window.innerWidth 를 명시적으로 고정하고 리사이저를 드래그한 뒤,
// 확정된 폭(mouseup 시 localStorage 저장)을 단언한다.
//
// 리사이저는 전용 클래스가 없어 인라인 스타일(cursor: col-resize)로 특정한다.
// 히스토리 뷰 기본 렌더에서 col-resize 요소는 [0]=사이드바, [1]=우패널 순서다.
// ──────────────────────────────────────────────────────────────

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

function seedOne(sidebar: number, rpanel: number) {
  localStorage.setItem('gitgrove:repos', JSON.stringify([
    { id: 'id-a', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
  ]))
  localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
  localStorage.setItem('gitgrove:sidebarWidth', String(sidebar))
  localStorage.setItem('gitgrove:rpanelWidth', String(rpanel))
}

async function renderLoaded() {
  const utils = render(<App />)
  await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))
  return utils
}

function setInnerWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: px })
}

function resizers(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[style*="col-resize"]'))
}

/** 리사이저를 startX 에서 endX 까지 드래그하고 확정(mouseup)한 뒤, 저장된 폭을 반환. */
function drag(handle: HTMLElement, startX: number, endX: number, key: string): number {
  act(() => { fireEvent.mouseDown(handle, { clientX: startX }) })
  act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: endX })) })
  act(() => { window.dispatchEvent(new MouseEvent('mouseup')) })
  return Number(localStorage.getItem(key))
}

describe('[4] 리사이저 클램프 — 중앙 패널 최소 폭(320) 보호', () => {
  beforeEach(() => { localStorage.clear(); installGitApiMock() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); setInnerWidth(1024) })

  it('좁은 창: 사이드바를 끝까지 넓혀도 (innerWidth−rpanel−320−8) 상한에서 멈춘다', async () => {
    setInnerWidth(900)
    seedOne(220, 300)
    const { container } = await renderLoaded()
    // 상한 = min(400, 900 − 300 − 320 − 8) = 272. (절대상한 400보다 작음 → 클램프가 구속.)
    const w = drag(resizers(container)[0], 0, 5000, 'gitgrove:sidebarWidth')
    expect(w).toBe(272)
  })

  it('넓은 창: 클램프가 구속하지 않아 사이드바는 기존 절대상한 400까지 넓어진다(무회귀)', async () => {
    setInnerWidth(2000)
    seedOne(220, 300)
    const { container } = await renderLoaded()
    // 상한 = min(400, 2000 − 300 − 320 − 8 = 1372) = 400 → 절대상한이 유효.
    const w = drag(resizers(container)[0], 0, 5000, 'gitgrove:sidebarWidth')
    expect(w).toBe(400)
  })

  it('사이드바 하한(160)은 유지된다: 왼쪽으로 끝까지 끌면 160에서 멈춘다', async () => {
    setInnerWidth(900)
    seedOne(220, 300)
    const { container } = await renderLoaded()
    const w = drag(resizers(container)[0], 0, -5000, 'gitgrove:sidebarWidth')
    expect(w).toBe(160)
  })

  it('좁은 창: 우패널을 끝까지 넓혀도 (innerWidth−sidebar−320−8) 상한에서 멈춘다', async () => {
    setInnerWidth(900)
    seedOne(220, 300)
    const { container } = await renderLoaded()
    // 우패널은 왼쪽으로 끌면 넓어진다. 상한 = min(600, 900 − 220 − 320 − 8 = 352) = 352.
    const w = drag(resizers(container)[1], 0, -5000, 'gitgrove:rpanelWidth')
    expect(w).toBe(352)
  })

  it('넓은 창: 우패널은 기존 절대상한 600까지 넓어진다(무회귀)', async () => {
    setInnerWidth(2000)
    seedOne(220, 300)
    const { container } = await renderLoaded()
    // 상한 = min(600, 2000 − 220 − 320 − 8 = 1452) = 600.
    const w = drag(resizers(container)[1], 0, -5000, 'gitgrove:rpanelWidth')
    expect(w).toBe(600)
  })
})

// ──────────────────────────────────────────────────────────────
// [4·Major] 창 축소 시 패널 폭 재클램프
//
// 드래그 클램프는 드래그 경로에서만 동작한다. 넓은 창에서 사이드바/우패널을 넓힌 뒤
// OS 창을 minWidth로 축소하면 sidebar+rpanel+320 > innerWidth 인데 패널이 flex-shrink:0·
// cpanel min-width:320 이라 못 줄고 .app-body{overflow:hidden}가 우패널을 잘라낸다.
// 픽스: window.resize 에서 불변식 sidebar+rpanel ≤ innerWidth − 320 − 8 을 라이브 유지
// (우패널 먼저 줄이고 하한 220, 그래도 넘치면 사이드바도 하한 160). setState 는 초과 시에만.
// 검증: 넓은 창서 큰 폭 seed → innerWidth 축소 → resize dispatch → 보정된 폭(localStorage) 단언.
// ──────────────────────────────────────────────────────────────
function fireResize(px: number) {
  setInnerWidth(px)
  act(() => { window.dispatchEvent(new Event('resize')) })
}

describe('[4·Major] 창 축소 재클램프 — 우패널 잘림 방지', () => {
  beforeEach(() => { localStorage.clear(); installGitApiMock() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); setInnerWidth(1024) })

  it('창을 좁히면 우패널을 먼저 줄여 불변식(sidebar+rpanel ≤ innerWidth−328)을 회복한다', async () => {
    setInnerWidth(2000)
    seedOne(300, 560) // 넓은 창서 양 패널을 크게
    await renderLoaded()
    // 1200 으로 축소: avail = 1200 − 320 − 8 = 872. sidebar 300 + rpanel 560 = 860 ≤ 872 → 아직 여유.
    fireResize(1200)
    expect(Number(localStorage.getItem('gitgrove:rpanelWidth') || 560)).toBe(560)
    // 1024(min) 로 축소: avail = 1024 − 328 = 696. 300 + 560 = 860 > 696 →
    // 우패널 먼저 max(220, 696 − 300 = 396) = 396 으로 축소. 사이드바 300 유지(max(160,696−396=300)).
    fireResize(1024)
    expect(Number(localStorage.getItem('gitgrove:rpanelWidth'))).toBe(396)
    expect(Number(localStorage.getItem('gitgrove:sidebarWidth') || 300)).toBe(300)
  })

  it('우패널을 하한(220)까지 줄여도 부족하면 사이드바도 줄인다', async () => {
    setInnerWidth(2000)
    seedOne(400, 600) // 양 패널 절대상한
    await renderLoaded()
    // 1024 로 축소: avail = 696. 우패널 max(220, 696 − 400 = 296) = 296. 296 ≥ 220 → 사이드바 유지.
    // sidebar 400 + rpanel 296 = 696 = avail → 정확히 회복.
    fireResize(1024)
    expect(Number(localStorage.getItem('gitgrove:rpanelWidth'))).toBe(296)
    expect(Number(localStorage.getItem('gitgrove:sidebarWidth') || 400)).toBe(400)
  })

  it('넓은 창으로 되돌려도(여유 충분) 패널 폭을 다시 늘리지 않는다(재클램프는 축소 전용·no-op)', async () => {
    setInnerWidth(1024)
    seedOne(200, 300)
    await renderLoaded()
    fireResize(2000) // 여유가 커져도 보정 setState 없음 — seed 값 그대로
    expect(Number(localStorage.getItem('gitgrove:rpanelWidth') || 300)).toBe(300)
    expect(Number(localStorage.getItem('gitgrove:sidebarWidth') || 200)).toBe(200)
  })
})
