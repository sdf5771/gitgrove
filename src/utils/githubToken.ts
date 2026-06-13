// GitHub 토큰 조회 공용 헬퍼.
//
// 우선순위: safeStorage(OS 키체인) 사용 가능 → IPC로 비동기 조회,
// 미가용 환경 → localStorage 평문 fallback.
//
// 평문 localStorage 미러를 제거(F1, v1.7.0)하면서 소비자가 동기 조회 대신
// 이 비동기 헬퍼를 사용하도록 일원화한다. 토큰 소비자는 마운트 시점 및
// `gitgrove:settings-changed` 이벤트 시 이 함수로 토큰을 읽어 state에 보관한다.

const GITHUB_TOKEN_KEY = 'gitgrove:githubToken'

export async function getGithubToken(): Promise<string> {
  try {
    if (await window.appAPI?.githubIsEncryptionAvailable()) {
      const stored = await window.appAPI.githubGetToken()
      return stored ?? ''
    }
  } catch {
    /* safeStorage 미가용/오류 시 fallback */
  }
  // safeStorage 미가용 환경: localStorage 평문 fallback
  try {
    return localStorage.getItem(GITHUB_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}
