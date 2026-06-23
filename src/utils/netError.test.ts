import { describe, it, expect } from 'vitest'
import { isUnreachableError } from './netError'

// 버그2 — 도달 실패(네트워크/오프라인) vs 인증 오류(401/403) 구분의 기준 유틸.
describe('isUnreachableError', () => {
  it('AbortError(DOMException)는 도달 실패로 본다 (타임아웃)', () => {
    expect(isUnreachableError(new DOMException('aborted', 'AbortError'))).toBe(true)
  })

  it('name이 AbortError인 일반 Error도 도달 실패로 본다', () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    expect(isUnreachableError(err)).toBe(true)
  })

  it('TypeError(Failed to fetch)는 도달 실패로 본다', () => {
    expect(isUnreachableError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('401 같은 API 응답 에러는 도달 실패가 아니다', () => {
    const err = new Error('GitHub API error: 401')
    expect(isUnreachableError(err)).toBe(false)
  })

  it('null/undefined/문자열은 도달 실패가 아니다', () => {
    expect(isUnreachableError(null)).toBe(false)
    expect(isUnreachableError(undefined)).toBe(false)
    expect(isUnreachableError('boom')).toBe(false)
  })
})
