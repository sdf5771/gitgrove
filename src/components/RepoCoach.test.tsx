import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RepoCoach } from './RepoCoach'
import { deriveCoach, type RepoCoachInput } from '../utils/repoCoach'

// 저장소 코치 배너 — 상태별 문구·액션·우선순위·핸들러 배선·닫기.
// 라이팅 가이드(docs/WRITING_GUIDE.md): 해요체·가운뎃점·느낌표/이모지 없음.

const handlers = () => ({ onPull: vi.fn(), onViewChanges: vi.fn(), onResolveConflict: vi.fn(), onDismiss: vi.fn() })
const base: RepoCoachInput = { conflict: false, behind: 0, dirty: false, changeCount: 0, conflictCount: 0, branch: 'main' }

afterEach(() => cleanup())

describe('deriveCoach — 상태 파생', () => {
  it('conflict: 충돌 파일 수 문구 + [충돌 해결][중단], 그루 conflict', () => {
    const s = deriveCoach({ ...base, conflict: true, conflictCount: 2 }, handlers())
    expect(s.kind).toBe('conflict')
    expect(s.geuru).toBe('conflict')
    expect(s.title).toBe('충돌난 파일 2개 · 해결이 필요해요')
    expect(s.acts.map(a => a.label)).toEqual(['충돌 해결', '중단'])
  })

  it('behind: origin보다 N 커밋 뒤처졌어요 + [Pull 하기][나중에], 그루 think', () => {
    const s = deriveCoach({ ...base, behind: 3, branch: 'develop' }, handlers())
    expect(s.kind).toBe('behind')
    expect(s.geuru).toBe('think')
    expect(s.title).toBe('origin보다 3 커밋 뒤처졌어요')
    expect(s.acts.map(a => a.label)).toEqual(['Pull 하기', '나중에'])
  })

  it('dirty: 변경 N개 · 커밋할 준비가 됐어요 + [변경 보기], 그루 idle', () => {
    const s = deriveCoach({ ...base, dirty: true, changeCount: 5 }, handlers())
    expect(s.kind).toBe('dirty')
    expect(s.geuru).toBe('idle')
    expect(s.title).toBe('변경 5개 · 커밋할 준비가 됐어요')
    expect(s.acts.map(a => a.label)).toEqual(['변경 보기'])
  })

  it('clean: 다 정리됐어요 · 최신 상태예요 + 액션 없음, 그루 happy', () => {
    const s = deriveCoach({ ...base }, handlers())
    expect(s.kind).toBe('clean')
    expect(s.geuru).toBe('happy')
    expect(s.title).toBe('다 정리됐어요 · 최신 상태예요')
    expect(s.acts).toHaveLength(0)
  })

  it('우선순위 conflict > behind > dirty > clean', () => {
    expect(deriveCoach({ ...base, conflict: true, behind: 9, dirty: true }, handlers()).kind).toBe('conflict')
    expect(deriveCoach({ ...base, behind: 9, dirty: true }, handlers()).kind).toBe('behind')
    expect(deriveCoach({ ...base, dirty: true }, handlers()).kind).toBe('dirty')
    expect(deriveCoach({ ...base }, handlers()).kind).toBe('clean')
  })

  it('라이팅 가이드: 느낌표·장식 이모지가 없다', () => {
    const all = [
      deriveCoach({ ...base, conflict: true, conflictCount: 2 }, handlers()),
      deriveCoach({ ...base, behind: 3 }, handlers()),
      deriveCoach({ ...base, dirty: true, changeCount: 5 }, handlers()),
      deriveCoach({ ...base }, handlers()),
    ]
    for (const s of all) {
      expect(s.title).not.toMatch(/!/)
      // 쉼표 대신 가운뎃점 사용(조각 구분)
      expect(s.title).not.toMatch(/, /)
    }
  })
})

describe('RepoCoach — 렌더/액션', () => {
  it('behind: Pull 버튼 클릭 → onPull, 나중에 클릭 → onDismiss', async () => {
    const user = userEvent.setup()
    const h = handlers()
    render(<RepoCoach {...base} behind={2} {...h} />)
    await user.click(screen.getByText('Pull 하기'))
    expect(h.onPull).toHaveBeenCalledTimes(1)
    await user.click(screen.getByText('나중에'))
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dirty: 변경 보기 클릭 → onViewChanges', async () => {
    const user = userEvent.setup()
    const h = handlers()
    render(<RepoCoach {...base} dirty changeCount={3} {...h} />)
    await user.click(screen.getByText('변경 보기'))
    expect(h.onViewChanges).toHaveBeenCalledTimes(1)
  })

  it('conflict: 충돌 해결 클릭 → onResolveConflict', async () => {
    const user = userEvent.setup()
    const h = handlers()
    render(<RepoCoach {...base} conflict conflictCount={2} {...h} />)
    await user.click(screen.getByText('충돌 해결'))
    expect(h.onResolveConflict).toHaveBeenCalledTimes(1)
  })

  it('clean: 액션 버튼 없이 × 닫기만 노출, 클릭 시 onDismiss', async () => {
    const user = userEvent.setup()
    const h = handlers()
    const { container } = render(<RepoCoach {...base} {...h} />)
    expect(container.querySelectorAll('.coach-btn').length).toBe(0)
    await user.click(screen.getByLabelText('배너 닫기'))
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
  })

  it('톤 클래스가 상태(kind)와 일치한다', () => {
    const { container } = render(<RepoCoach {...base} behind={1} {...handlers()} />)
    expect(container.querySelector('.coach.behind')).not.toBeNull()
  })
})
