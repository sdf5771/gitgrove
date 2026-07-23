import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'
import type { Mock } from 'vitest'

// 전체 히스토리 검색 배너(App 통합) — 가능 범위(핵심 배선)만.
// ① 검색어 입력 시 배너 + '전체 히스토리 검색' 버튼
// ② 클릭 시 searchCommits(repo, query, {limit}) 호출 + 결과 리스트
// ③ 결과 클릭 두 경로: 로드셋 안(handleSelectCommit) / 밖(외부 커밋 로드)
// jsdom 한계상 diff 렌더 전체가 아니라 "어떤 커밋을 어떻게 로드하는가"(getFiles 인자)로 경로를 가른다.

const REPO = '/repo/a'
const LOADED_ID = FIXTURES[REPO].commitId          // 'aaa1111' — 로드셋 안
const LOADED_MSG = FIXTURES[REPO].commitMsg        // 'REPO_A_ONLY_COMMIT'

function seedRepo() {
  localStorage.setItem('gitgrove:repos', JSON.stringify([
    { id: 'repo-a-id', name: 'a', path: REPO, branch: 'main', dirty: false, ahead: 0, behind: 0 },
  ]))
  localStorage.setItem('gitgrove:lastRepoPath', REPO)
}

async function renderLoaded() {
  const mock = installGitApiMock()
  render(<App />)
  await waitFor(() => expect(screen.queryAllByText(LOADED_MSG).length).toBeGreaterThan(0))
  return mock
}

async function typeSearch(user: ReturnType<typeof userEvent.setup>, q: string) {
  const input = screen.getByPlaceholderText(/Search commits/)
  await user.clear(input)
  await user.type(input, q)
}

describe('App — 전체 히스토리 검색 배너', () => {
  beforeEach(() => { localStorage.clear(); seedRepo() })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

  it('검색어 입력 시 배너와 "전체 히스토리 검색" 버튼이 뜬다', async () => {
    await renderLoaded()
    const user = userEvent.setup()
    await typeSearch(user, 'REPO_A_ONLY')
    expect(await screen.findByText('전체 히스토리 검색')).toBeInTheDocument()
  })

  it('"전체 히스토리 검색" 클릭 → searchCommits(repo, query, {limit:200, all}) 호출 + 결과 표시', async () => {
    const mock = await renderLoaded()
    const user = userEvent.setup()
    await typeSearch(user, 'REPO_A_ONLY')

    await user.click(await screen.findByText('전체 히스토리 검색'))
    // 로드셋(getLog)과 범위를 맞추려 all 을 함께 전달한다(기본 전체 브랜치 보기 = true).
    await waitFor(() =>
      expect(mock.gitAPI.searchCommits).toHaveBeenCalledWith(REPO, 'REPO_A_ONLY', { limit: 200, all: true })
    )
    // 결과가 있으면 '로드된 목록으로' 되돌리기 링크가 나타난다.
    expect(await screen.findByText('로드된 목록으로')).toBeInTheDocument()
  })

  it('결과가 0건이면 빈 상태 문구를 보인다', async () => {
    const mock = await renderLoaded()
    ;(mock.gitAPI.searchCommits as unknown as Mock).mockResolvedValue([])
    const user = userEvent.setup()
    await typeSearch(user, 'zzz-none')

    await user.click(await screen.findByText('전체 히스토리 검색'))
    expect(await screen.findByText('전체 히스토리에도 일치하는 커밋이 없어요 · 검색어를 바꿔 보세요')).toBeInTheDocument()
  })

  it('로드셋 안 결과 클릭 → handleSelectCommit 경로로 로드된 커밋(id)을 연다', async () => {
    // 기본 mock searchCommits 는 로드된 커밋(aaa1111)을 반환 → loadedIdx>=0 경로
    const mock = await renderLoaded()
    const user = userEvent.setup()
    await typeSearch(user, 'REPO_A_ONLY')
    await user.click(await screen.findByText('전체 히스토리 검색'))

    const item = await screen.findByText(LOADED_MSG, { selector: '.gsrch-msg' })
    ;(mock.gitAPI.getFiles as unknown as Mock).mockClear()
    await user.click(item)

    // 로드셋 안: 로드된 커밋 id 로 getFiles(=handleSelectCommit)
    await waitFor(() => expect(mock.gitAPI.getFiles).toHaveBeenCalledWith(REPO, LOADED_ID))
  })

  it('로드셋 밖 결과 클릭 → 외부 커밋 id로 getFiles 로드, "더 과거" 태그를 보인다', async () => {
    const mock = await renderLoaded()
    const EXT_ID = 'zzz9999'
    const EXTERNAL = [{
      id: EXT_ID, fullId: EXT_ID + '0'.repeat(33), msg: '아주 오래된 커밋',
      author: 'Old Author', time: '1y ago', parents: [], refs: [],
      stats: { files: 1, insertions: 1, deletions: 0 },
    }] as unknown as GitCommit[]
    ;(mock.gitAPI.searchCommits as unknown as Mock).mockResolvedValue(EXTERNAL)

    const user = userEvent.setup()
    await typeSearch(user, 'zzz')
    await user.click(await screen.findByText('전체 히스토리 검색'))

    // 로드셋 밖 표시(더 과거 태그)
    expect(await screen.findByText('더 과거')).toBeInTheDocument()

    const item = await screen.findByText('아주 오래된 커밋', { selector: '.gsrch-msg' })
    ;(mock.gitAPI.getFiles as unknown as Mock).mockClear()
    await user.click(item)

    // 로드셋 밖: 외부 커밋 id 로 getFiles(=외부 로드)
    await waitFor(() => expect(mock.gitAPI.getFiles).toHaveBeenCalledWith(REPO, EXT_ID))
  })
})
