import { useState } from 'react'
import { PR_DATA } from '../data/mockData'
import { FilePath } from './FilePath'

export function PRView({ onOpenConflict }: { onOpenConflict?: () => void }) {
  const [filter, setFilter] = useState<'open' | 'merged' | 'all'>('open')
  const [selId, setSelId] = useState(42)
  const [dtab, setDtab] = useState<'overview' | 'files' | 'comments' | 'checks'>('overview')
  const [approved, setApproved] = useState(false)
  const [requested, setRequested] = useState(false)

  const filtered = PR_DATA.filter(p => filter === 'all' || p.status === filter || (filter === 'open' && p.status === 'open'))
  const sel = PR_DATA.find(p => p.id === selId) || PR_DATA[0]

  const statusIcon = { pass: '✓', fail: '✗', pend: '…' } as const
  const statusCls = { pass: 'pass', fail: 'fail', pend: 'pend' } as const

  return (
    <div className="pr-wrap">
      <div className="pr-list-pane">
        <div className="pr-filters">
          {(['open', 'merged', 'all'] as const).map(f => (
            <button key={f} className={`pr-filter${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'open' && <span style={{ marginLeft: 4, fontFamily: 'var(--font-mono)', fontSize: 9 }}>({PR_DATA.filter(p => p.status === 'open').length})</span>}
            </button>
          ))}
        </div>
        <div className="pr-list-scroll">
          {filtered.map(pr => (
            <div key={pr.id} className={`pr-item${pr.id === selId ? ' on' : ''}`} onClick={() => { setSelId(pr.id); setDtab('overview'); setApproved(false); setRequested(false) }}>
              <div className="pr-item-hd">
                <span className={`pr-status pr-${pr.status}`}>{pr.status}</span>
                <span className="pr-num">#{pr.id}</span>
                {pr.labels.map(l => <span key={l} className="pr-label">{l}</span>)}
              </div>
              <div className="pr-title">{pr.title}</div>
              <div className="pr-meta">
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: pr.ac + '22', border: `1px solid ${pr.ac}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontFamily: 'var(--font-display)', color: pr.ac, flexShrink: 0 }}>{pr.initials}</div>
                <span>{pr.author}</span><span>·</span><span>{pr.created}</span>
                {pr.comments > 0 && <><span>·</span><span>💬 {pr.comments}</span></>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="pr-empty" style={{ height: 120 }}><span style={{ fontSize: 24 }}>🔍</span><span>No {filter} pull requests</span></div>}
        </div>
      </div>
      <div className="pr-detail-pane">
        {sel ? (
          <>
            <div className="pr-detail-hdr">
              <div className="pr-detail-title">{sel.title}</div>
              <div className="pr-detail-meta">
                <span className={`pr-status pr-${sel.status}`}>{sel.status}</span>
                <div className="pr-branch-arrow">
                  <span className="pr-branch-pill pr-from-pill">{sel.from}</span>
                  <span>→</span>
                  <span className="pr-branch-pill pr-to-pill">{sel.to}</span>
                </div>
                <span style={{ color: 'var(--c-text-faint)' }}>by <strong style={{ color: 'var(--c-text)' }}>{sel.author}</strong> · {sel.created}</span>
                <span style={{ color: 'var(--c-success)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>+{sel.additions}</span>
                <span style={{ color: 'var(--c-danger)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>−{sel.deletions}</span>
              </div>
            </div>
            <div className="pr-dtabs">
              {([['overview', 'Overview'], ['files', `Files (${sel.files.length})`], ['comments', `Comments (${sel.threads.length})`], ['checks', 'Checks']] as const).map(([id, label]) => (
                <button key={id} className={`pr-dtab${dtab === id ? ' on' : ''}`} onClick={() => setDtab(id)}>{label}</button>
              ))}
            </div>
            <div className="pr-body">
              {dtab === 'overview' && (
                <>
                  <div style={{ fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--c-text-faint)', fontFamily: 'var(--font-display)' }}>Description</div>
                  <div className="pr-desc">{sel.body}</div>
                  <div className="divl" />
                  <div style={{ fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--c-text-faint)', fontFamily: 'var(--font-display)' }}>Reviewers</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {sel.reviewers.map((r, i) => (
                      <div key={i} className="pr-reviewer-row">
                        <div className="pr-rv-av" style={{ background: r.ac + '22', color: r.ac, border: `1px solid ${r.ac}44` }}>{r.i}</div>
                        <span style={{ fontSize: 12, color: 'var(--c-text)', flex: 1 }}>{r.i === 'SK' ? 'Sarah Kim' : r.i === 'AC' ? 'Alex Chen' : r.i === 'ML' ? 'Mike Lee' : 'Liu Yang'}</span>
                        <span className="pr-rv-status" style={{ color: r.status === 'approved' ? 'var(--c-success)' : 'var(--c-text-faint)' }}>{r.status === 'approved' ? '✓ Approved' : '⏳ Pending'}</span>
                      </div>
                    ))}
                  </div>
                  {sel.status === 'open' && sel.checks.some(c => c.s === 'fail') && (
                    <div style={{ padding: '8px 12px', background: 'rgba(255,107,107,.08)', border: '1px solid rgba(255,107,107,.3)', borderRadius: 'var(--r2)', fontSize: 12, color: 'var(--c-danger)', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span>⚡</span>
                      <span>Some checks failed. <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-gold-300)', fontSize: 12, padding: 0, textDecoration: 'underline' }} onClick={onOpenConflict}>Resolve conflicts</button></span>
                    </div>
                  )}
                </>
              )}
              {dtab === 'files' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {sel.files.map(f => (
                    <div key={f.p} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', background: 'var(--c-bg-elevated)', border: '1px solid var(--c-border)', borderRadius: 'var(--r2)', cursor: 'pointer', transition: 'border-color 80ms' }}>
                      <span className={`fst fst-${f.s}`}>{f.s}</span>
                      <FilePath path={f.p} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--c-success)', flexShrink: 0 }}>+{f.a}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--c-danger)', flexShrink: 0 }}>−{f.d}</span>
                    </div>
                  ))}
                </div>
              )}
              {dtab === 'comments' && (
                sel.threads.length === 0
                  ? <div className="pr-empty" style={{ height: 120 }}><span style={{ fontSize: 22 }}>💬</span><span>No comments yet</span></div>
                  : sel.threads.map(t => (
                    <div key={t.id} className="pr-comment">
                      <div className="pr-comment-hd">
                        <div className="pr-comment-av" style={{ background: t.ac + '22', color: t.ac, border: `1px solid ${t.ac}44` }}>{t.i}</div>
                        <span style={{ fontSize: 12, color: 'var(--c-text-strong)', fontWeight: 600 }}>{t.author}</span>
                        <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{t.time}</span>
                        {t.file && <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-info)' }}>{t.file.split('/').pop()}:{t.line}</span>}
                      </div>
                      <div className="pr-comment-body">{t.body}</div>
                    </div>
                  ))
              )}
              {dtab === 'checks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sel.checks.map((c, i) => (
                    <div key={i} className="pr-check">
                      <div className={`pr-check-dot ${statusCls[c.s]}`}>{statusIcon[c.s]}</div>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--c-text)' }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: c.s === 'pass' ? 'var(--c-success)' : c.s === 'fail' ? 'var(--c-danger)' : 'var(--c-warning)', fontFamily: 'var(--font-mono)' }}>{c.s === 'pass' ? 'Passed' : c.s === 'fail' ? 'Failed' : 'Running'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {sel.status === 'open' && (
              <div className="pr-approve-row">
                <button className="pr-request-btn" onClick={() => { setRequested(true); setApproved(false) }}
                  style={requested ? { background: 'rgba(255,107,107,.25)' } : {}}>
                  {requested ? '✓ Changes Requested' : 'Request Changes'}
                </button>
                <button className="pr-approve-btn" onClick={() => { setApproved(true); setRequested(false) }}
                  style={approved ? { filter: 'brightness(1.1)' } : {}}>
                  {approved ? '✓ Approved' : 'Approve'}
                </button>
              </div>
            )}
          </>
        ) : <div className="pr-empty"><span style={{ fontSize: 28 }}>📋</span><span>Select a pull request</span></div>}
      </div>
    </div>
  )
}
