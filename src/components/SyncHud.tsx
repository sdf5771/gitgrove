// SY2 — 동기화 진행 HUD 팝오버.
//
// onRemoteProgress(SY1)로 모인 ProgressModel을 받아 그루(think→결과표정) + op명/sub + % +
// 진행바(det=줄무늬 width% / indet=흐르는 막대) + rate 줄 + 단계 로그 + 결과 푸터를 그린다.
// 색 규칙: 골드=진행 액센트, 녹색=완료/done, 빨강=충돌(디자인 정본 기준).
import { Geuru } from './Geuru'
import {
  type ProgressModel,
  type ResultView,
  type PhaseStatus,
  phasesFor,
  computePhaseStatuses,
  overallPercent,
  isDeterminate,
  countMeta,
  rateText,
  currentLabel,
  opTarget,
  OP_TITLE,
} from '../utils/syncProgress'

interface Props {
  model: ProgressModel
  branch: string
  // 결과 도착 시(성공/충돌/이미최신). 없으면 진행 중.
  result: ResultView | null
  onClose: () => void
  // 충돌 결과의 "충돌 해결 ↗" 클릭(있을 때만 버튼 노출).
  onResolveConflict?: () => void
}

const PhaseIcon = ({ status }: { status: PhaseStatus }) => {
  if (status === 'active') return <span className="pspin" />
  if (status === 'done') {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 8.5l3.2 3.2L13 5" /></svg>
    )
  }
  if (status === 'err') {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M8 1.5l6.5 11.5h-13z" /><path d="M8 6.5v3M8 11.3v.2" /></svg>
    )
  }
  return <span className="pdot" />
}

export function SyncHud({ model, branch, result, onClose, onResolveConflict }: Props) {
  const phases = phasesFor(model.op)
  const isConflict = result?.kind === 'conflict'
  const isDone = result !== null
  const statuses = computePhaseStatuses(model.op, model.maxPhase, {
    done: isDone && !isConflict,
    // 충돌은 마지막(병합) phase에서 멈춘 것으로 표시.
    errorAt: isConflict ? Math.max(model.maxPhase, phases.length - 1) : undefined,
  })

  const pct = isDone && !isConflict ? 100 : overallPercent(model)
  const det = isDeterminate(model)
  const sub = opTarget(model.op, branch).sub
  const meta = countMeta(model)
  const rate = rateText(model)
  const label = currentLabel(model)

  const headExpr = result ? result.geuru : 'think'

  // 진행바 클래스: 완료=done(녹색), 충돌=err(빨강), det 진행=striped, indet=흐르는 막대.
  let fillClass = 'hud-bar-fill'
  if (isDone && !isConflict) fillClass += ' done'
  else if (isConflict) fillClass += ' err'
  else if (det) fillClass += ' striped'
  else fillClass += ' indet'

  return (
    <div className="hud" role="dialog" aria-label={`${OP_TITLE[model.op]} 진행 상황`} aria-live="polite">
      <div className="hud-head">
        <span className={`hud-geuru${isDone ? '' : ' bob'}`}>
          <Geuru expr={headExpr} scale={1.5} title={`그루 — ${OP_TITLE[model.op]}`} />
        </span>
        <div className="hud-titles">
          <div className="hud-op">{OP_TITLE[model.op]}</div>
          <div className="hud-sub">{sub}</div>
        </div>
        <div className={`hud-pct${isDone && !isConflict ? ' done' : ''}${isConflict ? ' err' : ''}`}>
          {isDone && !isConflict
            ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 8.5l3.2 3.2L13 5" /></svg>
            : isConflict
              ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4l8 8M12 4l-8 8" /></svg>
              : `${pct}%`}
        </div>
      </div>

      <div className="hud-bar-wrap">
        <div className="hud-bar">
          <div
            className={fillClass}
            style={det && !isConflict ? { width: `${isDone ? 100 : pct}%` } : undefined}
          />
        </div>
        <div className="hud-rate">
          <span>{isDone ? (isConflict ? '병합 중단됨' : '완료') : (label ? `${label}…` : '시작하는 중…')}</span>
          <span>{!isDone ? rate : ''}</span>
        </div>
      </div>

      <div className="hud-phases">
        {phases.map((p, i) => (
          <div key={i} className={`hud-phase ${statuses[i]}`}>
            <span className="pico"><PhaseIcon status={statuses[i]} /></span>
            <span className="ptxt">{p.label}</span>
            <span className="pmeta">{statuses[i] === 'active' ? meta : ''}</span>
          </div>
        ))}
      </div>

      {result && (
        <div className="hud-foot">
          <div className="hud-result">
            <b className={isConflict ? 'err' : ''}>{result.title}</b>
            <div className="hud-result-detail">
              {result.detail}
              {(typeof result.insertions === 'number' || typeof result.deletions === 'number') && (
                <span className="diff">
                  {' · '}
                  {typeof result.insertions === 'number' && <span className="ins">+{result.insertions}</span>}
                  {typeof result.insertions === 'number' && typeof result.deletions === 'number' && ' '}
                  {typeof result.deletions === 'number' && <span className="del">−{result.deletions}</span>}
                </span>
              )}
            </div>
          </div>
          {isConflict ? (
            <>
              <button className="hud-btn ghost" onClick={onClose}>나중에</button>
              {onResolveConflict && (
                <button className="hud-btn danger" onClick={onResolveConflict}>충돌 해결 ↗</button>
              )}
            </>
          ) : (
            <button className="hud-btn ghost" onClick={onClose}>확인</button>
          )}
        </div>
      )}
    </div>
  )
}
