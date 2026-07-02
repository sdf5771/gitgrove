import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { CommandPalette } from './CommandPalette'

// ⌘K 팔레트: 상황 제안(behind/conflicts) · 검색 · 빈 상태.

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('CommandPalette — 상황 제안 + 검색', () => {
  it('behind/conflicts 컨텍스트로 "지금 상황" 제안을 그린다', () => {
    render(<CommandPalette onClose={vi.fn()} onAction={vi.fn()} context={{ behind: 3, conflicts: 2 }} />)
    expect(screen.getByText('✦ 지금 상황 — 그루의 제안')).toBeInTheDocument()
    expect(screen.getByText(/origin에서 3 커밋 받기/)).toBeInTheDocument()
    expect(screen.getByText('⚡ ↓3 뒤처짐')).toBeInTheDocument()
    expect(screen.getByText('충돌 해결 열기')).toBeInTheDocument()
    expect(screen.getByText('⚡ 충돌 2')).toBeInTheDocument()
  })

  it('컨텍스트가 없으면 "지금 상황" 섹션을 생략한다', () => {
    render(<CommandPalette onClose={vi.fn()} onAction={vi.fn()} context={{ behind: 0, conflicts: 0 }} />)
    expect(screen.queryByText('✦ 지금 상황 — 그루의 제안')).toBeNull()
    expect(screen.getByText('전체 명령')).toBeInTheDocument()
  })

  it('Pull 제안 클릭 → onAction("pull") + 닫기', () => {
    const onAction = vi.fn(); const onClose = vi.fn()
    render(<CommandPalette onClose={onClose} onAction={onAction} context={{ behind: 3 }} />)
    fireEvent.mouseDown(screen.getByText('⚡ ↓3 뒤처짐'))
    expect(onAction).toHaveBeenCalledWith('pull')
    expect(onClose).toHaveBeenCalled()
  })

  it('검색어로 명령을 거른다', () => {
    render(<CommandPalette onClose={vi.fn()} onAction={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/무엇을 할까요/), { target: { value: 'push' } })
    expect(screen.getByText('Push')).toBeInTheDocument()
    expect(screen.queryByText('Fetch')).toBeNull()
  })

  it('매칭 없으면 그루 빈 상태 + 추천 칩을 보여준다', () => {
    render(<CommandPalette onClose={vi.fn()} onAction={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/무엇을 할까요/), { target: { value: 'zzzznope' } })
    expect(screen.getByText(/에 맞는 명령이 없어요/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'pull' })).toBeInTheDocument()
  })
})
