// 네트워크 도달 실패(인스턴스가 망 밖/다운) 판별. fetch TypeError('Failed to
// fetch')와 타임아웃 AbortError는 401/403 같은 API 응답 에러와 구분한다. 도달
// 실패는 '연결이 끊긴 것'이 아니라 '지금 닿지 않는 것'으로 소프트 처리해 저장된
// 토큰을 보존한다(자동 해제 금지).
export function isUnreachableError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof TypeError) return true
  if (err instanceof Error && err.name === 'AbortError') return true
  return false
}
