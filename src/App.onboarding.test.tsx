import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock } from './test/gitApiMock'

const SEEN_KEY = 'gitgrove:onboarding-seen'
const WELCOME = '안녕하세요, 그루예요'

// 환영 텍스트는 <span>으로 쪼개져 있어 분할 노드까지 매칭하는 헬퍼.
const shownWelcome = () =>
  screen.queryAllByText((_t, node) => node?.textContent === WELCOME).length > 0

describe('첫 실행 온보딩', () => {
  beforeEach(() => {
    localStorage.clear()
    installGitApiMock()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('키가 없으면 첫 실행 시 온보딩이 노출된다', async () => {
    render(<App />)
    await waitFor(() => expect(shownWelcome()).toBe(true))
  })

  it('onboarding-seen 키가 있으면 온보딩이 노출되지 않는다', async () => {
    localStorage.setItem(SEEN_KEY, '1')
    render(<App />)
    await waitFor(() => expect(screen.queryAllByText('내 그로브').length).toBeGreaterThan(0))
    expect(shownWelcome()).toBe(false)
  })

  it('건너뛰기 클릭 시 닫히고 키가 저장된다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(shownWelcome()).toBe(true))

    await user.click(screen.getByText('건너뛰기'))

    await waitFor(() => expect(shownWelcome()).toBe(false))
    expect(localStorage.getItem(SEEN_KEY)).toBe('1')
  })

  it('단계 진행으로 끝까지 가면 종료 + 키 저장', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(shownWelcome()).toBe(true))

    await user.click(screen.getByText('시작할게요 →'))
    await user.click(screen.getByText('다음 →'))
    await user.click(screen.getByText('알겠어요 →'))
    await user.click(screen.getByText('그로브 둘러보기 →'))

    await waitFor(() => expect(shownWelcome()).toBe(false))
    expect(localStorage.getItem(SEEN_KEY)).toBe('1')
  })

  it('GitHub "연결" 클릭 시 설정창(GitHub 탭)이 열린다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(shownWelcome()).toBe(true))

    // Step 1(서비스 연결)로 이동.
    await user.click(screen.getByText('시작할게요 →'))
    await waitFor(() => expect(screen.queryByText('서비스를 연결할까요?')).not.toBeNull())

    const connectBtns = screen.getAllByText('연결')
    await user.click(connectBtns[0])

    // 설정 패널이 열렸는지(Settings 헤더/탭) 확인.
    await waitFor(() => expect(screen.queryAllByText(/Settings|설정/i).length).toBeGreaterThan(0))
  })
})
