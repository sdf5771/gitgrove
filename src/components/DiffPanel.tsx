import { DIFF, type FileEntry } from '../data/mockData'
import { HL } from '../utils/syntaxHighlight'

export function DiffPanel({ file }: { file: FileEntry | null }) {
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
        <div className="dhunk">{DIFF[0].s}</div>
        {DIFF.slice(1).map((line, i) => {
          if (line.t === 'hunk') return <div key={i} className="dhunk">{line.s}</div>
          return (
            <div key={i} className={`dline ${line.t === 'add' ? 'dadd' : line.t === 'del' ? 'ddel' : ''}`}>
              <span className="dnum">{i + 18}</span>
              <span className="dtxt"><HL s={line.s} /></span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
