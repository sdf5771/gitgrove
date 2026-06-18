import { describe, it, expect } from 'vitest'
import {
  normalizeStage,
  phaseIndexForStage,
  phasesFor,
  computePhaseStatuses,
  initialModel,
  applyProgress,
  overallPercent,
  isDeterminate,
  currentLabel,
  countMeta,
  rateText,
  mapResult,
  opTarget,
} from './syncProgress'
import type { RemoteProgress, GitRemoteResult } from './syncResult'

const prog = (op: RemoteProgress['op'], stage: string, progress: number, processed?: number, total?: number): RemoteProgress =>
  ({ op, stage, progress, processed, total })

describe('normalizeStage', () => {
  it('소문자 + 콜론/공백 이후 절단', () => {
    expect(normalizeStage('Receiving objects')).toBe('receiving')
    expect(normalizeStage('remote: Counting')).toBe('remote')
    expect(normalizeStage('  Compressing  ')).toBe('compressing')
  })
  it('빈/누락 입력 방어', () => {
    expect(normalizeStage('')).toBe('')
    expect(normalizeStage(undefined as unknown as string)).toBe('')
  })
})

describe('phaseIndexForStage — stage → phase 매핑', () => {
  it('pull raw stage들을 올바른 phase 인덱스로 매핑', () => {
    expect(phaseIndexForStage('pull', 'remote')).toBe(0)
    expect(phaseIndexForStage('pull', 'counting')).toBe(1)
    expect(phaseIndexForStage('pull', 'compressing')).toBe(2)
    expect(phaseIndexForStage('pull', 'receiving')).toBe(3)
    expect(phaseIndexForStage('pull', 'resolving')).toBe(4)
    expect(phaseIndexForStage('pull', 'merging')).toBe(5)
  })
  it('push는 writing/sending이 "올리는 중" phase', () => {
    expect(phaseIndexForStage('push', 'writing')).toBe(2)
    expect(phaseIndexForStage('push', 'sending')).toBe(2)
  })
  it('알 수 없는 stage는 -1', () => {
    expect(phaseIndexForStage('pull', 'frobnicating')).toBe(-1)
  })
  it('raw 문자열에 콜론이 붙어도 매핑', () => {
    expect(phaseIndexForStage('pull', 'Receiving objects:')).toBe(3)
  })
})

describe('isDeterminate — 단계별 진행바 모드', () => {
  it('receiving/compressing/resolving은 determinate, remote/merging은 indeterminate', () => {
    const recv = applyProgress(initialModel('pull'), prog('pull', 'receiving', 10))
    expect(isDeterminate(recv)).toBe(true)
    const remote = applyProgress(initialModel('pull'), prog('pull', 'remote', 0))
    expect(isDeterminate(remote)).toBe(false)
    const merge = applyProgress(recv, prog('pull', 'merging', 0))
    expect(isDeterminate(merge)).toBe(false)
  })
})

describe('applyProgress — 역행 방지', () => {
  it('더 앞 phase 이벤트가 늦게 와도 phase를 되돌리지 않는다', () => {
    let m = initialModel('pull')
    m = applyProgress(m, prog('pull', 'receiving', 50, 64, 128)) // phase 3
    expect(m.maxPhase).toBe(3)
    m = applyProgress(m, prog('pull', 'remote', 5)) // 늦게 온 phase 0 → 무시
    expect(m.maxPhase).toBe(3)
    expect(m.phaseProgress).toBe(50)
  })
  it('progress는 0~100으로 clamp', () => {
    const m = applyProgress(initialModel('pull'), prog('pull', 'receiving', 250))
    expect(m.phaseProgress).toBe(100)
    const m2 = applyProgress(initialModel('pull'), prog('pull', 'receiving', -5))
    expect(m2.phaseProgress).toBe(0)
  })
})

describe('overallPercent — phase 균등 분할 + 내부 진행률', () => {
  it('첫 phase 시작은 0%, det 단계 내부 진행을 반영', () => {
    const phases = phasesFor('pull').length
    const m = applyProgress(initialModel('pull'), prog('pull', 'receiving', 100, 128, 128))
    // phase 3 완료분(3/6) + 현재 phase 100%(1/6) = 4/6
    expect(overallPercent(m)).toBe(Math.round((4 / phases) * 100))
  })
  it('indet 단계는 phase 경계만 반영(내부 진행 0)', () => {
    const phases = phasesFor('pull').length
    const m = applyProgress(initialModel('pull'), prog('pull', 'remote', 80))
    expect(overallPercent(m)).toBe(0) // phase 0, indeterminate
    const m2 = applyProgress(m, prog('pull', 'merging', 99)) // phase 5, indeterminate
    expect(overallPercent(m2)).toBe(Math.round((5 / phases) * 100))
  })
})

describe('computePhaseStatuses', () => {
  it('현재 phase 앞=done, 같음=active, 뒤=pending', () => {
    const s = computePhaseStatuses('pull', 3)
    expect(s[2]).toBe('done')
    expect(s[3]).toBe('active')
    expect(s[4]).toBe('pending')
  })
  it('done=true면 전부 done', () => {
    const s = computePhaseStatuses('pull', 3, { done: true })
    expect(s.every(x => x === 'done')).toBe(true)
  })
  it('errorAt이면 해당 칸 err, 앞은 done, 뒤는 pending', () => {
    const s = computePhaseStatuses('pull', 5, { errorAt: 5 })
    expect(s[4]).toBe('done')
    expect(s[5]).toBe('err')
  })
})

describe('countMeta / rateText — determinate 단계만', () => {
  it('processed/total이 있으면 "74/128" 메타', () => {
    const m = applyProgress(initialModel('pull'), prog('pull', 'receiving', 58, 74, 128))
    expect(countMeta(m)).toBe('74/128')
    expect(rateText(m)).toBe('74/128 objects')
  })
  it('indet 단계는 메타 없음', () => {
    const m = applyProgress(initialModel('pull'), prog('pull', 'remote', 0, 0, 0))
    expect(countMeta(m)).toBe('')
    expect(rateText(m)).toBe('')
  })
  it('total 누락이면 메타 생략', () => {
    const m = applyProgress(initialModel('pull'), prog('pull', 'receiving', 50))
    expect(countMeta(m)).toBe('')
  })
})

describe('currentLabel', () => {
  it('현재 phase 한글 라벨', () => {
    const m = applyProgress(initialModel('pull'), prog('pull', 'receiving', 10))
    expect(currentLabel(m)).toBe('객체 받는 중')
  })
})

describe('opTarget — HUD 헤더 sub', () => {
  it('pull은 origin→local, push는 local→origin', () => {
    expect(opTarget('pull', 'main').sub).toBe('origin/main → main')
    expect(opTarget('push', 'dev').sub).toBe('dev → origin/dev')
  })
})

describe('mapResult — 결과 → HUD/토스트', () => {
  it('pull 성공: merge 표정 + diff stat + 커밋수', () => {
    const r: GitRemoteResult = { success: true, op: 'pull', summary: '', newCommits: 3, changedFiles: 12, insertions: 340, deletions: 88 }
    const v = mapResult(r)
    expect(v.kind).toBe('success')
    expect(v.geuru).toBe('merge')
    expect(v.insertions).toBe(340)
    expect(v.deletions).toBe(88)
    expect(v.toast.cls).toBe('success')
    expect(v.toast.msg).toContain('3 커밋')
  })
  it('pull 충돌: conflict 표정 + warning 토스트 + 파일 수', () => {
    const r: GitRemoteResult = { success: false, op: 'pull', summary: '', conflict: true, conflictedFiles: ['a.ts', 'b.ts', 'c.ts'] }
    const v = mapResult(r)
    expect(v.kind).toBe('conflict')
    expect(v.geuru).toBe('conflict')
    expect(v.detail).toContain('3개 파일')
    expect(v.toast.cls).toBe('warning')
    expect(v.toast.msg).toBe('3 files conflicted')
  })
  it('이미 최신(upToDate): happy 표정 + info 토스트', () => {
    const r: GitRemoteResult = { success: true, op: 'pull', summary: 'Already up to date', upToDate: true }
    const v = mapResult(r)
    expect(v.kind).toBe('uptodate')
    expect(v.geuru).toBe('happy')
    expect(v.toast.cls).toBe('info')
  })
  it('이미 최신(newCommits=0 추론)', () => {
    const r: GitRemoteResult = { success: true, op: 'fetch', summary: '', newCommits: 0 }
    expect(mapResult(r).kind).toBe('uptodate')
  })
  it('push 성공: merge 표정 + pushedCommits', () => {
    const r: GitRemoteResult = { success: true, op: 'push', summary: '', pushedCommits: 2 }
    const v = mapResult(r)
    expect(v.kind).toBe('success')
    expect(v.toast.title).toBe('Push 완료')
    expect(v.toast.msg).toContain('2 커밋')
  })
  it('upstream 없어 커밋수 undefined면 카운트 표기 생략(폴백)', () => {
    const r: GitRemoteResult = { success: true, op: 'pull', summary: 'updated', changedFiles: 4 }
    const v = mapResult(r)
    expect(v.kind).toBe('success')
    expect(v.commits).toBeUndefined()
    expect(v.detail).toContain('변경사항')
  })
})
