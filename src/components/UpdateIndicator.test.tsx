import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { UpdateIndicator } from './UpdateIndicator'
import {
  INITIAL_UPDATE_STATE,
  receiveUpdate,
  startDownload,
  applyProgress,
  finishDownload,
  failDownload,
} from '../utils/updateIndicator'
import type { UpdateAvailablePayload } from '../utils/appUpdate'

afterEach(cleanup)

const PAYLOAD: UpdateAvailablePayload = {
  version: '2.0.0',
  url: 'https://github.com/x/y/releases/tag/v2.0.0',
  dmgUrl: 'https://github.com/x/y/releases/download/v2.0.0/GitGrove.dmg',
}
const idle = receiveUpdate(INITIAL_UPDATE_STATE, PAYLOAD)

describe('UpdateIndicator', () => {
  it('idle 상태: 버전 라벨 노출 + 클릭 시 onActivate 호출', () => {
    const onActivate = vi.fn()
    render(<UpdateIndicator state={idle} onActivate={onActivate} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveTextContent('새 버전 v2.0.0')
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('다운로드 중: 버튼 비활성(중복 클릭 차단) + % 라벨', () => {
    const onActivate = vi.fn()
    const dl = applyProgress(startDownload(idle), { received: 40, total: 100, pct: 40 })
    render(<UpdateIndicator state={dl} onActivate={onActivate} />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(btn).toHaveTextContent('내려받는 중 40%')
    fireEvent.click(btn)
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('진행률 indeterminate(total 없음): % 없이 진행 문구', () => {
    const dl = applyProgress(startDownload(idle), { received: 1234 })
    render(<UpdateIndicator state={dl} onActivate={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('내려받는 중…')
  })

  it('완료: 설치 창 열림 라벨 + 다시 클릭 가능', () => {
    const onActivate = vi.fn()
    render(<UpdateIndicator state={finishDownload(startDownload(idle))} onActivate={onActivate} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveTextContent('설치 창 열림')
    expect(btn).not.toBeDisabled()
  })

  it('실패: 다시 시도 라벨 + 클릭 가능(재시도)', () => {
    const onActivate = vi.fn()
    render(<UpdateIndicator state={failDownload(startDownload(idle), 'net')} onActivate={onActivate} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveTextContent('다시 시도')
    fireEvent.click(btn)
    expect(onActivate).toHaveBeenCalledTimes(1)
  })
})
