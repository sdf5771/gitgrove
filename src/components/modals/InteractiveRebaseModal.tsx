import { useState } from 'react'
import { COMMITS, type Commit } from '../../data/mockData'
import { ModalShell, SuccessState } from './ModalShell'

type Action = 'pick' | 'squash' | 'fixup' | 'edit' | 'drop'

interface Props {
  onClose: () => void
  onSuccess?: () => void
  repoPath?: string | null
  commits?: Commit[]
  currentBranch?: string
}

export function InteractiveRebaseModal({ onClose, onSuccess, repoPath, commits, currentBranch }: Props) {
  const ACTIONS: Action[] = ['pick', 'squash', 'fixup', 'edit', 'drop']
  const sourceCommits = (commits ?? COMMITS).filter(c => c.lane === 0).slice(0, 6)
  const baseHash = (commits ?? COMMITS).filter(c => c.lane === 0)[6]?.id ?? 'unknown'

  const [items, setItems] = useState(() =>
    sourceCommits.map(c => ({ ...c, action: 'pick' as Action }))
  )
  const [doing, setDoing] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [error, setError] = useState('')

  const cycleAction = (id: string) =>
    setItems(p => p.map(c => c.id === id ? { ...c, action: ACTIONS[(ACTIONS.indexOf(c.action) + 1) % ACTIONS.length] } : c))

  const move = (i: number, dir: number) => {
    const ni = i + dir
    if (ni < 0 || ni >= items.length) return
    setItems(p => { const a = [...p]; [a[i], a[ni]] = [a[ni], a[i]]; return a })
  }

  const execute = async () => {
    setError('')
    setDoing(true)
    try {
      if (repoPath) {
        await window.gitAPI!.rebaseInteractive(
          repoPath,
          items.map(c => ({ hash: c.id, action: c.action, msg: c.msg }))
        )
      } else {
        await new Promise(r => setTimeout(r, 1600))
      }
      setIsDone(true)
      onSuccess?.()
      setTimeout(() => onClose(), 2400)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDoing(false)
    }
  }

  const pickCount = items.filter(c => c.action === 'pick').length
  const dropCount = items.filter(c => c.action === 'drop').length
  const branch = currentBranch ?? 'current'

  const icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold-300)" strokeWidth="2.2"><polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>

  return (
    <ModalShell title="Interactive Rebase" width={560} onClose={onClose} icon={icon}>
      {isDone ? <SuccessState msg="Rebase complete" sub={`${pickCount} commits applied, ${dropCount} dropped`} /> : (
        <>
          <div style={{ padding: '10px 16px 6px', fontSize: 11, color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-divider)' }}>
            Rebasing last {items.length} commits on <strong style={{ color: 'var(--c-gold-300)', fontFamily: 'var(--font-mono)' }}>{branch}</strong> · click action badge to cycle · ↑↓ to reorder
          </div>
          <div className="modal-body" style={{ padding: '10px 12px' }}>
            {error && (
              <div style={{ marginBottom: 10, padding: '8px 12px', background: 'rgba(255,107,107,.1)', border: '1px solid rgba(255,107,107,.35)', borderRadius: 'var(--r2)', fontSize: 11, color: 'var(--c-danger)' }}>
                {error}
              </div>
            )}
            <div className="reb-wrap">
              {items.map((c, i) => (
                <div key={c.id} className="reb-row" style={{ opacity: c.action === 'drop' ? .45 : 1, textDecoration: c.action === 'drop' ? 'line-through' : undefined }}>
                  <span className="reb-drag">⠿</span>
                  <span className={`reb-action reb-${c.action}`} onClick={() => cycleAction(c.id)}>{c.action}</span>
                  <span className="reb-hash">{c.id}</span>
                  <span className="reb-msg">{c.msg}</span>
                  <div className="reb-arrows">
                    <button className="reb-arrow" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
                    <button className="reb-arrow" onClick={() => move(i, 1)} disabled={i === items.length - 1}>▼</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, padding: '7px 10px', background: 'var(--c-bg-inset)', border: '1px solid var(--c-divider)', borderRadius: 'var(--r2)', fontSize: 11, color: 'var(--c-text-muted)', display: 'flex', gap: 10 }}>
              <span>Base: <strong style={{ color: 'var(--c-text)', fontFamily: 'var(--font-mono)' }}>{baseHash}</strong></span>
              <span>·</span><span><strong style={{ color: 'var(--c-info)' }}>{pickCount}</strong> pick</span>
              <span>·</span><span><strong style={{ color: 'var(--c-danger)' }}>{dropCount}</strong> drop</span>
              <span>·</span><span><strong style={{ color: 'var(--c-warning)' }}>{items.filter(c => c.action === 'squash').length}</strong> squash</span>
            </div>
          </div>
          <div className="modal-footer">
            <button className="mbtn-cancel" onClick={onClose}>Cancel</button>
            <button className={`mbtn-ok${doing ? ' doing' : ''}`} onClick={execute} disabled={doing}>
              {doing ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>Rebasing…</span> : 'Start Rebase →'}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  )
}
