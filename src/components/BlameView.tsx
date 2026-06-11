import { useState } from 'react'
import { BLAME_LINES, COMMITS } from '../data/mockData'
import { HL } from '../utils/syntaxHighlight'

export function BlameView({ onSelectCommit }: { onSelectCommit: (i: number) => void }) {
  const [selLine, setSelLine] = useState<number | null>(null)

  const handleClick = (n: number, hash: string) => {
    setSelLine(n)
    const ci = COMMITS.findIndex(c => c.id === hash)
    if (ci >= 0) onSelectCommit(ci)
  }

  return (
    <div className="blame-wrap">
      <div className="pnl-hdr">
        <h3>Git Blame</h3>
        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--c-text-faint)', fontFamily: 'var(--font-mono)' }}>src/auth/jwt.ts</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, fontSize: 10, color: 'var(--c-text-faint)' }}>
          <span style={{ background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-border)', borderRadius: 2, padding: '1px 6px', color: 'var(--c-gold-300)', fontFamily: 'var(--font-display)' }}>SK</span>
          <span style={{ background: 'rgba(95,184,230,.12)', border: '1px solid rgba(95,184,230,.35)', borderRadius: 2, padding: '1px 6px', color: '#5fb8e6', fontFamily: 'var(--font-display)' }}>JP</span>
        </div>
      </div>
      <div className="blame-scroll">
        {BLAME_LINES.map(line => (
          <div key={line.n} className={`blame-row${selLine === line.n ? ' sel' : ''}`} onClick={() => handleClick(line.n, line.hash)}>
            <div className="blame-gutter">
              <div className="blame-av" style={{ background: line.ac + '22', color: line.ac, borderColor: line.ac + '44' }}>{line.au}</div>
              <span className="blame-hash">{line.hash}</span>
              <span className="blame-time">{line.t}</span>
            </div>
            <span className="blame-lnum">{line.n}</span>
            <span className="blame-code"><HL s={line.c} /></span>
          </div>
        ))}
      </div>
    </div>
  )
}
