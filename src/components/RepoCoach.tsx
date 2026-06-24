// 저장소 상태 코치 배너 — 중앙 그래프/뷰 위에 현재 레포 상태를 그루가 한 줄로 안내한다.
// 디자인 정본(메인 작업 뷰.html)의 .coach + SCENES를 실데이터로 파생해 포팅했다.
// 상태 파생은 src/utils/repoCoach.tsx(순수 로직, 단위검증)에 분리.
import { Geuru } from './Geuru'
import { deriveCoach, type RepoCoachInput } from '../utils/repoCoach'

const PULL_IC = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M8 2v8M5 7l3 3 3-3M3 13h10" /></svg>
)

interface Props extends RepoCoachInput {
  onPull: () => void
  onViewChanges: () => void
  onResolveConflict: () => void
  onDismiss: () => void
}

export function RepoCoach({ onPull, onViewChanges, onResolveConflict, onDismiss, ...input }: Props) {
  const s = deriveCoach(input, { onPull, onViewChanges, onResolveConflict, onDismiss })
  return (
    <div className={`coach ${s.kind}`} role="status">
      <span className="coach-geuru"><Geuru expr={s.geuru} scale={2.2} /></span>
      <div className="coach-body">
        <b>{s.title}</b>
        <span>{s.sub}</span>
      </div>
      <div className="coach-acts">
        {s.acts.map(a => (
          <button key={a.label} className={`coach-btn ${a.key}`} onClick={a.onClick}>
            {a.icon ? PULL_IC : null}{a.label}
          </button>
        ))}
      </div>
      {s.acts.length === 0 && (
        <button className="coach-x" aria-label="배너 닫기" onClick={onDismiss}>×</button>
      )}
    </div>
  )
}
