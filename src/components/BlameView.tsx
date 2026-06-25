import { useState, useEffect, useMemo } from 'react'
import { type Commit } from '../data/mockData'
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

interface Props {
  onSelectCommit: (i: number) => void
  repoPath?: string | null
  filePath?: string
  // 클릭 시 hash → index 매핑에 사용하는 실제 커밋 목록 (App의 filteredCommits)
  commits?: Commit[]
}

export function BlameView({ onSelectCommit, repoPath, filePath, commits }: Props) {
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

  // 실제 데이터만 사용. blame 결과가 없으면 빈 목록(가짜 blame 미표시).
  const displayLines: DisplayLine[] = useMemo(() => {
    if (blameLines.length > 0) return blameLines.map(fromRealBlameLine)
    return []
  }, [blameLines])

  const displayFilePath = filePath ?? ''

  // 실제 데이터에서 고유 작성자 추출 (최대 4명)
  const authors = useMemo(() => {
    const seen = new Map<string, string>()
    for (const l of displayLines) {
      if (!seen.has(l.author)) seen.set(l.author, l.ac)
      if (seen.size >= 4) break
    }
    return Array.from(seen.entries()).map(([name, color]) => ({ name, color }))
  }, [displayLines])

  const handleClick = (lineNum: number, hash: string) => {
    setSelLine(lineNum)
    // 현재 표시 중인 커밋 목록(filteredCommits)에서 hash로 인덱스 탐색.
    // blame hash와 commit.id 모두 7자리 short hash라 정확 매칭된다.
    const ci = commits?.findIndex(c => c.id === hash) ?? -1
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
          {authors.map(({ name, color }) => (
            <span key={name} title={name} style={{ background: color + '22', border: `1px solid ${color}44`, borderRadius: 2, padding: '1px 6px', color, fontFamily: 'var(--font-display)' }}>
              {name.slice(0, 2).toUpperCase()}
            </span>
          ))}
        </div>
      </div>
      <div className="blame-scroll">
        {!loading && displayLines.length === 0 && (
          <div style={{ padding: '24px 16px', fontSize: 12, color: 'var(--c-text-faint)', fontFamily: 'var(--font-display)' }}>
            {filePath ? `No blame data for ${displayFilePath}` : 'Select a file to view blame'}
          </div>
        )}
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
