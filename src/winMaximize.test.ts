import { describe, it, expect } from 'vitest'
import { decideMaximizeAction } from '../electron/winMaximize'

// 신호등(트래픽 라이트) 최대화 버튼의 순수 토글 결정 로직.
// ⚠️ prod NSWindow 오실레이션 자체는 단위테스트로 재현 불가 — 여기서는
// "창 상태 + 잠금"에서 단일 액션을 올바르게 고르는지(코얼레싱·풀스크린 해제)만 검증.
describe('decideMaximizeAction (win-maximize 순수 로직)', () => {
  it('잠금 중이면 아무 것도 하지 않음(연속 토글 코얼레싱)', () => {
    expect(decideMaximizeAction({ locked: true, isFullScreen: false, isMaximized: false })).toBe('none')
    expect(decideMaximizeAction({ locked: true, isFullScreen: true, isMaximized: true })).toBe('none')
  })

  it('풀스크린이면 먼저 해제만(maximize/unmaximize 금지)', () => {
    expect(decideMaximizeAction({ locked: false, isFullScreen: true, isMaximized: false })).toBe('exit-fullscreen')
    // 풀스크린 우선순위가 maximized보다 높다
    expect(decideMaximizeAction({ locked: false, isFullScreen: true, isMaximized: true })).toBe('exit-fullscreen')
  })

  it('최대화 상태면 해제', () => {
    expect(decideMaximizeAction({ locked: false, isFullScreen: false, isMaximized: true })).toBe('unmaximize')
  })

  it('기본(비최대·비풀스크린)이면 최대화', () => {
    expect(decideMaximizeAction({ locked: false, isFullScreen: false, isMaximized: false })).toBe('maximize')
  })
})
