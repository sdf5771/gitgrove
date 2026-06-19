import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel'
import { installGitApiMock } from '../../test/gitApiMock'

beforeEach(() => {
  localStorage.clear()
  installGitApiMock()
})
afterEach(cleanup)

function openAppearance() {
  render(<SettingsPanel onClose={vi.fn()} repoPath={null} />)
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
}

function readSettings() {
  return JSON.parse(localStorage.getItem('gitgrove:settings') ?? '{}') as Record<string, unknown>
}

describe('SettingsPanel — 알림 사운드 설정 (기능 B)', () => {
  it('기본값: 토글 on + 드롭다운 활성 + Glass 선택', () => {
    openAppearance()
    const sel = screen.getByLabelText('알림 사운드') as HTMLSelectElement
    expect(sel.disabled).toBe(false)
    expect(sel.value).toBe('Glass')
  })

  it('Save 시 gitgrove:settings에 영속화된다', async () => {
    openAppearance()
    fireEvent.change(screen.getByLabelText('알림 사운드'), { target: { value: 'Ping' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      const s = readSettings()
      expect(s.notificationSound).toBe('Ping')
      expect(s.notificationSoundEnabled).toBe(true)
    })
  })

  it('토글 off 시 드롭다운 disabled + 저장값 false', async () => {
    openAppearance()
    // '알림 소리' 토글 행 클릭.
    fireEvent.click(screen.getByText('알림 소리'))
    const sel = screen.getByLabelText('알림 사운드') as HTMLSelectElement
    expect(sel.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(readSettings().notificationSoundEnabled).toBe(false))
  })

  it('저장된 설정을 마운트 시 복원한다', () => {
    localStorage.setItem('gitgrove:settings', JSON.stringify({ notificationSoundEnabled: false, notificationSound: 'Hero' }))
    openAppearance()
    const sel = screen.getByLabelText('알림 사운드') as HTMLSelectElement
    expect(sel.value).toBe('Hero')
    expect(sel.disabled).toBe(true)
  })
})

describe('SettingsPanel — 사운드 들어보기 버튼', () => {
  function openAppearanceWithMock() {
    const mock = installGitApiMock()
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    return mock
  }

  it('토글 on + 들어보기 클릭 → 현재 선택된 사운드 이름으로 previewSound 호출', () => {
    const { appAPI } = openAppearanceWithMock()
    fireEvent.click(screen.getByRole('button', { name: '▶ 들어보기' }))
    expect(appAPI.previewSound).toHaveBeenCalledTimes(1)
    expect(appAPI.previewSound).toHaveBeenCalledWith('Glass')
  })

  it('드롭다운에서 다른 사운드 선택 후 클릭 → 바뀐 값으로 호출', () => {
    const { appAPI } = openAppearanceWithMock()
    fireEvent.change(screen.getByLabelText('알림 사운드'), { target: { value: 'Ping' } })
    fireEvent.click(screen.getByRole('button', { name: '▶ 들어보기' }))
    expect(appAPI.previewSound).toHaveBeenCalledTimes(1)
    expect(appAPI.previewSound).toHaveBeenCalledWith('Ping')
  })

  it('토글 off → 버튼 disabled · 클릭해도 호출되지 않음', () => {
    const { appAPI } = openAppearanceWithMock()
    fireEvent.click(screen.getByText('알림 소리'))
    const btn = screen.getByRole('button', { name: '▶ 들어보기' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(appAPI.previewSound).not.toHaveBeenCalled()
  })
})
