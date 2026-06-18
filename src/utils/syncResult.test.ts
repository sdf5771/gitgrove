import { describe, it, expect } from 'vitest'
import {
  mapProgress,
  isConflictError,
  extractConflictedFiles,
  extractDiffStat,
  parseRevCount,
  computeFetchDelta,
  buildPullSummary,
  type SimpleGitProgressLike,
} from './syncResult'

describe('mapProgress (ProgressEvent → RemoteProgress)', () => {
  it('raw stage/progress를 그대로 패스하고 op만 붙인다', () => {
    const ev: SimpleGitProgressLike = {
      method: 'pull', stage: 'receiving', progress: 42, processed: 21, total: 50,
    }
    expect(mapProgress('pull', ev)).toEqual({
      op: 'pull', stage: 'receiving', progress: 42, processed: 21, total: 50,
    })
  })

  it('processed/total 없으면 undefined로 패스(가공하지 않음)', () => {
    const ev: SimpleGitProgressLike = { stage: 'resolving', progress: 100 }
    const p = mapProgress('fetch', ev)
    expect(p).toEqual({
      op: 'fetch', stage: 'resolving', progress: 100, processed: undefined, total: undefined,
    })
  })

  it('op은 호출자가 지정한 값을 그대로 사용(method 무시)', () => {
    const ev: SimpleGitProgressLike = { method: 'pull', stage: 'writing', progress: 10 }
    expect(mapProgress('push', ev).op).toBe('push')
  })
})

describe('isConflictError (충돌 vs 진짜 에러 판별)', () => {
  it('CONFLICT 포함 메시지는 충돌로 판별', () => {
    expect(isConflictError('CONFLICT (content): Merge conflict in a.txt')).toBe(true)
  })
  it('Automatic merge failed 메시지는 충돌로 판별', () => {
    expect(isConflictError('Automatic merge failed; fix conflicts and then commit.')).toBe(true)
  })
  it('대소문자 무관', () => {
    expect(isConflictError('automatic MERGE failed')).toBe(true)
    expect(isConflictError('conflict in file')).toBe(true)
  })
  it('일반 네트워크/인증 에러는 충돌 아님(→ throw 대상)', () => {
    expect(isConflictError('fatal: Authentication failed')).toBe(false)
    expect(isConflictError('Could not resolve host: github.com')).toBe(false)
    expect(isConflictError('')).toBe(false)
  })
})

describe('extractConflictedFiles', () => {
  it('string[] 그대로 통과', () => {
    expect(extractConflictedFiles(['a.txt', 'b.txt'])).toEqual(['a.txt', 'b.txt'])
  })
  it('배열 아니면 빈 배열', () => {
    expect(extractConflictedFiles(undefined)).toEqual([])
    expect(extractConflictedFiles(null)).toEqual([])
    expect(extractConflictedFiles('a.txt')).toEqual([])
  })
  it('비문자열/빈문자열 항목 필터링', () => {
    expect(extractConflictedFiles(['a.txt', '', 0, null, 'b.txt'] as unknown)).toEqual(['a.txt', 'b.txt'])
  })
})

describe('extractDiffStat', () => {
  it('files.length 우선으로 changedFiles 채움', () => {
    const stat = extractDiffStat({
      summary: { changes: 2, insertions: 10, deletions: 3 },
      files: ['a.txt', 'b.txt'],
    })
    expect(stat).toEqual({ changedFiles: 2, insertions: 10, deletions: 3, upToDate: false })
  })

  it('files 없으면 summary.changes로 fallback', () => {
    const stat = extractDiffStat({ summary: { changes: 5, insertions: 1, deletions: 1 } })
    expect(stat.changedFiles).toBe(5)
    expect(stat.upToDate).toBe(false)
  })

  it('변경 합이 0이면 upToDate=true', () => {
    const stat = extractDiffStat({ summary: { changes: 0, insertions: 0, deletions: 0 }, files: [] })
    expect(stat).toEqual({ changedFiles: 0, insertions: 0, deletions: 0, upToDate: true })
  })

  it('summary 누락 시 안전한 기본값', () => {
    const stat = extractDiffStat({})
    expect(stat).toEqual({ changedFiles: 0, insertions: 0, deletions: 0, upToDate: true })
  })
})

describe('parseRevCount (best-effort)', () => {
  it('정상 카운트 파싱', () => {
    expect(parseRevCount('3')).toBe(3)
    expect(parseRevCount('  12\n')).toBe(12)
    expect(parseRevCount('0')).toBe(0)
  })
  it('파싱 불가/음수/null은 undefined(필드 생략)', () => {
    expect(parseRevCount(null)).toBeUndefined()
    expect(parseRevCount(undefined)).toBeUndefined()
    expect(parseRevCount('')).toBeUndefined()
    expect(parseRevCount('abc')).toBeUndefined()
    expect(parseRevCount('-1')).toBeUndefined()
  })
})

describe('computeFetchDelta', () => {
  it('after - before 델타', () => {
    expect(computeFetchDelta(0, 3)).toBe(3)
    expect(computeFetchDelta(2, 5)).toBe(3)
  })
  it('변화 없으면 0', () => {
    expect(computeFetchDelta(4, 4)).toBe(0)
  })
  it('음수는 0으로 clamp(브랜치 전환 등 이상 케이스)', () => {
    expect(computeFetchDelta(5, 2)).toBe(0)
  })
  it('하나라도 미상이면 undefined(생략)', () => {
    expect(computeFetchDelta(undefined, 3)).toBeUndefined()
    expect(computeFetchDelta(1, undefined)).toBeUndefined()
  })
})

describe('buildPullSummary', () => {
  it('upToDate면 Already up to date', () => {
    expect(buildPullSummary({ changedFiles: 0, insertions: 0, deletions: 0, upToDate: true }))
      .toBe('Already up to date')
  })
  it('변경 있으면 파일 수 표기', () => {
    expect(buildPullSummary({ changedFiles: 3, insertions: 5, deletions: 1, upToDate: false }))
      .toBe('Fast-forward: 3 file(s) changed')
  })
})
