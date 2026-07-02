import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel'
import { installGitApiMock } from '../../test/gitApiMock'

beforeEach(() => { localStorage.clear(); installGitApiMock() })
afterEach(cleanup)

describe('SettingsPanel — 인증 관리 진입점(서비스 연결 탭)', () => {
  it('onOpenAuth 있으면 "인증 관리" 열기 버튼 노출 + 클릭 시 콜백', () => {
    const onOpenAuth = vi.fn()
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="github" onOpenAuth={onOpenAuth} />)
    expect(screen.getByText('인증 관리')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '열기' }))
    expect(onOpenAuth).toHaveBeenCalledTimes(1)
  })

  it('onOpenAuth 없으면 "인증 관리" 항목을 렌더하지 않는다', () => {
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="github" />)
    expect(screen.queryByText('인증 관리')).toBeNull()
  })
})
