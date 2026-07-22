import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadPullStrategy,
  savePullStrategy,
  isNonFastForwardPush,
  type PullStrategy,
} from './remoteWorkflow'

const KEY = 'gitgrove:pullStrategy'

describe('Pull 전략 저장/복원', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('저장된 값이 없으면 기본 merge 로 복원', () => {
    expect(loadPullStrategy()).toBe('merge')
  })

  it('손상/미지의 값이면 merge 로 폴백', () => {
    localStorage.setItem(KEY, 'nonsense')
    expect(loadPullStrategy()).toBe('merge')
  })

  it('빈 문자열도 merge 로 폴백', () => {
    localStorage.setItem(KEY, '')
    expect(loadPullStrategy()).toBe('merge')
  })

  it('세 유효값(merge·rebase·ff-only)을 저장하고 그대로 복원(왕복)', () => {
    const all: PullStrategy[] = ['merge', 'rebase', 'ff-only']
    for (const s of all) {
      savePullStrategy(s)
      expect(localStorage.getItem(KEY)).toBe(s)
      expect(loadPullStrategy()).toBe(s)
    }
  })

  it('마지막 저장이 이전 저장을 덮어쓴다', () => {
    savePullStrategy('rebase')
    savePullStrategy('ff-only')
    expect(loadPullStrategy()).toBe('ff-only')
  })
})

describe('non-fast-forward 감지 — isNonFastForwardPush', () => {
  it.each([
    ['non-fast-forward', 'error: failed to push some refs — non-fast-forward'],
    ['rejected', 'Updates were rejected because the tip of your current branch is behind'],
    ['fetch first', 'hint: Updates were rejected. Integrate the remote changes (git pull) before pushing again. fetch first'],
    ['한국어 뒤처', '원격이 로컬보다 앞서 있어 로컬이 뒤처져 있어요'],
  ])('토큰 "%s" 이 포함되면 true', (_token, message) => {
    expect(isNonFastForwardPush(message)).toBe(true)
  })

  it('영문 토큰은 대소문자 무관하게 매칭(NON-FAST-FORWARD·Rejected·FETCH FIRST)', () => {
    expect(isNonFastForwardPush('NON-FAST-FORWARD')).toBe(true)
    expect(isNonFastForwardPush('Push was REJECTED')).toBe(true)
    expect(isNonFastForwardPush('FETCH FIRST, then retry')).toBe(true)
  })

  it('일반 에러(인증/네트워크/타 실패)는 non-ff 로 오탐하지 않는다', () => {
    expect(isNonFastForwardPush('fatal: Authentication failed for origin')).toBe(false)
    expect(isNonFastForwardPush('Could not resolve host: github.com')).toBe(false)
    expect(isNonFastForwardPush('Permission denied (publickey)')).toBe(false)
    expect(isNonFastForwardPush('remote: Repository not found')).toBe(false)
  })

  it('보호 브랜치·서버 훅 거부는 rejected 가 있어도 non-ff 아님 — force 로 해결 불가', () => {
    // force-with-lease 로도 못 뚫는 서버측 거부 → ForcePushModal 을 띄우면 안 됨.
    expect(isNonFastForwardPush('! [remote rejected] main -> main (protected branch hook declined)')).toBe(false)
    expect(isNonFastForwardPush('! [remote rejected] main -> main (pre-receive hook declined)')).toBe(false)
    expect(isNonFastForwardPush('remote: error: GH006: Protected branch update failed')).toBe(false)
    expect(isNonFastForwardPush('! [remote rejected] main -> main (permission denied)')).toBe(false)
  })

  it('non-ff 와 훅 거부가 섞이지 않은 순수 non-ff 는 그대로 true (회귀 방어)', () => {
    expect(isNonFastForwardPush('! [rejected] main -> main (non-fast-forward)')).toBe(true)
    expect(isNonFastForwardPush('! [rejected] main -> main (fetch first)')).toBe(true)
    expect(isNonFastForwardPush('! [rejected] main -> main (stale info)')).toBe(true)
  })

  it('빈/누락 메시지는 false (null·undefined·빈 문자열)', () => {
    expect(isNonFastForwardPush(null)).toBe(false)
    expect(isNonFastForwardPush(undefined)).toBe(false)
    expect(isNonFastForwardPush('')).toBe(false)
  })
})
