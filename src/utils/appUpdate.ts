// 앱 자동 업데이트(옵션 1: 무서명 인앱 다운로드) — 순수 로직.
//
// main 프로세스의 업데이트 체크/다운로드 IPC가 쓰는 순수 함수만 분리한다.
// 실제 네트워크(https)·electron(shell/ipc)·child_process 호출은 CI에서 검증
// 불가하므로 여기에 두지 않는다. URL 호스트 검증, .dmg 자산 추출, 진행률 계산만
// 순수 함수로 빼서 vitest로 단위검증한다.

// GitHub Releases API의 자산 1건(필요 필드만).
export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

// 'app:update-available' 페이로드 — frontend(UP2)가 소비하는 계약.
// dmgUrl이 없으면(자산에 .dmg 없음) frontend는 기존 브라우저 열기(openReleaseUrl)로 폴백한다.
export interface UpdateAvailablePayload {
  version: string
  url: string          // 릴리즈 html_url (브라우저 폴백용)
  dmgUrl?: string      // .dmg 자산 browser_download_url (있을 때만)
  notes?: string       // release body 앞부분(요약, 옵션)
}

// 다운로드 진행률 이벤트('app:update-download-progress' 채널) 페이로드.
// total을 모를 때(Content-Length 없음) pct는 생략(frontend는 indeterminate 처리).
export interface UpdateDownloadProgress {
  received: number
  total?: number
  pct?: number
}

// GitHub 릴리즈 자산 다운로드가 허용되는 호스트 화이트리스트.
// 임의 URL 다운로드(SSRF/악성 바이너리 유도)를 막기 위해 다운로드 전 반드시 검증한다.
// 부분일치(host.includes)는 `github-releases.evil.com` 같은 호스트를 통과시키므로
// 사용하지 않는다. 정확 일치 또는 `.` 앵커 접미사 일치만 허용한다.
// - 정확 일치: github.com / api.github.com / objects.githubusercontent.com
// - 접미사 일치: *.github.com / *.githubusercontent.com (raw.githubusercontent.com 등)
// - GitHub 릴리즈 자산 S3 리다이렉트(302 실제 대상):
//   `*.amazonaws.com` 이면서 호스트명에 `github-` 가 포함된 경우만
//   (예: github-production-release-asset-2e65be.s3.amazonaws.com)
const ALLOWED_UPDATE_HOSTS_EXACT = [
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
]

// `.` 앵커 접미사 — `host === suffix` 또는 `host.endsWith('.' + suffix)` 만 허용.
const ALLOWED_UPDATE_HOST_SUFFIXES = [
  'github.com',
  'githubusercontent.com',
]

// 주어진 URL이 신뢰 가능한 GitHub 릴리즈 자산 호스트인지 판정.
// https만 허용. 파싱 불가/비-https/허용 외 호스트는 false.
export function isAllowedUpdateHost(rawUrl: string): boolean {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (!host) return false

  if (ALLOWED_UPDATE_HOSTS_EXACT.includes(host)) return true

  for (const suffix of ALLOWED_UPDATE_HOST_SUFFIXES) {
    if (host === suffix || host.endsWith('.' + suffix)) return true
  }

  // GitHub 릴리즈 자산 S3 리다이렉트 대상: *.amazonaws.com + 호스트에 'github-' 포함.
  // 'github-' 는 호스트명 안에서만(경로/임의 토큰 우회 차단) 확인한다.
  if (host.endsWith('.amazonaws.com') && host.includes('github-')) return true

  return false
}

// 릴리즈 자산 목록에서 macOS DMG 자산을 1건 고른다. 없으면 null.
// - 이름이 .dmg로 끝나는(대소문자 무시) 자산만 후보.
// - 여러 개면 browser_download_url이 GitHub 호스트인 첫 자산을 우선,
//   그것도 없으면 첫 .dmg 자산. (현재 빌드는 mac dmg 단일 산출물)
export function pickDmgAsset(assets: ReleaseAsset[] | undefined | null): ReleaseAsset | null {
  if (!Array.isArray(assets)) return null
  const dmgs = assets.filter(
    a => a && typeof a.name === 'string' && a.name.toLowerCase().endsWith('.dmg')
      && typeof a.browser_download_url === 'string' && a.browser_download_url.length > 0,
  )
  if (dmgs.length === 0) return null
  const trusted = dmgs.find(a => isAllowedUpdateHost(a.browser_download_url))
  return trusted ?? dmgs[0]
}

// release body(마크다운)에서 알림에 쓸 짧은 노트를 만든다.
// 과도하게 길면 maxLen에서 자르고 말줄임표를 붙인다. 없으면 undefined.
export function buildReleaseNotes(body: string | undefined | null, maxLen = 280): string | undefined {
  if (typeof body !== 'string') return undefined
  const trimmed = body.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed.length <= maxLen) return trimmed
  return trimmed.slice(0, maxLen).trimEnd() + '…'
}

// 다운로드 진행률 계산. total(Content-Length)을 알면 0~100 정수 pct를 포함하고,
// 모르면 pct를 생략한다(indeterminate). received는 0 미만으로 내려가지 않게 보정.
export function computeDownloadProgress(received: number, total?: number): UpdateDownloadProgress {
  const safeReceived = Number.isFinite(received) && received > 0 ? Math.floor(received) : 0
  if (typeof total === 'number' && Number.isFinite(total) && total > 0) {
    const ratio = safeReceived / total
    const clamped = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio
    return { received: safeReceived, total: Math.floor(total), pct: Math.round(clamped * 100) }
  }
  return { received: safeReceived }
}

// 저장할 dmg 파일명을 만든다. URL 경로의 마지막 세그먼트(.dmg)를 쓰되,
// 안전하지 않은 문자는 제거하고, 추출 실패 시 fallback 이름을 쓴다.
// 경로 탈출(../)·디렉터리 구분자 차단.
export function safeDownloadFilename(rawUrl: string, fallback = 'GitGrove-Update.dmg'): string {
  let candidate = ''
  try {
    const u = new URL(rawUrl)
    const seg = u.pathname.split('/').filter(Boolean).pop() ?? ''
    candidate = decodeURIComponent(seg)
  } catch {
    candidate = ''
  }
  // 디렉터리 구분자/상위경로/제어문자 제거
  candidate = candidate.replace(/[/\\]/g, '').replace(/\.\.+/g, '.').trim()
  // 제어문자(코드포인트 < 0x20) 제거 — no-control-regex 회피 위해 정규식 대신 필터링
  candidate = Array.from(candidate).filter(ch => ch.charCodeAt(0) >= 0x20).join('')
  if (!candidate.toLowerCase().endsWith('.dmg')) return fallback
  return candidate
}
