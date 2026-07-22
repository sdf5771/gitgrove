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
  // App이 넘기는 컨텍스트 파일(Diff·CommitDetail "blame" 진입 시). 내부 선택의 초기값.
  filePath?: string
  commits?: Commit[]
}

function splitPath(p: string): { dir: string; base: string } {
  const i = p.lastIndexOf('/')
  return i < 0 ? { dir: '', base: p } : { dir: p.slice(0, i + 1), base: p.slice(i + 1) }
}

export function BlameView({ onSelectCommit, repoPath, filePath, commits }: Props) {
  const [blameLines, setBlameLines] = useState<RealBlameLine[]>([])
  const [loading, setLoading] = useState(false)
  const [selHash, setSelHash] = useState<string | null>(null)
  const [offAuthors, setOffAuthors] = useState<Set<string>>(new Set())

  // ── 변경3: 선택 파일을 내부에서 소유 ──
  // 초기값 = App이 넘긴 filePath. 사용자가 좌측 목록에서 고르면 이 state가 바뀌고
  // blame effect가 그 파일로 재조회한다. prop이 나중에 바뀌면(다른 커밋 파일로 진입) 동기화.
  const [selFile, setSelFile] = useState<string | undefined>(filePath)
  const [files, setFiles] = useState<string[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState(false)
  const [fileQuery, setFileQuery] = useState('')

  useEffect(() => { if (filePath) setSelFile(filePath) }, [filePath])

  // ── 추적 파일 목록 로드(git:list-files) ──
  useEffect(() => {
    if (!repoPath) { setFiles([]); setFilesError(false); return }
    setFilesLoading(true)
    setFilesError(false)
    window.gitAPI?.listFiles(repoPath)
      .then(fs => setFiles(fs ?? []))
      .catch(() => { setFiles([]); setFilesError(true) })
      .finally(() => setFilesLoading(false))
  }, [repoPath])

  // ── blame 로드 — 내부 selFile 경유 ──
  useEffect(() => {
    if (!repoPath || !selFile) { setBlameLines([]); return }
    setLoading(true)
    setSelHash(null)
    setOffAuthors(new Set())
    const p = window.gitAPI?.blame(repoPath, selFile) as Promise<RealBlameLine[]> | undefined
    p?.then(lines => setBlameLines(lines ?? []))
      .catch(() => setBlameLines([]))
      .finally(() => setLoading(false))
  }, [repoPath, selFile])

  const filteredFiles = useMemo(() => {
    const q = fileQuery.trim().toLowerCase()
    return q ? files.filter(f => f.toLowerCase().includes(q)) : files
  }, [files, fileQuery])

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

  const displayFilePath = selFile ?? ''

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

      <div className="bf-body">
        <div className="bf-files">
          <div className="bf-files-hd">파일<span style={{ fontFamily: 'var(--font-mono)' }}>{files.length}</span></div>
          <div className="bf-search">
            <input
              value={fileQuery}
              onChange={e => setFileQuery(e.target.value)}
              placeholder="경로로 찾기"
            />
          </div>
          <div className="bf-flist">
            {!repoPath ? (
              <div className="bf-flist-msg">저장소를 열면 파일이 보여요</div>
            ) : filesLoading ? (
              <div className="bf-flist-msg">불러오는 중…</div>
            ) : filesError ? (
              <div className="bf-flist-msg">파일 목록을 불러오지 못했어요</div>
            ) : files.length === 0 ? (
              <div className="bf-flist-msg">추적 중인 파일이 없어요</div>
            ) : filteredFiles.length === 0 ? (
              <div className="bf-flist-msg">찾는 파일이 없어요</div>
            ) : filteredFiles.map(f => {
              const { dir, base } = splitPath(f)
              return (
                <div key={f} className={`bf-f${selFile === f ? ' on' : ''}`} onClick={() => setSelFile(f)} title={f}>
                  <span className="bf-fp">{dir && <span className="dir">{dir}</span>}<span className="base">{base}</span></span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bf-main">
          {!loading && blocks.length === 0 ? (
            <div className="code-scroll">
              <div style={{ padding: '24px 16px', fontSize: 12, color: 'var(--c-text-faint)' }}>
                {!repoPath
                  ? '저장소를 열면 blame을 볼 수 있어요'
                  : selFile
                    ? `${displayFilePath}의 blame 정보가 없어요`
                    : '왼쪽에서 파일을 고르면 blame을 볼 수 있어요'}
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
        </div>
      </div>

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
