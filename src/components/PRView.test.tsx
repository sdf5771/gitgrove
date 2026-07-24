import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
import { PRView } from './PRView'
import { GithubApiError } from '../utils/githubClient'

// 버그3 — PR 탭 진입 시 상세 미선택(빈 상태) 기본, 클릭해야 상세 표시.
// getGithubToken / getPulls만 mock.

const getTokenMock = vi.fn()
vi.mock('../utils/githubToken', async () => {
  const actual = await vi.importActual<typeof import('../utils/githubToken')>('../utils/githubToken')
  return { ...actual, getGithubToken: (...a: unknown[]) => getTokenMock(...a) }
})

const getPullsMock = vi.fn()
const createReviewMock = vi.fn()
const mergePullMock = vi.fn()
const createIssueCommentMock = vi.fn()
vi.mock('../utils/githubClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/githubClient')>('../utils/githubClient')
  return {
    ...actual,
    getPulls: (...a: unknown[]) => getPullsMock(...a),
    createReview: (...a: unknown[]) => createReviewMock(...a),
    mergePull: (...a: unknown[]) => mergePullMock(...a),
    createIssueComment: (...a: unknown[]) => createIssueCommentMock(...a),
  }
})

function ghPull(over: { number: number; title: string; state?: string }) {
  return {
    number: over.number,
    title: over.title,
    user: { login: 'seobi' },
    head: { ref: 'feat/x' },
    base: { ref: 'main' },
    state: over.state ?? 'open',
    merged_at: null,
    created_at: '2026-06-10T00:00:00Z',
    comments: 0,
    labels: [],
    body: '본문',
  }
}

function installApi() {
  Object.defineProperty(window, 'gitAPI', {
    configurable: true,
    value: { getRemotes: vi.fn(async () => [{ name: 'origin', url: 'git@github.com:seobi/gitgrove.git' }]) },
  })
}

beforeEach(() => {
  getTokenMock.mockReset().mockResolvedValue('ghp_tok')
  getPullsMock.mockReset()
  createReviewMock.mockReset().mockResolvedValue({ id: 1, state: 'APPROVED', body: '', html_url: '', user: { login: 'seobi' } })
  mergePullMock.mockReset().mockResolvedValue({ merged: true, message: 'Merged', sha: 'abc' })
  createIssueCommentMock.mockReset().mockResolvedValue({ id: 9, body: 'LGTM', html_url: '', user: { login: 'seobi' }, created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z' })
  installApi()
})
afterEach(cleanup)

describe('PRView — 버그3 (마운트 시 상세 미선택)', () => {
  it('탭 진입 시 상세는 미선택(빈 상태) — 특정 PR 상세가 자동 로드되지 않는다', async () => {
    getPullsMock.mockResolvedValue({ data: [ghPull({ number: 7, title: '토큰 회전' })] })
    const { container } = render(<PRView repoPath="/repo/gh" notify={vi.fn()} />)
    // 목록은 표시되지만 상세는 빈 상태.
    await waitFor(() => expect(within(container.querySelector('.pr-list-pane') as HTMLElement).getByText('토큰 회전')).toBeInTheDocument())
    expect(screen.getByText('왼쪽에서 PR을 고르면 여기에 보여요')).toBeInTheDocument()
    // 상세 헤더(.pr-detail-title)에 제목이 뜨지 않는다.
    expect(container.querySelector('.pr-detail-title')).toBeNull()
  })

  it('목록 항목을 클릭하면 해당 PR 상세가 뜬다', async () => {
    getPullsMock.mockResolvedValue({ data: [ghPull({ number: 7, title: '토큰 회전' })] })
    const { container } = render(<PRView repoPath="/repo/gh" notify={vi.fn()} />)
    await waitFor(() => expect(within(container.querySelector('.pr-list-pane') as HTMLElement).getByText('토큰 회전')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-pane') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(container.querySelector('.pr-detail-title')?.textContent).toBe('토큰 회전'))
    expect(screen.queryByText('왼쪽에서 PR을 고르면 여기에 보여요')).toBeNull()
  })
})

describe('PRView — PR 액션 배선', () => {
  async function openPR(container: HTMLElement) {
    await waitFor(() => expect(within(container.querySelector('.pr-list-pane') as HTMLElement).getByText('토큰 회전')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-pane') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(container.querySelector('.pr-detail-title')?.textContent).toBe('토큰 회전'))
  }

  it('승인은 확인 다이얼로그 후에만 createReview(APPROVE)를 호출하고 ✓ Approved로 바뀐다', async () => {
    getPullsMock.mockResolvedValue({ data: [ghPull({ number: 7, title: '토큰 회전' })] })
    const { container } = render(<PRView repoPath="/repo/gh" notify={vi.fn()} />)
    await openPR(container)
    // 클릭 즉시 호출하지 않고 확인 다이얼로그를 먼저 띄운다
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(screen.getByText('이 PR을 승인할까요?')).toBeInTheDocument())
    expect(createReviewMock).not.toHaveBeenCalled()
    // 확인해야 실제 API 호출
    fireEvent.click(screen.getByRole('button', { name: '승인' }))
    await waitFor(() => expect(createReviewMock).toHaveBeenCalledWith('seobi', 'gitgrove', 7, 'ghp_tok', 'APPROVE'))
    await waitFor(() => expect(screen.getByRole('button', { name: '✓ Approved' })).toBeInTheDocument())
  })

  it('승인 다이얼로그에서 취소하면 API를 호출하지 않는다', async () => {
    getPullsMock.mockResolvedValue({ data: [ghPull({ number: 7, title: '토큰 회전' })] })
    const { container } = render(<PRView repoPath="/repo/gh" notify={vi.fn()} />)
    await openPR(container)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(screen.getByText('이 PR을 승인할까요?')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByText('이 PR을 승인할까요?')).toBeNull())
    expect(createReviewMock).not.toHaveBeenCalled()
  })

  it('변경 요청은 body 필수 — 인라인 폼 입력 후 createReview(REQUEST_CHANGES, body) 호출', async () => {
    getPullsMock.mockResolvedValue({ data: [ghPull({ number: 7, title: '토큰 회전' })] })
    const { container } = render(<PRView repoPath="/repo/gh" notify={vi.fn()} />)
    await openPR(container)
    fireEvent.click(screen.getByRole('button', { name: 'Request Changes' }))
    const ta = await screen.findByPlaceholderText('변경 요청 사유를 적어 주세요 (필수)')
    // 빈 입력이면 보내기 버튼 비활성
    expect(screen.getByRole('button', { name: '변경 요청 보내기' })).toBeDisabled()
    fireEvent.change(ta, { target: { value: '테스트 좀 더 부탁해요' } })
    fireEvent.click(screen.getByRole('button', { name: '변경 요청 보내기' }))
    await waitFor(() => expect(createReviewMock).toHaveBeenCalledWith('seobi', 'gitgrove', 7, 'ghp_tok', 'REQUEST_CHANGES', '테스트 좀 더 부탁해요'))
  })

  it('머지 버튼 → 확인 다이얼로그(방식 선택) → mergePull 호출', async () => {
    getPullsMock.mockResolvedValue({ data: [ghPull({ number: 7, title: '토큰 회전' })] })
    const { container } = render(<PRView repoPath="/repo/gh" notify={vi.fn()} />)
    await openPR(container)
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(screen.getByText('Squash')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Squash'))
    fireEvent.click(screen.getByRole('button', { name: '머지' }))
    await waitFor(() => expect(mergePullMock).toHaveBeenCalledWith('seobi', 'gitgrove', 7, 'ghp_tok', 'squash'))
  })

  it('코멘트 탭: 입력 후 보내기 → createIssueComment 호출 + 입력 비움', async () => {
    getPullsMock.mockResolvedValue({ data: [ghPull({ number: 7, title: '토큰 회전' })] })
    const { container } = render(<PRView repoPath="/repo/gh" notify={vi.fn()} />)
    await openPR(container)
    fireEvent.click(screen.getByRole('button', { name: /Comments \(/ }))
    const ta = await screen.findByPlaceholderText('코멘트를 남겨 보세요')
    fireEvent.change(ta, { target: { value: 'LGTM 🌱' } })
    fireEvent.click(screen.getByRole('button', { name: '보내기' }))
    await waitFor(() => expect(createIssueCommentMock).toHaveBeenCalledWith('seobi', 'gitgrove', 7, 'ghp_tok', 'LGTM 🌱'))
    await waitFor(() => expect((ta as HTMLTextAreaElement).value).toBe(''))
  })

  it('머지: 방식 미변경(기본값)이면 mergePull이 merge로 호출된다', async () => {
    getPullsMock.mockResolvedValue({ data: [ghPull({ number: 7, title: '토큰 회전' })] })
    const { container } = render(<PRView repoPath="/repo/gh" notify={vi.fn()} />)
    await openPR(container)
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(screen.getByText('Squash')).toBeInTheDocument())
    // 방식을 바꾸지 않고 바로 확인 → 기본 merge
    fireEvent.click(screen.getByRole('button', { name: '머지' }))
    await waitFor(() => expect(mergePullMock).toHaveBeenCalledWith('seobi', 'gitgrove', 7, 'ghp_tok', 'merge'))
  })

  it('코멘트 전송 성공 후 목록을 재조회한다(loadPRs 재호출)', async () => {
    getPullsMock.mockResolvedValue({ data: [ghPull({ number: 7, title: '토큰 회전' })] })
    const { container } = render(<PRView repoPath="/repo/gh" notify={vi.fn()} />)
    await openPR(container)
    await waitFor(() => expect(getPullsMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /Comments \(/ }))
    const ta = await screen.findByPlaceholderText('코멘트를 남겨 보세요')
    fireEvent.change(ta, { target: { value: 'LGTM' } })
    fireEvent.click(screen.getByRole('button', { name: '보내기' }))
    // 전송 성공 → 액션 후 재조회로 getPulls가 다시 불린다.
    await waitFor(() => expect(getPullsMock.mock.calls.length).toBeGreaterThanOrEqual(2))
  })

  it('403(쓰기 권한 없음): 승인 실패 → repo 스코프 안내 토스트, ✓ Approved로 안 바뀐다', async () => {
    getPullsMock.mockResolvedValue({ data: [ghPull({ number: 7, title: '토큰 회전' })] })
    createReviewMock.mockRejectedValue(new GithubApiError('GitHub API error: 403', 403, false))
    const notify = vi.fn()
    const { container } = render(<PRView repoPath="/repo/gh" notify={notify} />)
    await openPR(container)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(screen.getByText('이 PR을 승인할까요?')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '승인' }))
    await waitFor(() => expect(createReviewMock).toHaveBeenCalled())
    // 사유 먼저: repo 스코프 안내가 에러 토스트로 전달된다.
    await waitFor(() => {
      const call = notify.mock.calls.find(c => c[0] === 'error' && c[1] === '승인 실패')
      expect(call).toBeTruthy()
      expect(call?.[2]).toContain('repo')
    })
    // 실패했으므로 승인 상태로 바뀌지 않는다.
    expect(screen.queryByRole('button', { name: '✓ Approved' })).toBeNull()
  })
})
