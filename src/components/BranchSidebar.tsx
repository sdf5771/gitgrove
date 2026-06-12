import { useState } from 'react'
import { LOCAL_BRANCHES, REMOTE_BRANCHES, LANE_COLORS, type Branch } from '../data/mockData'

type BranchAction = 'create' | 'rename' | 'delete'

interface Props {
  activeBranch: string
  onBranch?: (name: string) => void
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
  style?: React.CSSProperties
}

export function BranchSidebar({ activeBranch, onBranch: _onBranch, onBranchAction, onBranchContextMenu, localBranches, remoteBranches, tags, style }: Props) {
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

  return (
    <div className="bsidebar" style={style}>
      <div className="bsearch"><input placeholder="Filter branches…" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <div className="blist">
        <div className="bsec-hd">
          <span>Local</span>
          <div style={{ display: 'flex', gap: 2 }}>
            <button onClick={() => onBranchAction('create')} title="New branch" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-faint)', fontSize: 14, padding: '0 3px', borderRadius: 3, lineHeight: 1 }}>+</button>
            <button onClick={() => toggle('local')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', fontSize: 13, padding: '0 3px', borderRadius: 3, lineHeight: 1 }}>{collapsed.local ? '›' : '⌄'}</button>
          </div>
        </div>
        {!collapsed.local && filteredLocal.map(b => (
          <div key={b.name}
            className={`bitem${b.name === activeBranch ? ' cur' : ''}`}
            onContextMenu={e => {
              e.preventDefault()
              onBranchContextMenu?.(e, b.name, 'local', b.name === activeBranch)
            }}>
            <span className="bdot" style={{ background: LANE_COLORS[b.lane % LANE_COLORS.length] }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
            {b.current && <span style={{ fontSize: 9, fontFamily: 'var(--font-display)', color: 'var(--c-gold-300)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-border)', padding: '1px 5px', borderRadius: 999, letterSpacing: '.06em', textTransform: 'uppercase' }}>HEAD</span>}
            {b.ahead != null && b.ahead > 0 && <span className="bab"><span className="bab-a">↑{b.ahead}</span></span>}
          </div>
        ))}

        <div className="bsec-hd" style={{ marginTop: 6 }}>
          <span>Remote</span>
          <button onClick={() => toggle('remote')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', fontSize: 13, padding: '0 3px' }}>{collapsed.remote ? '›' : '⌄'}</button>
        </div>
        {!collapsed.remote && filteredRemote.map(name => (
          <div key={name} className="bitem"
            onContextMenu={e => {
              e.preventDefault()
              onBranchContextMenu?.(e, name, 'remote', false)
            }}>
            <span className="bdot bdot-r" />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-muted)' }}>{name}</span>
          </div>
        ))}

        <div className="bsec-hd" style={{ marginTop: 6 }}>
          <span>Tags</span>
          <button onClick={() => toggle('tags')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', fontSize: 13, padding: '0 3px' }}>{collapsed.tags ? '›' : '⌄'}</button>
        </div>
        {!collapsed.tags && filteredTags.map(name => (
          <div key={name} className="bitem"
            onContextMenu={e => {
              e.preventDefault()
              onBranchContextMenu?.(e, name, 'tag', false)
            }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6fcf7c" strokeWidth="2.5" style={{ flexShrink: 0 }}>
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            <span style={{ flex: 1, color: 'var(--c-success)' }}>{name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
