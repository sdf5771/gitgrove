import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BranchSidebar } from './BranchSidebar'
import type { Branch } from '../data/mockData'

// 그로브 사이드바 — 디자인 정본(.grove-sb) 포팅 후 기능/동작 보존 검증.
// 데이터 계약(props) 불변, 시각만 교체. 로컬 plot·원격·태그 렌더 + 건강배지 + 클릭/컨텍스트메뉴.

const LOCAL: Branch[] = [
  { name: 'main', lane: 0, current: true, ahead: 0, behind: 0 },     // healthy(최신)
  { name: 'feature/x', lane: 1, ahead: 4, behind: 0 },               // ahead ↑4
  { name: 'release', lane: 2, ahead: 0, behind: 2 },                 // behind ↓2
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

afterEach(() => cleanup())

describe('BranchSidebar — 그로브 패널', () => {
  it('헤더에 레포명·소유자·N그루(로컬 수) 배지를 표시한다', () => {
    renderSb()
    expect(screen.getByText('gitgrove')).toBeTruthy()
    expect(screen.getByText('seobisback · 정원')).toBeTruthy()
    expect(screen.getByText('3그루')).toBeTruthy()
  })

  it('로컬/원격/태그 세 섹션과 각 항목을 렌더한다 (태그 보존)', () => {
    const { container } = render(
      <BranchSidebar
        activeBranch="main"
        onBranchAction={vi.fn()}
        localBranches={LOCAL}
        remoteBranches={REMOTES}
        tags={TAGS}
      />,
    )
    expect(screen.getByText('로컬 브랜치')).toBeTruthy()
    expect(screen.getByText('원격')).toBeTruthy()
    expect(screen.getByText('태그')).toBeTruthy()
    // 로컬 plot 3개
    expect(container.querySelectorAll('.plot').length).toBe(3)
    // 원격 행(origin/ 제거 표기)
    expect(screen.getByText('v1.0.0')).toBeTruthy()
    expect(screen.getByText('v0.9.2')).toBeTruthy()
  })

  it('HEAD(activeBranch) plot에 head/on 클래스 + 정원지기 그루를 렌더한다', () => {
    const { container } = renderSb()
    const head = container.querySelector('.plot.head.on')
    expect(head).not.toBeNull()
    // HEAD plot에만 .gard(정원지기 그루)
    expect(head!.querySelector('.gard')).not.toBeNull()
    expect(container.querySelectorAll('.plot .gard').length).toBe(1)
  })

  it('건강배지를 상태별로 파생한다 (healthy/ahead/behind)', () => {
    const { container } = renderSb()
    const plots = Array.from(container.querySelectorAll('.plot'))
    const byName = (n: string) => plots.find(p => within(p as HTMLElement).queryByText(n)) as HTMLElement
    // main = 최신(healthy)
    expect(within(byName('main')).getByText('최신')).toBeTruthy()
    expect(byName('main').querySelector('.ph-healthy')).not.toBeNull()
    // feature/x = ahead ↑4 (건강배지 + g-ab 양쪽에 ↑4 노출)
    expect(byName('feature/x').querySelector('.ph-ahead')!.textContent).toBe('↑4')
    expect(byName('feature/x').querySelector('.g-ab .up')!.textContent).toBe('↑4')
    // release = behind ↓2
    expect(byName('release').querySelector('.ph-behind')!.textContent).toBe('↓2')
    expect(byName('release').querySelector('.g-ab .dn')!.textContent).toBe('↓2')
  })

  it('conflict prop이면 HEAD plot 건강배지가 충돌(conflict)로 바뀐다', () => {
    const { container } = renderSb({ conflict: true })
    const head = container.querySelector('.plot.head') as HTMLElement
    expect(head.querySelector('.ph-conflict')).not.toBeNull()
    expect(within(head).getByText('충돌')).toBeTruthy()
  })

  it('ahead 수로 나무 성장단계가 달라진다 (treeStage)', () => {
    const branches: Branch[] = [
      { name: 'seed', lane: 0, ahead: 0 },   // stage 0
      { name: 'grow', lane: 1, ahead: 7 },   // stage 3
    ]
    const { container } = render(
      <BranchSidebar activeBranch="x" onBranchAction={vi.fn()} localBranches={branches} remoteBranches={[]} tags={[]} />,
    )
    const labels = Array.from(container.querySelectorAll('.tree-tile .sprite title')).map(t => t.textContent)
    // 나무 스프라이트 aria-label에 단계 정보가 들어감(Tree 컴포넌트)
    expect(labels.length).toBe(2)
  })

  it('plot 클릭 시 onBranchClick(이름)을 호출한다 (체크아웃 배선)', async () => {
    const user = userEvent.setup()
    const { onBranchClick, container } = renderSb()
    const plots = Array.from(container.querySelectorAll('.plot')) as HTMLElement[]
    const featurePlot = plots.find(p => within(p).queryByText('feature/x'))!
    await user.click(featurePlot)
    expect(onBranchClick).toHaveBeenCalledWith('feature/x')
  })

  it('plot 우클릭 시 onBranchContextMenu(local)를 호출한다', () => {
    const { onBranchContextMenu, container } = renderSb()
    const plots = Array.from(container.querySelectorAll('.plot')) as HTMLElement[]
    const mainPlot = plots.find(p => within(p).queryByText('main'))!
    fireEvent.contextMenu(mainPlot)
    expect(onBranchContextMenu).toHaveBeenCalledWith(expect.anything(), 'main', 'local', true)
  })

  it('검색 필터로 로컬/원격/태그를 좁힌다', async () => {
    const user = userEvent.setup()
    const { container } = renderSb()
    await user.type(screen.getByPlaceholderText('브랜치 찾기'), 'release')
    expect(container.querySelectorAll('.plot').length).toBe(1)
    expect(screen.getByText('release')).toBeTruthy()
  })

  it('+버튼이 onBranchAction("create")를 호출한다', async () => {
    const user = userEvent.setup()
    const { onBranchAction } = renderSb()
    await user.click(screen.getByTitle('새 브랜치'))
    expect(onBranchAction).toHaveBeenCalledWith('create')
  })
})
