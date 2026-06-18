import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
import { RepoManager, type RepoManagerProps } from './RepoManager'
import type { Repo } from '../data/mockData'
import type { RepoActivity } from '../utils/repoActivity'

// ── window.gitAPI 모킹: getRemotes + getActivityBatch ──
function installApi(opts?: {
  remotes?: Record<string, Array<{ name: string; url: string }>>
  activity?: Record<string, RepoActivity>
}) {
  const remotes = opts?.remotes ?? {}
  const activity = opts?.activity ?? {}
  const empty: RepoActivity = { daily: Array(14).fill(0), total: 0, lastCommit: null }
  Object.defineProperty(window, 'gitAPI', {
    configurable: true,
    value: {
      getRemotes: vi.fn(async (p: string) => remotes[p] ?? []),
      getActivityBatch: vi.fn(async (paths: string[]) => {
        const out: Record<string, RepoActivity> = {}
        paths.forEach(p => { out[p] = activity[p] ?? empty })
        return out
      }),
    },
  })
  Object.defineProperty(window, 'appAPI', {
    configurable: true,
    value: { gitlabListHosts: vi.fn(async () => []), gitlabGetToken: vi.fn(async () => null) },
  })
}

function repo(over: Partial<Repo> & Pick<Repo, 'name' | 'path'>): Repo {
  return { id: over.path, branch: 'main', dirty: false, ahead: 0, behind: 0, ...over }
}

function baseProps(over?: Partial<RepoManagerProps>): RepoManagerProps {
  return {
    repos: [],
    activeRepo: 0,
    githubConnected: false,
    githubToken: '',
    githubLogin: null,
    gitlabConnected: false,
    recents: [],
    favorites: [],
    workspaces: [],
    onToggleFavorite: vi.fn(),
    onOpenPath: vi.fn(),
    onRemoveRepo: vi.fn(),
    onCreateWorkspace: vi.fn(() => 'ws1'),
    onRenameWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onToggleRepoInWorkspace: vi.fn(),
    onClone: vi.fn(async () => true),
    onBrowse: vi.fn(),
    onOpenUrl: vi.fn(),
    onOpenGithubSettings: vi.fn(),
    onOpenGitlabSettings: vi.fn(),
    notify: vi.fn(),
    ...over,
  }
}

function cardEl(name: string): HTMLElement {
  const nameEl = screen.getByText(name)
  return nameEl.closest('.rm-card') as HTMLElement
}

describe('RepoManager — 그로브 카드 그리드 (RM2~RM4)', () => {
  beforeEach(() => installApi())
  afterEach(cleanup)

  it('열린 레포가 카드로 렌더되고 헤더 타이틀("내 그로브")이 보인다', async () => {
    render(<RepoManager {...baseProps({ repos: [repo({ name: 'gitgrove', path: '/r/gitgrove' })] })} />)
    expect(screen.getByText('내 그로브')).toBeTruthy()
    expect(cardEl('gitgrove')).toBeTruthy()
    // 활동 배치 조회가 호출된다
    await waitFor(() => expect(window.gitAPI.getActivityBatch).toHaveBeenCalled())
  })

  it('활동 데이터의 14일 합이 스파크라인 라벨("N commits")로 표시된다', async () => {
    const daily = [1, 0, 2, 0, 3, 0, 1, 0, 0, 4, 0, 0, 2, 1] // 합 14
    installApi({ activity: { '/r/a': { daily, total: 14, lastCommit: '2일 전' } } })
    render(<RepoManager {...baseProps({ repos: [repo({ name: 'a', path: '/r/a' })] })} />)
    await waitFor(() => {
      const card = cardEl('a')
      expect(within(card).getByText('14 commits')).toBeTruthy()
    })
  })

  it('main 브랜치 칩은 골드(rm-bc-main), 그 외는 일반', () => {
    render(<RepoManager {...baseProps({
      repos: [
        repo({ name: 'onmain', path: '/r/m', branch: 'main' }),
        repo({ name: 'feature', path: '/r/f', branch: 'feature/x' }),
      ],
    })} />)
    const mainChip = within(cardEl('onmain')).getByText('main').closest('.rm-branch-chip')!
    expect(mainChip.className).toContain('rm-bc-main')
    const featChip = within(cardEl('feature')).getByText('feature/x').closest('.rm-branch-chip')!
    expect(featChip.className).not.toContain('rm-bc-main')
  })

  it('dirty/ahead/behind 칩이 표시된다', () => {
    render(<RepoManager {...baseProps({
      repos: [repo({ name: 'd', path: '/r/d', dirty: true, ahead: 2, behind: 1 })],
    })} />)
    const card = cardEl('d')
    expect(within(card).getByText('1', { selector: '.rm-dirty-badge span' })).toBeTruthy()
    expect(card.querySelector('.rm-sync-chip')).toBeTruthy()
  })

  it('즐겨찾기 별 클릭 → onToggleFavorite(path), 카드 선택은 발생하지 않는다', () => {
    const onToggleFavorite = vi.fn()
    render(<RepoManager {...baseProps({ repos: [repo({ name: 'a', path: '/r/a' })], onToggleFavorite })} />)
    const star = within(cardEl('a')).getByRole('button', { name: '즐겨찾기 추가' })
    fireEvent.click(star)
    expect(onToggleFavorite).toHaveBeenCalledWith('/r/a')
  })

  it('카드 더블클릭 → onOpenPath(활성화)', () => {
    const onOpenPath = vi.fn()
    render(<RepoManager {...baseProps({ repos: [repo({ name: 'a', path: '/r/a', branch: 'main' })], onOpenPath })} />)
    fireEvent.doubleClick(cardEl('a'))
    expect(onOpenPath).toHaveBeenCalledWith('/r/a', 'a', 'main')
  })

  it('열린 레포 푸터 버튼은 "열기" → onOpenPath', () => {
    const onOpenPath = vi.fn()
    render(<RepoManager {...baseProps({ repos: [repo({ name: 'a', path: '/r/a' })], onOpenPath })} />)
    const btn = within(cardEl('a')).getByRole('button', { name: '열기' })
    fireEvent.click(btn)
    expect(onOpenPath).toHaveBeenCalledWith('/r/a', 'a', 'main')
  })

  it('닫힌(최근) 레포 푸터 버튼은 "Clone" 라벨', () => {
    render(<RepoManager {...baseProps({
      recents: [{ path: '/r/closed', name: 'closed', branch: 'main' }],
    })} />)
    const btn = within(cardEl('closed')).getByRole('button', { name: 'Clone' })
    expect(btn).toBeTruthy()
  })

  it('카드 ⋯(메뉴) 버튼 → 케밥 메뉴가 열린다(리포지토리로 이동 / 제거)', () => {
    render(<RepoManager {...baseProps({ repos: [repo({ name: 'a', path: '/r/a' })] })} />)
    const menuBtn = within(cardEl('a')).getByRole('button', { name: '메뉴' })
    fireEvent.click(menuBtn)
    expect(screen.getByText('리포지토리로 이동')).toBeTruthy()
    expect(screen.getByText('GitGrove에서 제거')).toBeTruthy()
  })

  it('세그먼트 "변경"은 dirty 레포만 보여준다', () => {
    render(<RepoManager {...baseProps({
      repos: [
        repo({ name: 'clean', path: '/r/c' }),
        repo({ name: 'changed', path: '/r/d', dirty: true }),
      ],
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /변경/ }))
    expect(screen.queryByText('clean')).toBeNull()
    expect(screen.getByText('changed')).toBeTruthy()
  })

  it('검색은 이름으로 필터링한다', () => {
    render(<RepoManager {...baseProps({
      repos: [repo({ name: 'alpha', path: '/r/a' }), repo({ name: 'beta', path: '/r/b' })],
    })} />)
    fireEvent.change(screen.getByPlaceholderText('저장소 검색…'), { target: { value: 'alph' } })
    expect(screen.getByText('alpha')).toBeTruthy()
    expect(screen.queryByText('beta')).toBeNull()
  })

  it('검색 결과 없음 → 빈 상태 안내', () => {
    render(<RepoManager {...baseProps({ repos: [repo({ name: 'alpha', path: '/r/a' })] })} />)
    fireEvent.change(screen.getByPlaceholderText('저장소 검색…'), { target: { value: 'zzz' } })
    expect(screen.getByText('검색 결과가 없어요')).toBeTruthy()
  })

  it('전체 뷰에서 열린/닫힌 레포가 그룹("열린 저장소" / "다른 나무들")으로 나뉜다', () => {
    render(<RepoManager {...baseProps({
      repos: [repo({ name: 'open1', path: '/r/o' })],
      recents: [{ path: '/r/closed', name: 'closed', branch: 'main' }],
    })} />)
    expect(screen.getByText('열린 저장소')).toBeTruthy()
    expect(screen.getByText('그로브의 다른 나무들')).toBeTruthy()
  })

  it('정렬 토글: 활동순 ↔ 이름순', () => {
    render(<RepoManager {...baseProps({ repos: [repo({ name: 'a', path: '/r/a' })] })} />)
    const sortBtn = screen.getByText('최근 활동순')
    fireEvent.click(sortBtn)
    expect(screen.getByText('이름순')).toBeTruthy()
  })

  it('사이드바 "변경 있음" 항목 → 변경 세그먼트로 전환', () => {
    render(<RepoManager {...baseProps({
      repos: [repo({ name: 'clean', path: '/r/c' }), repo({ name: 'changed', path: '/r/d', dirty: true })],
    })} />)
    fireEvent.click(screen.getByText('변경 있음'))
    expect(screen.queryByText('clean')).toBeNull()
    expect(screen.getByText('changed')).toBeTruthy()
  })

  it('그로브 현황 카드(활발/보통/휴면)가 사이드바에 표시된다', () => {
    render(<RepoManager {...baseProps({ repos: [repo({ name: 'a', path: '/r/a' })] })} />)
    expect(screen.getByText('그로브 현황')).toBeTruthy()
    expect(screen.getByText('활발')).toBeTruthy()
    expect(screen.getByText('휴면')).toBeTruthy()
  })

  it('워크스페이스(그룹) 선택 → 그 워크스페이스의 레포 카드만 표시', () => {
    render(<RepoManager {...baseProps({
      repos: [repo({ name: 'inws', path: '/r/in' }), repo({ name: 'outws', path: '/r/out' })],
      workspaces: [{ id: 'w1', name: '회사', paths: ['/r/in'] }],
    })} />)
    fireEvent.click(screen.getByText('회사'))
    expect(cardEl('inws')).toBeTruthy()
    expect(screen.queryByText('outws')).toBeNull()
  })

  it('빈 그로브 → Clone 유도 빈 상태', () => {
    render(<RepoManager {...baseProps()} />)
    expect(screen.getByText('이 그로브는 비어 있어요')).toBeTruthy()
    expect(screen.getByRole('button', { name: '저장소 Clone' })).toBeTruthy()
  })

  it('owner 줄에 프로바이더 마크(GitHub)가 표시된다', async () => {
    installApi({ remotes: { '/r/a': [{ name: 'origin', url: 'https://github.com/me/a.git' }] } })
    render(<RepoManager {...baseProps({ repos: [repo({ name: 'a', path: '/r/a' })] })} />)
    await waitFor(() => {
      const mark = cardEl('a').querySelector('.prov-mark svg[aria-label="GitHub"]')
      expect(mark).toBeTruthy()
    })
  })
})
