import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { InteractiveRebaseModal } from './InteractiveRebaseModal'
import { installGitApiMock } from '../../test/gitApiMock'
import type { Commit } from '../../data/mockData'

// 계획 편집기 + 결과 미리보기(폴딩) 검증.
//  - lane 0 커밋 6개 → 계획 6행 · 미리보기 6 커밋
//  - 배지 클릭으로 drop 순환 → 미리보기 커밋 수 감소 · "N 버림"
//  - 리베이스 시작 → rebaseInteractive 호출 → 완료 화면

const REPO = '/repo/a'

// lane 0 커밋 7개(6개 계획 + 1개 기준). 최소 필드만 채우고 나머지는 캐스트.
const COMMITS = Array.from({ length: 7 }, (_, i) => ({
  id: `hash${i}`,
  msg: `커밋 ${i}`,
  lane: 0,
})) as unknown as Commit[]

let api: ReturnType<typeof installGitApiMock>['gitAPI']

beforeEach(() => {
  localStorage.clear()
  api = installGitApiMock().gitAPI
})
afterEach(cleanup)

describe('InteractiveRebaseModal — 계획 + 결과 미리보기', () => {
  it('lane0 커밋 6개를 계획 행으로, 미리보기를 6 커밋으로 그린다', () => {
    render(<InteractiveRebaseModal onClose={vi.fn()} repoPath={REPO} commits={COMMITS} currentBranch="main" />)
    // '커밋 0'은 계획 행 + 미리보기 노드 양쪽에 나온다(미리보기 배선 증거).
    expect(screen.getAllByText('커밋 0').length).toBe(2)
    expect(screen.getByText('결과 미리보기 · 6 커밋')).toBeInTheDocument()
    // 기준 커밋(7번째)은 앵커로만 노출
    expect(screen.getAllByText(/hash6/).length).toBeGreaterThan(0)
  })

  it('첫 커밋을 drop으로 순환하면 미리보기가 5 커밋으로 줄고 버림 카운트가 오른다', () => {
    render(<InteractiveRebaseModal onClose={vi.fn()} repoPath={REPO} commits={COMMITS} currentBranch="main" />)
    // 첫 행 배지: pick → squash → fixup → edit → drop (4번 클릭)
    const badges = screen.getAllByText('pick')
    for (let i = 0; i < 4; i++) fireEvent.click(badges[0])
    expect(screen.getByText('결과 미리보기 · 5 커밋')).toBeInTheDocument()
    expect(screen.getByText('1 버림')).toBeInTheDocument()
  })

  it('리베이스 시작 → rebaseInteractive 호출 후 완료 화면', async () => {
    api.rebaseInteractive.mockResolvedValue(undefined)
    const onSuccess = vi.fn()
    render(<InteractiveRebaseModal onClose={vi.fn()} onSuccess={onSuccess} repoPath={REPO} commits={COMMITS} currentBranch="main" />)
    fireEvent.click(screen.getByText('리베이스 시작 →'))
    await waitFor(() => expect(api.rebaseInteractive).toHaveBeenCalledWith(
      REPO,
      expect.arrayContaining([expect.objectContaining({ hash: 'hash0', action: 'pick' })]),
    ))
    expect(await screen.findByText(/가지치기 완료/)).toBeInTheDocument()
    expect(onSuccess).toHaveBeenCalled()
  })
})
