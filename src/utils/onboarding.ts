// 첫 실행 온보딩("첫 경험") 노출 여부 게이팅.
// 다른 gitgrove:* 키들과 동일한 try/catch 안전 패턴(repoStore.ts 참고).
// 단순 boolean 게이팅 — 버전 IPC는 신설하지 않는다.

const ONBOARDING_KEY = 'gitgrove:onboarding-seen'

// 온보딩을 이미 봤는지(완료/스킵) 확인한다. 저장소 접근 실패 시 false로 폴백한다.
export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1'
  } catch {
    return false
  }
}

// 온보딩을 본 것으로 표시한다(완료·스킵·Esc 등 모든 종료 경로에서 호출).
export function markOnboardingSeen(): void {
  try { localStorage.setItem(ONBOARDING_KEY, '1') } catch { /* ignore */ }
}
