import { describe, it, expect } from 'vitest'
import { notifFooterLinks } from './notifFooterLinks'

const GH = { provider: 'github', label: 'GitHub 알림', url: 'https://github.com/notifications' }
const GL = { provider: 'gitlab', label: 'GitLab Todos', url: 'https://gitlab.com/dashboard/todos' }

describe('notifFooterLinks', () => {
  it('filter=all + 양쪽 연결 → GitHub·GitLab 둘 다', () => {
    expect(notifFooterLinks({ filter: 'all', hasGithub: true, gitlabHost: 'https://gitlab.com' }))
      .toEqual([GH, GL])
  })

  it('filter=all + GitHub만 연결 → GitHub만', () => {
    expect(notifFooterLinks({ filter: 'all', hasGithub: true, gitlabHost: null }))
      .toEqual([GH])
  })

  it('filter=all + GitLab만 연결 → GitLab만', () => {
    expect(notifFooterLinks({ filter: 'all', hasGithub: false, gitlabHost: 'https://gitlab.com' }))
      .toEqual([GL])
  })

  it('filter=github → GitHub만(연결 시)', () => {
    expect(notifFooterLinks({ filter: 'github', hasGithub: true, gitlabHost: 'https://gitlab.com' }))
      .toEqual([GH])
  })

  it('filter=gitlab → GitLab만(연결 시)', () => {
    expect(notifFooterLinks({ filter: 'gitlab', hasGithub: true, gitlabHost: 'https://gitlab.com' }))
      .toEqual([GL])
  })

  it('self-hosted GitLab host 도 dashboard/todos 로', () => {
    expect(notifFooterLinks({ filter: 'gitlab', hasGithub: false, gitlabHost: 'https://gitlab.example.com:8443' }))
      .toEqual([{ provider: 'gitlab', label: 'GitLab Todos', url: 'https://gitlab.example.com:8443/dashboard/todos' }])
  })

  it('연결된 provider 없으면 빈 배열', () => {
    expect(notifFooterLinks({ filter: 'all', hasGithub: false, gitlabHost: null })).toEqual([])
    expect(notifFooterLinks({ filter: 'github', hasGithub: false, gitlabHost: null })).toEqual([])
  })

  it('host 끝 슬래시는 정리', () => {
    expect(notifFooterLinks({ filter: 'gitlab', hasGithub: false, gitlabHost: 'https://gitlab.com/' }))
      .toEqual([GL])
  })
})
