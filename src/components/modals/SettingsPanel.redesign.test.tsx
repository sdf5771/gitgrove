import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel'
import { installGitApiMock } from '../../test/gitApiMock'

let appAPI: ReturnType<typeof installGitApiMock>['appAPI']

beforeEach(() => {
  localStorage.clear()
  appAPI = installGitApiMock().appAPI
})
afterEach(cleanup)

describe('SettingsPanel 재설계 — 외부 탭 → 내부 nav 매핑', () => {
  it("initialTab='github' → 서비스 연결 탭 + GitHub 연결 흐름 포커스", () => {
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="github" />)
    // 서비스 연결 헤더
    expect(screen.getByRole('heading', { name: '서비스 연결' })).toBeTruthy()
    // GitHub 연결 흐름이 열려 토큰 입력(ghp_)이 보인다.
    expect(screen.getByPlaceholderText(/ghp_/)).toBeTruthy()
  })

  it("initialTab='gitlab' → 서비스 연결 탭 + GitLab 연결 흐름 포커스", () => {
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="gitlab" />)
    expect(screen.getByRole('heading', { name: '서비스 연결' })).toBeTruthy()
    // GitLab 연결 흐름(glpat_) 노출 + com/self 선택 노출
    expect(screen.getByPlaceholderText(/glpat-/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /GitLab\.com/ })).toBeTruthy()
  })

  it("initialTab='appearance' → 모양, 'remotes' → 원격", () => {
    const { unmount } = render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="appearance" />)
    expect(screen.getByRole('heading', { name: '모양' })).toBeTruthy()
    unmount()
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="remotes" />)
    expect(screen.getByRole('heading', { name: '원격' })).toBeTruthy()
  })
})

describe('SettingsPanel 재설계 — About 탭 (IPC 소비)', () => {
  it('nav 헤더와 about-hero에 getVersion() 결과를 표시한다', async () => {
    appAPI.getVersion.mockResolvedValue('2.0.0')
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} />)
    // nav 헤더 버전
    await waitFor(() => expect(screen.getByText('v2.0.0')).toBeTruthy())
    // About 탭으로 이동 → hero 버전
    fireEvent.click(screen.getByRole('button', { name: /정보 · 업데이트/ }))
    await waitFor(() => expect(screen.getByText(/v2\.0\.0 · Apple Silicon/)).toBeTruthy())
  })

  it('checkUpdates: updateAvailable=true → "받기" 노출, 클릭 시 downloadUpdate 호출', async () => {
    appAPI.checkUpdates.mockResolvedValue({ updateAvailable: true, version: '2.1.0', dmgUrl: 'https://x/y.dmg', current: '1.19.9' })
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} />)
    fireEvent.click(screen.getByRole('button', { name: /정보 · 업데이트/ }))

    await waitFor(() => expect(screen.getByText(/새 버전이 있어요 · v2\.1\.0/)).toBeTruthy())
    const getBtn = screen.getByRole('button', { name: '받기' })
    fireEvent.click(getBtn)
    await waitFor(() => expect(appAPI.downloadUpdate).toHaveBeenCalledWith('https://x/y.dmg'))
  })

  it('checkUpdates: updateAvailable=false → "최신 상태" 표시', async () => {
    appAPI.checkUpdates.mockResolvedValue({ updateAvailable: false, current: '1.19.9' })
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} />)
    fireEvent.click(screen.getByRole('button', { name: /정보 · 업데이트/ }))
    await waitFor(() => expect(screen.getByText('최신 상태예요')).toBeTruthy())
    expect(screen.queryByRole('button', { name: '받기' })).toBeNull()
  })

  it('다운로드 진행률 이벤트를 반영한다', async () => {
    appAPI.checkUpdates.mockResolvedValue({ updateAvailable: true, version: '2.1.0', dmgUrl: 'https://x/y.dmg', current: '1.19.9' })
    // downloadUpdate가 끝나기 전 진행률을 받도록, 보류 Promise를 사용.
    let resolveDl: (v: { path: string }) => void = () => {}
    appAPI.downloadUpdate.mockImplementation(() => new Promise(r => { resolveDl = r }))
    let progressCb: ((p: { received: number; total?: number; pct?: number }) => void) | null = null
    appAPI.onUpdateDownloadProgress.mockImplementation(cb => { progressCb = cb; return () => {} })

    render(<SettingsPanel onClose={vi.fn()} repoPath={null} />)
    fireEvent.click(screen.getByRole('button', { name: /정보 · 업데이트/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: '받기' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '받기' }))

    await waitFor(() => expect(progressCb).not.toBeNull())
    progressCb!({ received: 40, total: 100, pct: 40 })
    await waitFor(() => expect(screen.getByText(/받는 중… 40%/)).toBeTruthy())

    resolveDl({ path: '/tmp/x.dmg' })
    await waitFor(() => expect(screen.getByText(/다운로드 완료/)).toBeTruthy())
  })

  it('링크 버튼은 저장소·이슈·릴리스 URL을 외부로 연다', async () => {
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} />)
    fireEvent.click(screen.getByRole('button', { name: /정보 · 업데이트/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /GitHub 저장소/ })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /GitHub 저장소/ }))
    expect(appAPI.openReleaseUrl).toHaveBeenCalledWith('https://github.com/sdf5771/gitgrove')
    fireEvent.click(screen.getByRole('button', { name: /이슈 · 제안/ }))
    expect(appAPI.openReleaseUrl).toHaveBeenCalledWith('https://github.com/sdf5771/gitgrove/issues')
    fireEvent.click(screen.getByRole('button', { name: /릴리스 노트/ }))
    expect(appAPI.openReleaseUrl).toHaveBeenCalledWith('https://github.com/sdf5771/gitgrove/releases')
  })
})

describe('SettingsPanel 재설계 — 빈 상태', () => {
  it('git 탭: 이름이 비면 sleepy 빈 상태를 보인다', async () => {
    // repoPath 없음 → getConfig 미호출, name 기본 빈 값.
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} />)
    // 기본 nav가 git
    expect(screen.getByText('아직 이름이 없어요')).toBeTruthy()
    // nav 'Git 정보'에 warn 배지
    const gitItem = screen.getByRole('button', { name: /Git 정보/ })
    expect(gitItem.querySelector('.set2-badge.warn')).not.toBeNull()
  })

  it('원격 탭: 원격이 없으면 sleepy 빈 상태를 보인다', () => {
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} />)
    fireEvent.click(screen.getByRole('button', { name: /^원격/ }))
    expect(screen.getByText('연결된 원격이 없어요')).toBeTruthy()
  })
})

describe('SettingsPanel 재설계 — 완료 버튼', () => {
  it('완료 클릭 시 저장 후 onClose 호출', async () => {
    const onClose = vi.fn()
    render(<SettingsPanel onClose={onClose} repoPath={null} />)
    fireEvent.click(screen.getByRole('button', { name: '완료' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
