import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { BlameView } from './BlameView'
import { installGitApiMock } from '../test/gitApiMock'
import type { Commit } from '../data/mockData'
import type { Mock } from 'vitest'

const REPO = '/repo/a'
const now = Math.floor(Date.now() / 1000)

// 두 커밋: seo(2줄 연속) → alex(1줄) → seo(1줄, 비연속 재등장)
const LINES = [
  { lineNum: 1, hash: 'aaa1111', author: 'seo', authorColor: '#e6a536', timeAgo: '12분 전', timestamp: now - 600, summary: '상태바 매핑', content: "const a = 1" },
  { lineNum: 2, hash: 'aaa1111', author: 'seo', authorColor: '#e6a536', timeAgo: '12분 전', timestamp: now - 600, summary: '상태바 매핑', content: "const b = 2" },
  { lineNum: 3, hash: 'bbb2222', author: 'alex', authorColor: '#5fb8e6', timeAgo: '3일 전', timestamp: now - 3 * 86400, summary: '벨 배지', content: "const c = 3" },
  { lineNum: 4, hash: 'aaa1111', author: 'seo', authorColor: '#e6a536', timeAgo: '12분 전', timestamp: now - 600, summary: '상태바 매핑', content: "return a" },
]

let api: ReturnType<typeof installGitApiMock>['gitAPI']
beforeEach(() => { localStorage.clear(); api = installGitApiMock().gitAPI })
afterEach(cleanup)

describe('BlameView — 블록 · 작성자 필터', () => {
  it('연속 같은 커밋 줄을 블록으로 묶어 gutter에 summary를 보인다', async () => {
    (api.blame as unknown as Mock).mockResolvedValue(LINES)
    render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} filePath="a.ts" commits={[]} />)
    // seo 블록 2개(연속 + 비연속 재등장) → summary '상태바 매핑' 2회
    await waitFor(() => expect(screen.getAllByText('상태바 매핑').length).toBe(2))
    expect(screen.getByText('벨 배지')).toBeInTheDocument()
  })

  it('작성자 칩 클릭 → 해당 작성자 블록이 dim된다', async () => {
    (api.blame as unknown as Mock).mockResolvedValue(LINES)
    const { container } = render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} filePath="a.ts" commits={[]} />)
    await screen.findByText('벨 배지')
    // alex 칩(SE/AL 2글자) 클릭
    fireEvent.click(screen.getByTitle('alex'))
    expect(container.querySelectorAll('.blame-block.dimmed').length).toBe(1)
  })

  it('블록 클릭 → 해시로 커밋 인덱스를 찾아 onSelectCommit 호출', async () => {
    (api.blame as unknown as Mock).mockResolvedValue(LINES)
    const onSel = vi.fn()
    const commits = [{ id: 'bbb2222' }, { id: 'aaa1111' }] as unknown as Commit[]
    render(<BlameView onSelectCommit={onSel} repoPath={REPO} filePath="a.ts" commits={commits} />)
    await screen.findByText('벨 배지')
    fireEvent.click(screen.getByText('벨 배지'))
    expect(onSel).toHaveBeenCalledWith(0)
  })
})

// ── 변경3: Blame 탭 파일 선택기 ──
// 좌측 .bf-files pane — listFiles(repoPath)로 목록 로드, 검색, 파일 클릭 시 내부 selFile 갱신 → blame 재조회.
const FILES3 = ['src/a.ts', 'src/b.ts', 'lib/c.ts']

describe('BlameView — 파일 선택기(변경3)', () => {
  it('listFiles 결과로 좌측 파일 목록을 그린다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3)
    const { container } = render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} commits={[]} />)
    expect(await screen.findByText('a.ts')).toBeInTheDocument()
    expect(screen.getByText('b.ts')).toBeInTheDocument()
    expect(screen.getByText('c.ts')).toBeInTheDocument()
    // 파일 pane 헤더 카운트 = 목록 길이
    expect(container.querySelector('.bf-files-hd')?.textContent).toContain('3')
  })

  it('파일 클릭 시 blame(repoPath, 클릭 파일)을 재조회한다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3);
    (api.blame as unknown as Mock).mockResolvedValue([])
    // filePath 미전달 → 초기 selFile 없음 → 클릭 전 blame 미호출
    render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} commits={[]} />)
    await screen.findByTitle('src/b.ts')
    expect(api.blame).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTitle('src/b.ts'))
    await waitFor(() => expect(api.blame).toHaveBeenCalledWith(REPO, 'src/b.ts'))
  })

  it('검색 input이 파일 목록을 좁힌다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3)
    render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} commits={[]} />)
    await screen.findByText('a.ts')

    fireEvent.change(screen.getByPlaceholderText('경로로 찾기'), { target: { value: 'lib' } })
    expect(screen.queryByText('a.ts')).toBeNull()
    expect(screen.queryByText('b.ts')).toBeNull()
    expect(screen.getByText('c.ts')).toBeInTheDocument()
  })

  it('filePath prop이 초기 selFile로 반영돼 그 파일로 blame을 조회한다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3);
    (api.blame as unknown as Mock).mockResolvedValue(LINES)
    const { container } = render(
      <BlameView onSelectCommit={vi.fn()} repoPath={REPO} filePath="src/a.ts" commits={[]} />
    )
    await waitFor(() => expect(api.blame).toHaveBeenCalledWith(REPO, 'src/a.ts'))
    // 헤더에 현재 파일 경로 노출
    expect(container.querySelector('.pnl-hdr .fp')?.textContent).toBe('src/a.ts')
    // 좌측 목록에서 해당 파일이 선택(on) 상태
    await waitFor(() =>
      expect(container.querySelector('.bf-f.on')?.getAttribute('title')).toBe('src/a.ts')
    )
  })

  it('빈 상태 문구 — 무저장소·파일 미선택', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3)
    // 무저장소: 목록/본문 양쪽 빈 상태
    const noRepo = render(<BlameView onSelectCommit={vi.fn()} repoPath={null} commits={[]} />)
    expect(noRepo.getByText('저장소를 열면 파일이 보여요')).toBeInTheDocument()
    expect(noRepo.getByText('저장소를 열면 blame을 볼 수 있어요')).toBeInTheDocument()
    cleanup()

    // 파일 미선택(저장소는 있음): 본문에 파일 선택 유도
    render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} commits={[]} />)
    await screen.findByText('a.ts')
    expect(screen.getByText('왼쪽에서 파일을 고르면 blame을 볼 수 있어요')).toBeInTheDocument()
  })
})
