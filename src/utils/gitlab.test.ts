import { describe, it, expect } from 'vitest'
import { normalizeGitlabHost, parseGitLabRepo, accessLevelToRole, pipelineStatusToPipe, matchGitlabHost } from './gitlab'

describe('normalizeGitlabHost', () => {
  it('스킴 없으면 https 부여 + trailing slash 제거', () => {
    expect(normalizeGitlabHost('gitlab.com')).toBe('https://gitlab.com')
    expect(normalizeGitlabHost('gitlab.com/')).toBe('https://gitlab.com')
  })

  it('host를 소문자화', () => {
    expect(normalizeGitlabHost('GitLab.COM')).toBe('https://gitlab.com')
  })

  it('경로/쿼리/해시를 버리고 authority만 남김', () => {
    expect(normalizeGitlabHost('https://gitlab.example.com/group/proj?x=1#y'))
      .toBe('https://gitlab.example.com')
  })

  it('포트를 보존', () => {
    expect(normalizeGitlabHost('gitlab.example.com:8443/path'))
      .toBe('https://gitlab.example.com:8443')
  })

  it('http:// 는 보존(사내 self-hosted)', () => {
    expect(normalizeGitlabHost('http://gl.internal')).toBe('http://gl.internal')
  })

  it('https:// 명시도 그대로 정규화', () => {
    expect(normalizeGitlabHost('https://gitlab.com/')).toBe('https://gitlab.com')
  })

  it('비-http 스킴은 https로 강제', () => {
    expect(normalizeGitlabHost('ftp://gitlab.com')).toBe('https://gitlab.com')
  })

  it('공백/빈 입력은 빈 문자열', () => {
    expect(normalizeGitlabHost('')).toBe('')
    expect(normalizeGitlabHost('   ')).toBe('')
  })

  it('앞뒤 공백 trim', () => {
    expect(normalizeGitlabHost('  gitlab.com  ')).toBe('https://gitlab.com')
  })
})

describe('parseGitLabRepo', () => {
  it('https gitlab.com 단일 namespace', () => {
    expect(parseGitLabRepo('https://gitlab.com/group/proj.git')).toEqual({
      host: 'https://gitlab.com',
      fullPath: 'group/proj',
      namespace: 'group',
      project: 'proj',
    })
  })

  it('https .git 없이도 파싱', () => {
    expect(parseGitLabRepo('https://gitlab.com/group/proj')).toEqual({
      host: 'https://gitlab.com',
      fullPath: 'group/proj',
      namespace: 'group',
      project: 'proj',
    })
  })

  it('서브그룹(다단계 namespace)', () => {
    expect(parseGitLabRepo('https://gitlab.com/group/subgroup/proj.git')).toEqual({
      host: 'https://gitlab.com',
      fullPath: 'group/subgroup/proj',
      namespace: 'group/subgroup',
      project: 'proj',
    })
  })

  it('self-hosted https + 포트', () => {
    expect(parseGitLabRepo('https://gl.internal:8443/team/app.git')).toEqual({
      host: 'https://gl.internal:8443',
      fullPath: 'team/app',
      namespace: 'team',
      project: 'app',
    })
  })

  it('self-hosted http 보존', () => {
    expect(parseGitLabRepo('http://gl.internal/team/app.git')).toEqual({
      host: 'http://gl.internal',
      fullPath: 'team/app',
      namespace: 'team',
      project: 'app',
    })
  })

  it('scp-like ssh (git@host:group/proj.git)', () => {
    expect(parseGitLabRepo('git@gitlab.com:group/proj.git')).toEqual({
      host: 'https://gitlab.com',
      fullPath: 'group/proj',
      namespace: 'group',
      project: 'proj',
    })
  })

  it('scp-like ssh + 서브그룹', () => {
    expect(parseGitLabRepo('git@gitlab.com:group/sub/proj.git')).toEqual({
      host: 'https://gitlab.com',
      fullPath: 'group/sub/proj',
      namespace: 'group/sub',
      project: 'proj',
    })
  })

  it('ssh:// 형식 + 포트', () => {
    expect(parseGitLabRepo('ssh://git@gl.internal:2222/team/app.git')).toEqual({
      host: 'https://gl.internal:2222',
      fullPath: 'team/app',
      namespace: 'team',
      project: 'app',
    })
  })

  it('self-hosted scp-like ssh host 소문자화', () => {
    expect(parseGitLabRepo('git@GL.Internal:Team/App.git')?.host).toBe('https://gl.internal')
  })

  it('namespace 없이 project만이면 null', () => {
    expect(parseGitLabRepo('https://gitlab.com/proj.git')).toBeNull()
  })

  it('빈/공백 입력은 null', () => {
    expect(parseGitLabRepo('')).toBeNull()
    expect(parseGitLabRepo('   ')).toBeNull()
  })

  it('host만 있고 경로 없으면 null', () => {
    expect(parseGitLabRepo('https://gitlab.com')).toBeNull()
    expect(parseGitLabRepo('https://gitlab.com/')).toBeNull()
  })

  it('잘못된 입력(스킴/scp 둘 다 아님)은 null', () => {
    expect(parseGitLabRepo('not a url')).toBeNull()
    expect(parseGitLabRepo('group/proj')).toBeNull()
  })

  it('trailing slash 제거', () => {
    expect(parseGitLabRepo('https://gitlab.com/group/proj/')).toEqual({
      host: 'https://gitlab.com',
      fullPath: 'group/proj',
      namespace: 'group',
      project: 'proj',
    })
  })
})

describe('pipelineStatusToPipe', () => {
  it('success/manual → pass', () => {
    expect(pipelineStatusToPipe('success')).toBe('pass')
    expect(pipelineStatusToPipe('manual')).toBe('pass')
  })
  it('failed → fail', () => {
    expect(pipelineStatusToPipe('failed')).toBe('fail')
  })
  it('running → run (info 블루, 주황 아님)', () => {
    expect(pipelineStatusToPipe('running')).toBe('run')
  })
  it('pending/created/canceled/skipped/없음 → pend', () => {
    expect(pipelineStatusToPipe('pending')).toBe('pend')
    expect(pipelineStatusToPipe('created')).toBe('pend')
    expect(pipelineStatusToPipe('canceled')).toBe('pend')
    expect(pipelineStatusToPipe('skipped')).toBe('pend')
    expect(pipelineStatusToPipe(undefined)).toBe('pend')
    expect(pipelineStatusToPipe(null)).toBe('pend')
    expect(pipelineStatusToPipe('')).toBe('pend')
  })
  it('대소문자 무관', () => {
    expect(pipelineStatusToPipe('SUCCESS')).toBe('pass')
    expect(pipelineStatusToPipe('Running')).toBe('run')
  })
})

describe('accessLevelToRole', () => {
  it('표준 레벨 매핑', () => {
    expect(accessLevelToRole(10)).toBe('Guest')
    expect(accessLevelToRole(20)).toBe('Reporter')
    expect(accessLevelToRole(30)).toBe('Developer')
    expect(accessLevelToRole(40)).toBe('Maintainer')
    expect(accessLevelToRole(50)).toBe('Owner')
  })

  it('중간값은 하위 역할로 내림', () => {
    expect(accessLevelToRole(35)).toBe('Developer')
    expect(accessLevelToRole(45)).toBe('Maintainer')
    expect(accessLevelToRole(60)).toBe('Owner')
  })

  it('null/undefined/0/10미만은 null', () => {
    expect(accessLevelToRole(null)).toBeNull()
    expect(accessLevelToRole(undefined)).toBeNull()
    expect(accessLevelToRole(0)).toBeNull()
    expect(accessLevelToRole(5)).toBeNull()
  })

  it('NaN/Infinity는 null', () => {
    expect(accessLevelToRole(NaN)).toBeNull()
    expect(accessLevelToRole(Infinity)).toBeNull()
  })
})

describe('matchGitlabHost (origin host ↔ 연결 host 매칭)', () => {
  it('authority 완전 일치(gitlab.com)', () => {
    const hosts = ['https://gitlab.com']
    expect(matchGitlabHost(hosts, 'https://gitlab.com')).toBe('https://gitlab.com')
  })

  it('trailing slash / 스킴 차이를 무시하고 매칭', () => {
    const hosts = ['https://gitlab.com']
    expect(matchGitlabHost(hosts, 'https://gitlab.com/')).toBe('https://gitlab.com')
    // (이론상) http origin이라도 authority가 같으면 같은 인스턴스로 본다
    expect(matchGitlabHost(['http://gl.internal'], 'http://gl.internal/')).toBe('http://gl.internal')
  })

  it('self-hosted SSH 커스텀 포트(ssh://...:2222) origin도 저장된 API host와 매칭', () => {
    // parseGitLabRepo('ssh://git@gl.internal:2222/g/p.git').host === 'https://gl.internal:2222'
    // 저장 host(API)는 포트 없음 → hostname 폴백으로 매칭돼야 함
    const hosts = ['https://gl.internal']
    expect(matchGitlabHost(hosts, 'https://gl.internal:2222')).toBe('https://gl.internal')
  })

  it('scp-ssh(포트 없음) origin은 1순위 authority로 매칭', () => {
    // parseGitLabRepo('git@gl.internal:g/p.git').host === 'https://gl.internal'
    expect(matchGitlabHost(['https://gl.internal'], 'https://gl.internal')).toBe('https://gl.internal')
  })

  it('연결되지 않은 host는 null', () => {
    expect(matchGitlabHost(['https://gitlab.com'], 'https://gl.other.com')).toBeNull()
    expect(matchGitlabHost([], 'https://gitlab.com')).toBeNull()
  })

  it('빈 repoHost는 null', () => {
    expect(matchGitlabHost(['https://gitlab.com'], '')).toBeNull()
  })

  it('legit한 커스텀 HTTPS 포트는 구분 유지(exact만, 잘못된 매칭 안 함)', () => {
    // 8443에 연결돼 있고 origin이 9443이면 hostname은 같지만 포트가 다른 별개 인스턴스 →
    // 단, 같은 hostname 연결이 유일하면 폴백으로 매칭(아래 모호성 케이스와 구분)
    const hosts = ['https://gl.internal:8443']
    // exact 우선
    expect(matchGitlabHost(hosts, 'https://gl.internal:8443')).toBe('https://gl.internal:8443')
  })

  it('동일 hostname에 포트만 다른 인스턴스가 둘 이상이면 모호 → null(잘못된 매칭 방지)', () => {
    const hosts = ['https://gl.internal:8443', 'https://gl.internal:9443']
    // SSH 포트(2222)는 둘 중 어디로도 단정 불가 → null
    expect(matchGitlabHost(hosts, 'https://gl.internal:2222')).toBeNull()
  })

  it('여러 인스턴스 중 정확한 hostname 하나만 매칭', () => {
    const hosts = ['https://gitlab.com', 'https://gl.internal']
    expect(matchGitlabHost(hosts, 'https://gl.internal:2222')).toBe('https://gl.internal')
    expect(matchGitlabHost(hosts, 'https://gitlab.com')).toBe('https://gitlab.com')
  })
})
