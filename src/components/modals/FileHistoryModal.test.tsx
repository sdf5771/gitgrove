import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { FileHistoryModal } from './FileHistoryModal'
import { installGitApiMock } from '../../test/gitApiMock'
import type { Mock } from 'vitest'

const REPO = '/repo/a'
const FILE = 'src/auth/jwt.ts'

// full hash 는 40자로 두어 slice(0,7) 배지 검증이 결정적이도록.
const FULL0 = 'abc1234' + '0'.repeat(33)
const FULL1 = 'def5678' + '0'.repeat(33)
const LOG = [
  { id: 'abc1234', fullId: FULL0, msg: 'jwt 만료 처리', author: 'Alice', time: '2h ago', parents: [], refs: [], stats: { files: 1, insertions: 8, deletions: 3 } },
  { id: 'def5678', fullId: FULL1, msg: '토큰 파서 분리\n본문 무시', author: 'Bob', time: '1d ago', parents: [], refs: [], stats: { files: 2, insertions: 20, deletions: 5 } },
] as unknown as GitCommit[]

let api: ReturnType<typeof installGitApiMock>['gitAPI']
beforeEach(() => { localStorage.clear(); api = installGitApiMock().gitAPI })
afterEach(cleanup)

function renderModal(over?: Partial<Parameters<typeof FileHistoryModal>[0]>) {
  const onClose = vi.fn(), onOpenCommit = vi.fn(), onBlameAtRev = vi.fn()
  const utils = render(
    <FileHistoryModal repoPath={REPO} filePath={FILE} onClose={onClose} onOpenCommit={onOpenCommit} onBlameAtRev={onBlameAtRev} {...over} />
  )
  return { onClose, onOpenCommit, onBlameAtRev, ...utils }
}

describe('FileHistoryModal — 파일 이력 목록 · diff', () => {
  it('getFileLog(repo, path, {limit:100})로 좌측 리스트를 그린다', async () => {
    (api.getFileLog as unknown as Mock).mockResolvedValue(LOG)
    renderModal()
    await waitFor(() => expect(api.getFileLog).toHaveBeenCalledWith(REPO, FILE, { limit: 100 }))
    // 두 커밋의 첫 줄 메시지 + 짧은 sha
    expect(await screen.findByText('jwt 만료 처리')).toBeInTheDocument()
    expect(screen.getByText('토큰 파서 분리')).toBeInTheDocument()
    expect(screen.getByText('abc1234')).toBeInTheDocument()
    // 헤더 sub = 파일 경로
    expect(screen.getAllByText(FILE).length).toBeGreaterThan(0)
  })

  it('첫 항목이 자동 선택되어 그 커밋의 diff를 getCommitFileDiff(repo, fullId, path)로 조회한다', async () => {
    (api.getFileLog as unknown as Mock).mockResolvedValue(LOG)
    renderModal()
    await waitFor(() => expect(api.getCommitFileDiff).toHaveBeenCalledWith(REPO, FULL0, FILE))
  })

  it('다른 행 선택 시 그 커밋 fullId로 diff를 재조회한다', async () => {
    (api.getFileLog as unknown as Mock).mockResolvedValue(LOG)
    renderModal()
    await screen.findByText('토큰 파서 분리')
    ;(api.getCommitFileDiff as unknown as Mock).mockClear()
    fireEvent.click(screen.getByText('토큰 파서 분리'))
    await waitFor(() => expect(api.getCommitFileDiff).toHaveBeenCalledWith(REPO, FULL1, FILE))
  })

  it("'이 커밋 열기'는 선택 커밋으로 onOpenCommit, '이 시점 blame'은 (path, fullId)로 onBlameAtRev", async () => {
    (api.getFileLog as unknown as Mock).mockResolvedValue(LOG)
    const { onOpenCommit, onBlameAtRev } = renderModal()
    await screen.findByText('토큰 파서 분리')
    fireEvent.click(screen.getByText('토큰 파서 분리'))

    fireEvent.click(await screen.findByText('이 커밋 열기'))
    expect(onOpenCommit).toHaveBeenCalledWith(expect.objectContaining({ fullId: FULL1 }))

    fireEvent.click(screen.getByText('이 시점 blame'))
    expect(onBlameAtRev).toHaveBeenCalledWith(FILE, FULL1)
  })

  it('이력이 없으면 빈 상태 + 다음 행동 제안을 보인다', async () => {
    (api.getFileLog as unknown as Mock).mockResolvedValue([])
    renderModal()
    expect(await screen.findByText('이 파일의 커밋 이력이 없어요 · 다른 파일을 골라 보세요')).toBeInTheDocument()
  })

  it('이력 로드 실패 시 오류 문구를 보인다', async () => {
    (api.getFileLog as unknown as Mock).mockRejectedValue(new Error('boom'))
    renderModal()
    expect(await screen.findByText('이력을 불러오지 못했어요 · 다시 열어 보세요')).toBeInTheDocument()
  })
})

describe('FileHistoryModal — 닫기', () => {
  it('Escape로 닫힌다', async () => {
    (api.getFileLog as unknown as Mock).mockResolvedValue(LOG)
    const { onClose } = renderModal()
    await screen.findByText('jwt 만료 처리')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('백드롭 클릭으로 닫히고, 내부 클릭은 전파되지 않는다', async () => {
    (api.getFileLog as unknown as Mock).mockResolvedValue(LOG)
    const { onClose, container } = renderModal()
    await screen.findByText('jwt 만료 처리')
    // 내부(모달 박스) 클릭은 onClose 미호출
    fireEvent.click(container.querySelector('.modal-box')!)
    expect(onClose).not.toHaveBeenCalled()
    // 백드롭 클릭은 onClose
    fireEvent.click(container.querySelector('.modal-bd')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
