import { useState } from 'react'
import { LOCAL_BRANCHES, REMOTE_BRANCHES, LANE_COLORS, type Branch } from '../data/mockData'
import { Tree } from './Tree'
import { Geuru, type GeuruExpr } from './Geuru'
import type { GrowthStage } from '../utils/repoActivity'

type BranchAction = 'create' | 'rename' | 'delete'

type HealthKind = 'healthy' | 'behind' | 'ahead' | 'conflict'

interface Props {
  activeBranch: string
  onBranchAction: (mode: BranchAction, name?: string) => void
  onBranchContextMenu?: (
    e: React.MouseEvent,
    name: string,
    type: 'local' | 'remote' | 'tag',
    isCurrent: boolean,
  ) => void
  localBranches?: Branch[]
  remoteBranches?: string[]
  tags?: string[]
  /** 그로브 헤더에 표시할 레포명·소유자. 없으면 안전한 폴백. */
  repoName?: string
  repoOwner?: string
  /** 충돌 상태(앱 전역). HEAD 플롯 건강도·정원지기 표정 파생에 사용. */
  conflict?: boolean
  /** HEAD 플롯의 정원지기 그루 표정(앱의 geuruState). */
  geuruState?: GeuruExpr
  /** 브랜치 클릭 = 체크아웃 등. 없으면 무동작(시각만). */
  onBranchClick?: (name: string) => void
  style?: React.CSSProperties
}

// ahead 수로 나무 4단계 성장 (디자인 treeStage). ahead≥6→3, ≥3→2, ≥1→1, else 0.
function treeStageOf(ahead: number): GrowthStage {
  if (ahead >= 6) return 3
  if (ahead >= 3) return 2
  if (ahead >= 1) return 1
  return 0
}

// 브랜치 건강도 파생 (디자인 branchHealth). 충돌 > behind > ahead > healthy.
function branchHealthOf(
  b: Branch,
  isHead: boolean,
  conflict: boolean,
): { kind: HealthKind; label: string } {
  if (isHead && conflict) return { kind: 'conflict', label: '충돌' }
  if ((b.behind ?? 0) > 0) return { kind: 'behind', label: `↓${b.behind}` }
  if ((b.ahead ?? 0) > 0) return { kind: 'ahead', label: `↑${b.ahead}` }
  return { kind: 'healthy', label: '최신' }
}

export function BranchSidebar({
  activeBranch,
  onBranchAction,
  onBranchContextMenu,
  localBranches,
  remoteBranches,
  tags,
  repoName,
  repoOwner,
  conflict = false,
  geuruState = 'idle',
  onBranchClick,
  style,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [query, setQuery] = useState('')
  const toggle = (k: string) => setCollapsed(p => ({ ...p, [k]: !p[k] }))

  const localList = localBranches ?? LOCAL_BRANCHES
  const remoteList = remoteBranches ?? REMOTE_BRANCHES.map(b => b.name)
  const tagList = tags ?? ['v1.0.0', 'v0.9.2']

  const filteredLocal = query
    ? localList.filter(b => b.name.toLowerCase().includes(query.toLowerCase()))
    : localList
  const filteredRemote = query
    ? remoteList.filter(n => n.toLowerCase().includes(query.toLowerCase()))
    : remoteList
  const filteredTags = query
    ? tagList.filter(n => n.toLowerCase().includes(query.toLowerCase()))
    : tagList

  const headName = repoName || 'gitgrove'
  const headSub = repoOwner ? `${repoOwner} · 정원` : '정원'

  return (
    <div className="grove-sb bsidebar" style={style}>
      <div className="gsb-head">
        <div className="info">
          <b>{headName}</b>
          <span>{headSub}</span>
        </div>
        <span className="cnt">{localList.length}그루</span>
      </div>

      <div className="bsearch"><input placeholder="브랜치 찾기" value={query} onChange={e => setQuery(e.target.value)} /></div>

      <div className="gsb-scroll blist">
        <div className="gsb-sec bsec-hd">
          <span>로컬 브랜치</span>
          <button className="add" onClick={() => onBranchAction('create')} title="새 브랜치">+</button>
        </div>
        {!collapsed.local && filteredLocal.map(b => {
          const isHead = b.name === activeBranch
          const { kind, label } = branchHealthOf(b, isHead, conflict)
          const stage = treeStageOf(b.ahead ?? 0)
          const wilt = kind === 'behind' || kind === 'conflict'
          const sway = kind === 'healthy' || kind === 'ahead'
          const ahead = b.ahead ?? 0
          const behind = b.behind ?? 0
          return (
            <div
              key={b.name}
              className={`plot${isHead ? ' head on' : ''}`}
              onClick={() => onBranchClick?.(b.name)}
              onContextMenu={e => {
                e.preventDefault()
                onBranchContextMenu?.(e, b.name, 'local', isHead)
              }}
            >
              <div className={`tree-tile${wilt ? ' wilt' : ''}${sway ? ' sway' : ''}`}>
                <span className="spr"><Tree stage={stage} scale={2.0} title={`${b.name} 나무`} /></span>
                <div className="soil" />
                {isHead && <span className="gard"><Geuru expr={geuruState} scale={0.85} /></span>}
              </div>
              <div className="plot-info">
                <div className="plot-name">
                  <span className="lane" style={{ background: LANE_COLORS[b.lane % LANE_COLORS.length] }} />
                  <b>{b.name}</b>
                </div>
                <div className="plot-sub">
                  <span className={`plot-health ph-${kind}`}>{label}</span>
                  {(ahead > 0 || behind > 0) && (
                    <span className="g-ab">
                      {ahead > 0 && <span className="up">↑{ahead}</span>}
                      {behind > 0 && <span className="dn">↓{behind}</span>}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        <div className="gsb-sec bsec-hd">
          <span>원격</span>
          <button onClick={() => toggle('remote')} title={collapsed.remote ? '펼치기' : '접기'}>{collapsed.remote ? '›' : '⌄'}</button>
        </div>
        {!collapsed.remote && filteredRemote.map(name => (
          <div key={name} className="gsb-remote"
            onContextMenu={e => {
              e.preventDefault()
              onBranchContextMenu?.(e, name, 'remote', false)
            }}>
            <span className="rdot" style={{ background: 'var(--c-text-muted)' }} />
            <b>{name.replace(/^origin\//, '')}</b>
            <span>origin</span>
          </div>
        ))}

        <div className="gsb-sec bsec-hd">
          <span>태그</span>
          <button onClick={() => toggle('tags')} title={collapsed.tags ? '펼치기' : '접기'}>{collapsed.tags ? '›' : '⌄'}</button>
        </div>
        {!collapsed.tags && filteredTags.map(name => (
          <div key={name} className="gsb-remote gsb-tag"
            onContextMenu={e => {
              e.preventDefault()
              onBranchContextMenu?.(e, name, 'tag', false)
            }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--c-grove)" strokeWidth="2.5" style={{ flexShrink: 0 }}>
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            <b style={{ color: 'var(--c-grove)' }}>{name}</b>
          </div>
        ))}
      </div>
    </div>
  )
}
