import { useState, useMemo, useEffect } from 'react'
import { type Commit } from '../data/mockData'
import { HL } from '../utils/syntaxHighlight'
import { sideBySide } from '../utils/sideBySide'

interface Props {
  commit?: Commit | null
  repoPath?: string | null
  commitFiles?: GitFileEntry[]
}

const getFilePath = (f: unknown): string => {
  const e = f as Record<string, unknown>
  return (e.path as string) ?? (e.p as string) ?? ''
}
const getFileStatus = (f: unknown): string => {
  const e = f as Record<string, unknown>
  return (e.status as string) ?? (e.s as string) ?? 'M'
}
const getFileAdd = (f: unknown): number => {
  const e = f as Record<string, unknown>
  return (e.additions as number) ?? (e.a as number) ?? 0
}
const getFileDel = (f: unknown): number => {
  const e = f as Record<string, unknown>
  return (e.deletions as number) ?? (e.d as number) ?? 0
}

export function DiffExplorer({ commit, repoPath, commitFiles }: Props) {
  // When the user navigates directly to the Diff tab without first clicking a commit
  // in History (which populates commitFiles in App), fetch the file list internally.
  const [localFiles, setLocalFiles] = useState<GitFileEntry[]>([])

  useEffect(() => {
    if (!repoPath || !commit) { setLocalFiles([]); return }
    if (commitFiles && commitFiles.length > 0) { setLocalFiles([]); return }
    window.gitAPI?.getFiles(repoPath, commit.id)
      .then(f => setLocalFiles(f ?? []))
      .catch(() => setLocalFiles([]))
  }, [commit, repoPath, commitFiles])

  const files: unknown[] =
    (commitFiles && commitFiles.length > 0)
      ? commitFiles
      : localFiles.length > 0
        ? localFiles
        : commit
          ? commit.files
          : []

  const firstPath = files.length > 0 ? getFilePath(files[0]) : ''
  const [selFile, setSelFile] = useState(firstPath)
  const [rawDiff, setRawDiff] = useState<string>('')
  const [loadingDiff, setLoadingDiff] = useState(false)

  useEffect(() => {
    setSelFile(files.length > 0 ? getFilePath(files[0]) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, commitFiles, localFiles])

  useEffect(() => {
    if (!selFile) { setRawDiff(''); return }

    if (repoPath && commit) {
      setLoadingDiff(true)
      window.gitAPI?.getCommitFileDiff(repoPath, commit.id, selFile)
        .then(raw => setRawDiff(raw ?? ''))
        .catch(() => setRawDiff(''))
        .finally(() => setLoadingDiff(false))
      return
    }

    if (repoPath) {
      setLoadingDiff(true)
      window.gitAPI?.getDiff(repoPath, selFile)
        .then(raw => setRawDiff(raw ?? ''))
        .catch(() => setRawDiff(''))
        .finally(() => setLoadingDiff(false))
      return
    }

    setRawDiff('')
  }, [selFile, repoPath, commit])

  const rows = useMemo(() => {
    if (!rawDiff) return []
    const lines = rawDiff.split('\n')
      .filter(l => !l.startsWith('diff ') && !l.startsWith('index ') && !l.startsWith('--- ') && !l.startsWith('+++ '))
      .map(l => {
        if (l.startsWith('@@')) return { t: 'hunk' as const, s: l }
        if (l.startsWith('+')) return { t: 'add' as const, s: l }
        if (l.startsWith('-')) return { t: 'del' as const, s: l }
        return { t: 'ctx' as const, s: l }
      })
    return sideBySide(lines)
  }, [rawDiff])

  const addCount = rows.filter(r => r.t === 'pair' && r.R !== null).length
  const delCount = rows.filter(r => r.t === 'pair' && r.L !== null).length

  return (
    <div className="dex-wrap">
      <div className="dex-files">
        <div className="pnl-hdr">
          <h3>Files Changed</h3>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--c-text-faint)', fontFamily: 'var(--font-mono)' }}>{files.length}f</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {files.map((f, i) => {
            const fp = getFilePath(f)
            const fs = getFileStatus(f)
            const fa = getFileAdd(f)
            const fd = getFileDel(f)
            return (
              <div key={fp || i} className={`dex-fitem${selFile === fp ? ' on' : ''}`} onClick={() => setSelFile(fp)}>
                <span className={`fst fst-${fs}`}>{fs}</span>
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selFile === fp ? 'var(--c-text-strong)' : 'var(--c-text)' }}>{fp.split('/').pop()}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, display: 'flex', gap: 3 }}><span className="fadd">+{fa}</span><span className="fdel">−{fd}</span></span>
              </div>
            )
          })}
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
