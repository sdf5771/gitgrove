import { useState } from 'react'
import { type Repo } from '../../data/mockData'
import { ModalShell } from './ModalShell'

interface Props {
  onClose: () => void
  onAdd: (r: Repo) => void
  onOpenPath?: (path: string) => void
  recentPaths?: Array<{ name: string; path: string }>
  // CL2 — 원격 클론은 전용 3상태 CloneModal로 통합. 여기선 진입만 위임한다.
  onCloneRemote?: () => void
}

export function AddRepoModal({ onClose, onAdd, onOpenPath, recentPaths, onCloneRemote }: Props) {
  const [tab, setTab] = useState<'local' | 'clone'>('local')
  const [localPath, setLocalPath] = useState('')

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
                : []
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
          {/* CL2: 원격 클론은 전용 3상태 모달(폼→진행→나무)로 통합됨. 여기선 진입만. */}
          <div className="addrepo-clone-redirect">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold-300)" strokeWidth="1.6"><path d="M7 2H3a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-6"/><path d="M15 2h6v6M21 2l-9 9"/></svg>
            <div className="addrepo-clone-redirect-txt">원격 저장소를 클론하면 진행 상황과 함께 새 나무가 자라요.</div>
          </div>
          <div className="modal-footer" style={{ padding: 0, background: 'none', border: 'none', marginTop: 4 }}>
            <button className="mbtn-cancel" onClick={onClose}>Cancel</button>
            <button className="mbtn-ok" onClick={() => onCloneRemote?.()}>원격 저장소 클론 →</button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
