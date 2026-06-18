// CL2 — clone op의 진행 단계(phase) 전이 검증.
// pull/push/fetch와 같은 syncProgress 엔진을 clone op로 구동했을 때
// 연결→세기→압축→받기→델타→"파일 펼치는 중"(checkout) 순서/라벨/전이가 맞는지 본다.
import { describe, it, expect } from 'vitest'
import {
  phasesFor,
  phaseIndexForStage,
  applyProgress,
  computePhaseStatuses,
  currentLabel,
  initialModel,
  OP_TITLE,
} from './syncProgress'
import type { RemoteProgress } from './syncResult'

const ev = (stage: string, progress = 0, processed?: number, total?: number): RemoteProgress =>
  ({ op: 'clone', stage, progress, processed, total })

describe('clone phases — 단계 시퀀스/라벨', () => {
  it('마지막 단계는 checkout = "파일 펼치는 중"', () => {
    const phases = phasesFor('clone')
    const last = phases[phases.length - 1]
    expect(last.label).toBe('파일 펼치는 중')
    expect(last.stages).toContain('checkout')
  })

  it('OP_TITLE.clone = "Clone"', () => {
    expect(OP_TITLE.clone).toBe('Clone')
  })

  it('checkout stage가 clone의 마지막 phase로 매핑된다', () => {
    const phases = phasesFor('clone')
    expect(phaseIndexForStage('clone', 'checkout')).toBe(phases.length - 1)
    expect(phaseIndexForStage('clone', 'remote')).toBe(0)
    expect(phaseIndexForStage('clone', 'receiving')).toBe(3)
  })
})

describe('clone 진행 전이 — applyProgress + computePhaseStatuses', () => {
  it('연결→받기→checkout 순으로 maxPhase가 전진(역행 없음)', () => {
    let m = initialModel('clone')
    m = applyProgress(m, ev('remote'))
    expect(currentLabel(m)).toBe('원격에 연결하는 중')

    m = applyProgress(m, ev('Receiving objects', 40, 40, 100))
    expect(currentLabel(m)).toBe('객체 받는 중')
    const sMid = computePhaseStatuses('clone', m.maxPhase)
    expect(sMid[0]).toBe('done')   // remote
    expect(sMid[3]).toBe('active') // receiving

    m = applyProgress(m, ev('Checkout files', 80, 8, 10))
    expect(currentLabel(m)).toBe('파일 펼치는 중')

    // 늦게 도착한 이전 phase(receiving)는 무시(역행 금지)
    const before = m.maxPhase
    m = applyProgress(m, ev('Receiving objects', 99, 99, 100))
    expect(m.maxPhase).toBe(before)
  })

  it('완료 시 모든 phase done 표시', () => {
    const phases = phasesFor('clone')
    const s = computePhaseStatuses('clone', phases.length - 1, { done: true })
    expect(s.every(x => x === 'done')).toBe(true)
  })
})
