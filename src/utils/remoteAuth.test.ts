import { describe, it, expect } from 'vitest'
import { parseRemoteUrl, isGithubHost } from './remoteAuth'

describe('parseRemoteUrl', () => {
  it('HTTPS 원격 → scheme https + host(소문자)', () => {
    expect(parseRemoteUrl('https://github.com/owner/repo.git'))
      .toEqual({ scheme: 'https', host: 'github.com' })
    expect(parseRemoteUrl('https://GitLab.com/g/p.git'))
      .toEqual({ scheme: 'https', host: 'gitlab.com' })
  })

  it('self-hosted host + 포트 보존', () => {
    expect(parseRemoteUrl('https://gitlab.example.com:8443/team/proj.git'))
      .toEqual({ scheme: 'https', host: 'gitlab.example.com:8443' })
  })

  it('userinfo 는 host 에서 제외', () => {
    expect(parseRemoteUrl('https://oauth2:tok@gitlab.com/g/p.git'))
      .toEqual({ scheme: 'https', host: 'gitlab.com' })
    expect(parseRemoteUrl('https://user@github.com/o/r.git'))
      .toEqual({ scheme: 'https', host: 'github.com' })
  })

  it('http 원격', () => {
    expect(parseRemoteUrl('http://gitlab.internal/g/p.git'))
      .toEqual({ scheme: 'http', host: 'gitlab.internal' })
  })

  it('scp 형식 SSH(git@host:path) → ssh, host 비움', () => {
    expect(parseRemoteUrl('git@github.com:owner/repo.git'))
      .toEqual({ scheme: 'ssh', host: '' })
    expect(parseRemoteUrl('git@gitlab.example.com:team/proj.git'))
      .toEqual({ scheme: 'ssh', host: '' })
  })

  it('ssh:// 스킴 → ssh', () => {
    expect(parseRemoteUrl('ssh://git@gitlab.com:22/g/p.git'))
      .toEqual({ scheme: 'ssh', host: '' })
  })

  it('빈 값·미인식 → other', () => {
    expect(parseRemoteUrl('')).toEqual({ scheme: 'other', host: '' })
    expect(parseRemoteUrl('   ')).toEqual({ scheme: 'other', host: '' })
    expect(parseRemoteUrl('file:///tmp/repo')).toEqual({ scheme: 'other', host: '' })
  })
})

describe('isGithubHost', () => {
  it('github.com 만 true', () => {
    expect(isGithubHost('github.com')).toBe(true)
    expect(isGithubHost('GitHub.com')).toBe(true)
    expect(isGithubHost('www.github.com')).toBe(true)
    expect(isGithubHost('gitlab.com')).toBe(false)
    expect(isGithubHost('github.example.com')).toBe(false)
    expect(isGithubHost('')).toBe(false)
  })
})
