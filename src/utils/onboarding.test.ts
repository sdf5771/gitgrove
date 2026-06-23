import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { hasSeenOnboarding, markOnboardingSeen, hasExistingUserData, shouldShowOnboarding } from './onboarding'

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

describe('hasExistingUserData — 기존 사용자 동기 감지', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { localStorage.clear() })

  it('아무 데이터도 없으면 false', () => {
    expect(hasExistingUserData()).toBe(false)
  })

  it('repos가 비어있지 않은 배열이면 true', () => {
    localStorage.setItem('gitgrove:repos', JSON.stringify([{ path: '/x' }]))
    expect(hasExistingUserData()).toBe(true)
  })

  it('repos가 빈 배열이면 false', () => {
    localStorage.setItem('gitgrove:repos', JSON.stringify([]))
    expect(hasExistingUserData()).toBe(false)
  })

  it('레거시 평문 githubToken이 있으면 true', () => {
    localStorage.setItem('gitgrove:githubToken', 'ghp_abc')
    expect(hasExistingUserData()).toBe(true)
  })

  it('settings가 있으면 true', () => {
    localStorage.setItem('gitgrove:settings', JSON.stringify({ density: 'compact' }))
    expect(hasExistingUserData()).toBe(true)
  })

  it('빈 settings 객체({})는 흔적으로 보지 않는다', () => {
    localStorage.setItem('gitgrove:settings', '{}')
    expect(hasExistingUserData()).toBe(false)
  })

  it('recentRepos/workspaces/favoriteRepos 흔적이 있으면 true', () => {
    localStorage.setItem('gitgrove:recentRepos', JSON.stringify([{ path: '/r' }]))
    expect(hasExistingUserData()).toBe(true)
  })
})

describe('shouldShowOnboarding — 최종 게이팅', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { localStorage.clear() })

  it('미시청 + 흔적 없음(진짜 신규) → 노출', () => {
    expect(shouldShowOnboarding()).toBe(true)
  })

  it('이미 봤으면 → 미노출', () => {
    markOnboardingSeen()
    expect(shouldShowOnboarding()).toBe(false)
  })

  it('미시청이어도 기존 사용 흔적이 있으면 → 미노출', () => {
    localStorage.setItem('gitgrove:repos', JSON.stringify([{ path: '/x' }]))
    expect(shouldShowOnboarding()).toBe(false)
  })
})
