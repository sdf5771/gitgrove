import { describe, it, expect } from 'vitest'
import {
  mapProgress,
  isConflictError,
  extractConflictedFiles,
  extractDiffStat,
  parseRevCount,
  computeFetchDelta,
  buildPullSummary,
  buildCloneArgs,
  classifyCloneError,
  type SimpleGitProgressLike,
} from './syncResult'

describe('mapProgress — clone op (CL1)', () => {
  it("op:'clone'을 붙이고 checkout 단계 stage도 그대로 패스", () => {
    const ev: SimpleGitProgressLike = {
      method: 'clone', stage: 'checkout', progress: 70, processed: 35, total: 50,
    }
    expect(mapProgress('clone', ev)).toEqual({
      op: 'clone', stage: 'checkout', progress: 70, processed: 35, total: 50,
    })
  })
  it("receiving 단계도 그대로 흐름", () => {
    const ev: SimpleGitProgressLike = { stage: 'receiving', progress: 12 }
    expect(mapProgress('clone', ev).op).toBe('clone')
    expect(mapProgress('clone', ev).stage).toBe('receiving')
  })
})

describe('buildCloneArgs (CloneOptions → git args)', () => {
  it('옵션 미지정이면 빈 배열(기존 전체 클론 하위호환)', () => {
    expect(buildCloneArgs()).toEqual([])
    expect(buildCloneArgs({})).toEqual([])
  })
  it('shallow → --depth 1', () => {
    expect(buildCloneArgs({ shallow: true })).toEqual(['--depth', '1'])
  })
  it('recurseSubmodules → --recurse-submodules', () => {
    expect(buildCloneArgs({ recurseSubmodules: true })).toEqual(['--recurse-submodules'])
  })
  it('둘 다 지정 시 순서 고정(depth → recurse)', () => {
    expect(buildCloneArgs({ shallow: true, recurseSubmodules: true }))
      .toEqual(['--depth', '1', '--recurse-submodules'])
  })
  it('false는 인자 추가 안 함', () => {
    expect(buildCloneArgs({ shallow: false, recurseSubmodules: false })).toEqual([])
  })
})

describe('classifyCloneError (auth | notfound | error)', () => {
  it('인증 실패 → auth', () => {
    expect(classifyCloneError('fatal: Authentication failed for https://github.com/...')).toBe('auth')
    expect(classifyCloneError("could not read Username for 'https://github.com'")).toBe('auth')
    expect(classifyCloneError('remote: HTTP Basic: Access denied')).toBe('auth')
    expect(classifyCloneError('The requested URL returned error: 403')).toBe('auth')
    expect(classifyCloneError('fatal: unable to access ...: The requested URL returned error: 401')).toBe('auth')
    expect(classifyCloneError('Permission denied (publickey).')).toBe('auth')
  })
  it('저장소 없음 → notfound', () => {
    expect(classifyCloneError('remote: Repository not found.')).toBe('notfound')
    expect(classifyCloneError('fatal: repository \'https://x/y.git\' not found')).toBe('notfound')
    expect(classifyCloneError('The project you were looking for does not exist')).toBe('notfound')
    expect(classifyCloneError('The requested URL returned error: 404')).toBe('notfound')
  })
  it('그 외(네트워크/디스크) → error', () => {
    expect(classifyCloneError('Could not resolve host: github.com')).toBe('error')
    expect(classifyCloneError('fatal: destination path already exists')).toBe('error')
    expect(classifyCloneError('')).toBe('error')
    expect(classifyCloneError(null)).toBe('error')
    expect(classifyCloneError(undefined)).toBe('error')
  })
  it('대소문자 무관', () => {
    expect(classifyCloneError('AUTHENTICATION FAILED')).toBe('auth')
    expect(classifyCloneError('REPOSITORY NOT FOUND')).toBe('notfound')
  })
  it('404가 auth 신호보다 우선(notfound)', () => {
    // 일부 호스트는 private repo를 404로 숨기지만 사용자에겐 URL 확인이 먼저 유용
    expect(classifyCloneError('returned error: 404 Authentication failed')).toBe('notfound')
  })
})

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
