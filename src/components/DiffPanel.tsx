import { DIFF, type FileEntry, type DiffLine } from '../data/mockData'
import { HL } from '../utils/syntaxHighlight'

interface Props {
  file: FileEntry | null
  rawDiff?: string    // 실제 raw unified diff 텍스트 (IPC에서 로드)
  loading?: boolean   // diff 로딩 중 여부
}

// raw unified diff 텍스트를 DiffLine 배열로 파싱
function parseUnifiedDiff(raw: string): DiffLine[] {
  return raw.split('\n')
    .filter(line => !line.startsWith('---') && !line.startsWith('+++') && !line.startsWith('diff ') && !line.startsWith('index '))
    .map(line => {
      if (line.startsWith('@@')) return { t: 'hunk' as const, s: line }
      if (line.startsWith('+')) return { t: 'add' as const, s: line }
      if (line.startsWith('-')) return { t: 'del' as const, s: line }
      return { t: 'ctx' as const, s: line }
    })
}

export function DiffPanel({ file, rawDiff, loading }: Props) {
  // rawDiff가 있으면 파싱, 없으면 mock DIFF 사용
  const lines: DiffLine[] = rawDiff !== undefined && rawDiff.length > 0
    ? parseUnifiedDiff(rawDiff)
    : DIFF

  const hunkLine = lines[0]?.t === 'hunk' ? lines[0] : null
  const contentLines = hunkLine ? lines.slice(1) : lines

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="pnl-hdr"><h3>Diff</h3></div>
      <div className="diff-wrap">
        <div className="diff-fhdr">
          <span className="dfn">{file ? file.p : 'src/auth/jwt.ts'}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <span style={{ color: 'var(--c-success)' }}>+{file ? file.a : 31}</span>
            &nbsp;<span style={{ color: 'var(--c-danger)' }}>−{file ? file.d : 6}</span>
          </span>
        </div>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0', color: 'var(--c-text-faint)', fontSize: 13 }}>
            <span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite', marginRight: 8 }}>⟳</span>
            Loading diff…
          </div>
        ) : (
          <>
            {hunkLine && <div className="dhunk">{hunkLine.s}</div>}
            {contentLines.map((line, i) => {
              if (line.t === 'hunk') return <div key={i} className="dhunk">{line.s}</div>
              return (
                <div key={i} className={`dline ${line.t === 'add' ? 'dadd' : line.t === 'del' ? 'ddel' : ''}`}>
                  <span className="dnum">{i + 18}</span>
                  <span className="dtxt"><HL s={line.s} /></span>
                </div>
              )
            })}
            {rawDiff !== undefined && rawDiff.length === 0 && (
              <div style={{ padding: '24px', color: 'var(--c-text-faint)', fontSize: 12, textAlign: 'center' }}>
                diff 없음
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
