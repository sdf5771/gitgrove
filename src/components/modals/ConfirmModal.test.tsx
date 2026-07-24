import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConfirmModal } from './ConfirmModal'

// ──────────────────────────────────────────────────────────────
// 확인 다이얼로그 투명 버그 회귀 가드
//
// 다이얼로그 박스 배경이 투명하면 뒤 UI가 비쳐 보인다.
// 패턴 시트 정본화 이후 박스는 .modal-box 클래스로 불투명 --c-bg-surface를
// 받는다(인라인 배경 없음). 박스가 정본 클래스를 다는지 단언해 회귀를 막는다.
// ──────────────────────────────────────────────────────────────
describe('ConfirmModal 정본 골격 가드', () => {
  afterEach(() => {
    cleanup()
  })

  it('다이얼로그 박스가 불투명 배경을 주는 .modal-box 골격을 쓴다', () => {
    render(
      <ConfirmModal
        title="제거할까요"
        message="정말 진행할까요"
        confirmLabel="제거"
        danger
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    const box = screen.getByText('제거할까요').closest('.modal-box') as HTMLElement
    expect(box).not.toBeNull()
    expect(box.className).toContain('modal-box')
    // 인라인 배경으로 투명해지지 않는다(배경은 .modal-box 클래스가 담당).
    expect(box.style.background).toBe('')
  })

  it('취소 버튼은 한국어다', () => {
    render(
      <ConfirmModal title="삭제할까요" message="진행할까요" onConfirm={() => {}} onCancel={() => {}} />,
    )
    expect(screen.getByText('취소')).toBeTruthy()
  })

  it('Escape는 onCancel을 부르고 onConfirm은 부르지 않는다', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmModal title="머지할까요" message="진행할까요" onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
