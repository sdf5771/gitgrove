// 원격 URL을 분석해 인증 방식(askpass 주입 대상 여부)과 host를 뽑아내는 순수 로직.
//
// 배경: git push/pull/fetch 는 provider(GitHub/GitLab) 구분 없이 그 저장소의 origin 으로
// 그대로 실행된다. 인증은 git 에 위임되는데, HTTPS 원격은 OS 자격증명 헬퍼(키체인)에만
// 의존해 왔다 → 앱이 설정에 저장한 GitLab/GitHub 토큰이 push 에 전혀 안 실려 "GitLab 만
// 푸시가 안 되는" 증상이 났다. 이 모듈은 원격이 HTTPS 인지(=토큰을 GIT_ASKPASS 로
// 주입할 수 있는지)와 host 를 판정해, main 프로세스가 host 별 저장 토큰을 붙이도록 돕는다.
// SSH 원격은 키 인증이라 askpass 대상이 아니다.

export type RemoteScheme = 'https' | 'http' | 'ssh' | 'other'

export interface RemoteUrlInfo {
  scheme: RemoteScheme
  // http(s) 원격의 host(소문자, 포트 포함 가능). askpass 대상이 아니면 ''.
  host: string
}

// 원격 URL → 스킴/host. 파싱 실패나 빈 값이면 scheme:'other', host:''.
export function parseRemoteUrl(url: string): RemoteUrlInfo {
  const raw = (url ?? '').trim()
  if (!raw) return { scheme: 'other', host: '' }

  // scp 형식 SSH: user@host:path (스킴 없음, host 뒤 ':' + 경로). ':' 앞에 '//' 없음.
  //   예) git@github.com:owner/repo.git
  if (/^[^@/\s]+@[^:/\s]+:/.test(raw) && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
    return { scheme: 'ssh', host: '' }
  }

  const schemeMatch = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//)
  if (!schemeMatch) return { scheme: 'other', host: '' }
  const scheme = schemeMatch[1].toLowerCase()

  if (scheme === 'ssh' || scheme === 'git') return { scheme: 'ssh', host: '' }
  if (scheme !== 'http' && scheme !== 'https') return { scheme: 'other', host: '' }

  try {
    const u = new URL(raw)
    // u.host = hostname[:port], userinfo 제외. 소문자 정규화.
    return { scheme, host: u.host.toLowerCase() }
  } catch {
    // URL 파싱 실패 폴백: 스킴 제거 후 userinfo·경로 분리.
    const noScheme = raw.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
    const afterUser = noScheme.includes('@') ? noScheme.slice(noScheme.indexOf('@') + 1) : noScheme
    const host = afterUser.split(/[/?#]/)[0].toLowerCase()
    return host ? { scheme, host } : { scheme: 'other', host: '' }
  }
}

// host 가 GitHub(.com) 인지. GitHub Enterprise 는 앱이 토큰을 관리하지 않으므로 제외.
export function isGithubHost(host: string): boolean {
  const h = (host ?? '').toLowerCase()
  return h === 'github.com' || h === 'www.github.com'
}
