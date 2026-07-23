import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, within, fireEvent } from '@testing-library/react'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

// ──────────────────────────────────────────────────────────────
// 리포 탭 오버플로 (A + B) 커버리지
//
// B(탭 이름 말줄임): 탭 이름이 전용 span(.repo-tab-name, title=name)로 렌더되고
//   아이콘·dirty·닫기(×)와 공존한다(CSS ellipsis는 jsdom에서 시각검증 불가 → 계약만).
//
// A(오버플로 접기): 컨테이너 밖으로 잘린 탭이 있으면 `▾ N` 버튼이 뜨고, 클릭 시
//   드롭다운(열린 저장소 전체 목록)이 열린다. jsdom은 레이아웃이 0이라 자연 오버플로가
//   없으므로(폴백=▾ 미표시가 정상), getBoundingClientRect를 mock해 컨테이너 경계 밖으로
//   뒤쪽 탭들을 밀어 오버플로를 강제한다.
//
// ⚠️ jsdom 한계: 실제 픽셀 레이아웃 오버플로는 재현 불가. 측정 로직(각 탭 rect vs
//   컨테이너 rect 비교)만 rect mock으로 근사 검증한다. 실제 시각 오버플로는 Electron
//   수동/CDP 확인 영역.
// ──────────────────────────────────────────────────────────────

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

interface SeedRepo { id: string; name: string; path: string; branch?: string; dirty?: boolean; ahead?: number; behind?: number }

function seed(repos: SeedRepo[], activePath: string) {
  const full = repos.map(r => ({
    branch: 'main', dirty: false, ahead: 0, behind: 0, ...r,
  }))
  localStorage.setItem('gitgrove:repos', JSON.stringify(full))
  localStorage.setItem('gitgrove:lastRepoPath', activePath)
}

/**
 * getBoundingClientRect를 prototype 레벨에서 mock해 오버플로를 강제한다.
 * - 컨테이너(.repo-tabs): [0, containerRight]
 * - 각 탭(.repo-tab): 형제 인덱스 i 기준 [i*tabWidth, (i+1)*tabWidth]
 * - 그 외 요소: 원본(jsdom 기본=all-zero) 위임 → 다른 컴포넌트 무영향
 * 컨테이너 right < 뒤쪽 탭 right 인 탭들이 hiddenIdx로 잡힌다.
 */
function forceOverflow({ containerRight = 300, tabWidth = 100 } = {}) {
  const orig = HTMLElement.prototype.getBoundingClientRect
  const make = (left: number, right: number) => ({
    left, right, top: 0, bottom: 20, width: right - left, height: 20, x: left, y: 0,
    toJSON: () => ({}),
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

// containerRight=300, tabWidth=100 → 탭 0·1·2 가시(right ≤ 301), 3+ 숨김.
function overflowRepos(n: number): SeedRepo[] {
  // index 0 은 픽스처(/repo/a) → 부팅 로드로 앱이 완전히 마운트됨을 보장.
  const list: SeedRepo[] = [{ id: 'id-a', name: 'a', path: '/repo/a' }]
  for (let k = 1; k < n; k++) list.push({ id: `id-r${k}`, name: `r${k}`, path: `/repo/r${k}` })
  return list
}

async function renderLoaded() {
  const utils = render(<App />)
  await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))
  return utils
}

describe('리포 탭 오버플로 — B(탭 이름 말줄임 계약)', () => {
  beforeEach(() => { localStorage.clear(); installGitApiMock() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

  it('각 탭 이름이 .repo-tab-name span + title=name 으로 렌더된다', async () => {
    seed([
      { id: 'id-a', name: 'a', path: '/repo/a' },
      { id: 'id-b', name: 'b', path: '/repo/b', branch: 'develop', dirty: true, behind: 3 },
    ], '/repo/a')
    const { container } = await renderLoaded()

    const nameSpans = container.querySelectorAll('.repo-tab .repo-tab-name')
    expect(nameSpans.length).toBe(2)
    // 비활성 탭 b: 이름 span 텍스트 = 'b', title = 'b'(전체 이름 툴팁)
    const bTab = within(container.querySelector('.repo-tabs') as HTMLElement).getByText('b').closest('.repo-tab')!
    const bName = bTab.querySelector('.repo-tab-name')!
    expect(bName.textContent).toBe('b')
    expect(bName.getAttribute('title')).toBe('b')
  })

  it('탭 안에서 아이콘·dirty 점·이름·닫기(×)가 공존한다 (dirty 탭 b)', async () => {
    seed([
      { id: 'id-a', name: 'a', path: '/repo/a' },
      { id: 'id-b', name: 'b', path: '/repo/b', branch: 'develop', dirty: true, behind: 3 },
    ], '/repo/a')
    const { container } = await renderLoaded()

    const bTab = within(container.querySelector('.repo-tabs') as HTMLElement).getByText('b').closest('.repo-tab')!
    // 아이콘(폴더 SVG) + dirty 점 + 이름 span + behind ↓3 + 닫기 × 가 한 탭에 공존
    expect(bTab.querySelector('svg')).not.toBeNull()
    expect(bTab.querySelector('.repo-tab-dirty')).not.toBeNull()
    expect(bTab.querySelector('.repo-tab-name')).not.toBeNull()
    expect(within(bTab as HTMLElement).getByText('↓3')).toBeTruthy()
    expect(bTab.querySelector('.repo-tab-close')).not.toBeNull()
  })

  it('활성 탭 이름 span 은 .on 수식자를 가진다(넓은 폭용)', async () => {
    seed([
      { id: 'id-a', name: 'a', path: '/repo/a' },
      { id: 'id-b', name: 'b', path: '/repo/b', branch: 'develop' },
    ], '/repo/a')
    const { container } = await renderLoaded()

    const active = container.querySelector('.repo-tab.on')!
    expect(active.querySelector('.repo-tab-name.on')).not.toBeNull()
  })
})

describe('리포 탭 오버플로 — A(오버플로 강제, rect mock)', () => {
  beforeEach(() => { localStorage.clear(); installGitApiMock() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

  it('(a) 숨은 탭이 있으면 `▾ N` 버튼이 뜨고 N = 숨은 탭 수', async () => {
    forceOverflow()
    seed(overflowRepos(8), '/repo/a') // 8탭, 가시 3 → 숨김 5
    const { container } = await renderLoaded()

    const btn = await waitFor(() => {
      const b = container.querySelector('.repo-ov-btn')
      expect(b).not.toBeNull()
      return b as HTMLElement
    })
    expect(btn.querySelector('.repo-ov-count')!.textContent).toBe('5')
    expect(btn.getAttribute('aria-label')).toBe('숨은 저장소 5개 보기')
    expect(btn.getAttribute('aria-haspopup')).toBe('menu')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('(b) `▾` 클릭 시 드롭다운이 열리고 전체 저장소 목록이 렌더된다', async () => {
    forceOverflow()
    seed(overflowRepos(8), '/repo/a')
    const { container } = await renderLoaded()

    const btn = await waitFor(() => {
      const b = container.querySelector('.repo-ov-btn'); expect(b).not.toBeNull(); return b as HTMLElement
    })
    fireEvent.click(btn)

    const menu = await waitFor(() => {
      const m = container.querySelector('.repo-ov-menu'); expect(m).not.toBeNull(); return m as HTMLElement
    })
    expect(menu.getAttribute('role')).toBe('menu')
    expect(within(menu).getByText('열린 저장소')).toBeTruthy()
    // 숨은 5개가 아니라 열린 저장소 '전체' 8개가 나열된다
    expect(menu.querySelectorAll('.repo-ov-item').length).toBe(8)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
  })

  it('(c) 목록 행 클릭 → onSelect(해당 index) 로 그 저장소가 활성화되고 메뉴가 닫힌다', async () => {
    forceOverflow()
    seed(overflowRepos(8), '/repo/a')
    const { container } = await renderLoaded()

    const btn = await waitFor(() => {
      const b = container.querySelector('.repo-ov-btn'); expect(b).not.toBeNull(); return b as HTMLElement
    })
    fireEvent.click(btn)
    const menu = await waitFor(() => {
      const m = container.querySelector('.repo-ov-menu'); expect(m).not.toBeNull(); return m as HTMLElement
    })
    // 숨은 저장소 r5(index 5) 행 클릭
    fireEvent.click(within(menu).getByText('r5'))

    await waitFor(() => {
      const active = container.querySelector('.repo-tab.on')
      expect(active?.textContent).toContain('r5')
    })
    expect(container.querySelector('.repo-ov-menu')).toBeNull() // 선택 후 닫힘
  })

  it('(d) 행 닫기(×) → onClose(해당 index) 로 그 탭만 제거된다', async () => {
    forceOverflow()
    seed(overflowRepos(8), '/repo/a')
    const { container } = await renderLoaded()

    const btn = await waitFor(() => {
      const b = container.querySelector('.repo-ov-btn'); expect(b).not.toBeNull(); return b as HTMLElement
    })
    fireEvent.click(btn)
    const menu = await waitFor(() => {
      const m = container.querySelector('.repo-ov-menu'); expect(m).not.toBeNull(); return m as HTMLElement
    })
    const row = within(menu).getByText('r6').closest('.repo-ov-item')!
    fireEvent.click(row.querySelector('.repo-ov-close')!)

    await waitFor(() => expect(container.querySelectorAll('.repo-tab').length).toBe(7))
    // 닫은 r6 은 탭 스트립에서 사라지고, 다른 탭(r5)은 유지
    expect(within(container.querySelector('.repo-tabs') as HTMLElement).queryByText('r6')).toBeNull()
    expect(within(container.querySelector('.repo-tabs') as HTMLElement).queryByText('r5')).not.toBeNull()
    // 닫기는 stopPropagation → 활성 탭(a)은 그대로
    expect(container.querySelector('.repo-tab.on')?.textContent).toContain('a')
  })

  it('(e) Escape 로 드롭다운이 닫힌다', async () => {
    forceOverflow()
    seed(overflowRepos(8), '/repo/a')
    const { container } = await renderLoaded()

    const btn = await waitFor(() => {
      const b = container.querySelector('.repo-ov-btn'); expect(b).not.toBeNull(); return b as HTMLElement
    })
    fireEvent.click(btn)
    await waitFor(() => expect(container.querySelector('.repo-ov-menu')).not.toBeNull())

    // 실제 키 이벤트는 포커스된 요소를 target 으로 window 까지 버블한다.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(container.querySelector('.repo-ov-menu')).toBeNull())
  })

  it('(e) 바깥(backdrop) 클릭으로 드롭다운이 닫힌다', async () => {
    forceOverflow()
    seed(overflowRepos(8), '/repo/a')
    const { container } = await renderLoaded()

    const btn = await waitFor(() => {
      const b = container.querySelector('.repo-ov-btn'); expect(b).not.toBeNull(); return b as HTMLElement
    })
    fireEvent.click(btn)
    await waitFor(() => expect(container.querySelector('.repo-ov-menu')).not.toBeNull())

    fireEvent.click(container.querySelector('.repo-ov-backdrop')!)
    await waitFor(() => expect(container.querySelector('.repo-ov-menu')).toBeNull())
  })

  it('(f) 활성 행 하이라이트(.on) + 숨은 행 표시(.repo-ov-hidden)', async () => {
    forceOverflow()
    seed(overflowRepos(8), '/repo/a')
    const { container } = await renderLoaded()

    const btn = await waitFor(() => {
      const b = container.querySelector('.repo-ov-btn'); expect(b).not.toBeNull(); return b as HTMLElement
    })
    fireEvent.click(btn)
    const menu = await waitFor(() => {
      const m = container.querySelector('.repo-ov-menu'); expect(m).not.toBeNull(); return m as HTMLElement
    })
    // 활성 행 = index 0 'a'
    const onRow = menu.querySelector('.repo-ov-item.on')!
    expect(within(onRow as HTMLElement).getByText('a')).toBeTruthy()
    // 숨은 탭(index 3~7) = 5개만 '탭에 안 보임' 마커를 가진다
    expect(menu.querySelectorAll('.repo-ov-hidden').length).toBe(5)
  })

  it('(a-변형) 숨은 탭이 99 초과면 카운트가 `99+` 로 축약된다', async () => {
    forceOverflow()
    seed(overflowRepos(105), '/repo/a') // 가시 3 → 숨김 102
    const { container } = await renderLoaded()

    const btn = await waitFor(() => {
      const b = container.querySelector('.repo-ov-btn'); expect(b).not.toBeNull(); return b as HTMLElement
    })
    expect(btn.querySelector('.repo-ov-count')!.textContent).toBe('99+')
    // aria-label 은 전체 개수(축약 안 함)
    expect(btn.getAttribute('aria-label')).toBe('숨은 저장소 102개 보기')
  })
})

describe('리포 탭 오버플로 — 폴백(rect mock 없음: 오탐 없음·무회귀)', () => {
  beforeEach(() => { localStorage.clear(); installGitApiMock() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

  it('기본 jsdom(레이아웃 0)에선 `▾ N` 버튼이 표시되지 않는다', async () => {
    seed(overflowRepos(16), '/repo/a')
    const { container } = await renderLoaded()

    // 16개 탭은 렌더되지만(스트립 스크롤), 측정 폴백으로 오버플로 버튼은 없음
    expect(container.querySelectorAll('.repo-tab').length).toBe(16)
    // 측정 rAF 가 돌 시간을 준 뒤에도 버튼 미표시(오탐 없음)
    await waitFor(() => expect(container.querySelectorAll('.repo-tab').length).toBe(16))
    expect(container.querySelector('.repo-ov-btn')).toBeNull()
  })

  it('폴백 상태에서도 기존 탭 동작(선택·닫기·+추가)은 무회귀', async () => {
    seed([
      { id: 'id-a', name: 'a', path: '/repo/a' },
      { id: 'id-b', name: 'b', path: '/repo/b', branch: 'develop' },
    ], '/repo/a')
    const { container } = await renderLoaded()

    // 활성 = a
    expect(container.querySelector('.repo-tab.on')?.textContent).toContain('a')
    // 탭 선택 → b 전환
    fireEvent.click(within(container.querySelector('.repo-tabs') as HTMLElement).getByText('b'))
    await waitFor(() => expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true))
    // '+' 추가 버튼 존재
    expect(container.querySelector('.repo-tab-add')).not.toBeNull()
    // 닫기 → 한 탭 제거
    fireEvent.click((container.querySelectorAll('.repo-tab-close')[0]) as Element)
    await waitFor(() => expect(container.querySelectorAll('.repo-tab').length).toBe(1))
    // 오버플로 버튼은 여전히 없음
    expect(container.querySelector('.repo-ov-btn')).toBeNull()
  })
})
