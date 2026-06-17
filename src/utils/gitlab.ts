// GitLab 관련 공용 유틸 (순수 함수) — github.ts 대응
//
// self-hosted + gitlab.com 다중 인스턴스를 동시에 지원하므로 host가 가변이다.
// 이 파일은 host 정규화 / remote URL 파싱 / access_level→role 매핑만 담당하며,
// electron main(IPC 토큰 저장)과 gitlabClient(요청 구성)에서 import해 쓴다.
// 네트워크/electron 의존성 없음 → vitest로 단위테스트.

/**
 * GitLab host 입력을 저장/조회 키로 쓸 표준형으로 정규화한다.
 * - 스킴 없으면 https:// 부여 (http:// 는 그대로 보존 — 사내 self-hosted 대비)
 * - host(authority)는 소문자화, trailing slash·경로·쿼리·해시 제거
 * - 빈 입력은 빈 문자열 반환(호출부가 검증)
 *
 * 예) "GitLab.com/" → "https://gitlab.com"
 *     "gitlab.example.com:8443/path" → "https://gitlab.example.com:8443"
 *     "http://gl.internal" → "http://gl.internal"
 */
export function normalizeGitlabHost(input: string): string {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return ''
  // 스킴 보정: http(s)가 아니면 https 강제. 그 외 스킴은 무시하고 https.
  let withScheme = trimmed
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//)
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase()
    if (scheme !== 'http' && scheme !== 'https') {
      withScheme = `https://${trimmed.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')}`
    }
  } else {
    withScheme = `https://${trimmed}`
  }
  try {
    const u = new URL(withScheme)
    const scheme = (u.protocol === 'http:' ? 'http' : 'https')
    // host(authority)는 소문자, 포트 보존. 경로/쿼리/해시 버림.
    return `${scheme}://${u.host.toLowerCase()}`
  } catch {
    // URL 파싱 실패 시 수동 폴백: 스킴 분리 후 첫 세그먼트만.
    const noScheme = withScheme.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
    const hostOnly = noScheme.split(/[/?#]/)[0].toLowerCase()
    const scheme = withScheme.startsWith('http://') ? 'http' : 'https'
    return hostOnly ? `${scheme}://${hostOnly}` : ''
  }
}

export interface GitLabRepoInfo {
  /** 정규화된 host (예: "https://gitlab.com") */
  host: string
  /** namespace + project 전체 경로 (예: "group/subgroup/project") */
  fullPath: string
  /** project를 제외한 상위 경로 (예: "group/subgroup"). 최상위면 빈 문자열 불가 — GitLab은 최소 1단계 namespace */
  namespace: string
  /** 마지막 세그먼트 (예: "project") */
  project: string
}

/**
 * GitLab remote URL → { host, fullPath, namespace, project }.
 * 임의 host(gitlab.com + self-hosted) / https / ssh 모두 지원.
 * GitLab은 서브그룹으로 namespace가 다단계일 수 있다(`group/subgroup/project`).
 * fullPath의 마지막 세그먼트가 project, 나머지가 namespace.
 * 형식이 안 맞거나 namespace가 없으면(project만) null.
 *
 * 지원 형식:
 *   - https://gitlab.com/group/sub/proj.git
 *   - https://gl.internal:8443/group/proj
 *   - git@gitlab.com:group/sub/proj.git
 *   - ssh://git@gl.internal:2222/group/proj.git
 */
export function parseGitLabRepo(remoteUrl: string): GitLabRepoInfo | null {
  const raw = (remoteUrl ?? '').trim()
  if (!raw) return null

  let host = ''
  let pathPart = ''

  // scp-like ssh: git@host:group/sub/proj.git  (스킴 없음, host와 path를 ':'로 구분)
  const scpMatch = raw.match(/^[^@/]+@([^:/]+(?::\d+)?):(.+)$/)
  // ssh:// 또는 http(s):// 형식
  const schemeMatch = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//)

  if (schemeMatch) {
    try {
      const u = new URL(raw)
      const scheme = u.protocol === 'http:' ? 'http' : 'https'
      host = `${scheme}://${u.host.toLowerCase()}`
      pathPart = u.pathname
    } catch {
      return null
    }
  } else if (scpMatch) {
    const authority = scpMatch[1].toLowerCase()
    host = `https://${authority}`
    pathPart = scpMatch[2]
  } else {
    return null
  }

  // path 정리: 앞 슬래시·.git·trailing slash 제거
  const fullPath = pathPart
    .replace(/^\/+/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')

  if (!fullPath) return null
  const segments = fullPath.split('/').filter(Boolean)
  // namespace 1단계 + project 1단계 = 최소 2 세그먼트 필요
  if (segments.length < 2) return null

  const project = segments[segments.length - 1]
  const namespace = segments.slice(0, -1).join('/')
  return { host, fullPath: segments.join('/'), namespace, project }
}

/** host 문자열에서 authority(host:port)만 추출. 스킴/경로 제거, 소문자. */
function hostAuthority(host: string): string {
  return host.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/\/+$/, '')
}

/** authority에서 포트를 떼고 hostname만. */
function hostnameOnly(authority: string): string {
  // IPv6([::1]:443)은 본 앱 범위 밖 — 일반 host:port만 처리.
  const i = authority.lastIndexOf(':')
  return i > 0 ? authority.slice(0, i) : authority
}

/**
 * 활성 레포 origin에서 파싱한 GitLab host(`parseGitLabRepo(...).host`)를 연결된
 * 인스턴스 host 목록(`gitlabListHosts()` — normalizeGitlabHost 키)과 매칭한다.
 *
 * 1순위: authority(host:port) 완전 일치(스킴/trailing slash 무시).
 * 2순위: hostname(포트 제외) 일치가 **유일**하면 그 host. — SSH remote가
 *   `ssh://git@gl.internal:2222/...`처럼 SSH 포트를 host에 싣는 경우, 저장된
 *   API host(`https://gl.internal`)와 포트가 달라 1순위가 실패하므로 보정.
 *   동일 hostname에 포트가 다른 인스턴스가 둘 이상 연결된 경우(희귀)엔 모호하므로
 *   2순위를 적용하지 않는다(잘못된 인스턴스 매칭 방지).
 *
 * @returns 매칭된 연결 host(목록 원본 문자열) 또는 null
 */
export function matchGitlabHost(connectedHosts: string[], repoHost: string): string | null {
  if (!repoHost) return null
  const target = hostAuthority(repoHost)
  if (!target) return null

  // 1순위: authority 완전 일치
  const exact = connectedHosts.find(h => hostAuthority(h) === target)
  if (exact) return exact

  // 2순위: hostname(포트 제외) 일치가 유일할 때만
  const targetName = hostnameOnly(target)
  const byName = connectedHosts.filter(h => hostnameOnly(hostAuthority(h)) === targetName)
  if (byName.length === 1) return byName[0]

  return null
}

/**
 * GitLab 파이프라인/MR 머지 상태 문자열 → MR 뷰의 파이프라인 배지 상태.
 * 디자인 매핑: pass(녹색) / fail(빨강) / run(info 블루, 스핀) / pend(회색).
 *  - success/manual → pass
 *  - failed → fail
 *  - running → run
 *  - 그 외(pending/created/scheduled/preparing/waiting_for_resource/canceled/skipped/없음) → pend
 * GitLab pipeline running은 **주황이 아니라 info 블루**로 표기한다.
 */
export type PipeState = 'pass' | 'fail' | 'run' | 'pend'
export function pipelineStatusToPipe(status?: string | null): PipeState {
  switch ((status ?? '').toLowerCase()) {
    case 'success':
    case 'manual':
      return 'pass'
    case 'failed':
      return 'fail'
    case 'running':
      return 'run'
    default:
      return 'pend'
  }
}

/**
 * GitLab access_level 숫자 → 역할 라벨.
 * 10 Guest / 20 Reporter / 30 Developer / 40 Maintainer / 50 Owner.
 * null/undefined 또는 10 미만(No access=0)은 null(배지 숨김 — github permissionToRole 대응).
 */
export function accessLevelToRole(level?: number | null): string | null {
  if (level == null || !Number.isFinite(level)) return null
  if (level >= 50) return 'Owner'
  if (level >= 40) return 'Maintainer'
  if (level >= 30) return 'Developer'
  if (level >= 20) return 'Reporter'
  if (level >= 10) return 'Guest'
  return null
}
