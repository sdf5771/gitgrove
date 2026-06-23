import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel'
import { installGitApiMock } from '../../test/gitApiMock'

// GitHub 토큰 토글의 show/hide 표시가 이모지(🙈/👁)가 아니라 Geuru(SVG sprite)로
// 렌더되고, show/hide 상태에 따라 토글되는지 검증.
// 재설계 후: initialTab="github" → 서비스 연결 탭 + GitHub 인라인 연결 흐름(step 2)에서 노출.

beforeEach(() => {
  localStorage.clear()
  installGitApiMock()
})
afterEach(cleanup)

function openGithubFlow() {
  // initialTab="github" → conn 탭 + GitHub 연결 흐름이 바로 열린다.
  const { container } = render(<SettingsPanel onClose={vi.fn()} repoPath={null} initialTab="github" />)
  return container
}

describe('SettingsPanel — GitHub 토큰 show/hide 표시 (Geuru 통일)', () => {
  it('GitHub 토큰 토글이 이모지가 아니라 Geuru(SVG sprite)를 렌더한다', () => {
    const container = openGithubFlow()
    const toggle = screen.getByRole('button', { name: '토큰 보기' })
    // 이모지(🙈/👁)가 더 이상 사용되지 않음
    expect(toggle.textContent).not.toContain('🙈')
    expect(toggle.textContent).not.toContain('👁')
    // token-eye 버튼 + Geuru 스프라이트 렌더
    expect(toggle.className).toContain('set2-token-eye')
    expect(toggle.querySelector('svg.sprite')).not.toBeNull()
    expect(container.querySelectorAll('.set2-token-eye').length).toBeGreaterThanOrEqual(1)
  })

  it('show/hide 토글 시 aria-label이 바뀌며 Geuru가 계속 렌더된다', () => {
    openGithubFlow()
    // 숨김 상태(기본): "토큰 보기"
    const toggle = screen.getByRole('button', { name: '토큰 보기' })
    expect(toggle.querySelector('svg.sprite')).not.toBeNull()

    // 토글 → 보임 상태: "토큰 숨기기"
    fireEvent.click(toggle)
    const toggleShown = screen.getByRole('button', { name: '토큰 숨기기' })
    expect(toggleShown.querySelector('svg.sprite')).not.toBeNull()
    // 입력 type도 text로 전환(마스킹 로직 불변 확인)
    const input = screen.getByPlaceholderText(/ghp_/) as HTMLInputElement
    expect(input.type).toBe('text')

    // 다시 토글 → 숨김
    fireEvent.click(toggleShown)
    expect(screen.getByRole('button', { name: '토큰 보기' })).toBeTruthy()
    expect((screen.getByPlaceholderText(/ghp_/) as HTMLInputElement).type).toBe('password')
  })
})
