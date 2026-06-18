// 상시 업데이트 인디케이터(UP2) — 순수 상태 로직.
//
// onUpdateAvailable로 받은 페이로드 + 다운로드 진행률을 인디케이터의 표시 상태로
// 환산한다. React/IPC에 의존하지 않는 순수 함수만 둬서 vitest로 단위검증한다.
// (App.tsx는 이 함수들로 라벨/클릭 가능 여부/진행 % 만 계산해 그린다.)

import type { UpdateAvailablePayload, UpdateDownloadProgress } from './appUpdate'

// 인디케이터가 가질 수 있는 단계.
// - idle       : 업데이트 있음, 아직 다운로드 시작 전(클릭하면 다운로드)
// - downloading: 다운로드 중(클릭 비활성 — 중복 방지). pct 있으면 %, 없으면 indeterminate
// - done       : 다운로드 완료 + DMG 설치 창 열림(backend가 엶)
// - error      : 다운로드 실패(클릭하면 재시도)
export type UpdatePhase = 'idle' | 'downloading' | 'done' | 'error'

// 인디케이터 상태. payload가 null이면 업데이트 없음 → 렌더 안 함.
export interface UpdateState {
  payload: UpdateAvailablePayload | null
  phase: UpdatePhase
  progress: UpdateDownloadProgress | null
  error: string | null
}

export const INITIAL_UPDATE_STATE: UpdateState = {
  payload: null,
  phase: 'idle',
  progress: null,
  error: null,
}

// 업데이트 알림 수신 시 상태 셋업. 이미 다운로드 중/완료 단계면 덮어쓰지 않는다
// (동일 세션에서 onUpdateAvailable이 다시 와도 진행 상태를 보존).
export function receiveUpdate(prev: UpdateState, payload: UpdateAvailablePayload): UpdateState {
  if (prev.payload?.version === payload.version && (prev.phase === 'downloading' || prev.phase === 'done')) {
    return { ...prev, payload }
  }
  return { payload, phase: 'idle', progress: null, error: null }
}

// 다운로드 시작.
export function startDownload(prev: UpdateState): UpdateState {
  return { ...prev, phase: 'downloading', progress: null, error: null }
}

// 진행률 갱신(다운로드 중에만 반영).
export function applyProgress(prev: UpdateState, progress: UpdateDownloadProgress): UpdateState {
  if (prev.phase !== 'downloading') return prev
  return { ...prev, progress }
}

// 다운로드 완료(DMG 설치 창 열림).
export function finishDownload(prev: UpdateState): UpdateState {
  return { ...prev, phase: 'done', error: null }
}

// 다운로드 실패 → 클릭 시 재시도 가능.
export function failDownload(prev: UpdateState, message: string): UpdateState {
  return { ...prev, phase: 'error', error: message }
}

// 인디케이터를 렌더할지(업데이트가 있을 때만).
export function shouldShowIndicator(state: UpdateState): boolean {
  return state.payload !== null
}

// 클릭으로 다운로드/재시도/폴백을 트리거할 수 있는 단계인지(다운로드 중엔 비활성).
export function isClickable(state: UpdateState): boolean {
  return state.payload !== null && state.phase !== 'downloading'
}

// dmgUrl이 있으면 인앱 다운로드, 없으면 브라우저(openReleaseUrl) 폴백.
export function hasInAppDownload(state: UpdateState): boolean {
  return typeof state.payload?.dmgUrl === 'string' && state.payload.dmgUrl.length > 0
}

// 진행률이 결정적(determinate)인지 — pct가 숫자면 막대 width로, 아니면 indeterminate.
export function indicatorPercent(state: UpdateState): number | null {
  const pct = state.progress?.pct
  return typeof pct === 'number' && Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : null
}

// 인디케이터에 표시할 라벨 텍스트.
export function indicatorLabel(state: UpdateState): string {
  const v = state.payload?.version ?? ''
  switch (state.phase) {
    case 'downloading': {
      const pct = indicatorPercent(state)
      return pct === null ? '내려받는 중…' : `내려받는 중 ${pct}%`
    }
    case 'done':
      return '설치 창 열림'
    case 'error':
      return '다시 시도'
    case 'idle':
    default:
      return `새 버전 v${v}`
  }
}

// 접근성 타이틀(hover/aria) — 단계별 안내. 받자마자 설치 가능(quarantine 미부착).
export function indicatorTitle(state: UpdateState): string {
  switch (state.phase) {
    case 'downloading':
      return '업데이트를 내려받고 있어요'
    case 'done':
      return '다운로드 완료 — 설치 창이 열렸어요'
    case 'error':
      return state.error ? `다운로드 실패: ${state.error} (클릭해 다시 시도)` : '다운로드 실패 — 클릭해 다시 시도'
    case 'idle':
    default:
      return hasInAppDownload(state)
        ? '클릭하면 새 버전을 내려받아 설치할 수 있어요'
        : '클릭하면 릴리즈 페이지가 열려요'
  }
}
