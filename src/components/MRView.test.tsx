import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
import { MRView } from './MRView'
import { GitlabApiError } from '../utils/gitlabClient'
import type {
  GitlabMergeRequest,
  GitlabMrChange,
  GitlabMrNote,
  GitlabPipeline,
  GitlabMrApprovals,
} from '../utils/gitlabClient'

// ── gitlabClient 모킹 (네트워크 없이 응답 주입) ──
const getMergeRequestsMock = vi.fn()
const getMergeRequestChangesMock = vi.fn()
const getMergeRequestNotesMock = vi.fn()
const getMergeRequestPipelinesMock = vi.fn()
const getMergeRequestApprovalsMock = vi.fn()
const approveMergeRequestMock = vi.fn()
const unapproveMergeRequestMock = vi.fn()
const acceptMergeRequestMock = vi.fn()
const createMergeRequestNoteMock = vi.fn()

vi.mock('../utils/gitlabClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/gitlabClient')>('../utils/gitlabClient')
  return {
    ...actual,
    getMergeRequests: (...a: unknown[]) => getMergeRequestsMock(...a),
    getMergeRequestChanges: (...a: unknown[]) => getMergeRequestChangesMock(...a),
    getMergeRequestNotes: (...a: unknown[]) => getMergeRequestNotesMock(...a),
    getMergeRequestPipelines: (...a: unknown[]) => getMergeRequestPipelinesMock(...a),
    getMergeRequestApprovals: (...a: unknown[]) => getMergeRequestApprovalsMock(...a),
    approveMergeRequest: (...a: unknown[]) => approveMergeRequestMock(...a),
    unapproveMergeRequest: (...a: unknown[]) => unapproveMergeRequestMock(...a),
    acceptMergeRequest: (...a: unknown[]) => acceptMergeRequestMock(...a),
    createMergeRequestNote: (...a: unknown[]) => createMergeRequestNoteMock(...a),
  }
})

function mr(over: Partial<GitlabMergeRequest> & Pick<GitlabMergeRequest, 'iid' | 'title' | 'state'>): GitlabMergeRequest {
  return {
    id: over.iid * 1000,
    project_id: 7,
    description: '본문 설명',
    web_url: `https://gitlab.com/platform/web-client/-/merge_requests/${over.iid}`,
    source_branch: 'feat/x',
    target_branch: 'main',
    author: { id: 1, username: 'seokim', name: '서비스킴', avatar_url: null },
    created_at: '2026-06-10T00:00:00Z',
    updated_at: '2026-06-10T00:00:00Z',
    user_notes_count: 0,
    labels: [],
    ...over,
  }
}

function installApi(over?: { hosts?: string[]; token?: string | null; remotes?: Array<{ name: string; url: string }> }) {
  const hosts = over?.hosts ?? ['https://gitlab.com']
  const token = over?.token === undefined ? 'gl-tok' : over.token
  const remotes = over?.remotes ?? [{ name: 'origin', url: 'git@gitlab.com:platform/web-client.git' }]
  Object.defineProperty(window, 'appAPI', {
    configurable: true,
    value: {
      gitlabListHosts: vi.fn(async () => hosts),
      gitlabGetToken: vi.fn(async () => token),
      openReleaseUrl: vi.fn(),
    },
  })
  Object.defineProperty(window, 'gitAPI', {
    configurable: true,
    value: { getRemotes: vi.fn(async () => remotes) },
  })
}

describe('MRView — GitLab MR 뷰 (GL7)', () => {
  beforeEach(() => {
    getMergeRequestsMock.mockReset()
    getMergeRequestChangesMock.mockReset().mockResolvedValue([] as GitlabMrChange[])
    getMergeRequestNotesMock.mockReset().mockResolvedValue([] as GitlabMrNote[])
    getMergeRequestPipelinesMock.mockReset().mockResolvedValue([] as GitlabPipeline[])
    getMergeRequestApprovalsMock.mockReset().mockRejectedValue(new Error('no approvals')) // 기본: 승인 기능 미지원
    approveMergeRequestMock.mockReset().mockResolvedValue({ approvals_required: 0, approvals_left: 0 })
    unapproveMergeRequestMock.mockReset().mockResolvedValue({ approvals_required: 0, approvals_left: 0 })
    acceptMergeRequestMock.mockReset().mockResolvedValue({ state: 'merged' })
    createMergeRequestNoteMock.mockReset().mockResolvedValue({ id: 1, body: '노트', created_at: '2026-06-10T00:00:00Z', author: { id: 1, username: 'me', name: '나', avatar_url: null } })
  })
  afterEach(cleanup)

  it('MR 목록을 렌더한다 (!iid·제목·상태·라벨)', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([
      mr({ iid: 128, title: '토큰 회전', state: 'opened', labels: ['backend', 'security'] }),
      mr({ iid: 121, title: '한국어 로케일', state: 'merged' }),
    ])
    render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    expect(screen.getAllByText('토큰 회전').length).toBeGreaterThan(0)
    expect(screen.getByText('backend')).toBeInTheDocument()
    // merged는 open 필터 기본값에서 숨겨짐
    expect(screen.queryByText('한국어 로케일')).not.toBeInTheDocument()
  })

  it('회귀: getMergeRequests를 raw projectPath로 호출한다 (이중 인코딩 → 404 방지)', async () => {
    // origin git@gitlab.com:platform/web-client.git → projectPath = 'platform/web-client'
    // 호출부(MRView)에서 encodeURIComponent하면 gitlabClient가 다시 인코딩해
    // platform%252Fweb-client → GitLab 404. 따라서 raw 경로를 그대로 넘겨야 한다.
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(getMergeRequestsMock).toHaveBeenCalled())

    const [, , opts] = getMergeRequestsMock.mock.calls[0] as [string, string, { projectId: string }]
    expect(opts.projectId).toBe('platform/web-client')
    // 인코딩된 흔적(%2F 단일/%252F 이중)이 없어야 한다
    expect(opts.projectId).not.toContain('%2F')
    expect(opts.projectId).not.toContain('%252F')
  })

  it('필터(open/merged/all)가 목록을 거른다', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([
      mr({ iid: 128, title: '열린MR', state: 'opened' }),
      mr({ iid: 121, title: '머지된MR', state: 'merged' }),
    ])
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    const listPane = () => within(container.querySelector('.pr-list-scroll') as HTMLElement)
    await waitFor(() => expect(listPane().getByText('열린MR')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Merged/ }))
    await waitFor(() => expect(listPane().getByText('머지된MR')).toBeInTheDocument())
    expect(listPane().queryByText('열린MR')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    await waitFor(() => {
      expect(listPane().getByText('열린MR')).toBeInTheDocument()
      expect(listPane().getByText('머지된MR')).toBeInTheDocument()
    })
  })

  it('상세 탭 전환(개요→변경→파이프라인→노트)', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    getMergeRequestChangesMock.mockResolvedValue([
      { old_path: 'a.ts', new_path: 'a.ts', new_file: false, renamed_file: false, deleted_file: false, diff: '+added\n-removed\n' },
    ] as GitlabMrChange[])
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    // 버그3: 탭 진입 시 미선택 — 목록에서 클릭해야 상세가 뜬다.
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByText('Description')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^변경 \(/ }))
    await waitFor(() => expect(screen.getByText('a.ts')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /파이프라인/ }))
    await waitFor(() => expect(screen.getByText('최근 파이프라인')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^노트 \(/ }))
    await waitFor(() => expect(screen.getByText('아직 노트가 없어요 · 첫 코멘트를 남겨 보세요')).toBeInTheDocument())
  })

  it('파이프라인 배지: running은 info 블루(pipe-run), 주황 아님', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 126, title: 'WIP', state: 'opened' })])
    getMergeRequestPipelinesMock.mockResolvedValue([
      { id: 1, status: 'running', ref: 'feat/x', sha: 'abc', web_url: '', created_at: '', updated_at: '' },
    ] as GitlabPipeline[])
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('!126')).toBeInTheDocument())
    // 버그3: 상세를 보려면 먼저 목록에서 선택한다.
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('WIP'))
    // 상세 헤더 파이프라인 배지가 pipe-run으로 갱신될 때까지 대기
    await waitFor(() => expect(container.querySelector('.pipe-run')).toBeTruthy())
    // running은 주황(.pipe에 직접 주황 색 지정) 아님 — pipe-run 클래스(info 블루)
    expect(container.querySelector('.pipe-run')).toBeTruthy()
    expect(container.querySelector('.pipe-fail')).toBeFalsy()
  })

  it('승인 박스: approvals 응답이 있으면 met/unmet 렌더', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    getMergeRequestApprovalsMock.mockReset().mockResolvedValue({
      approvals_required: 2,
      approvals_left: 1,
      approved_by: [{ user: { id: 5, username: 'alex', name: '알렉스 첸', avatar_url: null } }],
    } as GitlabMrApprovals)
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByText('승인 (Approvals)')).toBeInTheDocument())
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('승인 대기 중')).toBeInTheDocument()
  })

  it('빈 상태: MR이 없으면 empty 메시지', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([])
    render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('No open merge requests')).toBeInTheDocument())
  })

  it('에러 상태: getMergeRequests 실패 시 에러 표시', async () => {
    installApi()
    getMergeRequestsMock.mockRejectedValue(new Error('GitLab API error: 500'))
    render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/GitLab API error: 500/)).toBeInTheDocument())
  })

  it('미연결: origin이 GitLab이지만 host 미연결이면 연결 유도', async () => {
    installApi({ hosts: [] })
    getMergeRequestsMock.mockResolvedValue([])
    render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('GitLab 인스턴스가 연결되지 않았어요')).toBeInTheDocument())
    expect(getMergeRequestsMock).not.toHaveBeenCalled()
  })

  it('open MR 상세: 승인은 확인 다이얼로그 후 approveMergeRequest를 호출하고 ✓ 승인함으로 바뀐다', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByRole('button', { name: '승인' })).toBeInTheDocument())
    // 클릭 즉시 호출하지 않고 확인 다이얼로그를 먼저 띄운다
    fireEvent.click(screen.getByRole('button', { name: '승인' }))
    await waitFor(() => expect(screen.getByText('이 MR을 승인할까요?')).toBeInTheDocument())
    expect(approveMergeRequestMock).not.toHaveBeenCalled()
    // 다이얼로그 확인 버튼(승인)을 눌러야 실제 API 호출 — (host, projectId, iid, token) 순서
    fireEvent.click(within(document.querySelector('.modal-footer') as HTMLElement).getByRole('button', { name: '승인' }))
    await waitFor(() => expect(approveMergeRequestMock).toHaveBeenCalledWith('https://gitlab.com', 7, 128, 'gl-tok'))
    await waitFor(() => expect(screen.getByRole('button', { name: '✓ 승인함' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument()
  })

  it('open MR 상세: Merge 버튼 → 확인 다이얼로그(squash) → acceptMergeRequest 호출', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(screen.getByText('커밋을 squash로 합치기')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '머지' }))
    await waitFor(() => expect(acceptMergeRequestMock).toHaveBeenCalledWith('https://gitlab.com', 7, 128, 'gl-tok', { squash: true }))
  })

  it('open MR 노트 탭: 입력 후 보내기 → createMergeRequestNote 호출 + 입력 비움', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByRole('button', { name: /노트 \(/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /노트 \(/ }))
    const ta = await screen.findByPlaceholderText('첫 코멘트를 남겨 보세요')
    fireEvent.change(ta, { target: { value: 'LGTM 🌱' } })
    fireEvent.click(screen.getByRole('button', { name: '보내기' }))
    await waitFor(() => expect(createMergeRequestNoteMock).toHaveBeenCalledWith('https://gitlab.com', 7, 128, 'gl-tok', 'LGTM 🌱'))
    await waitFor(() => expect((ta as HTMLTextAreaElement).value).toBe(''))
  })

  it('open MR 상세: squash 미체크면 acceptMergeRequest가 body 옵션 없이(undefined) 호출된다', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(screen.getByText('커밋을 squash로 합치기')).toBeInTheDocument())
    // 체크박스를 건드리지 않고 바로 머지 → squash 옵션 미전송
    fireEvent.click(screen.getByRole('button', { name: '머지' }))
    await waitFor(() => expect(acceptMergeRequestMock).toHaveBeenCalledWith('https://gitlab.com', 7, 128, 'gl-tok', undefined))
  })

  it('비동기 머지(state≠merged)면 "머지 완료"가 아니라 "머지 예약됨"으로 안내한다', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    acceptMergeRequestMock.mockResolvedValue({ state: 'opened' }) // 파이프라인 통과 후 머지 등 아직 미머지
    const notify = vi.fn()
    const { container } = render(<MRView repoPath="/repo/gl" notify={notify} />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(screen.getByText('커밋을 squash로 합치기')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '머지' }))
    await waitFor(() => expect(acceptMergeRequestMock).toHaveBeenCalled())
    await waitFor(() => expect(notify.mock.calls.some(c => c[1] === '머지 예약됨')).toBe(true))
    expect(notify.mock.calls.some(c => c[1] === '머지 완료')).toBe(false)
  })

  it('squash 체크는 MR 선택을 바꾸면 리셋된다(다른 MR로 전이 안 됨)', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([
      mr({ iid: 128, title: '토큰 회전', state: 'opened' }),
      mr({ iid: 129, title: '다른 MR', state: 'opened' }),
    ])
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    const scroll = () => container.querySelector('.pr-list-scroll') as HTMLElement
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(scroll()).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    const cb = await screen.findByRole('checkbox')
    fireEvent.click(cb)
    expect((cb as HTMLInputElement).checked).toBe(true)
    // 다이얼로그 취소(squash 상태는 그대로) 후 다른 MR 선택 → 리셋
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByText('커밋을 squash로 합치기')).toBeNull())
    fireEvent.click(within(scroll()).getByText('다른 MR'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    const cb2 = await screen.findByRole('checkbox')
    expect((cb2 as HTMLInputElement).checked).toBe(false)
  })

  it('open MR 상세: 승인 다이얼로그에서 취소하면 approveMergeRequest를 호출하지 않는다', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByRole('button', { name: '승인' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '승인' }))
    await waitFor(() => expect(screen.getByText('이 MR을 승인할까요?')).toBeInTheDocument())
    // 다이얼로그의 취소 버튼
    fireEvent.click(within(document.querySelector('.modal-footer') as HTMLElement).getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByText('이 MR을 승인할까요?')).toBeNull())
    expect(approveMergeRequestMock).not.toHaveBeenCalled()
  })

  it('이미 승인한 MR: 승인 취소 확인 → unapproveMergeRequest 호출', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    // 현재 토큰 사용자가 이미 승인한 상태(user_has_approved) → 버튼이 '✓ 승인함'
    getMergeRequestApprovalsMock.mockReset().mockResolvedValue({
      approvals_required: 1,
      approvals_left: 0,
      user_has_approved: true,
    } as GitlabMrApprovals)
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByRole('button', { name: '✓ 승인함' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '✓ 승인함' }))
    await waitFor(() => expect(screen.getByText('승인을 취소할까요?')).toBeInTheDocument())
    fireEvent.click(within(document.querySelector('.modal-footer') as HTMLElement).getByRole('button', { name: '승인 취소' }))
    await waitFor(() => expect(unapproveMergeRequestMock).toHaveBeenCalledWith('https://gitlab.com', 7, 128, 'gl-tok'))
    expect(approveMergeRequestMock).not.toHaveBeenCalled()
  })

  it('403(쓰기 권한 없음): 승인 실패 → api 스코프 안내 토스트', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    approveMergeRequestMock.mockReset().mockRejectedValue(new GitlabApiError('GitLab API error: 403', 403, false))
    const notify = vi.fn()
    const { container } = render(<MRView repoPath="/repo/gl" notify={notify} />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByRole('button', { name: '승인' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '승인' }))
    await waitFor(() => expect(screen.getByText('이 MR을 승인할까요?')).toBeInTheDocument())
    fireEvent.click(within(document.querySelector('.modal-footer') as HTMLElement).getByRole('button', { name: '승인' }))
    await waitFor(() => expect(approveMergeRequestMock).toHaveBeenCalled())
    await waitFor(() => {
      const call = notify.mock.calls.find(c => c[0] === 'error' && c[1] === '승인 처리 실패')
      expect(call).toBeTruthy()
      expect(call?.[2]).toContain('api')
    })
    // 실패 → 승인 상태로 바뀌지 않는다.
    expect(screen.queryByRole('button', { name: '✓ 승인함' })).toBeNull()
  })

  it('노트 전송 성공 후 상세를 재조회한다(getMergeRequestNotes 재호출)', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    fireEvent.click(await screen.findByRole('button', { name: /노트 \(/ }))
    const ta = await screen.findByPlaceholderText('첫 코멘트를 남겨 보세요')
    await waitFor(() => expect(getMergeRequestNotesMock).toHaveBeenCalledTimes(1))
    fireEvent.change(ta, { target: { value: '확인했어요' } })
    fireEvent.click(screen.getByRole('button', { name: '보내기' }))
    await waitFor(() => expect(createMergeRequestNoteMock).toHaveBeenCalled())
    // refreshDetail로 선택 MR 상세(노트 포함)가 다시 조회된다.
    await waitFor(() => expect(getMergeRequestNotesMock.mock.calls.length).toBeGreaterThanOrEqual(2))
  })

  it('버그3: 탭 진입 시 상세는 미선택(빈 상태) — 특정 MR 상세가 자동 로드되지 않는다', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    // 목록은 뜨지만(클릭 가능)…
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    // 상세 빈 상태 플레이스홀더가 보이고, 상세 헤더(Description)는 없다.
    expect(screen.getByText('왼쪽에서 MR을 고르면 여기에 보여요')).toBeInTheDocument()
    expect(screen.queryByText('Description')).not.toBeInTheDocument()
  })

  it('버그3: 목록 항목을 클릭하면 해당 MR 상세가 뜬다', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByText('Description')).toBeInTheDocument())
    expect(screen.queryByText('왼쪽에서 MR을 고르면 여기에 보여요')).not.toBeInTheDocument()
  })

  it('!iid·프로젝트 점은 GitLab 식별색(주황), Merge 버튼은 골드 클래스', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    const { container } = render(<MRView repoPath="/repo/gl" notify={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    expect(container.querySelector('.gl-dot')).toBeTruthy()
    const num = screen.getByText('!128') as HTMLElement
    expect(num.style.color).toMatch(/252|fc6d26/i)
    // 버그3: Merge 버튼은 상세에 있으므로 선택 후 확인.
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(container.querySelector('.pr-merge-btn')).toBeTruthy())
  })
})
