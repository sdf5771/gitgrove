import { describe, it, expect, afterEach, beforeEach, vi, type Mock } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { AuthManagerModal } from './AuthManagerModal'
import { installGitApiMock } from '../../test/gitApiMock'

// 네트워크 클라이언트는 목(HTTPS 검증이 실제 fetch를 타지 않도록).
vi.mock('../../utils/githubClient', () => ({ getUser: vi.fn(async () => ({ data: { login: 'seobisback' } })) }))
vi.mock('../../utils/gitlabClient', () => ({ getCurrentUser: vi.fn(async () => ({ username: 's.kim' })) }))

const KEYS: SshKeyEntry[] = [
  { name: 'id_ed25519', pubPath: '/home/u/.ssh/id_ed25519.pub', privExists: true, type: 'ED25519', fingerprint: 'SHA256:Xr4pQ', comment: 'u@mac', publicKey: 'ssh-ed25519 AAAAC3xyz u@mac', hasPassphrase: false },
  { name: 'id_rsa_work', pubPath: '/home/u/.ssh/id_rsa_work.pub', privExists: true, type: 'RSA 4096', fingerprint: 'SHA256:9bK2m', comment: '', publicKey: 'ssh-rsa AAAAB3work', hasPassphrase: true },
]

function installClipboard() {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true })
  return writeText
}

function setup(opts: { keys?: SshKeyEntry[]; githubToken?: string | null; gitlabHosts?: string[] } = {}) {
  const { appAPI } = installGitApiMock()
  ;(appAPI.sshKeys as unknown as Mock<() => Promise<SshKeyEntry[]>>).mockResolvedValue(opts.keys ?? KEYS)
  ;(appAPI.githubGetToken as Mock).mockResolvedValue(opts.githubToken ?? null)
  ;(appAPI.gitlabListHosts as Mock).mockResolvedValue(opts.gitlabHosts ?? [])
  ;(appAPI.gitlabGetToken as Mock).mockResolvedValue('glpat-secret8x1z')
  const onClose = vi.fn()
  const utils = render(<AuthManagerModal onClose={onClose} />)
  return { appAPI, onClose, ...utils }
}

afterEach(cleanup)

describe('AuthManagerModal — SSH 탭', () => {
  let writeText: ReturnType<typeof installClipboard>
  beforeEach(() => { writeText = installClipboard() })

  it('~/.ssh 키를 이름·종류·지문과 함께 보여준다', async () => {
    setup()
    expect(await screen.findByText('id_ed25519')).toBeTruthy()
    expect(screen.getByText('id_rsa_work')).toBeTruthy()
    expect(screen.getByText('ED25519')).toBeTruthy()
    expect(screen.getByText('RSA 4096')).toBeTruthy()
    expect(screen.getByText(/SHA256:Xr4pQ/)).toBeTruthy()
    // 패스프레이즈 배지는 패스프레이즈 있는 키(id_rsa_work)에만
    const rsaCard = screen.getByText('id_rsa_work').closest('.am-card') as HTMLElement
    expect(within(rsaCard).getByText('패스프레이즈')).toBeTruthy()
    const edCard = screen.getByText('id_ed25519').closest('.am-card') as HTMLElement
    expect(within(edCard).queryByText('패스프레이즈')).toBeNull()
  })

  it('공개키 복사 → clipboard write(.pub 내용)', async () => {
    setup()
    await screen.findByText('id_ed25519')
    fireEvent.click(screen.getAllByTitle('공개키 복사')[0])
    expect(writeText).toHaveBeenCalledWith('ssh-ed25519 AAAAC3xyz u@mac')
  })

  it('연결 테스트 → sshTest 호출 + 성공 인라인 결과', async () => {
    const { appAPI } = setup()
    await screen.findByText('id_ed25519')
    fireEvent.click(screen.getAllByText('연결 테스트')[0])
    expect(appAPI.sshTest).toHaveBeenCalledWith('github.com')
    expect(await screen.findByText(/successfully authenticated/)).toBeTruthy()
  })

  it('삭제 → 인라인 확인 → sshDelete(name)', async () => {
    const { appAPI } = setup()
    await screen.findByText('id_ed25519')
    fireEvent.click(screen.getAllByTitle('삭제')[0])
    fireEvent.click(screen.getByText('삭제'))
    await waitFor(() => expect(appAPI.sshDelete).toHaveBeenCalledWith('id_ed25519'))
  })

  it('새 키 생성 → sshGenerate + 공개키 clipboard 복사', async () => {
    const { appAPI } = setup({ keys: [] })
    await screen.findByText('~/.ssh에 키가 없어요')
    fireEvent.change(screen.getByPlaceholderText('id_ed25519'), { target: { value: 'gitgrove_key' } })
    fireEvent.click(screen.getByText('새 키 생성'))
    await waitFor(() => expect(appAPI.sshGenerate).toHaveBeenCalledWith('gitgrove_key', undefined))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ssh-ed25519 AAAAC3Nz test@gitgrove'))
  })
})

describe('AuthManagerModal — HTTPS 탭', () => {
  beforeEach(() => { installClipboard() })

  it('저장된 GitHub·GitLab 자격증명을 마스킹된 토큰과 함께 보여준다', async () => {
    setup({ githubToken: 'ghp_secretABCD1234', gitlabHosts: ['https://gitlab.com'] })
    await screen.findByText('id_ed25519')
    fireEvent.click(screen.getByRole('button', { name: /HTTPS 자격증명/ }))
    expect(await screen.findByText('github.com')).toBeTruthy()
    expect(screen.getByText('https://gitlab.com')).toBeTruthy()
    expect(screen.getByText(/••••••••1234/)).toBeTruthy()
  })

  it('GitHub 자격증명 삭제 → githubSetToken(빈 문자열)', async () => {
    const { appAPI } = setup({ githubToken: 'ghp_secretABCD1234' })
    fireEvent.click(await screen.findByRole('button', { name: /HTTPS 자격증명/ }))
    await screen.findByText('github.com')
    fireEvent.click(screen.getByTitle('삭제'))
    await waitFor(() => expect(appAPI.githubSetToken).toHaveBeenCalledWith(''))
  })

  it('자격증명 추가: github.com이면 githubSetToken, 아니면 gitlabSetToken', async () => {
    const { appAPI } = setup()
    fireEvent.click(await screen.findByRole('button', { name: /HTTPS 자격증명/ }))
    fireEvent.change(screen.getByPlaceholderText(/github.com \/ gitlab.com/), { target: { value: 'github.com' } })
    fireEvent.change(screen.getByPlaceholderText('ghp_… / glpat-…'), { target: { value: 'ghp_new' } })
    fireEvent.click(screen.getByText('저장 · 검증'))
    await waitFor(() => expect(appAPI.githubSetToken).toHaveBeenCalledWith('ghp_new'))
  })
})
