import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ConflictEditorModal } from './ConflictEditorModal'
import { installGitApiMock } from '../../test/gitApiMock'

// ConflictEditorModal 실배선 검증.
// getConflicts/resolveConflict/continueMerge IPC(mock)로:
//  - 충돌 렌더 / 0건 빈 상태
//  - 모든 hunk 해결 후 "머지 완료" → resolveConflict + continueMerge 호출, ok면 onComplete
//  - continue conflict 잔존 / error 처리

const REPO = '/repo/a'

const SAMPLE = [
  {
    path: 'src/auth/session.ts',
    conflicts: [
      { id: 'src/auth/session.ts#0', ours: ['ours line A'], theirs: ['theirs line A'], startLine: 3 },
    ],
  },
  {
    path: 'package.json',
    conflicts: [
      { id: 'package.json#0', ours: ['  "version": "1.1.9",'], theirs: ['  "version": "1.2.0",'], startLine: 5 },
    ],
  },
]

let api: ReturnType<typeof installGitApiMock>['gitAPI']

beforeEach(() => {
  localStorage.clear()
  api = installGitApiMock().gitAPI
})
afterEach(cleanup)

describe('ConflictEditorModal — 실 IPC 배선', () => {
  it('getConflicts 결과로 충돌 파일·hunk를 렌더한다', async () => {
    api.getConflicts.mockResolvedValue(SAMPLE)
    render(<ConflictEditorModal repoPath={REPO} onClose={vi.fn()} />)

    await waitFor(() => expect(api.getConflicts).toHaveBeenCalledWith(REPO))
    // 첫 파일(파일 목록 base명)과 충돌 블록 헤더가 보인다. 코드 줄은 구문
    // 하이라이트로 여러 span에 쪼개지므로 단일 텍스트 노드(파일명·헤더·카운터)로 단언.
    expect(await screen.findByText('session.ts')).toBeInTheDocument()
    expect(screen.getByText('충돌 1')).toBeInTheDocument()
    // 진행 카운터 0/2 (총 2 hunk)
    expect(screen.getByText('0/2 해결됨')).toBeInTheDocument()
  })

  it('충돌 0건이면 빈 상태("해결할 충돌이 없어요")를 보여준다', async () => {
    api.getConflicts.mockResolvedValue([])
    render(<ConflictEditorModal repoPath={REPO} onClose={vi.fn()} />)
    expect(await screen.findByText('해결할 충돌이 없어요')).toBeInTheDocument()
  })

  it('모든 hunk 해결 후 머지 완료 → resolveConflict + continueMerge 호출, ok면 onComplete + 닫기', async () => {
    api.getConflicts.mockResolvedValue(SAMPLE)
    api.continueMerge.mockResolvedValue({ ok: true })
    const onComplete = vi.fn()
    const onClose = vi.fn()
    render(<ConflictEditorModal repoPath={REPO} onClose={onClose} onComplete={onComplete} />)

    await screen.findByText('session.ts')

    // 파일1의 hunk 해결 (내 변경 사용)
    fireEvent.click(screen.getByText('이걸 사용 ←'))
    // 파일2로 이동
    fireEvent.click(screen.getByText('package.json'))
    fireEvent.click(await screen.findByText('이걸 사용 →'))

    // 모두 해결 → 머지 완료 버튼 활성
    const completeBtn = await screen.findByText('머지 완료 →')
    expect(completeBtn).not.toBeDisabled()
    fireEvent.click(completeBtn)

    await waitFor(() => expect(api.continueMerge).toHaveBeenCalledWith(REPO))
    // 파일별 resolveConflict — 순서대로 choice 배열
    expect(api.resolveConflict).toHaveBeenCalledWith(REPO, 'src/auth/session.ts', ['ours'])
    expect(api.resolveConflict).toHaveBeenCalledWith(REPO, 'package.json', ['theirs'])
    expect(onComplete).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('continueMerge가 conflict 잔존을 반환하면 안내 후 다시 로드한다', async () => {
    api.getConflicts.mockResolvedValue([SAMPLE[0]])
    api.continueMerge.mockResolvedValue({ ok: false, conflict: true })
    const onComplete = vi.fn()
    render(<ConflictEditorModal repoPath={REPO} onClose={vi.fn()} onComplete={onComplete} />)

    await screen.findByText('session.ts')
    fireEvent.click(screen.getByText('이걸 사용 ←'))
    fireEvent.click(await screen.findByText('머지 완료 →'))

    await waitFor(() => expect(api.continueMerge).toHaveBeenCalled())
    expect(await screen.findByText(/충돌이 아직 남아/)).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
    // 다시 로드 — getConflicts 두 번 호출(마운트 + 잔존 후 재로드)
    expect(api.getConflicts).toHaveBeenCalledTimes(2)
  })

  it('continueMerge가 error를 반환하면 에러를 담백하게 표시한다', async () => {
    api.getConflicts.mockResolvedValue([SAMPLE[0]])
    api.continueMerge.mockResolvedValue({ ok: false, error: 'nothing to commit' })
    const onComplete = vi.fn()
    render(<ConflictEditorModal repoPath={REPO} onClose={vi.fn()} onComplete={onComplete} />)

    await screen.findByText('session.ts')
    fireEvent.click(screen.getByText('이걸 사용 ←'))
    fireEvent.click(await screen.findByText('머지 완료 →'))

    expect(await screen.findByText('nothing to commit')).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
  })
})
