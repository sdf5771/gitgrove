import { describe, it, expect, afterEach, vi, type Mock } from 'vitest'
import { render, screen, cleanup, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RemoteManagerModal } from './RemoteManagerModal'
import { installGitApiMock } from '../../test/gitApiMock'

// RemoteManagerModal: 2-pane(좌측 목록 · 우측 상세/추가) 원격 관리 모달.
// repoPath 가 주어지면 window.gitAPI.getRemotes 로 목록을 채우고 remoteAdd/Rename/SetUrl/Remove 를 호출한다.

const REPO = '/repo/a'

const REMOTES: GitRemoteInfo[] = [
  { name: 'origin', url: 'git@github.com:acme/app.git' },
  { name: 'upstream', url: 'https://github.com/acme-upstream/app.git' },
]

function setup(remotes: GitRemoteInfo[] = REMOTES, upstream?: string | null) {
  const { gitAPI } = installGitApiMock()
  ;(gitAPI.getRemotes as unknown as Mock<(p: string) => Promise<GitRemoteInfo[]>>)
    .mockResolvedValue(remotes)
  const onClose = vi.fn()
  const utils = render(<RemoteManagerModal onClose={onClose} repoPath={REPO} currentUpstreamRemote={upstream} />)
  return { gitAPI, onClose, ...utils }
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('RemoteManagerModal — 목록 렌더', () => {
  it('getRemotes 결과를 이름·URL 로 좌측 목록에 그린다 (개수 배지 포함)', async () => {
    setup()
    // URL 은 목록에서만 텍스트로 노출되어 고유 → 로드 완료 신호로 사용.
    await screen.findByText('git@github.com:acme/app.git')
    expect(screen.getByText('https://github.com/acme-upstream/app.git')).toBeTruthy()
    // 이름은 목록·상세에 중복 노출되므로 존재만 확인.
    expect(screen.getAllByText('origin').length).toBeGreaterThan(0)
    expect(screen.getAllByText('upstream').length).toBeGreaterThan(0)
    // 개수 배지.
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('repoPath 로드 시 getRemotes 를 해당 경로로 호출', async () => {
    const { gitAPI } = setup()
    await screen.findByText('git@github.com:acme/app.git')
    expect(gitAPI.getRemotes).toHaveBeenCalledWith(REPO)
  })
})

describe('RemoteManagerModal — 원격 추가(빈값 방지)', () => {
  it('이름이 비면 remoteAdd 를 호출하지 않고 안내 토스트', async () => {
    const user = userEvent.setup()
    const { gitAPI } = setup()
    await screen.findByText('git@github.com:acme/app.git')

    await user.click(screen.getByRole('button', { name: '＋ 원격 추가' }))
    await user.click(screen.getByRole('button', { name: '원격 추가' }))

    expect(await screen.findByText('원격 이름을 적어 주세요')).toBeTruthy()
    expect(gitAPI.remoteAdd).not.toHaveBeenCalled()
  })

  it('URL 이 비면 remoteAdd 를 호출하지 않고 안내 토스트', async () => {
    const user = userEvent.setup()
    const { gitAPI } = setup()
    await screen.findByText('git@github.com:acme/app.git')

    await user.click(screen.getByRole('button', { name: '＋ 원격 추가' }))
    await user.type(screen.getByPlaceholderText('origin'), 'fork')
    await user.click(screen.getByRole('button', { name: '원격 추가' }))

    expect(await screen.findByText('원격 URL을 적어 주세요')).toBeTruthy()
    expect(gitAPI.remoteAdd).not.toHaveBeenCalled()
  })

  it('이름·URL 을 채우면 remoteAdd(repoPath, name, url) 호출 후 목록 갱신', async () => {
    const user = userEvent.setup()
    const { gitAPI } = setup()
    await screen.findByText('git@github.com:acme/app.git')
    expect(gitAPI.getRemotes).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '＋ 원격 추가' }))
    await user.type(screen.getByPlaceholderText('origin'), 'fork')
    await user.type(screen.getByPlaceholderText('git@github.com:user/repo.git'), 'git@github.com:me/app.git')
    await user.click(screen.getByRole('button', { name: '원격 추가' }))

    await waitFor(() => expect(gitAPI.remoteAdd).toHaveBeenCalledWith(REPO, 'fork', 'git@github.com:me/app.git'))
    // 성공 후 reload → getRemotes 재호출.
    await waitFor(() => expect(gitAPI.getRemotes).toHaveBeenCalledTimes(2))
  })
})

describe('RemoteManagerModal — 이름/URL 변경', () => {
  it('이름 변경 시 remoteRename(repoPath, 이전이름, 새이름) 호출', async () => {
    const user = userEvent.setup()
    const { gitAPI } = setup()
    await screen.findByText('git@github.com:acme/app.git')

    // 기본 선택은 첫 원격(origin). 이름 입력에 origin 프리필(자동선택 effect가 한 틱 늦게
    // 상세 pane 입력을 채우므로 동기 getBy 대신 findBy로 프리필 완료를 기다린다 — CI 플레이크 방지).
    const nameInput = await screen.findByDisplayValue('origin')
    await user.clear(nameInput)
    await user.type(nameInput, 'downstream')
    await user.click(screen.getByRole('button', { name: '이름 변경' }))

    await waitFor(() => expect(gitAPI.remoteRename).toHaveBeenCalledWith(REPO, 'origin', 'downstream'))
  })

  it('URL 변경 시 remoteSetUrl(repoPath, 이름, 새URL) 호출', async () => {
    const user = userEvent.setup()
    const { gitAPI } = setup()
    await screen.findByText('git@github.com:acme/app.git')

    const urlInput = await screen.findByDisplayValue('git@github.com:acme/app.git')
    await user.clear(urlInput)
    await user.type(urlInput, 'git@github.com:acme/renamed.git')
    await user.click(screen.getByRole('button', { name: 'URL 변경' }))

    await waitFor(() => expect(gitAPI.remoteSetUrl).toHaveBeenCalledWith(REPO, 'origin', 'git@github.com:acme/renamed.git'))
  })

  it('값이 그대로면(dirty 아님) 변경 버튼이 비활성이라 호출 안 함', async () => {
    setup()
    await screen.findByText('git@github.com:acme/app.git')
    // 상세 pane 프리필(origin) 완료를 기다린 뒤 dirty 판정(비활성)을 단언한다.
    // 프리필 전에는 입력이 비어 dirty 로 오판돼 버튼이 활성일 수 있어 CI에서 간헐 실패했음.
    await screen.findByDisplayValue('origin')
    expect(screen.getByRole('button', { name: '이름 변경' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'URL 변경' })).toBeDisabled()
  })
})

describe('RemoteManagerModal — 삭제(확인 모달)', () => {
  it('삭제 → ConfirmModal 확인 후 remoteRemove(repoPath, name) 호출', async () => {
    const user = userEvent.setup()
    const { gitAPI } = setup()
    await screen.findByText('git@github.com:acme/app.git')

    // 상세 pane 삭제 버튼 → 확인 모달.
    await user.click(screen.getByRole('button', { name: '삭제' }))
    const confirmBox = (await screen.findByText(/삭제할까요/)).closest('.modal-box') as HTMLElement
    expect(confirmBox).toBeTruthy()

    // 확인 모달 내부의 '삭제' 확정 버튼만 클릭.
    await user.click(within(confirmBox).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(gitAPI.remoteRemove).toHaveBeenCalledWith(REPO, 'origin'))
    // 성공 후 reload → getRemotes 재호출.
    await waitFor(() => expect(gitAPI.getRemotes).toHaveBeenCalledTimes(2))
  })

  it('확인 모달에서 취소하면 remoteRemove 를 호출하지 않는다', async () => {
    const user = userEvent.setup()
    const { gitAPI } = setup()
    await screen.findByText('git@github.com:acme/app.git')

    await user.click(screen.getByRole('button', { name: '삭제' }))
    const confirmBox = (await screen.findByText(/삭제할까요/)).closest('.modal-box') as HTMLElement
    await user.click(within(confirmBox).getByRole('button', { name: '취소' }))

    expect(gitAPI.remoteRemove).not.toHaveBeenCalled()
  })

  it('삭제 확인창에서 Escape는 확인창만 닫고 모달(onClose)은 유지한다', async () => {
    const user = userEvent.setup()
    const { onClose } = setup()
    await screen.findByText('git@github.com:acme/app.git')

    await user.click(screen.getByRole('button', { name: '삭제' }))
    expect(await screen.findByText(/삭제할까요/)).toBeTruthy()

    await user.keyboard('{Escape}')

    // 확인창만 사라지고, 상위 모달은 닫히지 않는다.
    await waitFor(() => expect(screen.queryByText(/삭제할까요/)).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('현재 브랜치가 추적 중인 원격 삭제 시 확인 문구에 Pull·Push 경고를 덧붙인다', async () => {
    const user = userEvent.setup()
    setup(REMOTES, 'origin')
    await screen.findByText('git@github.com:acme/app.git')

    // 기본 선택 = origin(추적 중) → 경고 노출.
    await user.click(screen.getByRole('button', { name: '삭제' }))
    expect(await screen.findByText(/Pull · Push 대상이 사라져요/)).toBeTruthy()
  })

  it('추적하지 않는 원격 삭제 시에는 Pull·Push 경고가 없다', async () => {
    const user = userEvent.setup()
    setup(REMOTES, 'origin')
    await screen.findByText('git@github.com:acme/app.git')

    // upstream 원격 선택(추적 대상 아님) → 경고 없음.
    await user.click(screen.getAllByText('upstream')[0])
    await user.click(screen.getByRole('button', { name: '삭제' }))
    const confirmBox = (await screen.findByText(/삭제할까요/)).closest('.modal-box') as HTMLElement
    expect(within(confirmBox).queryByText(/Pull · Push 대상이 사라져요/)).toBeNull()
  })
})
