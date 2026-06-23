import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { hasSeenOnboarding, markOnboardingSeen } from './onboarding'

describe('onboarding 헬퍼', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { localStorage.clear() })

  it('키가 없으면 아직 안 본 것으로 본다', () => {
    expect(hasSeenOnboarding()).toBe(false)
  })

  it('markOnboardingSeen 후 본 것으로 본다', () => {
    markOnboardingSeen()
    expect(localStorage.getItem('gitgrove:onboarding-seen')).toBe('1')
    expect(hasSeenOnboarding()).toBe(true)
  })

  it("값이 '1'이 아니면 아직 안 본 것으로 본다", () => {
    localStorage.setItem('gitgrove:onboarding-seen', 'nope')
    expect(hasSeenOnboarding()).toBe(false)
  })
})
