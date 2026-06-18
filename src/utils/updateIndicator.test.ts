import { describe, it, expect } from 'vitest'
import {
  INITIAL_UPDATE_STATE,
  receiveUpdate,
  startDownload,
  applyProgress,
  finishDownload,
  failDownload,
  shouldShowIndicator,
  isClickable,
  hasInAppDownload,
  indicatorPercent,
  indicatorLabel,
  indicatorTitle,
  type UpdateState,
} from './updateIndicator'
import type { UpdateAvailablePayload } from './appUpdate'

const PAYLOAD: UpdateAvailablePayload = {
  version: '2.0.0',
  url: 'https://github.com/x/y/releases/tag/v2.0.0',
  dmgUrl: 'https://github.com/x/y/releases/download/v2.0.0/GitGrove.dmg',
}
const PAYLOAD_NO_DMG: UpdateAvailablePayload = { version: '2.0.0', url: PAYLOAD.url }

describe('updateIndicator — 가시성/클릭 가능', () => {
  it('초기 상태는 payload 없음 → 인디케이터 미표시', () => {
    expect(shouldShowIndicator(INITIAL_UPDATE_STATE)).toBe(false)
    expect(isClickable(INITIAL_UPDATE_STATE)).toBe(false)
  })

  it('업데이트 수신 시 표시 + idle 클릭 가능', () => {
    const s = receiveUpdate(INITIAL_UPDATE_STATE, PAYLOAD)
    expect(shouldShowIndicator(s)).toBe(true)
    expect(isClickable(s)).toBe(true)
    expect(s.phase).toBe('idle')
  })

  it('다운로드 중에는 클릭 비활성(중복 클릭 방지)', () => {
    const s = startDownload(receiveUpdate(INITIAL_UPDATE_STATE, PAYLOAD))
    expect(isClickable(s)).toBe(false)
  })

  it('완료/실패 단계는 다시 클릭 가능(재시도)', () => {
    const base = receiveUpdate(INITIAL_UPDATE_STATE, PAYLOAD)
    expect(isClickable(finishDownload(startDownload(base)))).toBe(true)
    expect(isClickable(failDownload(startDownload(base), 'net'))).toBe(true)
  })
})

describe('updateIndicator — 진행률', () => {
  it('다운로드 중이 아니면 progress 무시', () => {
    const idle = receiveUpdate(INITIAL_UPDATE_STATE, PAYLOAD)
    expect(applyProgress(idle, { received: 10, pct: 5 }).progress).toBeNull()
  })

  it('다운로드 중 pct 있으면 determinate %, 없으면 indeterminate(null)', () => {
    const dl = startDownload(receiveUpdate(INITIAL_UPDATE_STATE, PAYLOAD))
    expect(indicatorPercent(applyProgress(dl, { received: 50, total: 100, pct: 50 }))).toBe(50)
    expect(indicatorPercent(applyProgress(dl, { received: 50 }))).toBeNull()
  })

  it('pct는 0~100으로 클램프', () => {
    const dl = startDownload(receiveUpdate(INITIAL_UPDATE_STATE, PAYLOAD))
    expect(indicatorPercent(applyProgress(dl, { received: 0, pct: -5 }))).toBe(0)
    expect(indicatorPercent(applyProgress(dl, { received: 0, pct: 150 }))).toBe(100)
  })
})

describe('updateIndicator — dmgUrl 폴백 판정', () => {
  it('dmgUrl 있으면 인앱 다운로드', () => {
    expect(hasInAppDownload(receiveUpdate(INITIAL_UPDATE_STATE, PAYLOAD))).toBe(true)
  })
  it('dmgUrl 없으면 브라우저 폴백(인앱 아님)', () => {
    expect(hasInAppDownload(receiveUpdate(INITIAL_UPDATE_STATE, PAYLOAD_NO_DMG))).toBe(false)
  })
})

describe('updateIndicator — receiveUpdate 보존 규칙', () => {
  it('같은 버전이 다운로드 중에 재수신돼도 진행 상태 보존', () => {
    const dl = startDownload(receiveUpdate(INITIAL_UPDATE_STATE, PAYLOAD))
    const again = receiveUpdate(dl, PAYLOAD)
    expect(again.phase).toBe('downloading')
  })
  it('새 버전이면 idle로 리셋', () => {
    const dl = startDownload(receiveUpdate(INITIAL_UPDATE_STATE, PAYLOAD))
    const next = receiveUpdate(dl, { ...PAYLOAD, version: '3.0.0' })
    expect(next.phase).toBe('idle')
    expect(next.payload?.version).toBe('3.0.0')
  })
})

describe('updateIndicator — 라벨/타이틀', () => {
  const base = receiveUpdate(INITIAL_UPDATE_STATE, PAYLOAD)
  it('idle 라벨에 버전 표기', () => {
    expect(indicatorLabel(base)).toBe('새 버전 v2.0.0')
  })
  it('다운로드 중 라벨에 % 또는 indeterminate 문구', () => {
    const dl = startDownload(base)
    expect(indicatorLabel(applyProgress(dl, { received: 1, total: 4, pct: 25 }))).toBe('내려받는 중 25%')
    expect(indicatorLabel(applyProgress(dl, { received: 1 }))).toBe('내려받는 중…')
  })
  it('완료/실패 라벨', () => {
    expect(indicatorLabel(finishDownload(startDownload(base)))).toBe('설치 창 열림')
    expect(indicatorLabel(failDownload(startDownload(base), 'x'))).toBe('다시 시도')
  })
  it('타이틀에 xattr/터미널 안내가 없다(받자마자 설치 가능 UX)', () => {
    const all: UpdateState[] = [
      base,
      startDownload(base),
      finishDownload(startDownload(base)),
      failDownload(startDownload(base), 'boom'),
    ]
    for (const s of all) {
      const t = indicatorTitle(s).toLowerCase()
      expect(t).not.toContain('xattr')
      expect(t).not.toContain('터미널')
    }
  })
})
