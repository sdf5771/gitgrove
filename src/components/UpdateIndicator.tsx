// 상시 업데이트 인디케이터(UP2) — 타이틀바 우측 코너의 작은 필.
//
// 업데이트가 있는 동안 계속 노출(시작 알림 토스트와 달리 1회성 아님).
// 클릭 시 다운로드(dmgUrl 있으면 인앱, 없으면 브라우저 폴백). 다운로드 중엔
// 진행 %/스피너로 바뀌고 중복 클릭 방지. 상태 계산은 utils/updateIndicator로 분리.
import {
  type UpdateState,
  isClickable,
  indicatorLabel,
  indicatorTitle,
  indicatorPercent,
} from '../utils/updateIndicator'

interface Props {
  state: UpdateState
  onActivate: () => void
}

export function UpdateIndicator({ state, onActivate }: Props) {
  const { phase } = state
  const clickable = isClickable(state)
  const pct = indicatorPercent(state)
  const label = indicatorLabel(state)
  const title = indicatorTitle(state)

  const isDownloading = phase === 'downloading'
  const isDone = phase === 'done'
  const isError = phase === 'error'

  return (
    <button
      type="button"
      className={`update-pill${isDownloading ? ' busy' : ''}${isDone ? ' done' : ''}${isError ? ' error' : ''}`}
      onClick={() => { if (clickable) onActivate() }}
      disabled={!clickable}
      title={title}
      aria-label={title}
      aria-busy={isDownloading}
    >
      {isDownloading
        ? <span className="update-pill-spin" aria-hidden />
        : isDone
          ? <svg className="update-pill-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M3 8.5l3.2 3.2L13 5" /></svg>
          : isError
            ? <svg className="update-pill-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
            : <svg className="update-pill-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M8 13V3M4 7l4-4 4 4" /></svg>}
      <span className="update-pill-label">{label}</span>
      {isDownloading && pct !== null && (
        <span className="update-pill-bar" aria-hidden>
          <span className="update-pill-bar-fill" style={{ width: `${pct}%` }} />
        </span>
      )}
      {isDownloading && pct === null && (
        <span className="update-pill-bar indet" aria-hidden>
          <span className="update-pill-bar-fill" />
        </span>
      )}
    </button>
  )
}
