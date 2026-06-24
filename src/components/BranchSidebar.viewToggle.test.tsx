import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BranchSidebar } from './BranchSidebar'
import type { Branch } from '../data/mockData'

// 그로브(나무) ↔ 기존 리스트(목록) 헤더 토글 + localStorage 영속화 검증.
// 키: gitgrove:branchView ('grove' | 'list'), 키 없으면 기본 'grove'.

const LOCAL: Branch[] = [
  { name: 'main', lane: 0, current: true, ahead: 0, behind: 0 },
  { name: 'feature/x', lane: 1, ahead: 4, behind: 0 },
  { name: 'release', lane: 2, ahead: 0, behind: 2 },
]
const REMOTES = ['origin/main', 'origin/feature/x']
const TAGS = ['v1.0.0', 'v0.9.2']

function renderSb(extra?: Partial<React.ComponentProps<typeof BranchSidebar>>) {
  const onBranchAction = vi.fn()
  const onBranchClick = vi.fn()
  const onBranchContextMenu = vi.fn()
  const utils = render(
    <BranchSidebar
      activeBranch="main"
      onBranchAction={onBranchAction}
      onBranchClick={onBranchClick}
      onBranchContextMenu={onBranchContextMenu}
      localBranches={LOCAL}
      remoteBranches={REMOTES}
      tags={TAGS}
      repoName="gitgrove"
      repoOwner="seobisback"
      {...extra}
    />,
  )
  return { onBranchAction, onBranchClick, onBranchContextMenu, container: utils.container }
}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('BranchSidebar — 보기 토글 (나무/목록)', () => {
  it('키가 없으면 기본 그로브(나무)로 렌더한다 (.plot 존재, .bitem 없음)', () => {
    const { container } = renderSb()
    expect(container.querySelectorAll('.plot').length).toBe(3)
    expect(container.querySelector('.bitem')).toBeNull()
    // 토글의 나무 버튼이 활성
    expect(screen.getByLabelText('나무 보기').getAttribute('aria-pressed')).toBe('true')
  })

  it('목록 토글 클릭 시 리스트로 전환하고 gitgrove:branchView=list를 저장한다', async () => {
    const user = userEvent.setup()
    const { container } = renderSb()
    await user.click(screen.getByLabelText('목록 보기'))
    // 리스트 렌더: .bitem 존재, .plot 없음
    expect(container.querySelectorAll('.bitem').length).toBeGreaterThan(0)
    expect(container.querySelector('.plot')).toBeNull()
    // 영속화
    expect(localStorage.getItem('gitgrove:branchView')).toBe('list')
    expect(screen.getByLabelText('목록 보기').getAttribute('aria-pressed')).toBe('true')
  })

  it('나무로 되돌리면 grove를 저장하고 .plot이 다시 보인다', async () => {
    const user = userEvent.setup()
    const { container } = renderSb()
    await user.click(screen.getByLabelText('목록 보기'))
    await user.click(screen.getByLabelText('나무 보기'))
    expect(container.querySelectorAll('.plot').length).toBe(3)
    expect(container.querySelector('.bitem')).toBeNull()
    expect(localStorage.getItem('gitgrove:branchView')).toBe('grove')
  })

  it('키가 list면 마운트 시 리스트로 시작한다 (깜빡임 없는 동기 read)', () => {
    localStorage.setItem('gitgrove:branchView', 'list')
    const { container } = renderSb()
    expect(container.querySelectorAll('.bitem').length).toBeGreaterThan(0)
    expect(container.querySelector('.plot')).toBeNull()
  })

  it('알 수 없는 값이면 기본 그로브로 폴백한다', () => {
    localStorage.setItem('gitgrove:branchView', 'bogus')
    const { container } = renderSb()
    expect(container.querySelectorAll('.plot').length).toBe(3)
  })

  it('두 모드 모두 헤더 토글(나무/목록)을 노출한다', async () => {
    const user = userEvent.setup()
    renderSb()
    expect(screen.getByLabelText('나무 보기')).toBeTruthy()
    expect(screen.getByLabelText('목록 보기')).toBeTruthy()
    await user.click(screen.getByLabelText('목록 보기'))
    // 리스트 모드에서도 동일 토글 유지
    expect(screen.getByLabelText('나무 보기')).toBeTruthy()
    expect(screen.getByLabelText('목록 보기')).toBeTruthy()
  })
})

describe('BranchSidebar — 리스트(목록) 모드 동작 보존', () => {
  function renderList(extra?: Partial<React.ComponentProps<typeof BranchSidebar>>) {
    localStorage.setItem('gitgrove:branchView', 'list')
    return renderSb(extra)
  }

  it('Local/Remote/Tags 섹션과 항목을 렌더한다', () => {
    renderList()
    expect(screen.getByText('Local')).toBeTruthy()
    expect(screen.getByText('Remote')).toBeTruthy()
    expect(screen.getByText('Tags')).toBeTruthy()
    expect(screen.getByText('main')).toBeTruthy()
    expect(screen.getByText('v1.0.0')).toBeTruthy()
  })

  it('활성 브랜치에 cur 클래스 + HEAD 배지를 표시한다', () => {
    const { container } = renderList()
    const items = Array.from(container.querySelectorAll('.bitem')) as HTMLElement[]
    const mainItem = items.find(i => within(i).queryByText('main'))!
    expect(mainItem.classList.contains('cur')).toBe(true)
    expect(within(mainItem).getByText('HEAD')).toBeTruthy()
  })

  it('ahead가 있으면 ↑N 배지를 표시한다', () => {
    const { container } = renderList()
    const items = Array.from(container.querySelectorAll('.bitem')) as HTMLElement[]
    const fx = items.find(i => within(i).queryByText('feature/x'))!
    expect(within(fx).getByText('↑4')).toBeTruthy()
  })

  it('브랜치 클릭 시 onBranchClick(이름)을 호출한다', async () => {
    const user = userEvent.setup()
    const { onBranchClick, container } = renderList()
    const items = Array.from(container.querySelectorAll('.bitem')) as HTMLElement[]
    const fx = items.find(i => within(i).queryByText('feature/x'))!
    await user.click(fx)
    expect(onBranchClick).toHaveBeenCalledWith('feature/x')
  })

  it('우클릭 시 onBranchContextMenu(local)를 호출한다', () => {
    const { onBranchContextMenu, container } = renderList()
    const items = Array.from(container.querySelectorAll('.bitem')) as HTMLElement[]
    const mainItem = items.find(i => within(i).queryByText('main'))!
    fireEvent.contextMenu(mainItem)
    expect(onBranchContextMenu).toHaveBeenCalledWith(expect.anything(), 'main', 'local', true)
  })

  it('검색 필터로 항목을 좁힌다', async () => {
    const user = userEvent.setup()
    const { container } = renderList()
    await user.type(screen.getByPlaceholderText('브랜치 찾기'), 'release')
    const names = Array.from(container.querySelectorAll('.bitem')).map(i => i.textContent)
    expect(names.some(n => n?.includes('release'))).toBe(true)
    expect(names.some(n => n?.includes('feature/x'))).toBe(false)
  })

  it('+버튼이 onBranchAction("create")를 호출한다', async () => {
    const user = userEvent.setup()
    const { onBranchAction } = renderList()
    await user.click(screen.getByTitle('새 브랜치'))
    expect(onBranchAction).toHaveBeenCalledWith('create')
  })
})
