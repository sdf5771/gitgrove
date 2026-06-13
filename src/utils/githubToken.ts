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
      if (stored) return stored
      // safeStorage가 비어 있고 평문 미러가 남아 있으면(업그레이드 첫 실행 등)
      // 읽는 시점에 자가 마이그레이션: safeStorage로 이관 후 평문 삭제.
      // → 사용자가 Settings를 열기 전에도 토큰이 즉시 동작하고 평문도 정리된다.
      let plain = ''
      try { plain = localStorage.getItem(GITHUB_TOKEN_KEY) ?? '' } catch { plain = '' }
      if (plain) {
        try {
          const ok = await window.appAPI.githubSetToken(plain)
          if (ok) { try { localStorage.removeItem(GITHUB_TOKEN_KEY) } catch { /* ignore */ } }
        } catch { /* 이관 실패 시 plain 반환으로 동작 보존 */ }
      }
      return plain
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
