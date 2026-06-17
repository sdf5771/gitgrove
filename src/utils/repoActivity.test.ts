import { describe, it, expect } from 'vitest'
import {
  normalizeDailyCounts,
  stageOf,
  bucketOf,
  toShortDate,
} from './repoActivity'

// 고정 기준일(로컬). 2026-06-17 정오 — 타임존 흔들림을 줄이려 정오로 잡는다.
const TODAY = new Date(2026, 5, 17, 12, 0, 0)

describe('normalizeDailyCounts — 일별 정규화', () => {
  it('빈 입력은 전부 0인 길이 days 배열', () => {
    const out = normalizeDailyCounts([], 14, TODAY)
    expect(out).toHaveLength(14)
    expect(out.every(n => n === 0)).toBe(true)
  })

  it('마지막 칸 = 오늘, 첫 칸 = (days-1)일 전 (과거→현재 순)', () => {
    const out = normalizeDailyCounts(
      ['2026-06-17', '2026-06-04'], 14, TODAY,
    )
    // 2026-06-04 = 13일 전 = index 0, 2026-06-17 = 오늘 = index 13
    expect(out[0]).toBe(1)
    expect(out[13]).toBe(1)
    expect(out.reduce((a, b) => a + b, 0)).toBe(2)
  })

  it('같은 날 여러 커밋은 누적', () => {
    const out = normalizeDailyCounts(
      ['2026-06-17', '2026-06-17', '2026-06-17'], 14, TODAY,
    )
    expect(out[13]).toBe(3)
    expect(out.reduce((a, b) => a + b, 0)).toBe(3)
  })

  it('빈 날은 0으로 채움(연속 칸 검증)', () => {
    const out = normalizeDailyCounts(
      ['2026-06-15', '2026-06-17'], 14, TODAY,
    )
    expect(out[11]).toBe(1) // 06-15 = 2일 전 = index 11
    expect(out[12]).toBe(0) // 06-16 = 1일 전 = 빈 날
    expect(out[13]).toBe(1) // 06-17 = 오늘
  })

  it('경계: 정확히 (days-1)일 전은 포함(index 0)', () => {
    const out = normalizeDailyCounts(['2026-06-04'], 14, TODAY)
    expect(out[0]).toBe(1)
  })

  it('경계: days일 전(범위 밖, 더 과거)은 무시', () => {
    const out = normalizeDailyCounts(['2026-06-03'], 14, TODAY)
    expect(out.every(n => n === 0)).toBe(true)
  })

  it('미래 날짜(오늘 이후)는 무시', () => {
    const out = normalizeDailyCounts(['2026-06-18'], 14, TODAY)
    expect(out.every(n => n === 0)).toBe(true)
  })

  it('days=7 등 다른 길이도 동작', () => {
    const out = normalizeDailyCounts(['2026-06-17', '2026-06-11'], 7, TODAY)
    expect(out).toHaveLength(7)
    expect(out[0]).toBe(1)  // 06-11 = 6일 전
    expect(out[6]).toBe(1)  // 06-17 = 오늘
  })

  it('days=0이면 빈 배열', () => {
    expect(normalizeDailyCounts(['2026-06-17'], 0, TODAY)).toEqual([])
  })

  it('공백/빈 문자열 항목은 무시', () => {
    const out = normalizeDailyCounts(['', '   ', '2026-06-17'], 14, TODAY)
    expect(out[13]).toBe(1)
    expect(out.reduce((a, b) => a + b, 0)).toBe(1)
  })

  it('타임존: short date는 로컬 자정 경계로 매칭 (시각 무관)', () => {
    // 기준일을 새벽/심야로 바꿔도 날짜 단위 매칭은 동일해야 한다.
    const earlyMorning = new Date(2026, 5, 17, 0, 30, 0)
    const lateNight = new Date(2026, 5, 17, 23, 30, 0)
    const a = normalizeDailyCounts(['2026-06-17'], 14, earlyMorning)
    const b = normalizeDailyCounts(['2026-06-17'], 14, lateNight)
    expect(a[13]).toBe(1)
    expect(b[13]).toBe(1)
    expect(a).toEqual(b)
  })
})

describe('stageOf — 성장단계 경계', () => {
  it('total<10 → 0(seedling)', () => {
    expect(stageOf(0)).toBe(0)
    expect(stageOf(9)).toBe(0)
  })
  it('10..29 → 1(young)', () => {
    expect(stageOf(10)).toBe(1)
    expect(stageOf(29)).toBe(1)
  })
  it('30..54 → 2(grown)', () => {
    expect(stageOf(30)).toBe(2)
    expect(stageOf(54)).toBe(2)
  })
  it('>=55 → 3(flourishing)', () => {
    expect(stageOf(55)).toBe(3)
    expect(stageOf(999)).toBe(3)
  })
})

describe('bucketOf — 그로브현황 버킷 경계', () => {
  it('<10 → dormant(휴면)', () => {
    expect(bucketOf(0)).toBe('dormant')
    expect(bucketOf(9)).toBe('dormant')
  })
  it('10..39 → moderate(보통)', () => {
    expect(bucketOf(10)).toBe('moderate')
    expect(bucketOf(39)).toBe('moderate')
  })
  it('>=40 → active(활발)', () => {
    expect(bucketOf(40)).toBe('active')
    expect(bucketOf(500)).toBe('active')
  })
})

describe('toShortDate — 로컬 YYYY-MM-DD', () => {
  it('월/일 0패딩', () => {
    expect(toShortDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toShortDate(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})
