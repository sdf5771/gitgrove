import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { StageArea } from './StageArea'

// 회귀: 커밋 후/변경사항 없는 깨끗한 레포에서 Stage 뷰가 mock 더미데이터를
// 보여주던 버그(INIT_UNSTAGED/INIT_STAGED 폴백). 빈 배열이면 빈 상태여야 한다.
describe('StageArea — 빈 상태 (mock 더미 누출 방지)', () => {
  afterEach(cleanup)

  it('빈 배열을 받으면 더미가 아니라 빈 상태 문구를 보여준다', () => {
    render(<StageArea onSelDiffFile={() => {}} initialUnstaged={[]} initialStaged={[]} repoPath="/repo/x" />)
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
        initialUnstaged={[{ p: 'src/real/file.ts', s: 'M', a: 1, d: 0 }]}
        initialStaged={[]}
        repoPath="/repo/x"
      />,
    )
    expect(screen.getByText('file.ts')).toBeTruthy()
  })
})
