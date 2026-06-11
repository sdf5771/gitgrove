import { useState, useMemo, useEffect, useRef } from 'react'
import { COMMANDS } from '../data/mockData'
import { HighlightMatch } from './HighlightMatch'

interface Props {
  onClose: () => void
  onAction: (id: string) => void
}

export function CommandPalette({ onClose, onAction }: Props) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])

  const filtered = useMemo(() => {
    if (!q.trim()) return COMMANDS
    const lq = q.toLowerCase()
    return COMMANDS.filter(c => c.label.toLowerCase().includes(lq) || c.cat.toLowerCase().includes(lq) || c.desc.toLowerCase().includes(lq))
  }, [q])

  const grouped = useMemo(() => {
    const m: Record<string, typeof COMMANDS> = {}
    filtered.forEach(c => { if (!m[c.cat]) m[c.cat] = []; m[c.cat].push(c) })
    return m
  }, [filtered])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && filtered[idx]) { onAction(filtered[idx].id); onClose() }
    if (e.key === 'Escape') onClose()
  }

  let gi = 0
  return (
    <div className="cmd-bd" onMouseDown={onClose}>
      <div className="cmd-box" onMouseDown={e => e.stopPropagation()}>
        <div className="cmd-inp-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-faint)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={ref} className="cmd-inp" placeholder="Search actions…" value={q} onChange={e => { setQ(e.target.value); setIdx(0) }} onKeyDown={handleKey} />
          <span style={{ fontSize: 10, color: 'var(--c-text-faint)', background: 'var(--c-bg-inset)', border: '1px solid var(--c-border)', borderRadius: 3, padding: '2px 6px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>ESC</span>
        </div>
        <div className="cmd-list">
          {filtered.length === 0 && <div className="cmd-empty">No actions match "<strong>{q}</strong>"</div>}
          {Object.entries(grouped).map(([cat, cmds]) => (
            <div key={cat}>
              <div className="cmd-cat">{cat}</div>
              {cmds.map(cmd => {
                const li = gi++
                const isOn = li === idx
                return (
                  <div key={cmd.id} className={`cmd-row${isOn ? ' on' : ''}`} onMouseEnter={() => setIdx(li)} onMouseDown={() => { onAction(cmd.id); onClose() }}>
                    <div className="cmd-icon">{cmd.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="cmd-label"><HighlightMatch text={cmd.label} query={q} /></div>
                      {cmd.desc && <div className="cmd-desc">{cmd.desc}</div>}
                    </div>
                    {cmd.kbd && <span className="cmd-ckbd">{cmd.kbd}</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="cmd-footer">
          <span><span className="cmd-fkey">↑↓</span> navigate</span>
          <span><span className="cmd-fkey">↵</span> run</span>
          <span><span className="cmd-fkey">ESC</span> close</span>
          <span style={{ marginLeft: 'auto' }}>{filtered.length} action{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}
