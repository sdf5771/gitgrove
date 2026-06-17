import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import App from './App'
import { installGitApiMock } from './test/gitApiMock'

// MRView가 실제 네트워크를 타지 않도록 getMergeRequests만 모킹(빈 목록).
const getMergeRequestsMock = vi.fn(async () => [])
vi.mock('./utils/gitlabClient', async () => {
  const actual = await vi.importActual<typeof import('./utils/gitlabClient')>('./utils/gitlabClient')
  return {
    ...actual,
    getMergeRequests: (() => getMergeRequestsMock()) as typeof actual.getMergeRequests,
  }
})

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

/** 활성 레포 1개를 복원 상태로 띄우고, origin/host를 provider별로 셋업 */
function setupRepo(opts: { originUrl: string; gitlabHosts: string[]; gitlabToken?: string | null }) {
  const { gitAPI, appAPI } = installGitApiMock()
  // 활성 레포의 origin을 지정 provider로
  gitAPI.getRemotes.mockResolvedValue([{ name: 'origin', url: opts.originUrl }])
  appAPI.gitlabListHosts.mockResolvedValue(opts.gitlabHosts)
  appAPI.gitlabGetToken.mockResolvedValue(opts.gitlabToken ?? null)
  localStorage.setItem('gitgrove:repos', JSON.stringify([
    { id: 'r1', name: 'web-client', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
  ]))
  localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
  return { gitAPI, appAPI }
}

async function openPRTab() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'PR' })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'PR' }))
}

describe('PR 탭 provider 분기 (GitHub PRView ↔ GitLab MRView)', () => {
  beforeEach(() => {
    localStorage.clear()
    getMergeRequestsMock.mockClear()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('origin이 GitLab + host 연결됨이면 MRView를 렌더한다', async () => {
    setupRepo({
      originUrl: 'git@gitlab.com:platform/web-client.git',
      gitlabHosts: ['https://gitlab.com'],
      gitlabToken: 'gl-tok',
    })
    render(<App />)
    await openPRTab()
    // MRView: 빈 MR 목록 → "No open merge requests" (PRView에는 없는 문구)
    await waitFor(() => expect(shown('No open merge requests')).toBe(true))
    expect(getMergeRequestsMock).toHaveBeenCalled()
    // PRView 전용 문구는 없어야
    expect(shown('GitHub 토큰이 설정되지 않았습니다')).toBe(false)
  })

  it('origin이 GitHub이면 기존 PRView를 렌더한다', async () => {
    setupRepo({
      originUrl: 'git@github.com:sdf5771/gitgrove.git',
      gitlabHosts: ['https://gitlab.com'], // GitLab 연결돼 있어도 origin이 GitHub면 PRView
    })
    render(<App />)
    await openPRTab()
    // PRView: 토큰 없음 안내(MRView엔 없는 문구)
    await waitFor(() => expect(shown('GitHub 토큰이 설정되지 않았습니다')).toBe(true))
    expect(shown('No open merge requests')).toBe(false)
    expect(getMergeRequestsMock).not.toHaveBeenCalled()
  })

  it('origin이 GitLab이지만 host 미연결이면 PRView로(기존 동작)', async () => {
    setupRepo({
      originUrl: 'git@gitlab.com:platform/web-client.git',
      gitlabHosts: [], // 연결된 GitLab 인스턴스 없음
    })
    render(<App />)
    await openPRTab()
    await waitFor(() => expect(shown('GitHub 토큰이 설정되지 않았습니다')).toBe(true))
    expect(getMergeRequestsMock).not.toHaveBeenCalled()
  })
})
