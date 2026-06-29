import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { StageArea } from './StageArea'
import type { FileEntry } from '../data/mockData'

// 단일 목록(GitHub Desktop식)으로 재설계됨: unstaged+staged를 path 기준 병합해
// 한 파일=한 행, 부분 스테이지(양쪽 존재)는 indeterminate 체크박스로 표시한다.

// 빈 상태 회귀: 커밋 후/깨끗한 레포에서 mock 더미가 누출되지 않아야 한다.
describe('StageArea — 빈 상태 (mock 더미 누출 방지)', () => {
  afterEach(cleanup)

  it('빈 배열을 받으면 더미가 아니라 빈 상태 문구를 보여준다', () => {
    render(<StageArea onSelDiffFile={() => {}} unstaged={[]} staged={[]} repoPath="/repo/x" />)
    expect(screen.getByText('변경된 파일이 없어요')).toBeTruthy()
    // 과거 더미 데이터 경로가 절대 보이면 안 된다.
    expect(screen.queryByText('src/auth/oauth.ts')).toBeNull()
    expect(screen.queryByText('src/auth/jwt.ts')).toBeNull()
  })

  it('initial props가 없어도 mock으로 폴백하지 않는다', () => {
    render(<StageArea onSelDiffFile={() => {}} repoPath="/repo/x" />)
    expect(screen.getByText('변경된 파일이 없어요')).toBeTruthy()
  })

  it('실제 파일이 주어지면 그 파일을 보여준다', () => {
    render(
      <StageArea
        onSelDiffFile={() => {}}
        unstaged={[{ p: 'src/real/file.ts', s: 'M', a: 1, d: 0 }]}
        staged={[]}
        repoPath="/repo/x"
      />,
    )
    expect(screen.getByText('file.ts')).toBeTruthy()
  })
})

// 회귀(B14): controlled prop 동기화. props가 바뀌면 화면에 반영된다.
describe('StageArea — controlled prop 동기화 (B14)', () => {
  afterEach(cleanup)

  it('unstaged prop이 새 파일로 바뀌면 그 파일이 화면에 나타난다', () => {
    const { rerender } = render(
      <StageArea onSelDiffFile={() => {}} unstaged={[]} staged={[]} repoPath="/repo/x" />,
    )
    expect(screen.getByText('변경된 파일이 없어요')).toBeTruthy()

    rerender(
      <StageArea
        onSelDiffFile={() => {}}
        unstaged={[{ p: 'src/new/added.ts', s: 'A', a: 5, d: 0 }]}
        staged={[]}
        repoPath="/repo/x"
      />,
    )

    expect(screen.getByText('added.ts')).toBeTruthy()
    expect(screen.queryByText('변경된 파일이 없어요')).toBeNull()
  })

  it('staged prop이 갱신되면(커밋/머지 후 등) 화면에 반영된다', () => {
    const { rerender } = render(
      <StageArea
        onSelDiffFile={() => {}}
        unstaged={[{ p: 'a.ts', s: 'M', a: 1, d: 1 }]}
        staged={[]}
        repoPath="/repo/x"
      />,
    )
    expect(screen.getByText('a.ts')).toBeTruthy()

    rerender(
      <StageArea
        onSelDiffFile={() => {}}
        unstaged={[]}
        staged={[{ p: 'a.ts', s: 'M', a: 1, d: 1 }]}
        repoPath="/repo/x"
      />,
    )

    // 여전히 한 행(a.ts)으로 존재하되 스테이지 상태가 된다.
    expect(screen.getByText('a.ts')).toBeTruthy()
    const cb = screen.getByLabelText('a.ts 스테이지 토글') as HTMLInputElement
    expect(cb.checked).toBe(true)
  })

  it('prop이 빈 배열로 바뀌면(외부에서 변경 되돌림 등) 빈 상태로 돌아간다', () => {
    const { rerender } = render(
      <StageArea
        onSelDiffFile={() => {}}
        unstaged={[{ p: 'gone.ts', s: 'M', a: 1, d: 0 }]}
        staged={[]}
        repoPath="/repo/x"
      />,
    )
    expect(screen.getByText('gone.ts')).toBeTruthy()

    rerender(<StageArea onSelDiffFile={() => {}} unstaged={[]} staged={[]} repoPath="/repo/x" />)

    expect(screen.queryByText('gone.ts')).toBeNull()
    expect(screen.getByText('변경된 파일이 없어요')).toBeTruthy()
  })
})

// 핵심: 단일 목록 + 3상태 체크박스 토글.
describe('StageArea — 단일 목록 + 3상태 토글', () => {
  let stage: ReturnType<typeof vi.fn>
  let unstage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    stage = vi.fn().mockResolvedValue(undefined)
    unstage = vi.fn().mockResolvedValue(undefined)
    // 최소 stub — StageArea가 호출하는 것만.
    ;(window as unknown as { gitAPI: Record<string, unknown> }).gitAPI = { stage, unstage }
  })
  afterEach(() => {
    cleanup()
    delete (window as unknown as { gitAPI?: unknown }).gitAPI
  })

  it('① 미스테이지 파일 토글 → stage 호출 + 체크', async () => {
    const onSel = vi.fn()
    render(
      <StageArea
        onSelDiffFile={onSel}
        unstaged={[{ p: 'a.ts', s: 'M', a: 1, d: 0 }]}
        staged={[]}
        repoPath="/repo/x"
      />,
    )
    const cb = screen.getByLabelText('a.ts 스테이지 토글') as HTMLInputElement
    expect(cb.checked).toBe(false)
    expect(cb.indeterminate).toBe(false)

    fireEvent.click(cb)
    await waitFor(() => expect(stage).toHaveBeenCalledWith('/repo/x', ['a.ts']))
    await waitFor(() => expect((screen.getByLabelText('a.ts 스테이지 토글') as HTMLInputElement).checked).toBe(true))
    // diff는 staged=true로 표시
    expect(onSel).toHaveBeenLastCalledWith(expect.objectContaining({ p: 'a.ts' }), true)
  })

  it('② 스테이지된 파일 토글 → unstage 호출 + 해제', async () => {
    const onSel = vi.fn()
    render(
      <StageArea
        onSelDiffFile={onSel}
        unstaged={[]}
        staged={[{ p: 'a.ts', s: 'M', a: 1, d: 0 }]}
        repoPath="/repo/x"
      />,
    )
    const cb = screen.getByLabelText('a.ts 스테이지 토글') as HTMLInputElement
    expect(cb.checked).toBe(true)

    fireEvent.click(cb)
    await waitFor(() => expect(unstage).toHaveBeenCalledWith('/repo/x', ['a.ts']))
    await waitFor(() => expect((screen.getByLabelText('a.ts 스테이지 토글') as HTMLInputElement).checked).toBe(false))
    expect(onSel).toHaveBeenLastCalledWith(expect.objectContaining({ p: 'a.ts' }), false)
  })

  it('③ 부분 스테이지(양쪽 존재) → 한 행 + indeterminate, 토글 시 나머지 stage', async () => {
    const same: FileEntry = { p: 'a.ts', s: 'M', a: 2, d: 1 }
    render(
      <StageArea
        onSelDiffFile={() => {}}
        unstaged={[same]}
        staged={[same]}
        repoPath="/repo/x"
      />,
    )
    // 같은 파일이 한 행만 존재(중복 아님)
    expect(screen.getAllByText('a.ts')).toHaveLength(1)
    // 부분 배지 표시
    expect(screen.getByText('부분')).toBeTruthy()
    const cb = screen.getByLabelText('a.ts 스테이지 토글') as HTMLInputElement
    expect(cb.indeterminate).toBe(true)
    expect(cb.checked).toBe(false)

    fireEvent.click(cb)
    // 부분 → 클릭 → 나머지까지 stage(완전 스테이지)
    await waitFor(() => expect(stage).toHaveBeenCalledWith('/repo/x', ['a.ts']))
    await waitFor(() => {
      const after = screen.getByLabelText('a.ts 스테이지 토글') as HTMLInputElement
      expect(after.checked).toBe(true)
      expect(after.indeterminate).toBe(false)
    })
    expect(screen.queryByText('부분')).toBeNull()
  })

  it('④ 커밋 카운트 = 스테이지된 파일 수(완전+부분)', () => {
    render(
      <StageArea
        onSelDiffFile={() => {}}
        unstaged={[
          { p: 'a.ts', s: 'M', a: 1, d: 0 },          // 미스테이지
          { p: 'part.ts', s: 'M', a: 1, d: 0 },       // 부분(아래 staged에도)
        ]}
        staged={[
          { p: 'b.ts', s: 'A', a: 5, d: 0 },          // 완전 스테이지
          { p: 'part.ts', s: 'M', a: 2, d: 0 },       // 부분
        ]}
        repoPath="/repo/x"
      />,
    )
    // b.ts(완전) + part.ts(부분) = 2
    expect(screen.getByText('2개 파일 커밋 →')).toBeTruthy()
  })

  it('⑤ 행 클릭(체크박스 외) → onSelDiffFile(staged 플래그 정확)', () => {
    const onSel = vi.fn()
    render(
      <StageArea
        onSelDiffFile={onSel}
        unstaged={[{ p: 'work.ts', s: 'M', a: 1, d: 0 }]}
        staged={[{ p: 'idx.ts', s: 'A', a: 2, d: 0 }]}
        repoPath="/repo/x"
      />,
    )
    fireEvent.click(screen.getByText('work.ts'))
    expect(onSel).toHaveBeenLastCalledWith(expect.objectContaining({ p: 'work.ts' }), false)

    fireEvent.click(screen.getByText('idx.ts'))
    expect(onSel).toHaveBeenLastCalledWith(expect.objectContaining({ p: 'idx.ts' }), true)
  })

  it('전체 토글 → stage all 호출(미스테이지/부분 존재 시)', async () => {
    render(
      <StageArea
        onSelDiffFile={() => {}}
        unstaged={[{ p: 'a.ts', s: 'M', a: 1, d: 0 }, { p: 'b.ts', s: 'M', a: 1, d: 0 }]}
        staged={[]}
        repoPath="/repo/x"
      />,
    )
    fireEvent.click(screen.getByText('전체 스테이지'))
    await waitFor(() => expect(stage).toHaveBeenCalledWith('/repo/x', ['a.ts', 'b.ts']))
  })
})

// 컨텍스트 메뉴 / discard 보존.
describe('StageArea — 컨텍스트 메뉴 + discard 보존', () => {
  afterEach(cleanup)

  it('우클릭 → 메뉴 표시, discard → ConfirmModal 노출', () => {
    render(
      <StageArea
        onSelDiffFile={() => {}}
        unstaged={[{ p: 'a.ts', s: 'M', a: 1, d: 0 }]}
        staged={[]}
        repoPath="/repo/x"
      />,
    )
    fireEvent.contextMenu(screen.getByText('a.ts'))
    // FileContextMenu의 discard 항목(말줄임 포함). 메뉴 항목은 onMouseDown으로 동작.
    const discard = screen.getByText('변경 되돌리기…')
    fireEvent.mouseDown(discard)
    // ConfirmModal 본문 문구로 확인(메뉴는 닫힘)
    expect(screen.getByText(/이 작업은 되돌릴 수 없어요/)).toBeTruthy()
  })
})
