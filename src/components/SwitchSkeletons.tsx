// 저장소 전환 로딩 스켈레톤 — 탭 전환으로 git 데이터를 불러오는 동안 표시한다.
// 디자인 정본(저장소 전환 로딩)의 로딩 어휘(.sk shimmer·새싹 placeholder·lane 노드/라인)만
// 가져와 실앱 레이아웃에 얹는다. 그루·나무 스프라이트는 기존 Geuru/Tree를 재사용한다.
import { LANE_COLORS } from '../data/mockData'
import { Geuru } from './Geuru'
import { Tree } from './Tree'

const SVGW = 10 + 4 * 20 + 8 // CommitGraph와 동일한 그래프 거터 폭

// 브랜치 사이드바 스켈레톤 — 그로브(나무) 모드: 새싹 placeholder + shimmer 텍스트.
// list 모드: 간단 shimmer 행. #101 나무/목록 토글과 공존하도록 view를 받는다.
export function BranchSkeletons({ view, rows = 4 }: { view: 'grove' | 'list'; rows?: number }) {
  if (view === 'list') {
    return (
      <div className="blist sk-branches" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="sk-bitem">
            <span className="sk sk-dot" />
            <span className="sk sk-soft" style={{ flex: 1, height: 11, maxWidth: 80 + (i % 3) * 34 }} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="gsb-scroll blist sk-branches" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="plot tile-seed" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="tree-tile">
            <span className="spr"><Tree stage={0} scale={2.0} title="" /></span>
            <div className="soil" />
          </div>
          <div className="plot-info">
            <div className="plot-name">
              <span className="lane" style={{ background: 'var(--c-border)' }} />
              <span className="sk sk-soft" style={{ height: 11, width: 86 + (i % 3) * 28 }} />
            </div>
            <div className="plot-sub">
              <span className="sk sk-soft" style={{ height: 12, width: 40, borderRadius: 999 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// 커밋 그래프 스켈레톤 — lane 색 노드 + 세로 라인 + shimmer 메시지/아바타/시간.
export function CommitSkeletons({ rows = 8, rowH = 42 }: { rows?: number; rowH?: number }) {
  return (
    <div className="gscroll sk-commits" aria-hidden="true">
      <div className="graph" style={{ position: 'relative', minHeight: rows * rowH }}>
        <svg className="sk-graph-svg" width={SVGW} height={rows * rowH + 20}>
          <line
            x1={10 + 20 / 2} y1={rowH / 2}
            x2={10 + 20 / 2} y2={(rows - 1) * rowH + rowH / 2}
            className="sk-line" stroke={LANE_COLORS[0]} strokeWidth={2} strokeLinecap="round"
          />
          {Array.from({ length: rows }).map((_, i) => (
            <circle
              key={i} className="sk-node"
              cx={10 + 20 / 2} cy={i * rowH + rowH / 2} r={5.5}
              fill={LANE_COLORS[i % LANE_COLORS.length]}
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </svg>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="crow sk-row" style={{ height: rowH }}>
            <div className="cspacer" style={{ width: SVGW }} />
            <div className="cinfo">
              <span className="sk sk-h" style={{ width: 52 }} />
              <span className="sk sk-msg" style={{ width: `${42 + ((i * 13) % 38)}%` }} />
              <span className="sk sk-av" />
              <span className="sk sk-time" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// 디테일 패널 스켈레톤 — 해시·메시지·메타·diff 블록을 shimmer로.
export function DetailSkeleton() {
  return (
    <div className="cdetail sk-detail" aria-hidden="true">
      <span className="sk sk-h" style={{ width: 92, height: 11 }} />
      <span className="sk" style={{ width: '78%', height: 15, marginTop: 10 }} />
      <span className="sk sk-soft" style={{ width: '52%', height: 12, marginTop: 8 }} />
      <div className="sk-detail-meta">
        <span className="sk sk-soft" style={{ width: '64%', height: 11 }} />
        <span className="sk sk-soft" style={{ width: '46%', height: 11 }} />
      </div>
      <div className="sk-block">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="sk sk-soft" style={{ height: 9, width: `${88 - i * 7}%`, animationDelay: `${i * 50}ms` }} />
        ))}
      </div>
    </div>
  )
}

// 코치 로딩 배너 — 그루 think + 진행 바 + 라벨 + 서브.
// progress: resolve된 promise 수(0..total). total은 보통 3(getLog/getBranches/getStatus).
export function CoachLoading({ progress, total = 3 }: { progress: number; total?: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0
  return (
    <div className="coach loading" role="status" aria-live="polite">
      <span className="coach-geuru"><Geuru expr="think" scale={2.2} title="그루 — 저장소를 여는 중" /></span>
      <div className="coach-body">
        <b>저장소를 여는 중…</b>
        <span>커밋과 브랜치를 불러오고 있어요</span>
        <div className="coach-bar"><span className="coach-bar-fill" style={{ width: `${pct}%` }} /></div>
      </div>
      <span className="coach-pct">{pct}%</span>
    </div>
  )
}
