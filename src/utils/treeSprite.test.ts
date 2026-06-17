import { describe, it, expect } from 'vitest'
import { treeCells, TREE_COLS, TREE_ROWS } from './treeSprite'
import type { GrowthStage } from './repoActivity'

describe('treeSprite — 성장단계별 픽셀 나무', () => {
  const STAGES: GrowthStage[] = [0, 1, 2, 3]

  it('모든 단계가 16×16 범위 안의 셀만 반환한다', () => {
    STAGES.forEach(stage => {
      const cells = treeCells(stage)
      expect(cells.length).toBeGreaterThan(0)
      cells.forEach(c => {
        expect(c.x).toBeGreaterThanOrEqual(0)
        expect(c.x).toBeLessThan(TREE_COLS)
        expect(c.y).toBeGreaterThanOrEqual(0)
        expect(c.y).toBeLessThan(TREE_ROWS)
        expect(c.fill).toMatch(/^#/)
      })
    })
  })

  it('단계가 올라갈수록 캐노피(채워진 셀)가 더 풍성하다', () => {
    const counts = STAGES.map(s => treeCells(s).length)
    expect(counts[0]).toBeLessThan(counts[2])
    expect(counts[2]).toBeLessThan(counts[3])
  })

  it('flourishing(3) 단계는 골드 열매(#e6a536)를 포함한다', () => {
    const fruit = treeCells(3).some(c => c.fill === '#e6a536')
    expect(fruit).toBe(true)
  })

  it('범위 밖 stage는 seedling(0)로 폴백한다', () => {
    const fallback = treeCells(9 as GrowthStage)
    expect(fallback).toEqual(treeCells(0))
  })
})
