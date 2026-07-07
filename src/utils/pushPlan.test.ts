import { describe, it, expect } from 'vitest'
import { planPush } from './pushPlan'

describe('planPush', () => {
  it('upstream 이름이 로컬과 다르면 HEAD:<upstream>로 명시 푸시', () => {
    expect(planPush({ currentBranch: 'main', upstreamRemote: 'origin', upstreamBranch: 'develop', defaultRemote: 'origin' }))
      .toEqual({ remote: 'origin', refspec: 'HEAD:develop', setUpstream: false })
  })

  it('upstream 이름이 같아도 HEAD:<upstream>로 푸시(결과 동일)', () => {
    expect(planPush({ currentBranch: 'main', upstreamRemote: 'origin', upstreamBranch: 'main', defaultRemote: 'origin' }))
      .toEqual({ remote: 'origin', refspec: 'HEAD:main', setUpstream: false })
  })

  it('upstream 없으면 같은 이름 원격 브랜치로 푸시 + upstream 설정(-u)', () => {
    expect(planPush({ currentBranch: 'feature/x', upstreamRemote: null, upstreamBranch: null, defaultRemote: 'origin' }))
      .toEqual({ remote: 'origin', refspec: 'HEAD:feature/x', setUpstream: true })
  })

  it('upstream remote 만 있고 merge 없으면 upstream 미설정 취급(-u 폴백)', () => {
    expect(planPush({ currentBranch: 'main', upstreamRemote: 'origin', upstreamBranch: null, defaultRemote: 'origin' }))
      .toEqual({ remote: 'origin', refspec: 'HEAD:main', setUpstream: true })
  })

  it('원격 이름이 origin 이 아니어도 그대로 사용', () => {
    expect(planPush({ currentBranch: 'main', upstreamRemote: 'upstream', upstreamBranch: 'trunk', defaultRemote: 'origin' }))
      .toEqual({ remote: 'upstream', refspec: 'HEAD:trunk', setUpstream: false })
  })

  it('detached HEAD(현재 브랜치 없음) + upstream 없음 → 기본 push 폴백', () => {
    expect(planPush({ currentBranch: null, upstreamRemote: null, upstreamBranch: null, defaultRemote: 'origin' }))
      .toEqual({ remote: null, refspec: null, setUpstream: false })
  })

  it('원격이 하나도 없으면(defaultRemote null) 기본 push 폴백', () => {
    expect(planPush({ currentBranch: 'main', upstreamRemote: null, upstreamBranch: null, defaultRemote: null }))
      .toEqual({ remote: null, refspec: null, setUpstream: false })
  })
})
