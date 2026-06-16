import { describe, it, expect } from 'vitest'
import { categorizeGitStatus, type RawFileStatus, type NumStat } from './gitStatus'

// porcelain 표기 헬퍼: 'M '(staged), ' M'(unstaged), 'MM'(both), '??'(untracked) …
const f = (xy: string, path: string): RawFileStatus => ({
  path,
  index: xy[0],
  working_dir: xy[1],
})
const noStats = new Map<string, NumStat>()

describe('categorizeGitStatus (Stage 탭 중복 버그)', () => {
  it("완전히 스테이징된 파일('M ')은 staged에만 — unstaged 중복 없음", () => {
    const { staged, unstaged } = categorizeGitStatus(
      [f('M ', 'a.txt')], [], noStats, noStats,
    )
    expect(staged.map(x => x.path)).toEqual(['a.txt'])
    expect(unstaged.map(x => x.path)).toEqual([]) // ← 회귀 가드: 여기 'a.txt' 들어가면 버그 재발
  })

  it("스테이징 후 재수정('MM')만 양쪽에 표시(정당)", () => {
    const { staged, unstaged } = categorizeGitStatus(
      [f('MM', 'a.txt')], [], noStats, noStats,
    )
    expect(staged.map(x => x.path)).toEqual(['a.txt'])
    expect(unstaged.map(x => x.path)).toEqual(['a.txt'])
  })

  it("워킹트리만 수정(' M')은 unstaged에만", () => {
    const { staged, unstaged } = categorizeGitStatus(
      [f(' M', 'a.txt')], [], noStats, noStats,
    )
    expect(staged).toEqual([])
    expect(unstaged.map(x => x.path)).toEqual(['a.txt'])
  })

  it('혼합 상태에서 staged_only는 한쪽, both만 양쪽', () => {
    const { staged, unstaged } = categorizeGitStatus(
      [
        f('M ', 'staged_only.txt'),
        f('MM', 'both.txt'),
        f(' M', 'unstaged_only.txt'),
        f(' D', 'deleted.txt'),
        f('??', 'untracked.txt'),
      ],
      [], noStats, noStats,
    )
    const inBoth = staged
      .map(s => s.path)
      .filter(p => unstaged.some(u => u.path === p))
    expect(inBoth).toEqual(['both.txt']) // both.txt만 양쪽 (MM이라 정당)

    expect(staged.map(x => x.path).sort()).toEqual(['both.txt', 'staged_only.txt'])
    expect(unstaged.map(x => x.path).sort()).toEqual(
      ['both.txt', 'deleted.txt', 'unstaged_only.txt', 'untracked.txt'],
    )
  })

  it('상태 문자 매핑: 추가/삭제/rename', () => {
    const { staged, unstaged } = categorizeGitStatus(
      [
        f('A ', 'added.txt'),    // 신규 스테이징
        f('D ', 'removed.txt'),  // 삭제 스테이징
        f('R ', 'renamed.txt'),  // rename 스테이징 → 'M'
        f('??', 'new.txt'),      // untracked → 'A'
      ],
      [], noStats, noStats,
    )
    expect(staged.find(x => x.path === 'added.txt')?.status).toBe('A')
    expect(staged.find(x => x.path === 'removed.txt')?.status).toBe('D')
    expect(staged.find(x => x.path === 'renamed.txt')?.status).toBe('M')
    expect(unstaged.find(x => x.path === 'new.txt')?.status).toBe('A')
  })

  it('충돌 파일은 unstaged에만 (staged 중복 없음)', () => {
    const { staged, unstaged } = categorizeGitStatus(
      [f('UU', 'conflict.txt')], ['conflict.txt'], noStats, noStats,
    )
    expect(staged).toEqual([])
    expect(unstaged.map(x => x.path)).toEqual(['conflict.txt'])
  })

  it('numstat additions/deletions를 올바른 칼럼에서 채운다', () => {
    const stagedStats = new Map([['a.txt', { additions: 5, deletions: 2 }]])
    const unstagedStats = new Map([['a.txt', { additions: 1, deletions: 0 }]])
    const { staged, unstaged } = categorizeGitStatus(
      [f('MM', 'a.txt')], [], stagedStats, unstagedStats,
    )
    expect(staged[0]).toMatchObject({ additions: 5, deletions: 2 })
    expect(unstaged[0]).toMatchObject({ additions: 1, deletions: 0 })
  })
})
