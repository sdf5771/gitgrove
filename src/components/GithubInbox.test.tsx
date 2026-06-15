import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { GithubInbox } from './GithubInbox'
import type { GithubIssueSearchItem, GithubSearchIssuesResponse } from '../utils/githubClient'

const getSearchIssuesMock = vi.fn()
vi.mock('../utils/githubClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/githubClient')>('../utils/githubClient')
  return {
    ...actual,
    getSearchIssues: (...args: unknown[]) => getSearchIssuesMock(...args),
  }
})

function item(over: Partial<GithubIssueSearchItem> & Pick<GithubIssueSearchItem, 'id' | 'number' | 'title'>): GithubIssueSearchItem {
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
function resp(items: GithubIssueSearchItem[]): GithubSearchIssuesResponse {
  return { total_count: items.length, incomplete_results: false, items }
}

describe('GithubInbox (B19)', () => {
  beforeEach(() => { getSearchIssuesMock.mockReset() })
  afterEach(cleanup)

  it('미연결이면 안내 메시지를 표시', () => {
    render(<GithubInbox githubToken="" githubLogin={null} onOpenUrl={vi.fn()} />)
    expect(screen.getByText(/GitHub 연결이 필요/)).toBeTruthy()
    expect(getSearchIssuesMock).not.toHaveBeenCalled()
  })

  it('첫 진입 시 기본 탭(내가 연 PR)만 author 쿼리로 로드', async () => {
    getSearchIssuesMock.mockResolvedValue(resp([item({ id: 1, number: 10, title: 'Fix bug', pull_request: {} })]))
    render(<GithubInbox githubToken="tok" githubLogin="octo" onOpenUrl={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeTruthy())
    expect(getSearchIssuesMock).toHaveBeenCalledTimes(1)
    expect(getSearchIssuesMock.mock.calls[0][1]).toBe('is:open is:pr author:octo')
    expect(screen.getByText('octo/repo')).toBeTruthy()
  })

  it('탭 전환 시 해당 쿼리로 로드(리뷰 요청 / 할당 이슈)', async () => {
    getSearchIssuesMock
      .mockResolvedValueOnce(resp([]))
      .mockResolvedValueOnce(resp([item({ id: 2, number: 5, title: '리뷰 PR', pull_request: {} })]))
    render(<GithubInbox githubToken="tok" githubLogin="octo" onOpenUrl={vi.fn()} />)

    await waitFor(() => expect(getSearchIssuesMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('리뷰 요청받음'))
    await waitFor(() => expect(screen.getByText('리뷰 PR')).toBeTruthy())
    expect(getSearchIssuesMock.mock.calls[1][1]).toBe('is:open is:pr review-requested:octo')
  })

  it('항목 클릭 → onOpenUrl(html_url)', async () => {
    getSearchIssuesMock.mockResolvedValue(resp([item({ id: 1, number: 10, title: 'Fix bug', pull_request: {} })]))
    const onOpenUrl = vi.fn()
    render(<GithubInbox githubToken="tok" githubLogin="octo" onOpenUrl={onOpenUrl} />)

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeTruthy())
    fireEvent.click(screen.getByText('Fix bug'))
    expect(onOpenUrl).toHaveBeenCalledWith('https://github.com/octo/repo/pull/10')
  })

  it('새로고침 버튼은 cache:false로 다시 fetch', async () => {
    getSearchIssuesMock.mockResolvedValue(resp([item({ id: 1, number: 1, title: 'A', pull_request: {} })]))
    render(<GithubInbox githubToken="tok" githubLogin="octo" onOpenUrl={vi.fn()} />)

    await waitFor(() => expect(getSearchIssuesMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByTitle('새로고침'))
    await waitFor(() => expect(getSearchIssuesMock).toHaveBeenCalledTimes(2))
    expect(getSearchIssuesMock.mock.calls[1][2]).toEqual({ cache: false })
  })

  it('에러 시 메시지를 표시', async () => {
    getSearchIssuesMock.mockRejectedValue(new Error('GitHub API rate limit 초과'))
    render(<GithubInbox githubToken="tok" githubLogin="octo" onOpenUrl={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/rate limit 초과/)).toBeTruthy())
  })
})
