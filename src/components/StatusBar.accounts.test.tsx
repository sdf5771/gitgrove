import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { StatusBar, type AccountProfile } from './StatusBar'
import { installGitApiMock } from '../test/gitApiMock'

const GH: AccountProfile = {
  provider: 'github', login: 'seobisback', name: '서비스킴', avatarUrl: null,
  bio: '풀스택 개발', role: '이 저장소 · admin',
  stats: [{ value: '142', label: 'followers' }, { value: '88', label: 'following' }, { value: '37', label: 'repos' }],
  company: 'GitGrove', location: 'Seoul', blog: 'gitgrove.dev', joined: 'Joined 2019',
  profileUrl: 'https://github.com/seobisback',
}
const GL: AccountProfile = {
  provider: 'gitlab', login: 's.kim', name: '서비스킴', avatarUrl: null,
  bio: '백엔드·인프라', role: '이 프로젝트 · Maintainer',
  stats: [{ value: '12', label: 'projects' }],
  company: 'Platform Team', location: 'Seoul', blog: null, joined: '가입 2021',
  profileUrl: 'https://gitlab.com/s.kim',
}

describe('StatusBar 계정 칩 + 프로필 카드', () => {
  let appAPI: ReturnType<typeof installGitApiMock>['appAPI']
  beforeEach(() => { appAPI = installGitApiMock().appAPI })
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('연결된 프로바이더별로 칩이 나란히 뜬다(@login + gh/gl 클래스)', () => {
    const { container } = render(<StatusBar branch="main" onSettings={() => {}} accounts={[GH, GL]} />)
    const chips = Array.from(container.querySelectorAll('.acct-chip')) as HTMLElement[]
    expect(chips).toHaveLength(2)
    expect(chips[0].className).toContain('gh')
    expect(chips[1].className).toContain('gl')
    expect(within(chips[0]).getByText('@seobisback')).toBeTruthy()
    expect(within(chips[1]).getByText('@s.kim')).toBeTruthy()
  })

  it('계정 없으면 칩을 렌더하지 않는다', () => {
    const { container } = render(<StatusBar branch="main" onSettings={() => {}} accounts={[]} />)
    expect(container.querySelector('.acct-chip')).toBeNull()
  })

  it('GitHub 칩 클릭 → gh 카드(이름·역할·통계·GitHub에서 보기)', () => {
    const { container } = render(<StatusBar branch="main" onSettings={() => {}} accounts={[GH, GL]} />)
    fireEvent.click(screen.getByTitle('@seobisback'))
    const card = container.querySelector('.pcard') as HTMLElement
    expect(card.className).toContain('gh')
    expect(within(card).getByText('서비스킴')).toBeTruthy()
    expect(within(card).getByText('이 저장소 · admin')).toBeTruthy()
    expect(within(card).getByText('142')).toBeTruthy()
    expect(within(card).getByText('GitHub에서 보기')).toBeTruthy()
  })

  it('GitLab 칩 클릭 → gl 카드(Maintainer·projects·GitLab에서 보기)', () => {
    const { container } = render(<StatusBar branch="main" onSettings={() => {}} accounts={[GH, GL]} />)
    fireEvent.click(screen.getByTitle('@s.kim'))
    const card = container.querySelector('.pcard') as HTMLElement
    expect(card.className).toContain('gl')
    expect(within(card).getByText('이 프로젝트 · Maintainer')).toBeTruthy()
    expect(within(card).getByText('projects')).toBeTruthy()
    expect(within(card).getByText('GitLab에서 보기')).toBeTruthy()
  })

  it('한 번에 하나의 카드만 열린다(다른 칩 클릭 시 전환)', () => {
    const { container } = render(<StatusBar branch="main" onSettings={() => {}} accounts={[GH, GL]} />)
    fireEvent.click(screen.getByTitle('@seobisback'))
    expect(container.querySelectorAll('.pcard')).toHaveLength(1)
    expect(container.querySelector('.pcard')!.className).toContain('gh')
    fireEvent.click(screen.getByTitle('@s.kim'))
    const cards = container.querySelectorAll('.pcard')
    expect(cards).toHaveLength(1)
    expect(cards[0].className).toContain('gl')
  })

  it('“…에서 보기” 클릭 시 profileUrl로 openReleaseUrl 호출 + 카드 닫힘', () => {
    const { container } = render(<StatusBar branch="main" onSettings={() => {}} accounts={[GH]} />)
    fireEvent.click(screen.getByTitle('@seobisback'))
    fireEvent.click(screen.getByText('GitHub에서 보기'))
    expect(appAPI.openReleaseUrl).toHaveBeenCalledWith('https://github.com/seobisback')
    expect(container.querySelector('.pcard')).toBeNull()
  })

  it('역할·통계가 없으면 해당 영역을 렌더하지 않는다', () => {
    const minimal: AccountProfile = { provider: 'github', login: 'nobody', profileUrl: 'https://github.com/nobody', stats: [] }
    const { container } = render(<StatusBar branch="main" onSettings={() => {}} accounts={[minimal]} />)
    fireEvent.click(screen.getByTitle('@nobody'))
    const card = container.querySelector('.pcard') as HTMLElement
    expect(within(card).queryByText(/·/)).toBeNull()
    expect(card.querySelector('.pc-stats')).toBeNull()
  })
})
