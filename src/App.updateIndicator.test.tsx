import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'
import type { UpdateAvailablePayload, UpdateDownloadProgress } from './utils/appUpdate'

// UP2 — 상시 업데이트 인디케이터 + 인앱 다운로드 진행 UI의 App 통합 회귀.
//
// 순수 상태 로직(utils/updateIndicator)·인디케이터 표현(UpdateIndicator)은 별도
// 단위테스트가 커버. 여기서는 onUpdateAvailable 수신→상시 인디케이터 노출, 클릭→
// downloadUpdate 호출, onUpdateDownloadProgress→진행률 UI 반영, 완료/실패 분기,
// dmgUrl 없을 때 브라우저 폴백, 구독 cleanup(누수)을 통합 검증한다.

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

const PAYLOAD: UpdateAvailablePayload = {
  version: '2.0.0',
  url: 'https://github.com/x/y/releases/tag/v2.0.0',
  dmgUrl: 'https://github.com/x/y/releases/download/v2.0.0/GitGrove.dmg',
}

function seedRepo() {
  localStorage.setItem('gitgrove:repos', JSON.stringify([
    { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
  ]))
  localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
}

// onUpdateAvailable / onUpdateDownloadProgress 콜백을 캡처할 수 있도록 mock 보강.
function installWithUpdateCapture() {
  const mock = installGitApiMock()
  let availCb: ((info: UpdateAvailablePayload) => void) | null = null
  let progressCb: ((p: UpdateDownloadProgress) => void) | null = null
  const unsub = vi.fn()
  mock.appAPI.onUpdateAvailable.mockImplementation((cb: (info: UpdateAvailablePayload) => void) => { availCb = cb })
  mock.appAPI.onUpdateDownloadProgress.mockImplementation((cb: (p: UpdateDownloadProgress) => void) => {
    progressCb = cb
    return () => { unsub() }
  })
  return {
    ...mock,
    unsub,
    emitAvailable: (info: UpdateAvailablePayload) => act(() => { availCb?.(info) }),
    emitProgress: (p: UpdateDownloadProgress) => act(() => { progressCb?.(p) }),
  }
}

describe('업데이트 인디케이터 — App 통합', () => {
  beforeEach(() => {
    localStorage.clear()
    seedRepo()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  async function renderLoaded(mock: ReturnType<typeof installWithUpdateCapture>) {
    render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))
    return mock
  }

  it('업데이트 수신 전엔 인디케이터 미표시, 수신 후 상시 노출', async () => {
    const mock = installWithUpdateCapture()
    await renderLoaded(mock)
    expect(screen.queryByText(/새 버전 v/)).toBeNull()

    mock.emitAvailable(PAYLOAD)
    await waitFor(() => expect(shown('새 버전 v2.0.0')).toBe(true))
    // 기존 시작 알림 토스트도 그대로(회귀 보존).
    expect(shown('GitGrove 2.0.0 출시')).toBe(true)
  })

  it('[.tb-right 회귀] 인디케이터는 우측 핀 영역(.tb-right) 안에 추가되고 브랜치 표시는 유지', async () => {
    const mock = installWithUpdateCapture()
    const { container } = render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))

    // 타이틀바 우측 영역과 브랜치 표시는 인디케이터 등장 전부터 존재.
    const tbRight = container.querySelector('.tb-right')
    expect(tbRight).not.toBeNull()
    // 인디케이터 미수신 상태에선 인디케이터가 우측 영역에 없음.
    expect(screen.queryByText(/새 버전 v/)).toBeNull()

    mock.emitAvailable(PAYLOAD)
    await waitFor(() => expect(shown('새 버전 v2.0.0')).toBe(true))

    // 인디케이터(.update-pill)가 .tb-right 내부에 추가됨(우측 핀 레이아웃 무파괴).
    const pill = screen.getByText('새 버전 v2.0.0').closest('button')
    expect(pill).not.toBeNull()
    expect(pill).toHaveClass('update-pill')
    expect(tbRight!.contains(pill)).toBe(true)
  })

  it('인디케이터 클릭 → downloadUpdate(dmgUrl) 호출 + 진행률 반영 + 완료', async () => {
    const mock = installWithUpdateCapture()
    let resolveDl: (v: { path: string }) => void = () => {}
    mock.appAPI.downloadUpdate.mockImplementation(() => new Promise(r => { resolveDl = r }))
    const user = userEvent.setup()
    await renderLoaded(mock)

    mock.emitAvailable(PAYLOAD)
    const pill = await screen.findByText('새 버전 v2.0.0')
    await user.click(pill)
    expect(mock.appAPI.downloadUpdate).toHaveBeenCalledWith(PAYLOAD.dmgUrl)

    // 진행률 수신 → % 라벨 반영.
    mock.emitProgress({ received: 50, total: 100, pct: 50 })
    await waitFor(() => expect(shown('내려받는 중 50%')).toBe(true))

    // 완료 → 설치 창 열림 라벨 + 성공 토스트.
    await act(async () => { resolveDl({ path: '/tmp/GitGrove.dmg' }) })
    await waitFor(() => expect(shown('설치 창 열림')).toBe(true))
    expect(shown('다운로드 완료')).toBe(true)
  })

  it('다운로드 실패 → 에러 토스트 + "다시 시도" 라벨(재시도 가능)', async () => {
    const mock = installWithUpdateCapture()
    mock.appAPI.downloadUpdate.mockRejectedValue(new Error('connection lost'))
    const user = userEvent.setup()
    await renderLoaded(mock)

    mock.emitAvailable(PAYLOAD)
    const pill = await screen.findByText('새 버전 v2.0.0')
    await user.click(pill)

    await waitFor(() => expect(shown('업데이트 다운로드 실패')).toBe(true))
    expect(shown('다시 시도')).toBe(true)
    // 재시도 클릭 가능.
    await user.click(screen.getByText('다시 시도'))
    expect(mock.appAPI.downloadUpdate).toHaveBeenCalledTimes(2)
  })

  it('dmgUrl 없으면 클릭 시 브라우저 폴백(openReleaseUrl), downloadUpdate 미호출', async () => {
    const mock = installWithUpdateCapture()
    const user = userEvent.setup()
    await renderLoaded(mock)

    mock.emitAvailable({ version: '2.0.0', url: PAYLOAD.url })
    const pill = await screen.findByText('새 버전 v2.0.0')
    await user.click(pill)

    expect(mock.appAPI.openReleaseUrl).toHaveBeenCalledWith(PAYLOAD.url)
    expect(mock.appAPI.downloadUpdate).not.toHaveBeenCalled()
  })

  it('언마운트 시 진행률 구독 해제(누수 방지)', async () => {
    const mock = installWithUpdateCapture()
    const { unmount } = render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))
    unmount()
    expect(mock.unsub).toHaveBeenCalled()
  })

  // ⚠️ 알려진 버그(QA, Medium): onUpdateAvailable 구독은 cleanup으로 해제되지 않는다.
  //   - preload.ts onUpdateAvailable 는 unsub 함수를 반환하지 않음(onUpdateDownloadProgress 와 비대칭).
  //   - App.tsx 의 onUpdateAvailable effect 도 cleanup return 이 없음.
  //   StrictMode(dev) 이중 마운트/향후 remount 시 'app:update-available' 리스너가
  //   누적되어 시작 알림 토스트가 중복 발생할 수 있다.
  //   it.fails: 현재 코드에선 '해제 안 됨'이 기대 → 통과. 프론트가 cleanup을 붙이면
  //   이 테스트가 red 로 뒤집혀 가드가 작동한다(그 시점에 .fails 제거 + 양성 단언으로 교체).
  it.fails('[알려진 누수] 언마운트 시 onUpdateAvailable 구독은 (현재) 해제되지 않는다', async () => {
    const mock = installGitApiMock()
    const availUnsub = vi.fn()
    // 픽스가 적용된 preload 라면 unsub 함수를 반환할 것이라고 가정한 mock.
    mock.appAPI.onUpdateAvailable.mockImplementation(() => () => { availUnsub() })
    const { unmount } = render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))
    unmount()
    // 픽스 전: App이 반환 unsub을 호출하지 않으므로 이 단언은 실패 → it.fails 로 통과.
    expect(availUnsub).toHaveBeenCalled()
  })
})
