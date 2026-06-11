import { useState, useEffect } from 'react'
import { DIFF, type Commit } from '../data/mockData'
import { FilePath } from './FilePath'

interface Props {
  commit: Commit | null
  files?: GitFileEntry[]       // 실제 파일 목록 (IPC로 로드)
  loadingFiles?: boolean       // 파일 로딩 중 여부
  onOpenDiff: () => void
  onCherryPick: () => void
  onBlame: () => void
}

export function CommitDetail({ commit, files, loadingFiles, onOpenDiff, onCherryPick, onBlame }: Props) {
  const [selFile, setSelFile] = useState(0)
  useEffect(() => setSelFile(0), [commit])

  if (!commit) {
    return (
      <div className="empty-state">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Select a commit
      </div>
    )
  }

  // 실제 파일 목록이 있으면 사용, 없으면 mock 데이터 (commit.files) 사용
  const hasRealFiles = files !== undefined
  const fileCount = hasRealFiles ? (files?.length ?? 0) : commit.stats.f

  const btnStyle: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '5px 6px', background: 'var(--c-bg-elevated)', border: '1px solid var(--c-border)', borderRadius: 'var(--r2)', color: 'var(--c-text)', fontSize: 11, fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'border-color 120ms,color 120ms' }

  return (
    <div className="cdetail">
      <div className="cd-hash">{commit.id}…</div>
      <div className="cd-msg">{commit.msg}</div>
      <div className="cd-meta">
        <div className="cd-row"><span className="cd-lbl">Author</span><span className="cd-val">{commit.author}</span></div>
        <div className="cd-row"><span className="cd-lbl">Date</span><span className="cd-val" style={{ color: 'var(--c-text-muted)' }}>{commit.time}</span></div>
        {commit.parents.length >= 2 && (
          <div className="cd-row">
            <span className="cd-lbl">Parents</span>
            <span className="cd-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {commit.parents.join(', ')}
            </span>
          </div>
        )}
      </div>
      <div className="divl" />
      <div>
        <div className="flhdr">
          <span>Changes · {fileCount}f</span>
          <span><span className="fadd">+{commit.stats.a}</span>&nbsp;<span className="fdel">−{commit.stats.d}</span></span>
        </div>
        {loadingFiles ? (
          <div style={{ color: 'var(--c-text-faint)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
            <span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>
          </div>
        ) : hasRealFiles ? (
          <div className="fl">
            {(files ?? []).map((f, i) => (
              <div key={f.path} className={`fi${i === selFile ? ' sel' : ''}`} onClick={() => setSelFile(i)}>
                <span className={`fst fst-${f.status}`}>{f.status}</span>
                <FilePath path={f.path} />
                <span className="fstats">
                  <span className="fadd">+{f.additions}</span>
                  <span className="fdel">−{f.deletions}</span>
                </span>
              </div>
            ))}
            {(files?.length ?? 0) === 0 && !loadingFiles && (
              <div style={{ color: 'var(--c-text-faint)', fontSize: 11, padding: '8px 0' }}>파일 없음</div>
            )}
          </div>
        ) : (
          <div className="fl">
            {commit.files.map((f, i) => (
              <div key={f.p} className={`fi${i === selFile ? ' sel' : ''}`} onClick={() => setSelFile(i)}>
                <span className={`fst fst-${f.s}`}>{f.s}</span>
                <FilePath path={f.p} />
                <span className="fstats"><span className="fadd">+{f.a}</span><span className="fdel">−{f.d}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="divl" />
      <div style={{ display: 'flex', gap: 5 }}>
        <button style={btnStyle} onClick={onOpenDiff}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>Diff
        </button>
        <button style={btnStyle} onClick={onCherryPick}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>Cherry-pick
        </button>
        <button style={btnStyle} onClick={onBlame}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>Blame
        </button>
      </div>
      <div style={{ background: 'var(--c-bg-inset)', borderRadius: 'var(--r2)', overflow: 'hidden', border: '1px solid var(--c-border)' }}>
        <div style={{ padding: '5px 10px', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-info)', borderBottom: '1px solid var(--c-divider)' }}>@@ −18,8 +18,16 @@</div>
        {DIFF.slice(1, 9).map((line, i) => {
          if (line.t === 'hunk') return null
          return <div key={i} className={`dline ${line.t === 'add' ? 'dadd' : line.t === 'del' ? 'ddel' : ''}`} style={{ lineHeight: '18px', padding: '0 10px', fontSize: 11 }}><span className="dtxt">{line.s}</span></div>
        })}
      </div>
    </div>
  )
}
