import { describe, it, expect } from 'vitest'
import { buildStashPreview, hasStashableChanges } from './stashPreview'

const f = (path: string, index: string, working_dir: string) => ({ path, index, working_dir })

describe('buildStashPreview', () => {
  it('스테이지·미스테이지 tracked 변경 분류', () => {
    const p = buildStashPreview([
      f('a.ts', 'M', ' '),   // staged 수정
      f('b.ts', ' ', 'M'),   // unstaged 수정
      f('c.ts', 'A', ' '),   // staged 추가
      f('d.ts', ' ', 'D'),   // unstaged 삭제
    ])
    expect(p.untracked).toEqual([])
    expect(p.tracked).toEqual([
      { path: 'a.ts', status: 'M', staged: true },
      { path: 'b.ts', status: 'M', staged: false },
      { path: 'c.ts', status: 'A', staged: true },
      { path: 'd.ts', status: 'D', staged: false },
    ])
  })

  it('untracked(??)는 별도 목록', () => {
    const p = buildStashPreview([f('new.txt', '?', '?')])
    expect(p.tracked).toEqual([])
    expect(p.untracked).toEqual([{ path: 'new.txt', status: 'A', staged: false }])
  })

  it('부분 스테이지(MM)는 한 행 · 워킹트리 상태 우선 · staged=true', () => {
    const p = buildStashPreview([f('e.ts', 'M', 'M')])
    expect(p.tracked).toEqual([{ path: 'e.ts', status: 'M', staged: true }])
  })

  it('빈 목록', () => {
    expect(buildStashPreview([])).toEqual({ tracked: [], untracked: [] })
  })
})

describe('hasStashableChanges', () => {
  const only = (tracked: number, untracked: number) => ({
    tracked: Array.from({ length: tracked }, (_, i) => ({ path: `t${i}`, status: 'M' as const, staged: false })),
    untracked: Array.from({ length: untracked }, (_, i) => ({ path: `u${i}`, status: 'A' as const, staged: false })),
  })

  it('tracked 변경이 있으면 항상 true', () => {
    expect(hasStashableChanges(only(1, 0), false)).toBe(true)
    expect(hasStashableChanges(only(2, 3), false)).toBe(true)
  })

  it('untracked만 있을 때는 include 여부에 좌우', () => {
    expect(hasStashableChanges(only(0, 2), false)).toBe(false)
    expect(hasStashableChanges(only(0, 2), true)).toBe(true)
  })

  it('아무 변경 없으면 false', () => {
    expect(hasStashableChanges(only(0, 0), true)).toBe(false)
  })
})
