// win-maximize 토글의 순수 결정 로직 (IPC/Electron 의존 제거 → 단위테스트 가능)
//
// 패키징된 prod 앱(고유 번들ID)에선 macOS 윈도우 상태복원/zoom과 맞물려 한 번의
// 클릭이 maximize↔unmaximize를 여러 번 토글해 창이 "커졌다 줄었다" 반복하는 문제가
// 보고됨(dev는 Electron 기본 번들ID라 미발생). 짧은 잠금으로 연속 토글을 한 번으로
// 묶고(코얼레싱), 풀스크린이면 먼저 해제한다.
//
// ⚠️ 오실레이션 자체는 prod NSWindow 동작이라 jsdom/단위테스트로 재현 불가.
// 여기서는 "주어진 창 상태 + 잠금 상태"에서 어떤 단일 액션을 취할지의 결정만 검증한다.

export type MaximizeAction = 'none' | 'exit-fullscreen' | 'maximize' | 'unmaximize'

export interface WinState {
  /** 토글 잠금 중인지(직전 입력 후 잠금창 내) */
  locked: boolean
  isFullScreen: boolean
  isMaximized: boolean
}

/**
 * win-maximize 클릭 시 취할 단일 액션을 결정한다.
 * - 잠금 중이면 무시('none').
 * - 풀스크린이면 먼저 해제만('exit-fullscreen').
 * - 최대화 상태면 해제, 아니면 최대화.
 *
 * 호출부는 'none'이 아닐 때 잠금을 켜고 일정 시간 후 해제한다(코얼레싱).
 */
export function decideMaximizeAction(s: WinState): MaximizeAction {
  if (s.locked) return 'none'
  if (s.isFullScreen) return 'exit-fullscreen'
  if (s.isMaximized) return 'unmaximize'
  return 'maximize'
}
