import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel'
import { installGitApiMock } from '../../test/gitApiMock'

beforeEach(() => {
  localStorage.clear()
  installGitApiMock()
})
afterEach(cleanup)

// 재설계 후: 가로 탭 → 좌측 nav. '모양' 항목이 알림 사운드 설정을 담는다.
function openLook() {
  render(<SettingsPanel onClose={vi.fn()} repoPath={null} />)
  fireEvent.click(screen.getByRole('button', { name: /모양/ }))
}

function readSettings() {
  return JSON.parse(localStorage.getItem('gitgrove:settings') ?? '{}') as Record<string, unknown>
}

describe('SettingsPanel — 알림 사운드 설정 (기능 B)', () => {
  it('기본값: 토글 on + 드롭다운 활성 + Glass 선택', () => {
    openLook()
    const sel = screen.getByLabelText('알림 사운드') as HTMLSelectElement
    expect(sel.disabled).toBe(false)
    expect(sel.value).toBe('Glass')
  })

  it('완료 시 gitgrove:settings에 영속화된다', async () => {
    openLook()
    fireEvent.change(screen.getByLabelText('알림 사운드'), { target: { value: 'Ping' } })
    fireEvent.click(screen.getByRole('button', { name: '완료' }))
    await waitFor(() => {
      const s = readSettings()
      expect(s.notificationSound).toBe('Ping')
      expect(s.notificationSoundEnabled).toBe(true)
    })
  })

  it('토글 off 시 드롭다운 disabled + 저장값 false', async () => {
    openLook()
    // '알림 소리' 토글 행 클릭.
    fireEvent.click(screen.getByText('소리 켜기'))
    const sel = screen.getByLabelText('알림 사운드') as HTMLSelectElement
    expect(sel.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '완료' }))
    await waitFor(() => expect(readSettings().notificationSoundEnabled).toBe(false))
  })

  it('density·showDiffStats 값을 UI 없이도 보존해 저장한다(회귀 방지)', async () => {
    localStorage.setItem('gitgrove:settings', JSON.stringify({ density: 'compact', showDiffStats: false, fontSize: '14' }))
    openLook()
    fireEvent.click(screen.getByRole('button', { name: '완료' }))
    await waitFor(() => {
      const s = readSettings()
      expect(s.density).toBe('compact')
      expect(s.showDiffStats).toBe(false)
      expect(s.fontSize).toBe('14')
    })
  })

  it('저장된 설정을 마운트 시 복원한다', () => {
    localStorage.setItem('gitgrove:settings', JSON.stringify({ notificationSoundEnabled: false, notificationSound: 'Hero' }))
    openLook()
    const sel = screen.getByLabelText('알림 사운드') as HTMLSelectElement
    expect(sel.value).toBe('Hero')
    expect(sel.disabled).toBe(true)
  })
})

describe('SettingsPanel — 사운드 들어보기 버튼', () => {
  function openLookWithMock() {
    const mock = installGitApiMock()
    render(<SettingsPanel onClose={vi.fn()} repoPath={null} />)
    fireEvent.click(screen.getByRole('button', { name: /모양/ }))
    return mock
  }

  it('토글 on + 들어보기 클릭 → 현재 선택된 사운드 이름으로 previewSound 호출', () => {
    const { appAPI } = openLookWithMock()
    fireEvent.click(screen.getByRole('button', { name: '▶ 들어보기' }))
    expect(appAPI.previewSound).toHaveBeenCalledTimes(1)
    expect(appAPI.previewSound).toHaveBeenCalledWith('Glass')
  })

  it('드롭다운에서 다른 사운드 선택 후 클릭 → 바뀐 값으로 호출', () => {
    const { appAPI } = openLookWithMock()
    fireEvent.change(screen.getByLabelText('알림 사운드'), { target: { value: 'Ping' } })
    fireEvent.click(screen.getByRole('button', { name: '▶ 들어보기' }))
    expect(appAPI.previewSound).toHaveBeenCalledTimes(1)
    expect(appAPI.previewSound).toHaveBeenCalledWith('Ping')
  })

  it('토글 off → 버튼 disabled · 클릭해도 호출되지 않음', () => {
    const { appAPI } = openLookWithMock()
    fireEvent.click(screen.getByText('소리 켜기'))
    const btn = screen.getByRole('button', { name: '▶ 들어보기' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(appAPI.previewSound).not.toHaveBeenCalled()
  })
})
