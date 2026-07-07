import { describe, it, expect } from 'vitest'
import { planCheckout } from './checkoutTarget'

const opts = (local: string[], remotes: string[] = ['origin']) => ({ localBranches: local, remotes })

describe('planCheckout', () => {
  it('로컬 브랜치는 그대로 전환', () => {
    expect(planCheckout('main', opts(['main', 'dev'])))
      .toEqual({ args: ['main'], branch: 'main' })
  })

  it('원격 브랜치(로컬 없음) → -b --track 로 로컬 추적 브랜치 생성', () => {
    expect(planCheckout('origin/feature-x', opts(['main'])))
      .toEqual({ args: ['-b', 'feature-x', '--track', 'origin/feature-x'], branch: 'feature-x' })
  })

  it('슬래시 포함 원격 브랜치도 원격명만 제거', () => {
    expect(planCheckout('origin/feature/foo', opts(['main'])))
      .toEqual({ args: ['-b', 'feature/foo', '--track', 'origin/feature/foo'], branch: 'feature/foo' })
  })

  it('동명 로컬 브랜치가 이미 있으면 그 로컬로 전환(비파괴)', () => {
    expect(planCheckout('origin/feature-x', opts(['main', 'feature-x'])))
      .toEqual({ args: ['feature-x'], branch: 'feature-x' })
  })

  it('origin 외 원격(upstream)도 처리', () => {
    expect(planCheckout('upstream/foo', opts(['main'], ['origin', 'upstream'])))
      .toEqual({ args: ['-b', 'foo', '--track', 'upstream/foo'], branch: 'foo' })
  })

  it("로컬명이 'origin/x' 로 실재하면 원격 해석보다 우선", () => {
    expect(planCheckout('origin/x', opts(['origin/x'], ['origin'])))
      .toEqual({ args: ['origin/x'], branch: 'origin/x' })
  })

  it('원격 접두가 아닌 이름(태그·커밋)은 그대로', () => {
    expect(planCheckout('v1.2.0', opts(['main'], ['origin'])))
      .toEqual({ args: ['v1.2.0'], branch: 'v1.2.0' })
    expect(planCheckout('a1b2c3d', opts(['main'], ['origin'])))
      .toEqual({ args: ['a1b2c3d'], branch: 'a1b2c3d' })
  })

  it('알 수 없는 원격 접두(설정 안 된 remote)는 그대로 시도', () => {
    // 'foo' 가 원격 목록에 없으면 브랜치명 통째로 취급.
    expect(planCheckout('foo/bar', opts(['main'], ['origin'])))
      .toEqual({ args: ['foo/bar'], branch: 'foo/bar' })
  })
})
