import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { PRView } from './PRView'

// mock 폴백 제거 회귀: realPRs가 null(fetch 에러)이어도 가짜 PR_DATA가 뜨지 않는다.
// 토큰은 있지만 PR 조회가 실패하면 에러 상태를 보이고, 데모용 PR 카드는 절대 렌더되지 않는다.

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

describe('PRView — mock 폴백 제거', () => {
  it('PR 조회 실패(realPRs null) 시 가짜 PR_DATA 대신 에러 상태를 보인다', async () => {
    getPullsMock.mockRejectedValue(new Error('네트워크 오류 · 503'))
    render(<PRView repoPath="/repo/gh" />)

    await waitFor(() => expect(screen.getByText(/네트워크 오류/)).toBeInTheDocument())
    // 데모 PR_DATA 카드 제목이 절대 나타나지 않는다.
    expect(screen.queryByText('Add OAuth2 token refresh with automatic rotation')).toBeNull()
    expect(screen.queryByText(/migrate to GitHub Actions v4/)).toBeNull()
  })

  it('PR이 0건이면 빈 목록 — 데모 PR_DATA가 채워지지 않는다', async () => {
    getPullsMock.mockResolvedValue({ data: [] })
    const { container } = render(<PRView repoPath="/repo/gh" />)

    await waitFor(() => expect(getPullsMock).toHaveBeenCalled())
    expect(screen.queryByText('Add OAuth2 token refresh with automatic rotation')).toBeNull()
    // 목록에 PR 항목이 없다.
    expect(container.querySelectorAll('.pr-item').length).toBe(0)
  })
})
