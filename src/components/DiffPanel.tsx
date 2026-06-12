import type { FileEntry, DiffLine } from '../data/mockData'
import { HL } from '../utils/syntaxHighlight'

interface Props {
  file: FileEntry | null
  rawDiff?: string
  loading?: boolean
}

interface DiffLineWithNums extends DiffLine {
  oldNum?: number
  newNum?: number
}

function parseUnifiedDiff(raw: string): DiffLineWithNums[] {
  const result: DiffLineWithNums[] = []
  let oldNum = 0
  let newNum = 0

  for (const line of raw.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') || line.startsWith('index ')) continue
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/)
      if (m) { oldNum = parseInt(m[1]) - 1; newNum = parseInt(m[2]) - 1 }
      result.push({ t: 'hunk', s: line })
    } else if (line.startsWith('+')) {
      newNum++
      result.push({ t: 'add', s: line, newNum })
    } else if (line.startsWith('-')) {
      oldNum++
      result.push({ t: 'del', s: line, oldNum })
    } else {
      oldNum++; newNum++
      result.push({ t: 'ctx', s: line, oldNum, newNum })
    }
  }
  return result
}

export function DiffPanel({ file, rawDiff, loading }: Props) {
  if (!file && rawDiff === undefined && !loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <div className="pnl-hdr"><h3>Diff</h3></div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-faint)', fontSize: 12 }}>
          파일을 선택하세요
        </div>
      </div>
    )
  }

  const lines: DiffLineWithNums[] = rawDiff !== undefined && rawDiff.length > 0
    ? parseUnifiedDiff(rawDiff)
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="pnl-hdr"><h3>Diff</h3></div>
      <div className="diff-wrap">
        <div className="diff-fhdr">
          <span className="dfn">{file?.p ?? ''}</span>
          {file && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <span style={{ color: 'var(--c-success)' }}>+{file.a}</span>
              &nbsp;<span style={{ color: 'var(--c-danger)' }}>−{file.d}</span>
            </span>
          )}
        </div>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0', color: 'var(--c-text-faint)', fontSize: 13 }}>
            <span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite', marginRight: 8 }}>⟳</span>
            Loading diff…
          </div>
        ) : lines.length === 0 ? (
          <div style={{ padding: '24px', color: 'var(--c-text-faint)', fontSize: 12, textAlign: 'center' }}>
            {rawDiff !== undefined ? 'diff 없음' : '파일을 선택하세요'}
          </div>
        ) : (
          <>
            {lines.map((line, i) => {
              if (line.t === 'hunk') return <div key={i} className="dhunk">{line.s}</div>
              const num = line.newNum ?? line.oldNum ?? ''
              return (
                <div key={i} className={`dline ${line.t === 'add' ? 'dadd' : line.t === 'del' ? 'ddel' : ''}`}>
                  <span className="dnum">{num}</span>
                  <span className="dtxt"><HL s={line.s} /></span>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
