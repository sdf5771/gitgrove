import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { CommitGraph } from './CommitGraph'
import type { Commit } from '../data/mockData'

function commit(over: Partial<Commit> & Pick<Commit, 'id'>): Commit {
  return {
    lane: 0,
    msg: 'msg ' + over.id,
    author: 'tester',
    time: '1h',
    parents: [],
    labels: [],
    stats: { f: 1, a: 2, d: 0 },
    files: [],
    ...over,
  }
}

const commits = [commit({ id: 'aaaaaaa' }), commit({ id: 'bbbbbbb', lane: 1 })]

describe('CommitGraph 행 인터랙션', () => {
  afterEach(cleanup)

  it('단일 클릭 → onSelect(i)', () => {
    const onSelect = vi.fn()
    render(
      <CommitGraph commits={commits} selectedIdx={0} onSelect={onSelect}
        onContextMenu={vi.fn()} showStats rowH={28} activeBranch="main" />,
    )
    fireEvent.click(screen.getByText('msg bbbbbbb'))
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('더블 클릭 → onActivate(i) (해당 커밋 Diff로 드릴인)', () => {
    const onActivate = vi.fn()
    render(
      <CommitGraph commits={commits} selectedIdx={0} onSelect={vi.fn()} onActivate={onActivate}
        onContextMenu={vi.fn()} showStats rowH={28} activeBranch="main" />,
    )
    fireEvent.doubleClick(screen.getByText('msg bbbbbbb'))
    expect(onActivate).toHaveBeenCalledWith(1)
  })

  it('onActivate 미지정이어도 더블클릭이 throw하지 않는다', () => {
    render(
      <CommitGraph commits={commits} selectedIdx={0} onSelect={vi.fn()}
        onContextMenu={vi.fn()} showStats rowH={28} activeBranch="main" />,
    )
    expect(() => fireEvent.doubleClick(screen.getByText('msg aaaaaaa'))).not.toThrow()
  })
})
