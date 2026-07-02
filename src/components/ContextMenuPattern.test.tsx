import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { ContextMenu } from './ContextMenu'
import { BranchContextMenu } from './BranchContextMenu'
import type { Commit } from '../data/mockData'

const COMMIT: Commit = {
  id: 'a1f3c9d', lane: 0, msg: '테스트 커밋', author: '서', time: '방금',
  parents: [], labels: [], stats: { f: 1, a: 1, d: 0 }, files: [],
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('컨텍스트 메뉴 패턴 — 커밋(ContextMenu)', () => {
  it('한국어 라벨을 렌더한다', () => {
    render(<ContextMenu x={10} y={10} commit={COMMIT} onClose={() => {}} onAction={() => {}} />)
    for (const l of ['해시 복사', '메시지 복사', '체리픽', '되돌리기 (revert)', '여기로 리셋', '여기서 브랜치', '여기에 태그', '대화형 리베이스']) {
      expect(screen.getByText(l)).toBeTruthy()
    }
  })

  it('커밋 메뉴는 대상 헤더(.ctx-head)가 없다', () => {
    const { container } = render(<ContextMenu x={10} y={10} commit={COMMIT} onClose={() => {}} onAction={() => {}} />)
    expect(container.querySelector('.ctx-head')).toBeNull()
  })

  it('여기로 리셋 hover 시 soft/mixed/hard 서브메뉴 행이 뜨고 hard는 danger', () => {
    const onAction = vi.fn()
    render(<ContextMenu x={10} y={10} commit={COMMIT} onClose={() => {}} onAction={onAction} />)
    fireEvent.mouseEnter(screen.getByText('여기로 리셋').closest('.ctx-item')!)
    expect(screen.getByText('스테이지 유지')).toBeTruthy()
    expect(screen.getByText('언스테이지')).toBeTruthy()
    const hardRow = screen.getByText('모두 버림').closest('.ctx-sub-row')!
    expect(hardRow.className).toContain('danger')
    fireEvent.mouseDown(hardRow)
    expect(onAction).toHaveBeenCalledWith('reset-hard')
  })
})

describe('컨텍스트 메뉴 패턴 — 브랜치(BranchContextMenu)', () => {
  it('대상 헤더에 이름 + local 배지를 보여준다', () => {
    const { container } = render(
      <BranchContextMenu x={10} y={10} branchName="feature/sync-hud" branchType="local" isCurrent={false} onClose={() => {}} onAction={() => {}} />,
    )
    const head = container.querySelector('.ctx-head') as HTMLElement
    expect(head).toBeTruthy()
    expect(within(head).getByText('feature/sync-hud')).toBeTruthy()
    expect(within(head).getByText('local')).toBeTruthy()
  })

  it('로컬 메뉴는 위험 항목(삭제)이 맨 아래에 온다', () => {
    const { container } = render(
      <BranchContextMenu x={10} y={10} branchName="dev" branchType="local" isCurrent={false} onClose={() => {}} onAction={() => {}} />,
    )
    const items = Array.from(container.querySelectorAll('.ctx-menu .ctx-item')) as HTMLElement[]
    const last = items[items.length - 1]
    expect(last.textContent).toContain('삭제')
    expect(last.className).toContain('danger')
    // 이름 복사는 삭제보다 위에 있어야 한다(위험은 항상 맨 아래)
    const copyIdx = items.findIndex(i => i.textContent?.includes('이름 복사'))
    const delIdx = items.findIndex(i => i.textContent?.includes('삭제'))
    expect(copyIdx).toBeGreaterThanOrEqual(0)
    expect(copyIdx).toBeLessThan(delIdx)
  })

  it('현재 브랜치면 체크아웃이 비활성(pointerEvents:none)', () => {
    render(
      <BranchContextMenu x={10} y={10} branchName="main" branchType="local" isCurrent onClose={() => {}} onAction={() => {}} />,
    )
    const checkout = screen.getByText('체크아웃').closest('.ctx-item') as HTMLElement
    expect(checkout.style.pointerEvents).toBe('none')
  })
})
