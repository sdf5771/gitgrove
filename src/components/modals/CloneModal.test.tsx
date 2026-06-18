// CL2 — 클론 모달 3상태 RTL 통합테스트.
//   폼(프로바이더 인식·옵션→clone 인자) → 진행(emitRemoteProgress로 단계 전이)
//   → 결과 분기(success 나무 / auth 토큰칸 / notfound / error).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CloneModal } from './CloneModal'
import { installGitApiMock } from '../../test/gitApiMock'
import type { RemoteProgress } from '../../utils/syncResult'

const prog = (stage: string, progress: number, processed?: number, total?: number): RemoteProgress =>
  ({ op: 'clone', stage, progress, processed, total })

// pickDirectory를 즉시 결정해주는 헬퍼(폴더 선택 다이얼로그 대체).
const pickOk = (p = '/dev') => vi.fn(async () => p)

describe('CloneModal — 3상태', () => {
  let mock: ReturnType<typeof installGitApiMock>

  beforeEach(() => { mock = installGitApiMock() })
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('폼: GitHub URL 입력 시 owner/repo 인식 표시', async () => {
    const user = userEvent.setup()
    render(<CloneModal onClose={vi.fn()} onCloned={vi.fn()} pickDirectory={pickOk()} />)
    await user.type(screen.getByPlaceholderText(/github.com\/owner\/repo/), 'https://github.com/acme/widget.git')
    expect(screen.getByText('acme/widget')).toBeTruthy()
  })

  it('Clone 버튼은 유효 URL이어야 활성', async () => {
    const user = userEvent.setup()
    render(<CloneModal onClose={vi.fn()} onCloned={vi.fn()} pickDirectory={pickOk()} />)
    const btn = screen.getByRole('button', { name: 'Clone' })
    expect(btn).toBeDisabled()
    await user.type(screen.getByPlaceholderText(/github.com\/owner\/repo/), 'https://github.com/acme/widget.git')
    expect(btn).not.toBeDisabled()
  })

  it('옵션(서브모듈/얕은복제) 체크 → clone 인자로 전달', async () => {
    const user = userEvent.setup()
    render(<CloneModal onClose={vi.fn()} onCloned={vi.fn()} pickDirectory={pickOk('/dev')} initialUrl="https://github.com/acme/widget.git" />)
    // 옵션 체크
    await user.click(screen.getByText(/서브모듈 포함/))
    await user.click(screen.getByText(/얕은 복제/))
    // dest 프리필을 위해 Browse 후 Clone
    await user.click(screen.getByRole('button', { name: /Browse/ }))
    await user.click(screen.getByRole('button', { name: 'Clone' }))
    await waitFor(() => {
      expect(mock.gitAPI.clone).toHaveBeenCalledWith(
        'https://github.com/acme/widget.git', '/dev',
        { shallow: true, recurseSubmodules: true },
      )
    })
  })

  it('진행: emitRemoteProgress(op:clone)로 단계 전이 표시', async () => {
    const user = userEvent.setup()
    // clone을 보류시켜 진행 상태를 잡는다.
    let resolveClone: (v: GitCloneResult) => void = () => {}
    mock.gitAPI.clone.mockImplementation(() => new Promise(r => { resolveClone = r }))
    render(<CloneModal onClose={vi.fn()} onCloned={vi.fn()} pickDirectory={pickOk('/dev')} initialUrl="https://github.com/acme/widget.git" />)
    await user.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => expect(screen.getByRole('dialog', { name: /Clone 진행 상황/ })).toBeTruthy())
    act(() => {
      mock.emitRemoteProgress(prog('remote', 0))
      mock.emitRemoteProgress(prog('receiving', 50, 64, 128))
    })
    expect(screen.getByText('객체 받는 중')).toBeTruthy()
    act(() => { mock.emitRemoteProgress(prog('checkout', 80, 8, 10)) })
    expect(screen.getByText('파일 펼치는 중')).toBeTruthy()

    // 마무리(누수 방지 확인용 — 구독 해제는 다음 테스트에서)
    act(() => resolveClone({ success: true, path: '/dev/widget', name: 'widget' }))
    await waitFor(() => expect(screen.getByText('그로브에 심었어요')).toBeTruthy())
  })

  it('성공: 나무 + "그로브에 심었어요" + 저장소 열기 → onCloned(path)', async () => {
    const onCloned = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    mock.gitAPI.clone.mockResolvedValue({ success: true, path: '/dev/widget', name: 'widget' })
    render(<CloneModal onClose={onClose} onCloned={onCloned} pickDirectory={pickOk('/dev')} initialUrl="https://github.com/acme/widget.git" />)
    await user.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => expect(screen.getByText('그로브에 심었어요')).toBeTruthy())
    expect(screen.getByLabelText('새로 심은 나무')).toBeTruthy()
    // "저장소 열기"(골드 CTA) → 클론 repo 활성화(onCloned) 동선
    await user.click(screen.getByRole('button', { name: '저장소 열기' }))
    expect(onCloned).toHaveBeenCalledWith('/dev/widget')
  })

  it('성공: "그로브로"는 onCloned 없이 모달만 닫음(그로브 유지)', async () => {
    const onCloned = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    mock.gitAPI.clone.mockResolvedValue({ success: true, path: '/dev/widget', name: 'widget' })
    render(<CloneModal onClose={onClose} onCloned={onCloned} pickDirectory={pickOk('/dev')} initialUrl="https://github.com/acme/widget.git" />)
    await user.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => expect(screen.getByText('그로브에 심었어요')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: '그로브로' }))
    expect(onClose).toHaveBeenCalled()
    expect(onCloned).not.toHaveBeenCalled()
  })

  it('auth 실패: 인라인 PAT 토큰칸 노출', async () => {
    const user = userEvent.setup()
    mock.gitAPI.clone.mockResolvedValue({ success: false, errorKind: 'auth', message: '401' })
    render(<CloneModal onClose={vi.fn()} onCloned={vi.fn()} pickDirectory={pickOk('/dev')} initialUrl="https://github.com/acme/private.git" />)
    await user.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => expect(screen.getByText('인증이 필요해요')).toBeTruthy())
    expect(screen.getByPlaceholderText(/ghp_/)).toBeTruthy()
    // 토큰 입력 전엔 재시도 비활성
    const retry = screen.getByRole('button', { name: /토큰으로 다시 시도/ })
    expect(retry).toBeDisabled()
    await user.type(screen.getByPlaceholderText(/ghp_/), 'ghp_xxx')
    expect(retry).not.toBeDisabled()
  })

  it('notfound 실패: 비공개 안내 + 인라인 토큰칸 + 토큰 재시도(입력 전 비활성)', async () => {
    const user = userEvent.setup()
    mock.gitAPI.clone.mockResolvedValue({ success: false, errorKind: 'notfound', message: '404' })
    render(<CloneModal onClose={vi.fn()} onCloned={vi.fn()} pickDirectory={pickOk('/dev')} initialUrl="https://github.com/acme/ghost.git" />)
    await user.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => expect(screen.getByText('저장소를 찾을 수 없어요')).toBeTruthy())
    // "비공개일 수 있어요" 안내 + 토큰칸 노출
    expect(screen.getByText(/비공개 저장소일 수 있어요/)).toBeTruthy()
    expect(screen.getByPlaceholderText(/ghp_/)).toBeTruthy()
    // 재시도 경로: URL 수정 + 토큰으로 다시 시도(토큰 입력 전 비활성)
    expect(screen.getByRole('button', { name: 'URL 수정' })).toBeTruthy()
    const retry = screen.getByRole('button', { name: /토큰으로 다시 시도/ })
    expect(retry).toBeDisabled()
    await user.type(screen.getByPlaceholderText(/ghp_/), 'ghp_xxx')
    expect(retry).not.toBeDisabled()
  })

  it('notfound: 토큰 입력 후 재시도 → URL에 토큰 끼워 폼 복귀', async () => {
    const user = userEvent.setup()
    mock.gitAPI.clone.mockResolvedValue({ success: false, errorKind: 'notfound', message: '404' })
    render(<CloneModal onClose={vi.fn()} onCloned={vi.fn()} pickDirectory={pickOk('/dev')} initialUrl="https://github.com/acme/ghost.git" />)
    await user.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => expect(screen.getByText('저장소를 찾을 수 없어요')).toBeTruthy())
    await user.type(screen.getByPlaceholderText(/ghp_/), 'ghp_secret')
    await user.click(screen.getByRole('button', { name: /토큰으로 다시 시도/ }))
    // 폼 복귀 + URL에 토큰 주입(https://<token>@host/...)
    const urlInput = screen.getByPlaceholderText(/github.com\/owner\/repo/) as HTMLInputElement
    expect(urlInput.value).toContain('ghp_secret@github.com')
  })

  it('입력검증 throw(폴더 존재 등) → error 뷰', async () => {
    const user = userEvent.setup()
    mock.gitAPI.clone.mockRejectedValue(new Error("이미 'widget' 폴더가 존재합니다."))
    render(<CloneModal onClose={vi.fn()} onCloned={vi.fn()} pickDirectory={pickOk('/dev')} initialUrl="https://github.com/acme/widget.git" />)
    await user.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => expect(screen.getByText('클론하지 못했어요')).toBeTruthy())
    expect(screen.getByText(/이미 'widget' 폴더가 존재합니다/)).toBeTruthy()
  })

  it('구독 레이스: clone 호출 중 즉시 emit된 첫 진행 이벤트도 유실 없이 반영', async () => {
    const user = userEvent.setup()
    let resolveClone: (v: GitCloneResult) => void = () => {}
    // clone IPC 호출 "도중"(progress 렌더 완료 전)에 첫 이벤트들을 흘려보낸다.
    // 구독이 마운트 1회 등록 + phase guard가 호출 전에 켜져야만 이 이벤트가 모델에 반영된다.
    // (구독이 'progress' 렌더 후 등록되던 과거 구현이면 이 receiving 이벤트는 유실되어 64/128이 안 보임.)
    mock.gitAPI.clone.mockImplementation(() => {
      mock.emitRemoteProgress(prog('remote', 0))
      mock.emitRemoteProgress(prog('receiving', 50, 64, 128))
      return new Promise<GitCloneResult>(r => { resolveClone = r })
    })
    render(<CloneModal onClose={vi.fn()} onCloned={vi.fn()} pickDirectory={pickOk('/dev')} initialUrl="https://github.com/acme/widget.git" />)
    await user.click(screen.getByRole('button', { name: 'Clone' }))

    // 호출 중 emit된 receiving 이벤트가 반영되어 활성 단계 카운트(64/128)가 표시된다.
    await waitFor(() => expect(screen.getByText('64/128')).toBeTruthy())
    act(() => resolveClone({ success: true, path: '/dev/widget', name: 'widget' }))
    await waitFor(() => expect(screen.getByText('그로브에 심었어요')).toBeTruthy())
  })

  it('진행 구독 누수 방지: 모달 언마운트 시 onRemoteProgress 해제', async () => {
    const user = userEvent.setup()
    let resolveClone: (v: GitCloneResult) => void = () => {}
    mock.gitAPI.clone.mockImplementation(() => new Promise(r => { resolveClone = r }))
    const { unmount } = render(<CloneModal onClose={vi.fn()} onCloned={vi.fn()} pickDirectory={pickOk('/dev')} initialUrl="https://github.com/acme/widget.git" />)
    await user.click(screen.getByRole('button', { name: 'Clone' }))
    await waitFor(() => expect(mock.remoteProgressStats().active).toBeGreaterThan(0))
    act(() => resolveClone({ success: true, path: '/dev/widget', name: 'widget' }))
    unmount()
    expect(mock.remoteProgressStats().active).toBe(0)
  })
})
