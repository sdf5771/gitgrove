import { useEffect, useMemo, useRef } from 'react'
import { LANE_COLORS, BRANCH_LANES, type Commit } from '../data/mockData'
import { Chip } from './Chip'
import { HighlightMatch } from './HighlightMatch'

const LW = 20, DR = 5.5, SVGW = 10 + 4 * LW + 8
const cx = (lane: number) => 10 + lane * LW + LW / 2

function CommitGraphSVG({ commits, selectedIdx, rowH, activeBranch }: { commits: Commit[]; selectedIdx: number; rowH: number; activeBranch: string }) {
  const aLane = BRANCH_LANES[activeBranch] ?? 0
  const isMain = activeBranch === 'main'
  const laneOp = (l1: number, l2: number) => { if (isMain) return .85; const m = Math.max(l1, l2); return (m === aLane || m === 0) ? .9 : .18 }
  const dotOp = (lane: number) => { if (isMain) return 1; return (lane === aLane || lane === 0) ? 1 : .22 }

  const conns = useMemo(() => {
    const out: Array<{ d: string; color: string; key: string; l1: number; l2: number }> = []
    commits.forEach((c, ri) => {
      c.parents.forEach(pi => {
        const rpi = pi
        if (rpi >= commits.length) return
        const p = commits[rpi]
        if (!p) return
        const color = LANE_COLORS[Math.max(c.lane, p.lane) % LANE_COLORS.length]
        const x1 = cx(c.lane), y1 = ri * rowH + rowH / 2 + DR + 1
        const x2 = cx(p.lane), y2 = rpi * rowH + rowH / 2 - DR - 1
        let d: string
        if (c.lane === p.lane) { d = `M${x1} ${y1} L${x2} ${y2}` }
        else { const off = Math.min(rowH * .75, Math.abs(y2 - y1) * .45); d = `M${x1} ${y1} C${x1} ${y1 + off} ${x2} ${y2 - off} ${x2} ${y2}` }
        out.push({ d, color, key: `${c.id}-${rpi}`, l1: c.lane, l2: p.lane })
      })
    })
    return out
  }, [commits, rowH])

  return (
    <svg width={SVGW} height={commits.length * rowH + 20} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 1 }}>
      {conns.map(({ d, color, key, l1, l2 }) => (
        <path key={key} d={d} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round"
          opacity={laneOp(l1, l2)} style={{ transition: 'opacity 280ms ease' }} />
      ))}
      {commits.map((c, i) => {
        const sel = i === selectedIdx, lc = LANE_COLORS[c.lane % LANE_COLORS.length], isMerge = c.parents.length >= 2
        const cxv = cx(c.lane), cyv = i * rowH + rowH / 2
        return (
          <g key={c.id} style={{ opacity: dotOp(c.lane), transition: 'opacity 280ms ease' }}>
            {sel && <circle cx={cxv} cy={cyv} r={DR + 5} fill="none" stroke={lc} strokeWidth={1.5} opacity={.35} />}
            <circle cx={cxv} cy={cyv} r={DR} fill={lc} stroke={sel ? 'rgba(244,236,210,.7)' : 'none'} strokeWidth={sel ? 1.5 : 0} />
            {isMerge && <circle cx={cxv} cy={cyv} r={2.5} fill="#0d1220" />}
          </g>
        )
      })}
    </svg>
  )
}

interface Props {
  commits: Commit[]
  selectedIdx: number
  onSelect: (i: number) => void
  /** 행 더블클릭(드릴인) — 해당 커밋의 Diff로 이동 */
  onActivate?: (i: number) => void
  onContextMenu: (e: React.MouseEvent, c: Commit, i: number) => void
  showStats: boolean
  rowH: number
  activeBranch: string
}

export function CommitGraph({ commits, selectedIdx, onSelect, onActivate, onContextMenu, showStats, rowH, activeBranch }: Props) {
  // 선택 행이 뷰포트 밖이면 스크롤(방향키 탐색 시 따라가도록). block:'nearest'라 보이면 no-op.
  const selRowRef = useRef<HTMLDivElement>(null)
  // scrollIntoView는 jsdom 등 일부 환경에 없을 수 있어 옵셔널 호출로 가드.
  useEffect(() => { selRowRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [selectedIdx])

  return (
    <div className="gscroll">
      {commits.length === 0 ? (
        <div className="empty-state" style={{ height: 200 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          No commits match
        </div>
      ) : (
        <div key={activeBranch} className="graph-anim" style={{ position: 'relative', minHeight: commits.length * rowH }}>
          <CommitGraphSVG commits={commits} selectedIdx={selectedIdx} rowH={rowH} activeBranch={activeBranch} />
          {commits.map((c, i) => (
            <div key={c.id}
              ref={i === selectedIdx ? selRowRef : undefined}
              className={`crow${i === selectedIdx ? ' sel' : ''}`}
              style={{ height: rowH }}
              onClick={() => onSelect(i)}
              onDoubleClick={() => onActivate?.(i)}
              onContextMenu={e => { e.preventDefault(); onContextMenu(e, c, i) }}>
              <div className="cspacer" style={{ width: SVGW }} />
              <div className="cinfo">
                <span className="chash">{c.id}</span>
                <span className="cmsg"><HighlightMatch text={c.msg} query={c._q} /></span>
                {c.labels.length > 0 && <span className="clabels">{c.labels.map(l => <Chip key={l.text} text={l.text} type={l.type} />)}</span>}
                <span className="cauthor">{c.author}</span>
                {showStats && <span className="cstats"><span className="sa">+{c.stats.a}</span><span className="sd">−{c.stats.d}</span></span>}
                <span className="ctime">{c.time}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
