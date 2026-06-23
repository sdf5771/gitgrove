import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
import { MRView } from './MRView'
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

vi.mock('../utils/gitlabClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/gitlabClient')>('../utils/gitlabClient')
  return {
    ...actual,
    getMergeRequests: (...a: unknown[]) => getMergeRequestsMock(...a),
    getMergeRequestChanges: (...a: unknown[]) => getMergeRequestChangesMock(...a),
    getMergeRequestNotes: (...a: unknown[]) => getMergeRequestNotesMock(...a),
    getMergeRequestPipelines: (...a: unknown[]) => getMergeRequestPipelinesMock(...a),
    getMergeRequestApprovals: (...a: unknown[]) => getMergeRequestApprovalsMock(...a),
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
  })
  afterEach(cleanup)

  it('MR 목록을 렌더한다 (!iid·제목·상태·라벨)', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([
      mr({ iid: 128, title: '토큰 회전', state: 'opened', labels: ['backend', 'security'] }),
      mr({ iid: 121, title: '한국어 로케일', state: 'merged' }),
    ])
    render(<MRView repoPath="/repo/gl" />)
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
    render(<MRView repoPath="/repo/gl" />)
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
    const { container } = render(<MRView repoPath="/repo/gl" />)
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
    const { container } = render(<MRView repoPath="/repo/gl" />)
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
    const { container } = render(<MRView repoPath="/repo/gl" />)
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
    const { container } = render(<MRView repoPath="/repo/gl" />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByText('승인 (Approvals)')).toBeInTheDocument())
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('승인 대기 중')).toBeInTheDocument()
  })

  it('빈 상태: MR이 없으면 empty 메시지', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([])
    render(<MRView repoPath="/repo/gl" />)
    await waitFor(() => expect(screen.getByText('No open merge requests')).toBeInTheDocument())
  })

  it('에러 상태: getMergeRequests 실패 시 에러 표시', async () => {
    installApi()
    getMergeRequestsMock.mockRejectedValue(new Error('GitLab API error: 500'))
    render(<MRView repoPath="/repo/gl" />)
    await waitFor(() => expect(screen.getByText(/GitLab API error: 500/)).toBeInTheDocument())
  })

  it('미연결: origin이 GitLab이지만 host 미연결이면 연결 유도', async () => {
    installApi({ hosts: [] })
    getMergeRequestsMock.mockResolvedValue([])
    render(<MRView repoPath="/repo/gl" />)
    await waitFor(() => expect(screen.getByText('GitLab 인스턴스가 연결되지 않았어요')).toBeInTheDocument())
    expect(getMergeRequestsMock).not.toHaveBeenCalled()
  })

  it('open MR 상세에 승인/변경요청/Merge 버튼 노출 + 낙관적 토글', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    const { container } = render(<MRView repoPath="/repo/gl" />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByRole('button', { name: '승인' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '승인' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '✓ 승인함' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument()
  })

  it('버그3: 탭 진입 시 상세는 미선택(빈 상태) — 특정 MR 상세가 자동 로드되지 않는다', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    render(<MRView repoPath="/repo/gl" />)
    // 목록은 뜨지만(클릭 가능)…
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    // 상세 빈 상태 플레이스홀더가 보이고, 상세 헤더(Description)는 없다.
    expect(screen.getByText('왼쪽에서 MR을 고르면 여기에 보여요')).toBeInTheDocument()
    expect(screen.queryByText('Description')).not.toBeInTheDocument()
  })

  it('버그3: 목록 항목을 클릭하면 해당 MR 상세가 뜬다', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    const { container } = render(<MRView repoPath="/repo/gl" />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(screen.getByText('Description')).toBeInTheDocument())
    expect(screen.queryByText('왼쪽에서 MR을 고르면 여기에 보여요')).not.toBeInTheDocument()
  })

  it('!iid·프로젝트 점은 GitLab 식별색(주황), Merge 버튼은 골드 클래스', async () => {
    installApi()
    getMergeRequestsMock.mockResolvedValue([mr({ iid: 128, title: '토큰 회전', state: 'opened' })])
    const { container } = render(<MRView repoPath="/repo/gl" />)
    await waitFor(() => expect(screen.getByText('!128')).toBeInTheDocument())
    expect(container.querySelector('.gl-dot')).toBeTruthy()
    const num = screen.getByText('!128') as HTMLElement
    expect(num.style.color).toMatch(/252|fc6d26/i)
    // 버그3: Merge 버튼은 상세에 있으므로 선택 후 확인.
    fireEvent.click(within(container.querySelector('.pr-list-scroll') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(container.querySelector('.pr-merge-btn')).toBeTruthy())
  })
})
