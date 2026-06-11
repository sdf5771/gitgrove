import { useState, useMemo, useEffect } from 'react'
import { COMMITS, DIFF_FULL, type Commit } from '../data/mockData'
import { HL } from '../utils/syntaxHighlight'
import { sideBySide } from '../utils/sideBySide'

interface Props {
  commit?: Commit | null
  repoPath?: string | null
}

export function DiffExplorer({ commit, repoPath }: Props) {
  const files = commit ? commit.files : COMMITS[0].files
  const [selFile, setSelFile] = useState(files[0]?.p || 'src/auth/jwt.ts')
  const [rawDiff, setRawDiff] = useState<string>('')
  const [loadingDiff, setLoadingDiff] = useState(false)

  useEffect(() => {
    setSelFile(files[0]?.p || 'src/auth/jwt.ts')
  }, [commit])

  useEffect(() => {
    if (!selFile || !repoPath) {
      setRawDiff('')
      return
    }
    setLoadingDiff(true)
    window.gitAPI?.getDiff(repoPath, selFile)
      .then(raw => setRawDiff(raw ?? ''))
      .catch(() => setRawDiff(''))
      .finally(() => setLoadingDiff(false))
  }, [selFile, repoPath])

  const rows = useMemo(() => {
    if (!rawDiff) {
      // fallback: mock 데이터
      const mockData = DIFF_FULL[selFile] || Object.values(DIFF_FULL)[0]
      return mockData ? sideBySide(mockData.lines) : []
    }
    const lines = rawDiff.split('\n')
      .filter(l => !l.startsWith('diff ') && !l.startsWith('index ') && !l.startsWith('--- ') && !l.startsWith('+++ '))
      .map(l => {
        if (l.startsWith('@@')) return { t: 'hunk' as const, s: l }
        if (l.startsWith('+')) return { t: 'add' as const, s: l }
        if (l.startsWith('-')) return { t: 'del' as const, s: l }
        return { t: 'ctx' as const, s: l }
      })
    return sideBySide(lines)
  }, [rawDiff, selFile])

  // diff stats 계산
  const addCount = rawDiff
    ? rows.filter(r => r.t === 'pair' && r.R !== null).length
    : (DIFF_FULL[selFile] || Object.values(DIFF_FULL)[0])?.a ?? 0
  const delCount = rawDiff
    ? rows.filter(r => r.t === 'pair' && r.L !== null).length
    : (DIFF_FULL[selFile] || Object.values(DIFF_FULL)[0])?.d ?? 0

  return (
    <div className="dex-wrap">
      <div className="dex-files">
        <div className="pnl-hdr">
          <h3>Files Changed</h3>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--c-text-faint)', fontFamily: 'var(--font-mono)' }}>{files.length}f</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {files.map(f => (
            <div key={f.p} className={`dex-fitem${selFile === f.p ? ' on' : ''}`} onClick={() => setSelFile(f.p)}>
              <span className={`fst fst-${f.s}`}>{f.s}</span>
              <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selFile === f.p ? 'var(--c-text-strong)' : 'var(--c-text)' }}>{f.p.split('/').pop()}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, display: 'flex', gap: 3 }}><span className="fadd">+{f.a}</span><span className="fdel">−{f.d}</span></span>
            </div>
          ))}
        </div>
      </div>
      <div className="dex-main">
        <div className="dex-fhdr">
          <span className="dfn">{selFile}</span>
          <span style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            {loadingDiff
              ? <span style={{ color: 'var(--c-text-faint)' }}>Loading…</span>
              : <>
                  <span style={{ color: 'var(--c-success)' }}>+{addCount}</span>
                  <span style={{ color: 'var(--c-danger)' }}>−{delCount}</span>
                </>
            }
          </span>
        </div>
        <div className="dex-sbs">
          <div className="dex-half">
            <div className="dex-side-hdr">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--c-danger)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              Before
            </div>
            <div className="dex-scroll">
              {rows.map((row, i) => {
                if (row.t === 'hunk') return <div key={i} className="dex-hunk">{row.s}</div>
                if (!row.L) return <div key={i} className="dex-line dex-empty" style={{ height: 21 }} />
                return <div key={i} className={`dex-line${row.t === 'pair' ? ' dex-del' : ''}`}><span className="dex-num">{row.L.n}</span><span className="dex-code"><HL s={row.L.s} /></span></div>
              })}
            </div>
          </div>
          <div className="dex-half">
            <div className="dex-side-hdr">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--c-success)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              After
            </div>
            <div className="dex-scroll">
              {rows.map((row, i) => {
                if (row.t === 'hunk') return <div key={i} className="dex-hunk">{row.s}</div>
                if (!row.R) return <div key={i} className="dex-line dex-empty" style={{ height: 21 }} />
                return <div key={i} className={`dex-line${row.t === 'pair' ? ' dex-add' : ''}`}><span className="dex-num">{row.R.n}</span><span className="dex-code"><HL s={row.R.s} /></span></div>
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
