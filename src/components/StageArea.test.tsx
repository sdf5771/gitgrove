import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { StageArea } from './StageArea'

// 회귀: 커밋 후/변경사항 없는 깨끗한 레포에서 Stage 뷰가 mock 더미데이터를
// 보여주던 버그(INIT_UNSTAGED/INIT_STAGED 폴백). 빈 배열이면 빈 상태여야 한다.
describe('StageArea — 빈 상태 (mock 더미 누출 방지)', () => {
  afterEach(cleanup)

  it('빈 배열을 받으면 더미가 아니라 빈 상태 문구를 보여준다', () => {
    render(<StageArea onSelDiffFile={() => {}} unstaged={[]} staged={[]} repoPath="/repo/x" />)
    expect(screen.getByText('No unstaged changes')).toBeTruthy()
    expect(screen.getByText('No staged files')).toBeTruthy()
    // 과거 더미 데이터 경로가 절대 보이면 안 된다.
    expect(screen.queryByText('src/auth/oauth.ts')).toBeNull()
    expect(screen.queryByText('src/auth/jwt.ts')).toBeNull()
  })

  it('initial props가 없어도 mock으로 폴백하지 않는다', () => {
    render(<StageArea onSelDiffFile={() => {}} repoPath="/repo/x" />)
    expect(screen.getByText('No unstaged changes')).toBeTruthy()
    expect(screen.getByText('No staged files')).toBeTruthy()
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

// 회귀(B14): StageArea가 controlled로 전환되어 props(unstaged/staged)가 바뀌면
// 화면에 반영되어야 한다. 과거 `useState(initialUnstaged ?? [])`로 props를 1회만
// 흡수하던 버그("고쳤는데 또 안 됨")가 재발하지 않도록 고정한다.
describe('StageArea — controlled prop 동기화 (B14)', () => {
  afterEach(cleanup)

  it('unstaged prop이 새 파일로 바뀌면 그 파일이 화면에 나타난다', () => {
    const { rerender } = render(
      <StageArea onSelDiffFile={() => {}} unstaged={[]} staged={[]} repoPath="/repo/x" />,
    )
    // 처음엔 빈 상태
    expect(screen.getByText('No unstaged changes')).toBeTruthy()

    // loadRepo 확정 결과가 새 unstaged를 prop으로 흘려보낸 상황을 모사
    rerender(
      <StageArea
        onSelDiffFile={() => {}}
        unstaged={[{ p: 'src/new/added.ts', s: 'A', a: 5, d: 0 }]}
        staged={[]}
        repoPath="/repo/x"
      />,
    )

    // 1회 흡수 버그면 여전히 "No unstaged changes"라 실패한다.
    expect(screen.getByText('added.ts')).toBeTruthy()
    expect(screen.queryByText('No unstaged changes')).toBeNull()
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
    expect(screen.getByText('No staged files')).toBeTruthy()

    rerender(
      <StageArea
        onSelDiffFile={() => {}}
        unstaged={[]}
        staged={[{ p: 'a.ts', s: 'M', a: 1, d: 1 }]}
        repoPath="/repo/x"
      />,
    )

    // a.ts가 staged 쪽으로 이동해 표시되고, unstaged는 비어야 한다.
    expect(screen.getByText('a.ts')).toBeTruthy()
    expect(screen.getByText('No unstaged changes')).toBeTruthy()
    expect(screen.queryByText('No staged files')).toBeNull()
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
    expect(screen.getByText('No unstaged changes')).toBeTruthy()
  })
})
