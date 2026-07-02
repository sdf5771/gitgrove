import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
