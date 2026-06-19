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

/** provider 감지 결과와 무관하게 'pr' 탭(라벨 PR 또는 MR)을 찾아 클릭 */
async function openPRTab() {
  const tab = await waitFor(() => {
    const el = screen.queryByRole('button', { name: 'PR' }) ?? screen.queryByRole('button', { name: 'MR' })
    if (!el) throw new Error('PR/MR 탭을 찾지 못함')
    return el
  })
  fireEvent.click(tab)
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
    expect(shown('GitHub 토큰이 설정되지 않았어요')).toBe(false)
  })

  it('origin이 GitHub이면 기존 PRView를 렌더한다', async () => {
    setupRepo({
      originUrl: 'git@github.com:sdf5771/gitgrove.git',
      gitlabHosts: ['https://gitlab.com'], // GitLab 연결돼 있어도 origin이 GitHub면 PRView
    })
    render(<App />)
    await openPRTab()
    // PRView: 토큰 없음 안내(MRView엔 없는 문구)
    await waitFor(() => expect(shown('GitHub 토큰이 설정되지 않았어요')).toBe(true))
    expect(shown('No open merge requests')).toBe(false)
    expect(getMergeRequestsMock).not.toHaveBeenCalled()
  })

  it('self-hosted SSH 커스텀 포트 origin도 저장 host와 매칭돼 MRView를 렌더한다', async () => {
    // origin이 ssh://...:2222 → parseGitLabRepo.host = https://gl.internal:2222
    // 저장된 API host는 포트 없는 https://gl.internal → hostname 폴백 매칭(회귀 방지).
    setupRepo({
      originUrl: 'ssh://git@gl.internal:2222/platform/web-client.git',
      gitlabHosts: ['https://gl.internal'],
      gitlabToken: 'gl-tok',
    })
    render(<App />)
    await openPRTab()
    await waitFor(() => expect(shown('No open merge requests')).toBe(true))
    expect(getMergeRequestsMock).toHaveBeenCalled()
  })

  it('origin이 GitLab이지만 host 미연결이면 PRView로(기존 동작)', async () => {
    setupRepo({
      originUrl: 'git@gitlab.com:platform/web-client.git',
      gitlabHosts: [], // 연결된 GitLab 인스턴스 없음
    })
    render(<App />)
    await openPRTab()
    await waitFor(() => expect(shown('GitHub 토큰이 설정되지 않았어요')).toBe(true))
    expect(getMergeRequestsMock).not.toHaveBeenCalled()
  })
})

describe("'pr' 탭 라벨 provider 적응 (GitHub=PR / GitLab=MR)", () => {
  beforeEach(() => {
    localStorage.clear()
    getMergeRequestsMock.mockClear()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('origin이 GitLab + host 연결됨이면 탭 라벨이 MR로 보인다', async () => {
    setupRepo({
      originUrl: 'git@gitlab.com:platform/web-client.git',
      gitlabHosts: ['https://gitlab.com'],
      gitlabToken: 'gl-tok',
    })
    render(<App />)
    // provider 감지는 비동기 → 'MR' 라벨이 나타날 때까지 대기
    await waitFor(() => expect(screen.getByRole('button', { name: 'MR' })).toBeInTheDocument())
    // 내부 id는 'pr' 유지지만 'PR' 라벨은 더 이상 노출되지 않음
    expect(screen.queryByRole('button', { name: 'PR' })).not.toBeInTheDocument()
    // 다른 view-toggle 탭 라벨은 불변(view-toggle 컨테이너 안의 History로 회귀 확인)
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
    // 접근성 title
    expect(screen.getByRole('button', { name: 'MR' })).toHaveAttribute('title', 'Merge Requests')
  })

  it('origin이 GitHub이면 탭 라벨이 PR로 보인다', async () => {
    setupRepo({
      originUrl: 'git@github.com:sdf5771/gitgrove.git',
      gitlabHosts: ['https://gitlab.com'], // GitLab 연결돼 있어도 origin이 GitHub면 PR
    })
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'PR' })).toBeInTheDocument())
    // 충분히 안정화될 때까지 기다린 뒤 MR이 끝내 노출되지 않음을 확인
    await new Promise(r => setTimeout(r, 0))
    expect(screen.queryByRole('button', { name: 'MR' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PR' })).toHaveAttribute('title', 'Pull Requests')
  })

  it('origin이 GitLab이지만 host 미연결이면 라벨은 PR(기존 동작 유지)', async () => {
    setupRepo({
      originUrl: 'git@gitlab.com:platform/web-client.git',
      gitlabHosts: [], // 연결된 GitLab 인스턴스 없음 → github로 폴백
    })
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'PR' })).toBeInTheDocument())
    await new Promise(r => setTimeout(r, 0))
    expect(screen.queryByRole('button', { name: 'MR' })).not.toBeInTheDocument()
  })
})
