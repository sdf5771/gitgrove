import { useState, useEffect } from 'react'
import { BLAME_LINES, COMMITS, type BlameLine } from '../data/mockData'
import { HL } from '../utils/syntaxHighlight'

// IPC에서 반환되는 blame 라인 타입 (electron-env.d.ts의 GitBlameLine과 동일)
interface RealBlameLine {
  lineNum: number
  hash: string
  author: string
  authorColor: string
  timeAgo: string
  content: string
}

interface DisplayLine {
  lineNum: number
  hash: string
  author: string
  ac: string
  timeAgo: string
  content: string
}

function fromRealBlameLine(line: RealBlameLine): DisplayLine {
  return {
    lineNum: line.lineNum,
    hash: line.hash,
    author: line.author,
    ac: line.authorColor,
    timeAgo: line.timeAgo,
    content: line.content,
  }
}

function fromMockBlameLine(line: BlameLine): DisplayLine {
  return {
    lineNum: line.n,
    hash: line.hash,
    author: line.au,
    ac: line.ac,
    timeAgo: line.t,
    content: line.c,
  }
}

interface Props {
  onSelectCommit: (i: number) => void
  repoPath?: string | null
  filePath?: string
}

export function BlameView({ onSelectCommit, repoPath, filePath }: Props) {
  const [selLine, setSelLine] = useState<number | null>(null)
  const [blameLines, setBlameLines] = useState<RealBlameLine[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!repoPath || !filePath) {
      setBlameLines([])
      return
    }
    setLoading(true)
    const blamePromise = window.gitAPI?.blame(repoPath, filePath) as Promise<RealBlameLine[]> | undefined
    blamePromise
      ?.then(lines => setBlameLines(lines ?? []))
      .catch(() => setBlameLines([]))
      .finally(() => setLoading(false))
  }, [repoPath, filePath])

  // 실제 데이터가 있으면 사용, 없으면 mock fallback
  const displayLines: DisplayLine[] = blameLines.length > 0
    ? blameLines.map(fromRealBlameLine)
    : BLAME_LINES.map(fromMockBlameLine)

  const displayFilePath = filePath ?? 'src/auth/jwt.ts'

  const handleClick = (lineNum: number, hash: string) => {
    setSelLine(lineNum)
    // 실제 데이터면 커밋 목록에서 hash로 탐색, fallback은 mock COMMITS
    const ci = COMMITS.findIndex(c => c.id === hash)
    if (ci >= 0) onSelectCommit(ci)
  }

  return (
    <div className="blame-wrap">
      <div className="pnl-hdr">
        <h3>Git Blame</h3>
        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--c-text-faint)', fontFamily: 'var(--font-mono)' }}>{displayFilePath}</span>
        {loading && (
          <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--c-text-faint)' }}>
            <span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, fontSize: 10, color: 'var(--c-text-faint)' }}>
          <span style={{ background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-border)', borderRadius: 2, padding: '1px 6px', color: 'var(--c-gold-300)', fontFamily: 'var(--font-display)' }}>SK</span>
          <span style={{ background: 'rgba(95,184,230,.12)', border: '1px solid rgba(95,184,230,.35)', borderRadius: 2, padding: '1px 6px', color: '#5fb8e6', fontFamily: 'var(--font-display)' }}>JP</span>
        </div>
      </div>
      <div className="blame-scroll">
        {displayLines.map(line => (
          <div key={line.lineNum} className={`blame-row${selLine === line.lineNum ? ' sel' : ''}`} onClick={() => handleClick(line.lineNum, line.hash)}>
            <div className="blame-gutter">
              <div className="blame-av" style={{ background: line.ac + '22', color: line.ac, borderColor: line.ac + '44' }}>
                {line.author.slice(0, 2).toUpperCase()}
              </div>
              <span className="blame-hash">{line.hash}</span>
              <span className="blame-time">{line.timeAgo}</span>
            </div>
            <span className="blame-lnum">{line.lineNum}</span>
            <span className="blame-code"><HL s={line.content} /></span>
          </div>
        ))}
      </div>
    </div>
  )
}
