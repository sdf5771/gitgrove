import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Geuru } from './Geuru'
import { BASE, PAL, EXP, spriteCells, type GeuruExpr } from '../utils/geuruSprite'

// 디자인 정본의 renderSprite와 동일하게: 패치 적용 후 '색이 있는' 셀 수를 직접 센다.
function expectedRectCount(expr: GeuruExpr): number {
  const patch = EXP[expr]
  let n = 0
  for (let y = 0; y < BASE.length; y++) {
    for (let x = 0; x < BASE[y].length; x++) {
      const ch = patch[`${y},${x}`] !== undefined ? patch[`${y},${x}`] : BASE[y][x]
      if (PAL[ch]) n++
    }
  }
  return n
}

const ALL_EXPR: GeuruExpr[] = ['idle', 'happy', 'think', 'merge', 'conflict', 'sleepy', 'blink']

describe('Geuru sprite', () => {
  it('BASE 그리드는 16×18 정본 치수를 유지한다', () => {
    expect(BASE).toHaveLength(18)
    for (const row of BASE) expect(row).toHaveLength(16)
  })

  it.each(ALL_EXPR)('표정 %s 의 rect 개수가 정본과 일치한다', expr => {
    const { container } = render(<Geuru expr={expr} scale={2} />)
    const rects = container.querySelectorAll('rect')
    expect(rects.length).toBe(expectedRectCount(expr))
    expect(rects.length).toBeGreaterThan(0)
  })

  it('rect 는 픽셀 틈 방지를 위해 width/height=1.02 를 쓴다', () => {
    const { container } = render(<Geuru expr="idle" scale={3} />)
    const first = container.querySelector('rect')!
    expect(first.getAttribute('width')).toBe('1.02')
    expect(first.getAttribute('height')).toBe('1.02')
  })

  it('SVG 는 crispEdges + sprite 클래스 + scale 반영 치수를 갖는다', () => {
    const { container } = render(<Geuru expr="idle" scale={2} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges')
    expect(svg.classList.contains('sprite')).toBe(true)
    expect(svg.getAttribute('width')).toBe(String(16 * 2))
    expect(svg.getAttribute('height')).toBe(String(18 * 2))
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 18')
  })

  it('happy 표정은 눈(네이비 #10182b)과 입(#7a4412)·볼터치(#ff9b6b) 픽셀을 포함한다', () => {
    const fills = new Set(spriteCells(EXP.happy).map(c => c.fill))
    expect(fills.has('#10182b')).toBe(true) // 눈
    expect(fills.has('#7a4412')).toBe(true) // 입
    expect(fills.has('#ff9b6b')).toBe(true) // 볼터치
  })

  it('conflict 표정은 땀(#5fb8e6) 픽셀을 포함한다', () => {
    const fills = spriteCells(EXP.conflict).map(c => c.fill)
    expect(fills).toContain('#5fb8e6')
  })

  it('title 이 주어지면 접근성 라벨(role=img)을 노출한다', () => {
    const { container } = render(<Geuru expr="merge" title="그루 — 머지" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toBe('그루 — 머지')
    expect(container.querySelector('title')?.textContent).toBe('그루 — 머지')
  })

  it('title 이 없으면 aria-hidden 으로 장식 처리된다', () => {
    const { container } = render(<Geuru expr="idle" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })
})
