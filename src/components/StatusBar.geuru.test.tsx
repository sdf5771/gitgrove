import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StatusBar } from './StatusBar'
import { spriteCells, EXP } from '../utils/geuruSprite'

describe('StatusBar 그루', () => {
  it('좌측 끝에 .geuru-status 컨테이너로 그루를 렌더한다', () => {
    const { container } = render(
      <StatusBar branch="main" onSettings={() => {}} geuruState="sleepy" />,
    )
    const slot = container.querySelector('.geuru-status')
    expect(slot).not.toBeNull()
    expect(slot!.querySelector('svg.sprite')).not.toBeNull()
    // 상태바는 첫 자식이 그루여야 한다(디자인 좌측 끝).
    expect(container.querySelector('.sbar')!.firstElementChild).toBe(slot)
  })

  it('geuruState 가 표정에 1:1 매핑된다 (conflict → conflict rect 수)', () => {
    const { container } = render(
      <StatusBar branch="main" onSettings={() => {}} geuruState="conflict" />,
    )
    const rects = container.querySelectorAll('.geuru-status rect')
    expect(rects.length).toBe(spriteCells(EXP.conflict).length)
  })

  it('geuruState 미지정 시 기본 idle 로 그루를 표시한다', () => {
    const { container } = render(<StatusBar branch="main" onSettings={() => {}} />)
    const rects = container.querySelectorAll('.geuru-status rect')
    expect(rects.length).toBe(spriteCells(EXP.idle).length)
  })
})
