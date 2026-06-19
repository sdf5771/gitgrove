import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfirmModal } from './ConfirmModal'

// ──────────────────────────────────────────────────────────────
// 확인 다이얼로그 투명 버그 회귀 가드
//
// 다이얼로그 박스 배경이 미정의 CSS 변수(--c-bg-panel)를 참조하면
// fallback이 없어 투명해지고 뒤 UI가 비쳐 보인다.
// jsdom은 CSS 변수를 계산하지 않으므로 시각 회귀는 어렵다.
// 인라인 style의 background가 정의된 불투명 변수를 참조하는지만 단언한다.
// ──────────────────────────────────────────────────────────────
describe('ConfirmModal 배경 불투명 가드', () => {
  afterEach(() => {
    cleanup()
  })

  it('다이얼로그 박스 배경이 미정의 --c-bg-panel을 참조하지 않는다', () => {
    render(
      <ConfirmModal
        title="제거할까요"
        message="정말 진행할까요"
        confirmLabel="제거"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    const box = screen.getByText('제거할까요').parentElement as HTMLElement
    const bg = box.style.background

    expect(bg).not.toContain('--c-bg-panel')
    expect(bg).toContain('--c-bg-surface')
  })
})
