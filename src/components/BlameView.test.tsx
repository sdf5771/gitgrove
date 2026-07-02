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
