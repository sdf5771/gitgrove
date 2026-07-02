import { useState, useEffect } from 'react'
import type { Commit } from '../data/mockData'

interface Props {
  x: number
  y: number
  commit: Commit
  onClose: () => void
  onAction: (action: string) => void
}

export function ContextMenu({ x, y, onClose, onAction }: Props) {
  const [showReset, setShowReset] = useState(false)

  useEffect(() => {
    const h = () => onClose()
    setTimeout(() => document.addEventListener('mousedown', h), 0)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const st = { left: Math.min(x, 1380), top: Math.min(y, 750) }

  const sv = (d: React.ReactNode) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{d}</svg>
  )

  const item = (icon: React.ReactNode, label: string, action: string, kbd = '', danger = false) => (
    <div className={`ctx-item${danger ? ' danger' : ''}`} onMouseDown={e => { e.stopPropagation(); onAction(action); onClose() }}>
      {icon}<span style={{ flex: 1 }}>{label}</span>{kbd && <span className="ctx-kbd">{kbd}</span>}
    </div>
  )

  return (
    <div className="ctx-wrap" style={st} onMouseDown={e => e.stopPropagation()}>
      <div className="ctx-menu">
        {item(sv(<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>), '해시 복사', 'copy-hash', '⌘C')}
        {item(sv(<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></>), '메시지 복사', 'copy-msg')}
        <div className="ctx-sep" />
        {item(sv(<><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></>), '체리픽', 'cherry-pick')}
        {item(sv(<><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></>), '되돌리기 (revert)', 'revert')}
        <div className="ctx-item ctx-sub" onMouseEnter={() => setShowReset(true)} onMouseLeave={() => setShowReset(false)}>
          {sv(<><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></>)}
          <span style={{ flex: 1 }}>여기로 리셋</span>
          <span className="ctx-sub-arrow">›</span>
          {showReset && (
            <div className="ctx-submenu">
              {([['soft', '스테이지 유지'], ['mixed', '언스테이지'], ['hard', '모두 버림']] as const).map(([t, d]) => (
                <div key={t} className={`ctx-sub-row${t === 'hard' ? ' danger' : ''}`} onMouseDown={e => { e.stopPropagation(); onAction('reset-' + t); onClose() }}>
                  <span className="mode">{t}</span>
                  <span className="d">{d}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="ctx-sep" />
        {item(sv(<><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></>), '여기서 브랜치', 'branch-here')}
        {item(sv(<><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>), '여기에 태그', 'tag-here')}
        <div className="ctx-sep" />
        {item(sv(<><polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></>), '대화형 리베이스', 'rebase')}
      </div>
    </div>
  )
}
