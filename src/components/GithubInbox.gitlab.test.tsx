import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { GithubInbox } from './GithubInbox'
import type { GithubIssueSearchItem, GithubSearchIssuesResponse } from '../utils/githubClient'
import type { GitlabMergeRequest, GitlabIssue } from '../utils/gitlabClient'
import type { GitlabConn } from '../utils/useGitlabConns'

const getSearchIssuesMock = vi.fn()
vi.mock('../utils/githubClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/githubClient')>('../utils/githubClient')
  return { ...actual, getSearchIssues: (...a: unknown[]) => getSearchIssuesMock(...a) }
})

const getMergeRequestsMock = vi.fn()
const getIssuesMock = vi.fn()
vi.mock('../utils/gitlabClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/gitlabClient')>('../utils/gitlabClient')
  return {
    ...actual,
    getMergeRequests: (...a: unknown[]) => getMergeRequestsMock(...a),
    getIssues: (...a: unknown[]) => getIssuesMock(...a),
  }
})

function ghResp(items: GithubIssueSearchItem[]): GithubSearchIssuesResponse {
  return { total_count: items.length, incomplete_results: false, items }
}
function ghItem(over: Partial<GithubIssueSearchItem> & Pick<GithubIssueSearchItem, 'id' | 'number' | 'title'>): GithubIssueSearchItem {
  return {
    html_url: `https://github.com/octo/repo/pull/${over.number}`,
    state: 'open',
    repository_url: 'https://api.github.com/repos/octo/repo',
    user: { login: 'octo' },
    updated_at: new Date().toISOString(),
    comments: 0,
    labels: [],
    ...over,
  }
}
function glMr(over: Partial<GitlabMergeRequest> & Pick<GitlabMergeRequest, 'id' | 'iid' | 'title'>): GitlabMergeRequest {
  return {
    project_id: 7,
    description: null,
    state: 'opened',
    web_url: `https://gitlab.com/platform/web-client/-/merge_requests/${over.iid}`,
    source_branch: 'feat',
    target_branch: 'main',
    author: { id: 1, username: 'kim', name: '서비스킴', avatar_url: null },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_notes_count: 0,
    labels: [],
    ...over,
  }
}
function glIssue(over: Partial<GitlabIssue> & Pick<GitlabIssue, 'id' | 'iid' | 'title'>): GitlabIssue {
  return {
    project_id: 7,
    state: 'opened',
    web_url: `https://gitlab.com/platform/web-client/-/issues/${over.iid}`,
    references: { full: `platform/web-client#${over.iid}` },
    author: { id: 1, username: 'kim', name: '운영팀', avatar_url: null },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_notes_count: 0,
    labels: [],
    ...over,
  }
}

const INST: GitlabConn[] = [{ host: 'https://gitlab.com', token: 'glt', username: 'kim' }]

describe('GithubInbox — GitLab 통합 (GL9)', () => {
  beforeEach(() => {
    getSearchIssuesMock.mockReset()
    getMergeRequestsMock.mockReset()
    getIssuesMock.mockReset()
  })
  afterEach(cleanup)

  it('GitHub + GitLab 항목을 한 목록에 통합(최신순)', async () => {
    getSearchIssuesMock.mockResolvedValue(ghResp([ghItem({ id: 1, number: 212, title: 'README 배너', pull_request: {}, updated_at: '2026-06-16T00:00:00Z' })]))
    getMergeRequestsMock.mockResolvedValue([glMr({ id: 9, iid: 128, title: '토큰 회전', updated_at: '2026-06-17T00:00:00Z' })])

    render(<GithubInbox githubToken="tok" githubLogin="octo" gitlabInstances={INST} onOpenUrl={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('토큰 회전')).toBeTruthy())
    expect(screen.getByText('README 배너')).toBeTruthy()
    // GitLab MR 번호는 ! prefix
    expect(screen.getByText('!128')).toBeTruthy()
    // GitHub PR 번호는 # prefix
    expect(screen.getByText('#212')).toBeTruthy()
  })

  it('created 탭은 GitLab scope=created_by_me로 MR 조회', async () => {
    getSearchIssuesMock.mockResolvedValue(ghResp([]))
    getMergeRequestsMock.mockResolvedValue([glMr({ id: 9, iid: 128, title: '내 MR' })])

    render(<GithubInbox githubToken="tok" githubLogin="octo" gitlabInstances={INST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getMergeRequestsMock).toHaveBeenCalled())
    expect(getMergeRequestsMock.mock.calls[0][2]).toMatchObject({ scope: 'created_by_me', state: 'opened' })
  })

  it('review 탭은 reviewer_username으로 MR 조회', async () => {
    getSearchIssuesMock.mockResolvedValue(ghResp([]))
    getMergeRequestsMock.mockResolvedValue([])

    render(<GithubInbox githubToken="tok" githubLogin="octo" gitlabInstances={INST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getMergeRequestsMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('리뷰 요청받음'))
    await waitFor(() => expect(getMergeRequestsMock).toHaveBeenCalledTimes(2))
    expect(getMergeRequestsMock.mock.calls[1][2]).toMatchObject({ reviewerUsername: 'kim' })
  })

  it('assigned 탭은 GitLab getIssues(assigned_to_me) 사용', async () => {
    getSearchIssuesMock.mockResolvedValue(ghResp([]))
    getMergeRequestsMock.mockResolvedValue([])
    getIssuesMock.mockResolvedValue([glIssue({ id: 3, iid: 412, title: '리다이렉트 깨짐' })])

    render(<GithubInbox githubToken="tok" githubLogin="octo" gitlabInstances={INST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(getSearchIssuesMock).toHaveBeenCalled())
    fireEvent.click(screen.getByText('할당된 이슈'))
    await waitFor(() => expect(screen.getByText('리다이렉트 깨짐')).toBeTruthy())
    expect(getIssuesMock.mock.calls[0][2]).toMatchObject({ scope: 'assigned_to_me' })
  })

  it('프로바이더 필터(GitLab)로 GitHub 항목을 숨김', async () => {
    getSearchIssuesMock.mockResolvedValue(ghResp([ghItem({ id: 1, number: 212, title: 'GH 항목', pull_request: {} })]))
    getMergeRequestsMock.mockResolvedValue([glMr({ id: 9, iid: 128, title: 'GL 항목' })])

    render(<GithubInbox githubToken="tok" githubLogin="octo" gitlabInstances={INST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('GH 항목')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /GitLab/ }))
    expect(screen.queryByText('GH 항목')).toBeNull()
    expect(screen.getByText('GL 항목')).toBeTruthy()
  })

  it('GitLab 미연결이면 GitHub만 조회(getMergeRequests 미호출)', async () => {
    getSearchIssuesMock.mockResolvedValue(ghResp([ghItem({ id: 1, number: 1, title: 'GH only', pull_request: {} })]))

    render(<GithubInbox githubToken="tok" githubLogin="octo" gitlabInstances={[]} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('GH only')).toBeTruthy())
    expect(getMergeRequestsMock).not.toHaveBeenCalled()
    expect(getIssuesMock).not.toHaveBeenCalled()
  })

  it('한 소스 실패해도 다른 소스 결과는 표시', async () => {
    getSearchIssuesMock.mockRejectedValue(new Error('GH 실패'))
    getMergeRequestsMock.mockResolvedValue([glMr({ id: 9, iid: 128, title: 'GL 살아남음' })])

    render(<GithubInbox githubToken="tok" githubLogin="octo" gitlabInstances={INST} onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('GL 살아남음')).toBeTruthy())
  })
})
