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
  timestamp: number
  summary: string
  content: string
}

// 같은 커밋에서 연속으로 온 줄들을 하나의 블록으로 묶는다.
interface BlameBlock {
  hash: string
  author: string
  ac: string
  timeAgo: string
  summary: string
  age: 0 | 1 | 2 | 3
  startLine: number
  lines: string[]
}

const DAY = 86400
const AGE_LBL = ['오늘', '이번 주', '이번 달', '오래됨']
function ageBucket(ts: number): 0 | 1 | 2 | 3 {
  const age = Date.now() / 1000 - ts
  if (age < DAY) return 0
  if (age < 7 * DAY) return 1
  if (age < 30 * DAY) return 2
  return 3
}

function groupBlocks(lines: RealBlameLine[]): BlameBlock[] {
  const blocks: BlameBlock[] = []
  for (const l of lines) {
    const last = blocks[blocks.length - 1]
    if (last && last.hash === l.hash && last.startLine + last.lines.length === l.lineNum) {
      last.lines.push(l.content)
    } else {
      blocks.push({
        hash: l.hash, author: l.author, ac: l.authorColor, timeAgo: l.timeAgo,
        summary: l.summary, age: ageBucket(l.timestamp), startLine: l.lineNum, lines: [l.content],
      })
    }
  }
  return blocks
}

interface Props {
  onSelectCommit: (i: number) => void
  repoPath?: string | null
  filePath?: string
  commits?: Commit[]
}

export function BlameView({ onSelectCommit, repoPath, filePath, commits }: Props) {
  const [blameLines, setBlameLines] = useState<RealBlameLine[]>([])
  const [loading, setLoading] = useState(false)
  const [selHash, setSelHash] = useState<string | null>(null)
  const [offAuthors, setOffAuthors] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!repoPath || !filePath) { setBlameLines([]); return }
    setLoading(true)
    setSelHash(null)
    setOffAuthors(new Set())
    const p = window.gitAPI?.blame(repoPath, filePath) as Promise<RealBlameLine[]> | undefined
    p?.then(lines => setBlameLines(lines ?? []))
      .catch(() => setBlameLines([]))
      .finally(() => setLoading(false))
  }, [repoPath, filePath])

  const blocks = useMemo(() => groupBlocks(blameLines), [blameLines])

  // 작성자별 색 + 줄 수(칩 표시용, 최대 6명).
  const authors = useMemo(() => {
    const m = new Map<string, { color: string; count: number }>()
    for (const l of blameLines) {
      const e = m.get(l.author) ?? { color: l.authorColor, count: 0 }
      e.count += 1
      m.set(l.author, e)
    }
    return Array.from(m.entries()).slice(0, 6).map(([name, v]) => ({ name, ...v }))
  }, [blameLines])

  const displayFilePath = filePath ?? ''

  const clickBlock = (hash: string) => {
    setSelHash(prev => prev === hash ? null : hash)
    const ci = commits?.findIndex(c => c.id === hash) ?? -1
    if (ci >= 0) onSelectCommit(ci)
  }
  const toggleAuthor = (name: string) =>
    setOffAuthors(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })

  return (
    <div className="blame-wrap">
      <div className="pnl-hdr">
        <h3>Git Blame</h3>
        <span className="fp">{displayFilePath}</span>
        {loading && <span style={{ fontSize: 10, color: 'var(--c-text-faint)' }}><span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span></span>}
        <div className="auth-chips">
          {authors.map(a => (
            <button key={a.name} className={`auth-chip${offAuthors.has(a.name) ? ' offed' : ''}`}
              title={a.name} onClick={() => toggleAuthor(a.name)}
              style={{ color: a.color, background: a.color + '18', borderColor: a.color + '44' }}>
              {a.name.slice(0, 2).toUpperCase()}<span className="ct">{a.count}</span>
            </button>
          ))}
        </div>
      </div>

      {!loading && blocks.length === 0 ? (
        <div className="code-scroll">
          <div style={{ padding: '24px 16px', fontSize: 12, color: 'var(--c-text-faint)' }}>
            {filePath ? `${displayFilePath}의 blame 정보가 없어요` : '파일을 선택하면 blame을 볼 수 있어요'}
          </div>
        </div>
      ) : (
        <div className="code-scroll">
          {blocks.map((b, bi) => {
            const dim = offAuthors.has(b.author)
            const sel = selHash === b.hash
            return (
              <div key={bi} className={`blame-block${sel ? ' sel' : ''}${dim ? ' dimmed' : ''}`} onClick={() => clickBlock(b.hash)}>
                <span className={`age age-${b.age}`} title={AGE_LBL[b.age]} />
                <div className="blame-gutter">
                  <div className="bg-top">
                    <span className="blame-av" style={{ background: b.ac + '22', color: b.ac, borderColor: b.ac + '44' }}>{b.author.slice(0, 2).toUpperCase()}</span>
                    <span className="blame-hash">{b.hash}</span>
                    <span className="blame-time">{b.timeAgo}</span>
                  </div>
                  {b.summary && <div className="bg-msg">{b.summary}</div>}
                </div>
                <div className="blame-lines">
                  {b.lines.map((l, i) => (
                    <div key={i} className="cl"><span className="lnum">{b.startLine + i}</span><span className="ctext"><HL s={l} /></span></div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="age-legend">
        <span>줄 나이</span>
        <span className="sw age-0" />오늘
        <span className="sw age-1" />이번 주
        <span className="sw age-2" />이번 달
        <span className="sw age-3" />오래됨
        <span style={{ marginLeft: 'auto' }}>블록을 누르면 같은 커밋 줄이 함께 강조돼요</span>
      </div>
    </div>
  )
}
