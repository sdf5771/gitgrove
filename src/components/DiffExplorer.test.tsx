import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { DiffExplorer } from './DiffExplorer'
import { installGitApiMock } from '../test/gitApiMock'
import type { Commit } from '../data/mockData'
import type { Mock } from 'vitest'

const REPO = '/repo/a'
const COMMIT = { id: 'c0ffee1', files: [] } as unknown as Commit
const FILES = [{ path: 'src/a.ts', status: 'M', additions: 2, deletions: 1 }] as unknown as GitFileEntry[]

// 수정 한 줄(word-diff 대상) + 추가 한 줄 + 컨텍스트
const RAW = [
  '@@ -1,3 +1,4 @@ function f()',
  " const keep = 1",
  "-const x = 'syncing'",
  "+const x = 'idle'",
  "+const y = 2",
].join('\n')

let api: ReturnType<typeof installGitApiMock>['gitAPI']
beforeEach(() => { localStorage.clear(); api = installGitApiMock().gitAPI })
afterEach(cleanup)

describe('DiffExplorer — Unified/Split 토글 · word-diff', () => {
  it('통합 모드로 diff를 그리고 훅 헤더의 함수 컨텍스트를 보인다', async () => {
    (api.getCommitFileDiff as unknown as Mock).mockResolvedValue(RAW)
    render(<DiffExplorer commit={COMMIT} repoPath={REPO} commitFiles={FILES} />)
    await waitFor(() => expect(api.getCommitFileDiff).toHaveBeenCalled())
    expect(await screen.findByText('function f()')).toBeInTheDocument()
    expect(screen.getByText('변경 파일')).toBeInTheDocument()
  })

  it('word-diff: 수정 페어의 바뀐 토큰만 wdel/wadd로 강조', async () => {
    (api.getCommitFileDiff as unknown as Mock).mockResolvedValue(RAW)
    const { container } = render(<DiffExplorer commit={COMMIT} repoPath={REPO} commitFiles={FILES} />)
    await screen.findByText('function f()')
    // 'syncing' → 'idle' 만 바뀜
    expect(container.querySelector('.wdel')?.textContent).toBe('syncing')
    expect(container.querySelector('.wadd')?.textContent).toBe('idle')
  })

  it('나란히 토글 → split 2컬럼 렌더', async () => {
    (api.getCommitFileDiff as unknown as Mock).mockResolvedValue(RAW)
    const { container } = render(<DiffExplorer commit={COMMIT} repoPath={REPO} commitFiles={FILES} />)
    await screen.findByText('function f()')
    fireEvent.click(screen.getByText('나란히'))
    expect(container.querySelectorAll('.split .col').length).toBe(2)
  })
})

// ── 변경2: Diff 탭 커밋 피커 ──
// commits+selIdx+onSelectCommit 주입 시 .dxc-bar(스텝퍼 + 현재 커밋 칩 + 드롭다운)를 그린다.
// 피커 자체는 props로 동기 렌더되므로 diff effect와 무관하다.
const PICK_COMMITS = [
  { id: 'aaaaaa1', msg: 'first commit', author: 'Alice', time: '3h ago', files: [] },
  { id: 'bbbbbb2', msg: 'second commit', author: 'Bob', time: '2h ago', files: [] },
  { id: 'cccccc3', msg: 'third commit', author: 'Carol', time: '1h ago', files: [] },
] as unknown as Commit[]

// 피커는 repoPath와 무관하게 props로 렌더된다. repoPath를 주지 않아 diff fetch 효과를
// 태우지 않음으로써 async setState(act 경고·플레이크)를 피한다.
describe('DiffExplorer — 커밋 피커(변경2)', () => {
  it('현재 selIdx의 커밋 칩(7자 sha + 첫 줄 메시지)을 보인다', () => {
    const { container } = render(
      <DiffExplorer commit={PICK_COMMITS[1]} commitFiles={[]}
        commits={PICK_COMMITS} selIdx={1} onSelectCommit={vi.fn()} />
    )
    expect(container.querySelector('.dxc-cur .sha')?.textContent).toBe('bbbbbb2')
    expect(container.querySelector('.dxc-cur .msg')?.textContent).toBe('second commit')
  })

  it('→ 클릭 시 onSelectCommit(selIdx+1) 호출, 양끝에서 스텝퍼 disabled', () => {
    const onSel = vi.fn()
    const { rerender } = render(
      <DiffExplorer commit={PICK_COMMITS[1]} commitFiles={[]}
        commits={PICK_COMMITS} selIdx={1} onSelectCommit={onSel} />
    )
    fireEvent.click(screen.getByTitle('다음 커밋'))
    expect(onSel).toHaveBeenCalledWith(2)

    // 첫 커밋: ← disabled, → 활성
    rerender(
      <DiffExplorer commit={PICK_COMMITS[0]} commitFiles={[]}
        commits={PICK_COMMITS} selIdx={0} onSelectCommit={onSel} />
    )
    expect(screen.getByTitle('이전 커밋')).toBeDisabled()
    expect(screen.getByTitle('다음 커밋')).not.toBeDisabled()

    // 마지막 커밋: → disabled
    rerender(
      <DiffExplorer commit={PICK_COMMITS[2]} commitFiles={[]}
        commits={PICK_COMMITS} selIdx={2} onSelectCommit={onSel} />
    )
    expect(screen.getByTitle('다음 커밋')).toBeDisabled()
  })

  it('칩 클릭 → 드롭다운 열림 → 검색 필터 → 항목 클릭 시 원본 index로 onSelectCommit', () => {
    const onSel = vi.fn()
    const { container } = render(
      <DiffExplorer commit={PICK_COMMITS[0]} commitFiles={[]}
        commits={PICK_COMMITS} selIdx={0} onSelectCommit={onSel} />
    )
    // 닫힌 상태: 드롭다운 없음
    expect(container.querySelector('.dxc-pop')).toBeNull()

    // 칩 클릭 → 드롭다운 열림
    fireEvent.click(container.querySelector('.dxc-cur')!)
    expect(container.querySelector('.dxc-pop')).not.toBeNull()

    // 검색으로 목록 축소(third만 남음)
    fireEvent.change(screen.getByPlaceholderText('메시지 · sha로 찾기'), { target: { value: 'third' } })
    expect(container.querySelectorAll('.dxc-item').length).toBe(1)

    // 항목 클릭 → 원본 index(2)로 콜백, 드롭다운 닫힘
    fireEvent.click(screen.getByText('third commit'))
    expect(onSel).toHaveBeenCalledWith(2)
    expect(container.querySelector('.dxc-pop')).toBeNull()
  })

  it('검색 결과가 없으면 빈 문구를 보인다', () => {
    const { container } = render(
      <DiffExplorer commit={PICK_COMMITS[0]} commitFiles={[]}
        commits={PICK_COMMITS} selIdx={0} onSelectCommit={vi.fn()} />
    )
    fireEvent.click(container.querySelector('.dxc-cur')!)
    fireEvent.change(screen.getByPlaceholderText('메시지 · sha로 찾기'), { target: { value: 'nope-zzz' } })
    expect(screen.getByText('찾는 커밋이 없어요')).toBeInTheDocument()
  })

  it('commits 미전달·빈 배열·onSelectCommit 없음이면 .dxc-bar 미렌더', () => {
    // 미전달
    const r1 = render(<DiffExplorer commit={PICK_COMMITS[0]} commitFiles={[]} />)
    expect(r1.container.querySelector('.dxc-bar')).toBeNull()
    cleanup()
    // 빈 배열
    const r2 = render(<DiffExplorer commit={PICK_COMMITS[0]} commitFiles={[]} commits={[]} selIdx={0} onSelectCommit={vi.fn()} />)
    expect(r2.container.querySelector('.dxc-bar')).toBeNull()
    cleanup()
    // onSelectCommit 없음
    const r3 = render(<DiffExplorer commit={PICK_COMMITS[0]} commitFiles={[]} commits={PICK_COMMITS} selIdx={0} />)
    expect(r3.container.querySelector('.dxc-bar')).toBeNull()
  })
})

// ── 변경1: 파일 pane 폭 리사이즈(스모크) ──
// BlameView 와 동일 로직. repoPath 미전달로 diff fetch 효과를 태우지 않아 async 경고를 피한다.
// jsdom clientWidth=0 → max=480 상한이라 아래 델타 계산은 결정적.
const DX_FILES_WIDTH_KEY = 'gitgrove:diffFilesWidth'

describe('DiffExplorer — 파일 pane 리사이즈(변경1)', () => {
  it('localStorage 저장 폭이 초기 .dx-files width로 반영된다', () => {
    localStorage.setItem(DX_FILES_WIDTH_KEY, '300')
    const { container } = render(<DiffExplorer commit={PICK_COMMITS[0]} commitFiles={[]} />)
    expect((container.querySelector('.dx-files') as HTMLElement).style.width).toBe('300px')
  })

  it('저장값이 없으면 기본 260px, col-resize 핸들이 존재한다', () => {
    const { container } = render(<DiffExplorer commit={PICK_COMMITS[0]} commitFiles={[]} />)
    expect((container.querySelector('.dx-files') as HTMLElement).style.width).toBe('260px')
    expect(container.querySelector('[style*="col-resize"]')).not.toBeNull()
  })

  it('드래그 시 폭이 델타만큼 바뀌고 localStorage에 저장된다', () => {
    const { container } = render(<DiffExplorer commit={PICK_COMMITS[0]} commitFiles={[]} />)
    const files = container.querySelector('.dx-files') as HTMLElement
    const handle = container.querySelector('[style*="col-resize"]') as HTMLElement

    // 260 + (170-100)=330, 클램프 [150,480] → 330
    fireEvent.mouseDown(handle, { clientX: 100 })
    fireEvent.mouseMove(window, { clientX: 170 })
    fireEvent.mouseUp(window)

    expect(files.style.width).toBe('330px')
    expect(localStorage.getItem(DX_FILES_WIDTH_KEY)).toBe('330')
  })
})
