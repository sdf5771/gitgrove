import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SyncHud } from './SyncHud'
import {
  initialModel,
  applyProgress,
  mapResult,
  type ProgressModel,
} from '../utils/syncProgress'
import type { RemoteProgress, GitRemoteResult } from '../utils/syncResult'

afterEach(cleanup)

// onRemoteProgress mock 이벤트를 순차 적용해 모델을 만든다(수동 발사 방식).
function modelFrom(op: RemoteProgress['op'], events: RemoteProgress[]): ProgressModel {
  return events.reduce((m, e) => applyProgress(m, e), initialModel(op))
}

const p = (op: RemoteProgress['op'], stage: string, progress: number, processed?: number, total?: number): RemoteProgress =>
  ({ op, stage, progress, processed, total })

describe('SyncHud — 진행 단계 전이', () => {
  it('헤더에 op명·sub를 그리고, 진행 중에는 think 그루', () => {
    const model = modelFrom('pull', [p('pull', 'remote', 0)])
    render(<SyncHud model={model} branch="main" result={null} onClose={() => {}} />)
    expect(screen.getByText('Pull')).toBeTruthy()
    expect(screen.getByText('origin/main → main')).toBeTruthy()
    expect(screen.getByLabelText('그루 — Pull')).toBeTruthy()
  })

  it('receiving 단계: 이전 단계는 done, 현재는 active + 카운트 메타', () => {
    const model = modelFrom('pull', [
      p('pull', 'remote', 0),
      p('pull', 'counting', 0),
      p('pull', 'receiving', 58, 74, 128),
    ])
    const { container } = render(<SyncHud model={model} branch="main" result={null} onClose={() => {}} />)
    const phases = container.querySelectorAll('.hud-phase')
    // 0:연결 done, 1:세는중 done, 2:압축 done(skip된 앞 단계도 done), 3:받는중 active
    const active = container.querySelector('.hud-phase.active')
    expect(active?.querySelector('.ptxt')?.textContent).toBe('객체 받는 중')
    expect(active?.querySelector('.pmeta')?.textContent).toBe('74/128')
    // 받는 중보다 앞 단계는 done 처리(역행 없음)
    expect(phases[0].classList.contains('done')).toBe(true)
  })

  it('determinate 단계는 줄무늬 width% 바, indeterminate 단계는 흐르는 막대', () => {
    const det = modelFrom('pull', [p('pull', 'receiving', 40, 40, 100)])
    const { container: c1 } = render(<SyncHud model={det} branch="main" result={null} onClose={() => {}} />)
    expect(c1.querySelector('.hud-bar-fill.striped')).toBeTruthy()
    expect(c1.querySelector('.hud-bar-fill.indet')).toBeNull()
    cleanup()
    const indet = modelFrom('pull', [p('pull', 'remote', 0)])
    const { container: c2 } = render(<SyncHud model={indet} branch="main" result={null} onClose={() => {}} />)
    expect(c2.querySelector('.hud-bar-fill.indet')).toBeTruthy()
  })
})

describe('SyncHud — 결과 분기', () => {
  it('성공(pull): 결과 푸터 제목 + diff stat + 확인 버튼 + merge 그루', () => {
    // 마지막 phase(merging)까지 도달한 모델 → 완료 시 전 단계 done.
    const model = modelFrom('pull', [p('pull', 'merging', 100)])
    const result = mapResult({ success: true, op: 'pull', summary: '', newCommits: 3, changedFiles: 12, insertions: 340, deletions: 88 })
    const { container } = render(<SyncHud model={model} branch="main" result={result} onClose={() => {}} />)
    expect(screen.getByText('최신으로 맞췄어요')).toBeTruthy()
    expect(screen.getByText('+340')).toBeTruthy()
    expect(screen.getByText('−88')).toBeTruthy()
    expect(screen.getByRole('button', { name: '확인' })).toBeTruthy()
    expect(screen.getByLabelText('그루 — Pull')).toBeTruthy()
    // 완료 바는 녹색 done
    expect(container.querySelector('.hud-bar-fill.done')).toBeTruthy()
    // 마지막 단계까지 도달했으므로 모든 단계 done
    expect(container.querySelectorAll('.hud-phase.done').length).toBe(container.querySelectorAll('.hud-phase').length)
  })

  it('성공(pull, m3): indet만 거쳐 일찍 끝나면 도달 안 한 phase는 done 아님', () => {
    // remote(0번)까지만 도달 → 완료 시 0번만 done, 압축/받는중 등은 done 표기 안 됨.
    const model = modelFrom('pull', [p('pull', 'remote', 0)])
    const result = mapResult({ success: true, op: 'pull', summary: '', newCommits: 1, changedFiles: 1 })
    const { container } = render(<SyncHud model={model} branch="main" result={result} onClose={() => {}} />)
    const phases = container.querySelectorAll('.hud-phase')
    const doneCount = container.querySelectorAll('.hud-phase.done').length
    // 전부 done(버그)이 아니라 도달한 1칸만 done.
    expect(doneCount).toBe(1)
    expect(doneCount).toBeLessThan(phases.length)
    expect(phases[0].classList.contains('done')).toBe(true)
  })

  it('충돌(pull): 빨강 제목 + 나중에/충돌 해결 버튼 + err 바', () => {
    const model = modelFrom('pull', [p('pull', 'receiving', 80, 80, 100)])
    const result = mapResult({ success: false, op: 'pull', summary: '', conflict: true, conflictedFiles: ['a.ts', 'b.ts', 'c.ts'] })
    let resolved = false
    const { container } = render(
      <SyncHud model={model} branch="main" result={result} onClose={() => {}} onResolveConflict={() => { resolved = true }} />,
    )
    expect(screen.getByText('병합 충돌이 생겼어요')).toBeTruthy()
    expect(screen.getByRole('button', { name: '나중에' })).toBeTruthy()
    const resolveBtn = screen.getByRole('button', { name: /충돌 해결/ })
    expect(container.querySelector('.hud-bar-fill.err')).toBeTruthy()
    // err phase 존재
    expect(container.querySelector('.hud-phase.err')).toBeTruthy()
    resolveBtn.click()
    expect(resolved).toBe(true)
  })

  it('이미 최신(up-to-date): happy 결과 + 확인 버튼', () => {
    const model = modelFrom('pull', [p('pull', 'remote', 0)])
    const result = mapResult({ success: true, op: 'pull', summary: 'Already up to date', upToDate: true })
    render(<SyncHud model={model} branch="main" result={result} onClose={() => {}} />)
    expect(screen.getByText('이미 최신 상태예요')).toBeTruthy()
    expect(screen.getByRole('button', { name: '확인' })).toBeTruthy()
  })

  it('확인 버튼 클릭 시 onClose 호출', () => {
    const model = modelFrom('pull', [p('pull', 'receiving', 100, 1, 1)])
    const result = mapResult({ success: true, op: 'pull', summary: '', newCommits: 1 })
    let closed = false
    render(<SyncHud model={model} branch="main" result={result} onClose={() => { closed = true }} />)
    screen.getByRole('button', { name: '확인' }).click()
    expect(closed).toBe(true)
  })

  it('push: 헤더 sub가 local → origin 방향', () => {
    const model = modelFrom('push', [p('push', 'writing', 30, 30, 100)])
    const result: GitRemoteResult = { success: true, op: 'push', summary: '', pushedCommits: 2 }
    render(<SyncHud model={model} branch="dev" result={mapResult(result)} onClose={() => {}} />)
    expect(screen.getByText('dev → origin/dev')).toBeTruthy()
  })
})
