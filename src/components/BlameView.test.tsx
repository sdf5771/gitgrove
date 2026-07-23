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
  it('listFiles 결과를 디렉토리/파일 계층 트리로 그린다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3)
    const { container } = render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} commits={[]} />)
    // 기본은 디렉토리 접힘 → 최상위 dir 노드만 보인다
    expect(await screen.findByText('src')).toBeInTheDocument()
    expect(screen.getByText('lib')).toBeInTheDocument()
    expect(screen.queryByText('a.ts')).toBeNull()
    // dir을 펼치면 하위 파일이 보인다
    fireEvent.click(screen.getByText('src'))
    fireEvent.click(screen.getByText('lib'))
    expect(screen.getByText('a.ts')).toBeInTheDocument()
    expect(screen.getByText('b.ts')).toBeInTheDocument()
    expect(screen.getByText('c.ts')).toBeInTheDocument()
    // 파일 pane 헤더 카운트 = 목록 길이
    expect(container.querySelector('.bf-files-hd')?.textContent).toContain('3')
  })

  it('dir 재클릭 시 다시 접혀 하위 파일이 사라진다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3)
    render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} commits={[]} />)
    await screen.findByText('src')
    // 펼침 → 자식 노출
    fireEvent.click(screen.getByText('src'))
    expect(screen.getByText('a.ts')).toBeInTheDocument()
    expect(screen.getByText('b.ts')).toBeInTheDocument()
    // 재클릭 → 접힘 → 자식 사라짐(src 노드 자체는 유지)
    fireEvent.click(screen.getByText('src'))
    expect(screen.queryByText('a.ts')).toBeNull()
    expect(screen.queryByText('b.ts')).toBeNull()
    expect(screen.getByText('src')).toBeInTheDocument()
  })

  it('파일 클릭 시 blame(repoPath, 클릭 파일)을 재조회한다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3);
    (api.blame as unknown as Mock).mockResolvedValue([])
    // filePath 미전달 → 초기 selFile 없음 → 클릭 전 blame 미호출
    render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} commits={[]} />)
    await screen.findByText('src')
    expect(api.blame).not.toHaveBeenCalled()

    // src 디렉토리 펼친 뒤 파일 클릭
    fireEvent.click(screen.getByText('src'))
    fireEvent.click(screen.getByTitle('src/b.ts'))
    await waitFor(() => expect(api.blame).toHaveBeenCalledWith(REPO, 'src/b.ts', undefined))
  })

  it('검색 input이 트리를 좁히고 매칭 파일의 조상 dir을 자동 펼친다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3)
    render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} commits={[]} />)
    await screen.findByText('src')

    fireEvent.change(screen.getByPlaceholderText('경로로 찾기'), { target: { value: 'lib' } })
    // lib/c.ts만 남고 조상(lib) 자동 펼침 → c.ts 노출, src 서브트리는 사라짐
    expect(screen.getByText('c.ts')).toBeInTheDocument()
    expect(screen.queryByText('src')).toBeNull()
    expect(screen.queryByText('a.ts')).toBeNull()
    expect(screen.queryByText('b.ts')).toBeNull()
  })

  it('filePath prop이 초기 selFile로 반영돼 그 파일로 blame을 조회한다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3);
    (api.blame as unknown as Mock).mockResolvedValue(LINES)
    const { container } = render(
      <BlameView onSelectCommit={vi.fn()} repoPath={REPO} filePath="src/a.ts" commits={[]} />
    )
    await waitFor(() => expect(api.blame).toHaveBeenCalledWith(REPO, 'src/a.ts', undefined))
    // 헤더에 현재 파일 경로 노출
    expect(container.querySelector('.pnl-hdr .fp')?.textContent).toBe('src/a.ts')
    // 선택 파일의 조상 dir 자동 펼침 → 트리에서 해당 파일이 선택(on) 상태
    await waitFor(() =>
      expect(container.querySelector('.bf-node-file.on')?.getAttribute('title')).toBe('src/a.ts')
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
    await screen.findByText('src')
    expect(screen.getByText('왼쪽에서 파일을 고르면 blame을 볼 수 있어요')).toBeInTheDocument()
  })
})

// ── 변경(확장): 특정 시점 blame(rev prop) ──
// rev 전달 시 blame(repo, path, rev) 로 그 리비전 blame 을 조회하고 배지·복귀 버튼을 보인다.
const REV = 'abcdef1234567890abcdef1234567890abcdef12'

describe('BlameView — 특정 시점 blame(rev)', () => {
  it('rev prop 주입 시 blame(repo, path, rev)로 조회하고 리비전 배지를 보인다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3);
    (api.blame as unknown as Mock).mockResolvedValue(LINES)
    const { container } = render(
      <BlameView onSelectCommit={vi.fn()} repoPath={REPO} filePath="src/a.ts" rev={REV} commits={[]} />
    )
    await waitFor(() => expect(api.blame).toHaveBeenCalledWith(REPO, 'src/a.ts', REV))
    // 배지 = @ + 앞 7자, .at 클래스
    const badge = container.querySelector('.blame-rev')
    expect(badge?.className).toContain('at')
    expect(badge?.textContent).toBe('@ abcdef1')
    // 워킹트리 복귀 버튼 노출
    expect(screen.getByText('워킹트리로')).toBeInTheDocument()
  })

  it("'워킹트리로' 클릭 시 rev 없이 재조회하고 배지가 워킹트리로 바뀐다", async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3);
    (api.blame as unknown as Mock).mockResolvedValue(LINES)
    const { container } = render(
      <BlameView onSelectCommit={vi.fn()} repoPath={REPO} filePath="src/a.ts" rev={REV} commits={[]} />
    )
    await waitFor(() => expect(api.blame).toHaveBeenCalledWith(REPO, 'src/a.ts', REV))
    ;(api.blame as unknown as Mock).mockClear()

    fireEvent.click(screen.getByText('워킹트리로'))
    await waitFor(() => expect(api.blame).toHaveBeenCalledWith(REPO, 'src/a.ts', undefined))
    // 배지가 워킹트리로, 복귀 버튼 사라짐
    expect(container.querySelector('.blame-rev')?.textContent).toBe('워킹트리')
    expect(screen.queryByText('워킹트리로')).toBeNull()
  })

  it('rev 미전달 시 워킹트리 blame(rev undefined)로 동작하고 복귀 버튼이 없다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3);
    (api.blame as unknown as Mock).mockResolvedValue(LINES)
    const { container } = render(
      <BlameView onSelectCommit={vi.fn()} repoPath={REPO} filePath="src/a.ts" commits={[]} />
    )
    await waitFor(() => expect(api.blame).toHaveBeenCalledWith(REPO, 'src/a.ts', undefined))
    const badge = container.querySelector('.blame-rev')
    expect(badge?.className).not.toContain('at')
    expect(badge?.textContent).toBe('워킹트리')
    expect(screen.queryByText('워킹트리로')).toBeNull()
  })
})

// ── 변경1: 파일 pane 폭 리사이즈(스모크) ──
// jsdom은 레이아웃이 0이라 컨테이너 기반 max(55%) 클램프는 검증 불가.
// 여기서는 (1) 저장된 폭이 초기 style.width로 반영 (2) 드래그 핸들 존재
// (3) mousedown→mousemove→mouseup 시 style.width가 델타만큼 바뀌고 localStorage에 저장
// 만 확인한다. 컨테이너 미측정(clientWidth=0)이라 max=480 상한이 되어 아래 계산은 결정적.
const FILES_WIDTH_KEY = 'gitgrove:blameFilesWidth'

describe('BlameView — 파일 pane 리사이즈(변경1)', () => {
  it('localStorage에 저장된 폭이 초기 .bf-files width로 반영된다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3)
    localStorage.setItem(FILES_WIDTH_KEY, '320')
    const { container } = render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} commits={[]} />)
    await screen.findByText('src')
    expect((container.querySelector('.bf-files') as HTMLElement).style.width).toBe('320px')
  })

  it('저장값이 없으면 기본 260px', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3)
    const { container } = render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} commits={[]} />)
    await screen.findByText('src')
    expect((container.querySelector('.bf-files') as HTMLElement).style.width).toBe('260px')
  })

  it('col-resize 드래그 핸들이 렌더된다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3)
    const { container } = render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} commits={[]} />)
    await screen.findByText('src')
    expect(container.querySelector('[style*="col-resize"]')).not.toBeNull()
  })

  it('드래그(mousedown→move→up) 시 폭이 델타만큼 바뀌고 localStorage에 저장된다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3)
    const { container } = render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} commits={[]} />)
    await screen.findByText('src')
    const files = container.querySelector('.bf-files') as HTMLElement
    const handle = container.querySelector('[style*="col-resize"]') as HTMLElement
    expect(files.style.width).toBe('260px')

    // clientWidth=0 → max=480. 초기 260 + (180-100)=340, 클램프 [150,480] → 340
    fireEvent.mouseDown(handle, { clientX: 100 })
    fireEvent.mouseMove(window, { clientX: 180 })
    fireEvent.mouseUp(window)

    expect(files.style.width).toBe('340px')
    expect(localStorage.getItem(FILES_WIDTH_KEY)).toBe('340')
  })

  it('드래그로 폭을 줄여도 min 150 아래로는 내려가지 않는다', async () => {
    (api.listFiles as unknown as Mock).mockResolvedValue(FILES3)
    const { container } = render(<BlameView onSelectCommit={vi.fn()} repoPath={REPO} commits={[]} />)
    await screen.findByText('src')
    const files = container.querySelector('.bf-files') as HTMLElement
    const handle = container.querySelector('[style*="col-resize"]') as HTMLElement

    // 260 + (100-400) = -40 → 클램프 하한 150
    fireEvent.mouseDown(handle, { clientX: 400 })
    fireEvent.mouseMove(window, { clientX: 100 })
    fireEvent.mouseUp(window)

    expect(files.style.width).toBe('150px')
  })
})
