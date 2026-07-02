import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { type Commit } from '../data/mockData'
import { HL } from '../utils/syntaxHighlight'
import { sideBySide, type SbsRow } from '../utils/sideBySide'
import { wordDiff } from '../utils/wordDiff'

interface Props {
  commit?: Commit | null
  repoPath?: string | null
  commitFiles?: GitFileEntry[]
}

const getFilePath = (f: unknown): string => { const e = f as Record<string, unknown>; return (e.path as string) ?? (e.p as string) ?? '' }
const getFileStatus = (f: unknown): string => { const e = f as Record<string, unknown>; return (e.status as string) ?? (e.s as string) ?? 'M' }
const getFileAdd = (f: unknown): number => { const e = f as Record<string, unknown>; return (e.additions as number) ?? (e.a as number) ?? 0 }
const getFileDel = (f: unknown): number => { const e = f as Record<string, unknown>; return (e.deletions as number) ?? (e.d as number) ?? 0 }

function splitPath(p: string): { dir: string; base: string } {
  const i = p.lastIndexOf('/')
  return i < 0 ? { dir: '', base: p } : { dir: p.slice(0, i + 1), base: p.slice(i + 1) }
}

// 파일별 변경 비율 미니 바(최대 5칸, 추가:삭제 비율).
function changeBars(a: number, d: number): Array<'a' | 'd'> {
  const tot = Math.min(5, Math.max(1, Math.round((a + d) / 12)))
  const an = Math.round(tot * a / (a + d || 1))
  return Array.from({ length: tot }, (_, i) => (i < an ? 'a' : 'd'))
}

// 수정 페어(삭제↔추가)의 문자 단위 하이라이트. 아니면 원문(구문 하이라이트 없이).
function wordSide(self: string, other: string | null, kind: 'del' | 'add'): ReactNode {
  if (other == null) return self || ' '
  // self가 첫 인자이므로 self의 세그먼트는 항상 a. 클래스만 kind로 가른다.
  const { a } = wordDiff(self, other)
  const cls = kind === 'del' ? 'wdel' : 'wadd'
  return a.map((s, i) => s.changed ? <span key={i} className={cls}>{s.text}</span> : <span key={i}>{s.text}</span>)
}

export function DiffExplorer({ commit, repoPath, commitFiles }: Props) {
  const [localFiles, setLocalFiles] = useState<GitFileEntry[]>([])
  const [mode, setMode] = useState<'unified' | 'split'>('unified')

  useEffect(() => {
    if (!repoPath || !commit) { setLocalFiles([]); return }
    if (commitFiles && commitFiles.length > 0) { setLocalFiles([]); return }
    window.gitAPI?.getFiles(repoPath, commit.id).then(f => setLocalFiles(f ?? [])).catch(() => setLocalFiles([]))
  }, [commit, repoPath, commitFiles])

  const files: unknown[] =
    (commitFiles && commitFiles.length > 0) ? commitFiles
      : localFiles.length > 0 ? localFiles
        : commit ? commit.files : []

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
      window.gitAPI?.getCommitFileDiff(repoPath, commit.id, selFile).then(raw => setRawDiff(raw ?? '')).catch(() => setRawDiff('')).finally(() => setLoadingDiff(false))
      return
    }
    if (repoPath) {
      setLoadingDiff(true)
      window.gitAPI?.getDiff(repoPath, selFile).then(raw => setRawDiff(raw ?? '')).catch(() => setRawDiff('')).finally(() => setLoadingDiff(false))
      return
    }
    setRawDiff('')
  }, [selFile, repoPath, commit])

  const rows = useMemo<SbsRow[]>(() => {
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

  // hunk 헤더의 함수 컨텍스트("@@ … @@ fn")를 loc/fn으로 분리.
  const splitHunk = (s: string): { loc: string; fn: string } => {
    const m = s.match(/^(@@[^@]*@@)(.*)$/)
    return m ? { loc: m[1].trim(), fn: m[2].trim() } : { loc: s, fn: '' }
  }

  const renderUnified = () => rows.map((row, i) => {
    if (row.t === 'hunk') { const { loc, fn } = splitHunk(row.s ?? ''); return <div key={i} className="hunk-hd">{loc}{fn && <span className="fn">{fn}</span>}</div> }
    if (row.t === 'ctx') {
      return <div key={i} className="cl"><span className="lnum">{row.L?.n}</span><span className="lnum">{row.R?.n}</span><span className="sign" /><span className="ctext"><HL s={row.L?.s ?? ''} /></span></div>
    }
    // pair: L(삭제) 먼저, R(추가) 다음. 둘 다 있으면 수정 페어 → word-diff.
    const out: ReactNode[] = []
    if (row.L) out.push(<div key={`${i}d`} className="cl del"><span className="lnum">{row.L.n}</span><span className="lnum" /><span className="sign">−</span><span className="ctext">{wordSide(row.L.s, row.R?.s ?? null, 'del')}</span></div>)
    if (row.R) out.push(<div key={`${i}a`} className="cl add"><span className="lnum" /><span className="lnum">{row.R.n}</span><span className="sign">+</span><span className="ctext">{wordSide(row.R.s, row.L?.s ?? null, 'add')}</span></div>)
    return out
  })

  // split 모드: hunk 헤더는 전폭, 그 안의 행만 2컬럼으로. hunk 단위 세그먼트로 나눈다.
  const segments = useMemo(() => {
    const segs: Array<{ loc: string; fn: string; rows: SbsRow[] }> = []
    rows.forEach(r => {
      if (r.t === 'hunk') { const { loc, fn } = splitHunk(r.s ?? ''); segs.push({ loc, fn, rows: [] }) }
      else { if (!segs.length) segs.push({ loc: '', fn: '', rows: [] }); segs[segs.length - 1].rows.push(r) }
    })
    return segs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const colCell = (row: SbsRow, side: 'L' | 'R', i: number): ReactNode => {
    const cell = side === 'L' ? row.L : row.R
    if (row.t === 'ctx') return <div key={i} className="cl"><span className="lnum">{cell?.n}</span><span className="ctext"><HL s={cell?.s ?? ''} /></span></div>
    if (!cell) return <div key={i} className="cl" style={{ minHeight: 19, background: 'rgba(0,0,0,.18)' }} />
    const kind = side === 'L' ? 'del' : 'add'
    const other = side === 'L' ? row.R : row.L
    return <div key={i} className={`cl ${kind}`}><span className="lnum">{cell.n}</span><span className="sign">{kind === 'del' ? '−' : '+'}</span><span className="ctext">{wordSide(cell.s, other?.s ?? null, kind)}</span></div>
  }

  const renderSplit = () => segments.map((seg, si) => (
    <div key={si}>
      {(seg.loc || seg.fn) && <div className="hunk-hd">{seg.loc}{seg.fn && <span className="fn">{seg.fn}</span>}</div>}
      <div className="split">
        <div className="col">{seg.rows.map((r, i) => colCell(r, 'L', i))}</div>
        <div className="col">{seg.rows.map((r, i) => colCell(r, 'R', i))}</div>
      </div>
    </div>
  ))

  return (
    <div className="diffx">
      <div className="dx-files">
        <div className="dx-files-hd">변경 파일<span style={{ fontFamily: 'var(--font-mono)' }}>{files.length}</span></div>
        <div className="dx-flist">
          {files.map((f, i) => {
            const fp = getFilePath(f); const fs = getFileStatus(f); const fa = getFileAdd(f); const fd = getFileDel(f)
            const { dir, base } = splitPath(fp)
            return (
              <div key={fp || i} className={`dx-f${selFile === fp ? ' on' : ''}`} onClick={() => setSelFile(fp)}>
                <span className={`fst fst-${fs}`}>{fs}</span>
                <span className="dx-fp">{dir && <span className="dir">{dir}</span>}<span className="base">{base}</span></span>
                <span className="dx-bars">{changeBars(fa, fd).map((k, bi) => <i key={bi} className={k} />)}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="dx-main">
        <div className="dx-hd">
          <span className="fp">{selFile}</span>
          <span className="stats">
            {loadingDiff ? <span style={{ color: 'var(--c-text-faint)' }}>불러오는 중…</span> : <><span className="sa">+{addCount}</span><span className="sd">−{delCount}</span></>}
          </span>
          <div className="dx-mode">
            <button className={mode === 'unified' ? 'on' : ''} onClick={() => setMode('unified')}>통합</button>
            <button className={mode === 'split' ? 'on' : ''} onClick={() => setMode('split')}>나란히</button>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="dx-empty-msg">{loadingDiff ? '불러오는 중…' : '변경 내용이 없어요'}</div>
        ) : mode === 'unified' ? (
          <div className="code-scroll">{renderUnified()}</div>
        ) : (
          <div className="code-scroll">{renderSplit()}</div>
        )}
      </div>
    </div>
  )
}
