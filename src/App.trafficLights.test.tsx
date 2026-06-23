import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'

// ──────────────────────────────────────────────────────────────
// 신호등(traffic lights) 조건부 렌더 (feat/native-traffic-lights-ui)
//
// macOS: titleBarStyle:'hiddenInset' + 네이티브 신호등을 OS가 그린다. 렌더러는
//   커스텀 신호등(.tl/.td)을 렌더하지 않고, .title-bar에 mac 클래스를 부여해
//   좌측에 네이티브 신호등 공간(패딩)을 확보한다.
// 비-mac(Windows/Linux): 네이티브 오버레이가 없으므로 기존 커스텀 신호등 +
//   win-* IPC(win-close/minimize/maximize)를 그대로 유지한다.
//
// platform은 window.appAPI.platform(동기 노출)로 첫 렌더부터 분기한다.
// mock 기본값은 'darwin'이며, 비-mac 케이스는 테스트에서 오버라이드한다.
// ──────────────────────────────────────────────────────────────

function seedRepo() {
  localStorage.setItem(
    'gitgrove:repos',
    JSON.stringify([{ id: 'r0', name: 'repo-0', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 }]),
  )
  localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
}

describe('신호등 조건부 렌더 (플랫폼 분기)', () => {
  beforeEach(() => {
    localStorage.clear()
    installGitApiMock()
    seedRepo()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('macOS: 커스텀 신호등(.tl/.td)을 렌더하지 않고 .title-bar에 mac 패딩 클래스가 있다', async () => {
    window.appAPI.platform = 'darwin'
    const { container } = render(<App />)

    await waitFor(() => {
      expect(screen.getAllByText(FIXTURES['/repo/a'].commitMsg).length).toBeGreaterThan(0)
    })

    // 커스텀 신호등 DOM 부재
    expect(container.querySelector('.tl')).toBeNull()
    expect(container.querySelector('.td')).toBeNull()

    // 타이틀바에 네이티브 신호등 공간 확보용 mac 클래스
    const titleBar = container.querySelector('.title-bar')
    expect(titleBar).not.toBeNull()
    expect(titleBar?.classList.contains('mac')).toBe(true)
  })

  it('비-mac(win32): 커스텀 신호등을 렌더하고 클릭 시 win-* IPC를 보낸다', async () => {
    window.appAPI.platform = 'win32'
    const sendMock = window.ipcRenderer.send as ReturnType<typeof vi.fn>
    const { container } = render(<App />)

    await waitFor(() => {
      expect(screen.getAllByText(FIXTURES['/repo/a'].commitMsg).length).toBeGreaterThan(0)
    })

    // 커스텀 신호등 3개 렌더, mac 패딩 클래스는 없음
    expect(container.querySelector('.tl')).not.toBeNull()
    expect(container.querySelectorAll('.td').length).toBe(3)
    expect(container.querySelector('.title-bar')?.classList.contains('mac')).toBe(false)

    const user = userEvent.setup()
    await user.click(container.querySelector('.td-r')!)
    await user.click(container.querySelector('.td-y')!)
    await user.click(container.querySelector('.td-g')!)

    expect(sendMock).toHaveBeenCalledWith('win-close')
    expect(sendMock).toHaveBeenCalledWith('win-minimize')
    expect(sendMock).toHaveBeenCalledWith('win-maximize')
  })
})
