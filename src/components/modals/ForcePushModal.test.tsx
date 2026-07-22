import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ForcePushModal } from './ForcePushModal'

// ForcePushModal: non-fast-forward 로 push 가 거부됐을 때 뜨는 안전 확인 모달.
// 세 갈래 콜백(먼저 받기=onPull · 강제 푸시=onForce · 취소=onCancel)과 경고 문구 노출을 검증.

function setup(props?: Partial<Parameters<typeof ForcePushModal>[0]>) {
  const onPull = vi.fn()
  const onForce = vi.fn()
  const onCancel = vi.fn()
  const utils = render(<ForcePushModal onPull={onPull} onForce={onForce} onCancel={onCancel} {...props} />)
  return { onPull, onForce, onCancel, ...utils }
}

afterEach(cleanup)

describe('ForcePushModal', () => {
  it('제목·안내·강제 푸시 경고 문구를 노출한다', () => {
    setup()
    expect(screen.getByText('Push가 거부됐어요')).toBeTruthy()
    // 안내: 원격에 내게 없는 커밋이 있어 거부됨 (텍스트가 <br>로 나뉘므로 부분 매칭).
    expect(screen.getByText(/원격에 내게 없는 커밋이 있어/)).toBeTruthy()
    // 파괴적 경고 스트립.
    expect(screen.getByText('강제 푸시는 원격 이력을 덮어써요')).toBeTruthy()
    expect(screen.getByText(/force-with-lease가 남의 새 커밋은 막아 주지만/)).toBeTruthy()
  })

  it('branch prop 이 주어지면 안내에 브랜치명을 덧붙인다', () => {
    setup({ branch: 'feature/x' })
    expect(screen.getByText(/feature\/x/)).toBeTruthy()
  })

  it('"먼저 받기(Pull)" 클릭 시 onPull 만 호출', async () => {
    const user = userEvent.setup()
    const { onPull, onForce, onCancel } = setup()
    await user.click(screen.getByRole('button', { name: /먼저 받기/ }))
    expect(onPull).toHaveBeenCalledTimes(1)
    expect(onForce).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('"강제 푸시" 클릭 시 onForce 만 호출(force-with-lease 확정)', async () => {
    const user = userEvent.setup()
    const { onPull, onForce, onCancel } = setup()
    await user.click(screen.getByRole('button', { name: '강제 푸시' }))
    expect(onForce).toHaveBeenCalledTimes(1)
    expect(onPull).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('"취소" 버튼 클릭 시 onCancel 호출', async () => {
    const user = userEvent.setup()
    const { onCancel } = setup()
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('× 닫기 버튼 클릭 시 onCancel 호출', async () => {
    const user = userEvent.setup()
    const { onCancel } = setup()
    await user.click(screen.getByRole('button', { name: '×' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('배경(백드롭) 클릭 시 onCancel, 박스 내부 클릭은 닫지 않음', async () => {
    const user = userEvent.setup()
    const { onCancel } = setup()
    // 박스 내부(제목) 클릭 — 전파 차단으로 닫히지 않아야.
    await user.click(screen.getByText('Push가 거부됐어요'))
    expect(onCancel).not.toHaveBeenCalled()
  })
})
