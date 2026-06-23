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

// ── 기존 사용자 감지 ───────────────────────────────────────────────
// 온보딩은 "첫 실행" 전용이다. v1.20.0 이전 사용자에겐 onboarding-seen 키가
// 없어, 업데이트 직후 기존 사용자에게도 온보딩이 떠버린다.
// localStorage에 남은 "기존 사용 흔적"으로 기존 사용자를 동기 판정한다.
// (safeStorage 토큰·GitLab 호스트 등 비동기 신호는 App 마운트 effect에서 보완.)

// 비어있지 않은 JSON 배열이 들어있는 키인지 확인한다.
function hasNonEmptyArray(key: string): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0
  } catch {
    return false
  }
}

// 비어있지 않은 값이 들어있는 키인지 확인한다.
function hasValue(key: string): boolean {
  try {
    const raw = localStorage.getItem(key)
    return raw != null && raw !== '' && raw !== '{}' && raw !== '[]'
  } catch {
    return false
  }
}

// localStorage 동기 신호로 기존 사용자인지 판정한다.
// 다음 중 하나라도 있으면 기존 사용자(= 온보딩 미노출).
//  - gitgrove:repos 가 비어있지 않은 배열
//  - gitgrove:githubToken 존재(레거시 평문)
//  - gitgrove:settings 존재
//  - gitgrove:recentRepos / workspaces / favoriteRepos 등 기존 사용 흔적
export function hasExistingUserData(): boolean {
  return (
    hasNonEmptyArray('gitgrove:repos') ||
    hasValue('gitgrove:githubToken') ||
    hasValue('gitgrove:settings') ||
    hasNonEmptyArray('gitgrove:recentRepos') ||
    hasNonEmptyArray('gitgrove:workspaces') ||
    hasNonEmptyArray('gitgrove:favoriteRepos')
  )
}

// 비동기 신호(safeStorage GitHub 토큰·GitLab 호스트)로도 기존 사용자인지 확인한다.
// App 마운트 effect에서 호출 — 동기 판정이 신규로 나왔지만 비동기로 기존
// 사용자임이 드러나는 경우(평문 토큰을 safeStorage로 이미 이관 등)를 보완한다.
export async function hasExistingUserDataAsync(): Promise<boolean> {
  try {
    const token = await window.appAPI?.githubGetToken()
    if (token) return true
  } catch { /* ignore */ }
  try {
    const hosts = await window.appAPI?.gitlabListHosts()
    if (hosts && hosts.length > 0) return true
  } catch { /* ignore */ }
  return false
}

// 온보딩을 띄울지 최종 판정한다(동기).
// 진짜 신규(온보딩 미시청 + 기존 사용 흔적 없음)만 노출한다.
export function shouldShowOnboarding(): boolean {
  return !hasSeenOnboarding() && !hasExistingUserData()
}
