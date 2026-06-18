import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { installGitApiMock, FIXTURES } from './test/gitApiMock'
import type { RemoteProgress } from './utils/syncResult'

// CL2 — 클론 인터랙션 App 레벨 통합 회귀.
//
// 순수 함수(cloneLogic/syncProgress)와 모달 단독(CloneModal.test.tsx)은 별도 테스트가
// 커버한다. 여기서는 "진입점 → App.handleClone → CloneModal → 결과가 호출부 Promise<boolean>
// 와 loadRepo 동선으로 흐르는지"를 검증한다(에이전트 간 계약: 모달 ↔ App resolver).
//   - 진입점: AddRepoModal "원격 저장소 클론 →" (handleClone('') 진입).
//   - 성공: "그로브로 →" → handleClonePlanted → loadRepo(activate) → 새 레포 탭 활성.
//   - 취소/닫기: handleCloneModalClose → resolver false (호출부 스피너 해제 계약).
//   - 진행: emitRemoteProgress(op:'clone') → checkout "파일 펼치는 중" 단계 전이.
// 진행 이벤트는 mock의 emitRemoteProgress로 수동 발사한다.

const shown = (msg: string) => screen.queryAllByText(msg).length > 0

function seedRepo() {
  localStorage.setItem('gitgrove:repos', JSON.stringify([
    { id: 'repo-a-id', name: 'a', path: '/repo/a', branch: 'main', dirty: false, ahead: 0, behind: 0 },
  ]))
  localStorage.setItem('gitgrove:lastRepoPath', '/repo/a')
}

const prog = (stage: string, progress: number, processed?: number, total?: number): RemoteProgress =>
  ({ op: 'clone', stage, progress, processed, total })

// AddRepoModal 진입점을 통해 CloneModal을 연다(저장소 추가 → Clone Remote 탭 → 클론 진입).
async function openCloneViaAddRepo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '저장소 추가' }))
  await user.click(await screen.findByRole('button', { name: /Clone Remote/ }))
  await user.click(await screen.findByRole('button', { name: /원격 저장소 클론/ }))
  // CloneModal(폼) 노출 확인.
  await waitFor(() => expect(screen.getByPlaceholderText(/github.com\/owner\/repo/)).toBeTruthy())
}

describe('클론 인터랙션 — App 통합(진입점 → resolver → loadRepo)', () => {
  beforeEach(() => {
    localStorage.clear()
    seedRepo()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  async function renderLoaded(mock: ReturnType<typeof installGitApiMock>) {
    render(<App />)
    await waitFor(() => expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true))
    return mock
  }

  it('AddRepoModal "원격 저장소 클론 →" 진입점이 CloneModal(폼)을 연다', async () => {
    const mock = installGitApiMock()
    const user = userEvent.setup()
    await renderLoaded(mock)

    await openCloneViaAddRepo(user)
    // 전용 3상태 모달의 폼이 떠야 한다(레거시 인-모달 클론 폼이 아니라).
    expect(screen.getByRole('button', { name: 'Clone' })).toBeTruthy()
    expect(screen.getByText(/받을 위치/)).toBeTruthy()
  })

  it('성공: "그로브로 →" → loadRepo(activate) 로 클론된 레포가 활성 탭이 된다', async () => {
    const mock = installGitApiMock()
    // 부모 폴더 선택 다이얼로그가 경로를 돌려주도록(폼 dest 비어있을 때 runClone이 물어봄).
    mock.gitAPI.pickDirectory.mockResolvedValue('/dev')
    // 클론 성공 결과 + 클론된 경로의 로그를 /repo/b 픽스처로 매핑(활성화 검증용).
    mock.gitAPI.clone.mockResolvedValue({ success: true, path: '/repo/b', name: 'b' })
    const user = userEvent.setup()
    await renderLoaded(mock)

    await openCloneViaAddRepo(user)
    await user.type(screen.getByPlaceholderText(/github.com\/owner\/repo/), 'https://github.com/acme/b.git')
    await user.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => expect(shown('그로브에 심었어요')).toBe(true))
    await user.click(screen.getByRole('button', { name: /그로브로/ }))

    // handleClonePlanted → loadRepo('/repo/b', activate) → repoB 커밋이 화면에.
    await waitFor(() => expect(shown(FIXTURES['/repo/b'].commitMsg)).toBe(true))
    expect(mock.gitAPI.clone).toHaveBeenCalledWith('https://github.com/acme/b.git', expect.any(String), expect.any(Object))
  })

  it('진행: emitRemoteProgress(op:clone)로 checkout "파일 펼치는 중"까지 단계 전이', async () => {
    const mock = installGitApiMock()
    mock.gitAPI.pickDirectory.mockResolvedValue('/dev')
    let resolveClone: (v: GitCloneResult) => void = () => {}
    mock.gitAPI.clone.mockImplementation(() => new Promise(r => { resolveClone = r }))
    const user = userEvent.setup()
    await renderLoaded(mock)

    await openCloneViaAddRepo(user)
    await user.type(screen.getByPlaceholderText(/github.com\/owner\/repo/), 'https://github.com/acme/b.git')
    await user.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => expect(screen.getByRole('dialog', { name: /Clone 진행 상황/ })).toBeTruthy())

    // 클론이 아직 진행 전(phase 0)인 시점에 다른 op(pull) 이벤트가 먼저 도착해도
    // op 필터로 무시되어 clone 모델이 앞으로 끌려가지 않아야 한다(누수/오염 방지).
    // op 필터가 없으면 pull의 'receiving'(=clone phase 3)으로 maxPhase가 점프해
    // 아직 오지 않은 "객체 받는 중"이 표시되며 이 단언이 깨진다.
    // phase 라벨들은 항상 행으로 렌더되므로, "활성 단계"는 그 행의 카운트 메타(pmeta)로 판별한다.
    // op 필터가 없으면 pull의 'receiving'(=clone phase 3, determinate)으로 점프해 "90/100"이 새어 표시된다.
    act(() => { mock.emitRemoteProgress({ op: 'pull', stage: 'receiving', progress: 90, processed: 90, total: 100 }) })
    expect(shown('90/100')).toBe(false)
    // rate 줄(좌측 "…중" 문구)도 clone phase 0(원격 연결)에 머문다.
    expect(shown('객체 받는 중…')).toBe(false)

    act(() => {
      mock.emitRemoteProgress(prog('remote', 0))
      mock.emitRemoteProgress(prog('receiving', 50, 64, 128))
    })
    // 이제 clone 자신의 receiving → 활성 단계 카운트(64/128)가 표시된다.
    expect(shown('64/128')).toBe(true)
    act(() => { mock.emitRemoteProgress(prog('checkout', 80, 8, 10)) })
    expect(shown('파일 펼치는 중…')).toBe(true)

    await act(async () => { resolveClone({ success: true, path: '/repo/b', name: 'b' }) })
    await waitFor(() => expect(shown('그로브에 심었어요')).toBe(true))
  })

  it('닫기(취소): CloneModal을 닫으면 모달이 사라지고 기존 화면이 유지된다(resolver false 계약)', async () => {
    const mock = installGitApiMock()
    const user = userEvent.setup()
    await renderLoaded(mock)

    await openCloneViaAddRepo(user)
    // 폼의 "취소"로 닫는다 → handleCloneModalClose(resolver false).
    await user.click(screen.getByRole('button', { name: '취소' }))

    await waitFor(() => expect(screen.queryByPlaceholderText(/github.com\/owner\/repo/)).toBeNull())
    // 기존 레포 화면은 그대로(클론 실패해도 동선 깨지지 않음).
    expect(shown(FIXTURES['/repo/a'].commitMsg)).toBe(true)
  })

  it('auth 실패: 인라인 토큰칸 노출 + 토큰 입력 전 재시도 비활성(App 통합 경로)', async () => {
    const mock = installGitApiMock()
    mock.gitAPI.pickDirectory.mockResolvedValue('/dev')
    mock.gitAPI.clone.mockResolvedValue({ success: false, errorKind: 'auth', message: 'fatal: Authentication failed' })
    const user = userEvent.setup()
    await renderLoaded(mock)

    await openCloneViaAddRepo(user)
    await user.type(screen.getByPlaceholderText(/github.com\/owner\/repo/), 'https://github.com/acme/private.git')
    await user.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => expect(shown('인증이 필요해요')).toBe(true))
    expect(screen.getByPlaceholderText(/ghp_/)).toBeTruthy()
    const retry = screen.getByRole('button', { name: /토큰으로 다시 시도/ })
    expect(retry).toBeDisabled()
    // 토큰 입력 → 재시도 활성. 기존 레포 화면은 백그라운드에 유지.
    await user.type(screen.getByPlaceholderText(/ghp_/), 'ghp_secret')
    expect(retry).not.toBeDisabled()
  })

  it('재진입(중복 클론 진입): 이전 미해결 흐름을 정리하고 새 모달을 연다(resolver 누수 방지)', async () => {
    const mock = installGitApiMock()
    const user = userEvent.setup()
    await renderLoaded(mock)

    // 1차 진입(폼 노출) 후 닫지 않고 다시 진입점으로 재진입.
    await openCloneViaAddRepo(user)
    expect(screen.getAllByRole('button', { name: 'Clone' }).length).toBe(1)
    await openCloneViaAddRepo(user)
    // 모달이 중복 스택되지 않고 한 개만 유지된다.
    expect(screen.getAllByRole('button', { name: 'Clone' }).length).toBe(1)
  })

  it('구독 누수 방지: 진행 중 모달을 닫아도 onRemoteProgress 구독이 정확히 해제된다', async () => {
    const mock = installGitApiMock()
    mock.gitAPI.pickDirectory.mockResolvedValue('/dev')
    let resolveClone: (v: GitCloneResult) => void = () => {}
    mock.gitAPI.clone.mockImplementation(() => new Promise(r => { resolveClone = r }))
    const user = userEvent.setup()
    await renderLoaded(mock)

    // App 자신의 onRemoteProgress(SyncHud용) 구독 1개가 기준선.
    const baseActive = mock.remoteProgressStats().active

    await openCloneViaAddRepo(user)
    await user.type(screen.getByPlaceholderText(/github.com\/owner\/repo/), 'https://github.com/acme/b.git')
    await user.click(screen.getByRole('button', { name: 'Clone' }))

    // 진행 진입 시 CloneModal이 추가 구독(누적 > 기준선).
    await waitFor(() => expect(mock.remoteProgressStats().active).toBeGreaterThan(baseActive))

    // 결과로 전이(progress 구독 해제) → 닫기.
    await act(async () => { resolveClone({ success: true, path: '/repo/b', name: 'b' }) })
    await waitFor(() => expect(shown('그로브에 심었어요')).toBe(true))
    const dialog = screen.getByText('그로브에 심었어요').closest('.clone-result') as HTMLElement
    await user.click(within(dialog.parentElement as HTMLElement).getByRole('button', { name: '닫기' }))

    // CloneModal 구독은 해제되어 기준선으로 복귀(App 자신의 구독만 남음).
    await waitFor(() => expect(mock.remoteProgressStats().active).toBe(baseActive))
  })
})
