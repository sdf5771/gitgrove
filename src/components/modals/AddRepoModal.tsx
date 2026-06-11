import { useState } from 'react'
import { RECENT_REPOS, type Repo } from '../../data/mockData'
import { ModalShell, SuccessState } from './ModalShell'

interface Props {
  onClose: () => void
  onAdd: (r: Repo) => void
  onOpenPath?: (path: string) => void
  recentPaths?: Array<{ name: string; path: string }>
}

export function AddRepoModal({ onClose, onAdd, onOpenPath, recentPaths }: Props) {
  const [tab, setTab] = useState<'local' | 'clone'>('local')
  const [localPath, setLocalPath] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloneDest, setCloneDest] = useState('~/dev/')
  const [cloneShallow, setCloneShallow] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [isDone, setIsDone] = useState(false)

  const openLocal = (path: string) => {
    if (!path) return
    const name = path.split('/').pop() || 'new-project'
    if (onOpenPath) {
      onOpenPath(path)
    } else {
      onAdd({ id: String(Date.now()), name, path, branch: 'main', dirty: false, ahead: 0, behind: 0 })
    }
    onClose()
  }

  const handleBrowse = async () => {
    const picked = await window.gitAPI?.openDialog()
    if (picked) setLocalPath(picked)
  }

  const clone = () => {
    if (!cloneUrl) return
    setCloning(true)
    setTimeout(() => {
      setCloning(false); setIsDone(true)
      const name = cloneUrl.split('/').pop()?.replace('.git', '') || 'repo'
      onAdd({ id: String(Date.now()), name, path: cloneDest + name, branch: 'main', dirty: false, ahead: 0, behind: 0 })
      setTimeout(() => onClose(), 1200)
    }, 1800)
  }

  const icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold-300)" strokeWidth="2.2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>

  return (
    <ModalShell title="Add Repository" width={460} onClose={onClose} icon={icon}>
      <div className="btabs">
        <button className={`btab${tab === 'local' ? ' on' : ''}`} onClick={() => setTab('local')}>Open Local</button>
        <button className={`btab${tab === 'clone' ? ' on' : ''}`} onClick={() => setTab('clone')}>Clone Remote</button>
      </div>
      {tab === 'local' && (
        <div className="modal-body">
          <div className="mfield">
            <label>Repository path</label>
            <div className="repo-browse-row">
              <input className="mselect" style={{ flex: 1 }} placeholder="~/dev/my-project" value={localPath} onChange={e => setLocalPath(e.target.value)} />
              <button className="repo-browse-btn" onClick={handleBrowse}>Browse…</button>
            </div>
          </div>
          <div className="mfield">
            <label>Recent repositories</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(recentPaths && recentPaths.length > 0
                ? recentPaths.map(r => ({ name: r.name, path: r.path, lastOpened: '' }))
                : RECENT_REPOS
              ).map(r => (
                <div key={r.path} className="repo-recent" onClick={() => openLocal(r.path)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold-300)" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                  <div className="repo-recent-info">
                    <div className="repo-recent-name">{r.name}</div>
                    <div className="repo-recent-path">{r.path}</div>
                  </div>
                  {'lastOpened' in r && r.lastOpened && <span style={{ fontSize: 10, color: 'var(--c-text-faint)', flexShrink: 0 }}>{r.lastOpened}</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="modal-footer" style={{ padding: 0, background: 'none', border: 'none', marginTop: 4 }}>
            <button className="mbtn-cancel" onClick={onClose}>Cancel</button>
            <button className="mbtn-ok" onClick={() => openLocal(localPath)} disabled={!localPath}>Open Repository →</button>
          </div>
        </div>
      )}
      {tab === 'clone' && (
        <div className="modal-body">
          {isDone ? <SuccessState msg="Repository cloned" sub="Opened in a new tab" /> : (
            <>
              <div className="mfield">
                <label>Repository URL</label>
                <input className="mselect" placeholder="git@github.com:user/repo.git" value={cloneUrl} onChange={e => setCloneUrl(e.target.value)} />
              </div>
              <div className="mfield">
                <label>Destination</label>
                <div className="repo-browse-row">
                  <input className="mselect" style={{ flex: 1 }} value={cloneDest} onChange={e => setCloneDest(e.target.value)} />
                  <button className="repo-browse-btn">Browse…</button>
                </div>
              </div>
              <div className="repo-clone-opt" onClick={() => setCloneShallow(v => !v)} style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={cloneShallow} readOnly style={{ pointerEvents: 'none', accentColor: 'var(--c-gold-400)' }} />
                <span>Shallow clone (depth 1) — faster for large repos</span>
              </div>
              <div className="modal-footer" style={{ padding: 0, background: 'none', border: 'none', marginTop: 4 }}>
                <button className="mbtn-cancel" onClick={onClose}>Cancel</button>
                <button className={`mbtn-ok${cloning ? ' doing' : ''}`} onClick={clone} disabled={!cloneUrl || cloning}>
                  {cloning ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>Cloning…</span> : 'Clone →'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </ModalShell>
  )
}
