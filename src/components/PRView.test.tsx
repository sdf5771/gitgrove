import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
import { PRView } from './PRView'

// 버그3 — PR 탭 진입 시 상세 미선택(빈 상태) 기본, 클릭해야 상세 표시.
// getGithubToken / getPulls만 mock.

const getTokenMock = vi.fn()
vi.mock('../utils/githubToken', async () => {
  const actual = await vi.importActual<typeof import('../utils/githubToken')>('../utils/githubToken')
  return { ...actual, getGithubToken: (...a: unknown[]) => getTokenMock(...a) }
})

const getPullsMock = vi.fn()
vi.mock('../utils/githubClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/githubClient')>('../utils/githubClient')
  return { ...actual, getPulls: (...a: unknown[]) => getPullsMock(...a) }
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
  installApi()
})
afterEach(cleanup)

describe('PRView — 버그3 (마운트 시 상세 미선택)', () => {
  it('탭 진입 시 상세는 미선택(빈 상태) — 특정 PR 상세가 자동 로드되지 않는다', async () => {
    getPullsMock.mockResolvedValue({ data: [ghPull({ number: 7, title: '토큰 회전' })] })
    const { container } = render(<PRView repoPath="/repo/gh" />)
    // 목록은 표시되지만 상세는 빈 상태.
    await waitFor(() => expect(within(container.querySelector('.pr-list-pane') as HTMLElement).getByText('토큰 회전')).toBeInTheDocument())
    expect(screen.getByText('왼쪽에서 PR을 고르면 여기에 보여요')).toBeInTheDocument()
    // 상세 헤더(.pr-detail-title)에 제목이 뜨지 않는다.
    expect(container.querySelector('.pr-detail-title')).toBeNull()
  })

  it('목록 항목을 클릭하면 해당 PR 상세가 뜬다', async () => {
    getPullsMock.mockResolvedValue({ data: [ghPull({ number: 7, title: '토큰 회전' })] })
    const { container } = render(<PRView repoPath="/repo/gh" />)
    await waitFor(() => expect(within(container.querySelector('.pr-list-pane') as HTMLElement).getByText('토큰 회전')).toBeInTheDocument())
    fireEvent.click(within(container.querySelector('.pr-list-pane') as HTMLElement).getByText('토큰 회전'))
    await waitFor(() => expect(container.querySelector('.pr-detail-title')?.textContent).toBe('토큰 회전'))
    expect(screen.queryByText('왼쪽에서 PR을 고르면 여기에 보여요')).toBeNull()
  })
})
