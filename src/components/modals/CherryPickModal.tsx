import { useState } from 'react'
import type { Commit } from '../../data/mockData'
import { ModalShell, SuccessState } from './ModalShell'

interface Props {
  commit: Commit
  onClose: () => void
  onSuccess?: () => void
  repoPath?: string | null
  currentBranch?: string
}

export function CherryPickModal({ commit, onClose, onSuccess, repoPath, currentBranch }: Props) {
  const [noCommit, setNoCommit] = useState(false)
  const [doing, setDoing] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState('')

  const execute = async () => {
    setError('')
    setDoing(true)
    try {
      if (repoPath) {
        await window.gitAPI!.cherryPick(repoPath, commit.id, noCommit)
      } else {
        await new Promise(r => setTimeout(r, 1200))
        if (commit.parents.length >= 2) { setConflict(true); setDoing(false); return }
      }
      setIsDone(true)
      onSuccess?.()
      setTimeout(() => onClose(), 1800)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.toLowerCase().includes('conflict') || msg.toLowerCase().includes('cherry-pick')) {
        setConflict(true)
      } else {
        setError(msg)
      }
    } finally {
      setDoing(false)
    }
  }

  const branch = currentBranch ?? 'current'
  const icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold-300)" strokeWidth="2.2"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>

  return (
    <ModalShell title="Cherry-pick" width={420} onClose={onClose} icon={icon}>
      {conflict ? (
        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,107,107,.1)', border: '1px solid rgba(255,107,107,.35)', borderRadius: 'var(--r2)' }}>
            <span style={{ fontSize: 18, color: 'var(--c-danger)' }}>⚡</span>
            <div><div style={{ fontSize: 13, color: 'var(--c-danger)', fontWeight: 600 }}>Merge conflict</div><div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 2 }}>1 file needs manual resolution</div></div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="mbtn-cancel" onClick={onClose} style={{ flex: 1 }}>Abort</button>
            <button className="mbtn-ok" onClick={onClose} style={{ flex: 1 }}>Open Conflict Editor</button>
          </div>
        </div>
      ) : isDone ? (
        <SuccessState msg="Cherry-pick applied"
          sub={<>Commit <strong style={{ color: 'var(--c-gold-300)', fontFamily: 'var(--font-mono)' }}>{commit.id}</strong> → {branch}</>} />
      ) : (
        <>
          <div className="modal-body">
            {error && (
              <div style={{ marginBottom: 10, padding: '8px 12px', background: 'rgba(255,107,107,.1)', border: '1px solid rgba(255,107,107,.35)', borderRadius: 'var(--r2)', fontSize: 11, color: 'var(--c-danger)' }}>
                {error}
              </div>
            )}
            <div className="mfield">
              <label>Commit to apply</label>
              <div className="cp-commit-card">
                <div className="cp-hash">{commit.id}…</div>
                <div className="cp-msg">{commit.msg}</div>
                <div className="cp-meta">{commit.author} · {commit.time}</div>
              </div>
            </div>
            <div className="mfield">
              <label>Apply onto</label>
              <div className="mval"><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e6a536', flexShrink: 0, display: 'inline-block' }} />{branch} (current)</div>
            </div>
            <div className="mfield">
              <label>Options</label>
              <div className={`mcheckrow${noCommit ? ' on' : ''}`} onClick={() => setNoCommit(v => !v)}>
                <div className="mcheckbox">{noCommit ? '✓' : ''}</div>
                <div>
                  <div className="mcheck-lbl">Apply without committing</div>
                  <div className="mcheck-sub"><code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>--no-commit</code> — stages changes only</div>
                </div>
              </div>
            </div>
            <div className="minfo" style={{ background: 'rgba(95,184,230,.07)', border: '1px solid rgba(95,184,230,.22)' }}>
              <span style={{ color: 'var(--c-info)', fontSize: 15 }}>ℹ</span>
              <span style={{ fontSize: 11 }}><strong style={{ color: 'var(--c-text-strong)' }}>{commit.stats.f} files</strong> will be applied. Conflicts prompt resolution.</span>
            </div>
          </div>
          <div className="modal-footer">
            <button className="mbtn-cancel" onClick={onClose}>Cancel</button>
            <button className={`mbtn-ok${doing ? ' doing' : ''}`} onClick={execute} disabled={doing}>
              {doing ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>Applying…</span> : 'Apply →'}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  )
}
