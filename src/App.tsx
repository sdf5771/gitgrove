import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import './App.css'
import { COMMITS, REPOS, type Commit, type Repo, type FileEntry } from './data/mockData'
import { BranchSidebar } from './components/BranchSidebar'
import { CommitGraph } from './components/CommitGraph'
import { CommitDetail } from './components/CommitDetail'
import { StageArea } from './components/StageArea'
import { DiffPanel } from './components/DiffPanel'
import { DiffExplorer } from './components/DiffExplorer'
import { BlameView } from './components/BlameView'
import { PRView } from './components/PRView'
import { StatusBar } from './components/StatusBar'
import { NotificationStack } from './components/NotificationStack'
import { ContextMenu } from './components/ContextMenu'
import { CommandPalette } from './components/CommandPalette'
import { MergeModal } from './components/modals/MergeModal'
import { CherryPickModal } from './components/modals/CherryPickModal'
import { StashPanel } from './components/modals/StashPanel'
import { BranchModal } from './components/modals/BranchModal'
import { InteractiveRebaseModal } from './components/modals/InteractiveRebaseModal'
import { SettingsPanel } from './components/modals/SettingsPanel'
import { AddRepoModal } from './components/modals/AddRepoModal'
import { ConflictEditorModal } from './components/modals/ConflictEditorModal'
import { useNotifications } from './hooks/useNotifications'

type View = 'history' | 'commit' | 'diff' | 'blame' | 'pr'
type BranchTab = 'create' | 'rename' | 'delete'

function RepoTabs({ repos, active, onSelect, onAdd, onClose }: {
  repos: Repo[]; active: number
  onSelect: (i: number) => void
  onAdd: () => void
  onClose: (i: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <div className="repo-tabs">
        {repos.map((r, i) => (
          <div key={r.id} className={`repo-tab${i === active ? ' on' : ''}`} onClick={() => onSelect(i)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: .7, flexShrink: 0 }}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
            {r.dirty && <span className="repo-tab-dirty" title="Uncommitted changes" />}
            <span>{r.name}</span>
            {r.behind > 0 && <span style={{ fontSize: 9, color: 'var(--c-warning)', fontFamily: 'var(--font-mono)' }}>↓{r.behind}</span>}
            {repos.length > 1 && <button className="repo-tab-close" onClick={e => { e.stopPropagation(); onClose(i) }}>×</button>}
          </div>
        ))}
      </div>
      <button className="repo-tab-add" onClick={onAdd} title="Add repository">+</button>
    </div>
  )
}

export default function App() {
  const [repos, setRepos] = useState<Repo[]>(REPOS)
  const [activeRepo, setActiveRepo] = useState(0)
  const addRepo = useCallback((r: Repo) => setRepos(p => [...p, r]), [])
  const closeRepo = useCallback((i: number) => setRepos(p => p.filter((_, j) => j !== i)), [])

  const [view, setView] = useState<View>('history')
  const [selIdx, setSelIdx] = useState(0)
  const [activeBranch, setActiveBranch] = useState('main')
  const [diffFile, setDiffFile] = useState<FileEntry | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const srchRef = useRef<HTMLInputElement>(null)

  const [showMerge,     setShowMerge]     = useState(false)
  const [showCherryPick,setShowCherryPick]= useState(false)
  const [showStash,     setShowStash]     = useState(false)
  const [showBranch,    setShowBranch]    = useState(false)
  const [branchTab,     setBranchTab]     = useState<BranchTab>('create')
  const [showRebase,    setShowRebase]    = useState(false)
  const [showSettings,  setShowSettings]  = useState(false)
  const [showAddRepo,   setShowAddRepo]   = useState(false)
  const [showConflict,  setShowConflict]  = useState(false)
  const [showCmd,       setShowCmd]       = useState(false)
  const [ctxMenu,       setCtxMenu]       = useState<{ x: number; y: number; commit: Commit; idx: number } | null>(null)

  const { notifs, notify, dismiss } = useNotifications()

  const filteredCommits = useMemo(() => {
    if (!searchQuery.trim()) return COMMITS
    const q = searchQuery.toLowerCase()
    return COMMITS.filter(c =>
      c.msg.toLowerCase().includes(q) || c.author.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) || c.files.some(f => f.p.toLowerCase().includes(q))
    ).map(c => ({ ...c, _q: searchQuery }))
  }, [searchQuery])

  useEffect(() => { if (selIdx >= filteredCommits.length) setSelIdx(Math.max(0, filteredCommits.length - 1)) }, [filteredCommits, selIdx])
  const selectedCommit = filteredCommits[selIdx] ?? null

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowCmd(v => !v) }
      if (e.key === 'Escape') {
        if (showCmd) setShowCmd(false)
        else if (ctxMenu) setCtxMenu(null)
        else if (showMerge) setShowMerge(false)
        else if (showCherryPick) setShowCherryPick(false)
        else if (showStash) setShowStash(false)
        else if (showBranch) setShowBranch(false)
        else if (showRebase) setShowRebase(false)
        else if (showSettings) setShowSettings(false)
        else if (showAddRepo) setShowAddRepo(false)
        else if (showConflict) setShowConflict(false)
        else if (searchQuery) { setSearchQuery(''); srchRef.current?.focus() }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '1') { e.preventDefault(); setView('history') }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') { e.preventDefault(); setView('commit') }
      if ((e.metaKey || e.ctrlKey) && e.key === '3') { e.preventDefault(); setView('diff') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [showCmd, ctxMenu, showMerge, showCherryPick, showStash, showBranch, showRebase, showSettings, showAddRepo, showConflict, searchQuery])

  const handleCommand = useCallback((id: string) => {
    const M: Record<string, () => void> = {
      'pull':          () => notify('success', 'Pulled successfully', 'Fast-forward: 3 new commits from origin/main'),
      'push':          () => notify('success', 'Pushed to origin/main', '2 commits pushed'),
      'fetch':         () => notify('info', 'Fetching…', 'Checking all remotes'),
      'merge':         () => setShowMerge(true),
      'stash':         () => setShowStash(true),
      'cherry':        () => setShowCherryPick(true),
      'rebase':        () => setShowRebase(true),
      'branch-new':    () => { setBranchTab('create'); setShowBranch(true) },
      'branch-rename': () => { setBranchTab('rename'); setShowBranch(true) },
      'branch-delete': () => { setBranchTab('delete'); setShowBranch(true) },
      'view-history':  () => setView('history'),
      'view-stage':    () => setView('commit'),
      'view-diff':     () => setView('diff'),
      'view-blame':    () => setView('blame'),
      'settings':      () => setShowSettings(true),
    }
    M[id]?.()
  }, [notify])

  const handleCtxAction = useCallback((action: string) => {
    if (action === 'cherry-pick') setShowCherryPick(true)
    else if (action === 'rebase') setShowRebase(true)
    else if (action === 'branch-here') { setBranchTab('create'); setShowBranch(true) }
    else if (action === 'copy-hash' && ctxMenu) {
      navigator.clipboard?.writeText(ctxMenu.commit.id).catch(() => {})
      notify('success', 'Hash copied', ctxMenu.commit.id)
    }
    else if (action === 'revert') notify('warning', 'Revert', 'Reverted ' + ctxMenu?.commit?.id)
    else if (action?.startsWith('reset-')) notify('warning', 'Reset', 'Repository reset (' + action.split('-')[1] + ')')
  }, [ctxMenu, notify])

  const handleBranchAction = useCallback((mode: BranchTab) => { setBranchTab(mode); setShowBranch(true) }, [])

  const repo = repos[activeRepo] || repos[0]

  return (
    <div className="git-window">
      {/* Title bar */}
      <div className="title-bar">
        <div className="tl">
          <div className="td td-r" onClick={() => window.ipcRenderer?.send('win-close')} />
          <div className="td td-y" onClick={() => window.ipcRenderer?.send('win-minimize')} />
          <div className="td td-g" onClick={() => window.ipcRenderer?.send('win-maximize')} />
        </div>
        <span className="app-name" style={{ marginRight: 10 }}>🌿 GitGrove</span>
        <div style={{ width: 1, height: 20, background: 'var(--c-border)', flexShrink: 0, marginRight: 6 }} />
        <RepoTabs repos={repos} active={activeRepo} onSelect={setActiveRepo} onAdd={() => setShowAddRepo(true)}
          onClose={i => { closeRepo(i); if (activeRepo >= i) setActiveRepo(Math.max(0, activeRepo - 1)) }} />
        <div className="sep" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--c-text-faint)', fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: 'var(--c-gold-300)' }}>⎇</span>{repo?.branch || activeBranch}
          <span style={{ color: 'var(--c-success)' }}>↑2</span><span>↓0</span>
        </div>
      </div>

      {/* Action bar */}
      <div className="action-bar">
        <button className="abt" onClick={() => notify('success', 'Pulled', 'Fast-forward: 3 new commits')}><span style={{ fontSize: 14, lineHeight: 1 }}>↓</span>Pull</button>
        <button className="abt" onClick={() => notify('success', 'Pushed', '2 commits → origin/main')}><span style={{ fontSize: 14, lineHeight: 1 }}>↑</span>Push</button>
        <button className="abt" onClick={() => notify('info', 'Fetching…', 'Checking origin, upstream')}><span style={{ fontSize: 14, lineHeight: 1 }}>⟳</span>Fetch</button>
        <div className="abt-sep" />
        <button className="abt" onClick={() => { setBranchTab('create'); setShowBranch(true) }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>Branch
        </button>
        <button className="abt" onClick={() => setShowMerge(true)} style={showMerge ? { borderColor: 'var(--c-gold-border)', color: 'var(--c-gold-300)' } : {}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 012 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>Merge
        </button>
        <button className="abt" onClick={() => setShowRebase(true)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>Rebase
        </button>
        <button className="abt" onClick={() => setShowStash(true)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="8,17 3,12 8,7"/><polyline points="16,17 21,12 16,7"/></svg>Stash
        </button>
        <button className="abt" onClick={() => setShowConflict(true)} style={{ color: 'var(--c-warning)', borderColor: 'rgba(255,206,90,.3)' }}>
          <span style={{ fontSize: 12 }}>⚡</span>Conflicts
        </button>
        <div className="view-toggle">
          {([['history', 'History'], ['commit', 'Stage'], ['diff', 'Diff'], ['blame', 'Blame'], ['pr', 'PR']] as const).map(([id, label]) => (
            <button key={id} className={`vbtn${view === id ? ' on' : ''}`} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
        <div className="srch-wrap">
          <input ref={srchRef} className="srch" placeholder="Search commits…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && <button className="srch-clear" onClick={() => { setSearchQuery(''); srchRef.current?.focus() }}>×</button>}
          {searchQuery && <div className="srch-badge" style={filteredCommits.length === 0 ? { background: 'var(--c-danger)' } : {}}>{filteredCommits.length}</div>}
        </div>
        <button className="abt" onClick={() => setShowCmd(true)} style={{ marginLeft: 4, gap: 4 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--c-text-faint)' }}>⌘K</span>
        </button>
      </div>

      {/* App body */}
      <div className="app-body" style={{ position: 'relative' }}>
        <BranchSidebar activeBranch={activeBranch} onBranch={setActiveBranch} onBranchAction={handleBranchAction} />

        {view === 'pr' ? (
          <PRView onOpenConflict={() => setShowConflict(true)} />
        ) : view === 'blame' ? (
          <>
            <BlameView onSelectCommit={i => { setSelIdx(i); setView('history') }} />
            <div className="rpanel">
              <div className="pnl-hdr"><h3>Commit Detail</h3></div>
              <CommitDetail commit={selectedCommit} onOpenDiff={() => setView('diff')} onCherryPick={() => setShowCherryPick(true)} onBlame={() => setView('blame')} />
            </div>
          </>
        ) : view === 'diff' ? (
          <DiffExplorer commit={selectedCommit} />
        ) : (
          <>
            <div className="cpanel">
              {view === 'history' ? (
                <>
                  <div className="graph-hdr">
                    <span className="ghm">
                      Message
                      {searchQuery && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--c-gold-300)', fontFamily: 'var(--font-display)' }}>{filteredCommits.length} result{filteredCommits.length !== 1 ? 's' : ''}</span>}
                    </span>
                    <span className="gha">Author</span>
                    <span className="ght">Time</span>
                  </div>
                  <CommitGraph
                    commits={filteredCommits}
                    selectedIdx={selIdx}
                    onSelect={setSelIdx}
                    onContextMenu={(e, c, i) => setCtxMenu({ x: e.clientX, y: e.clientY, commit: c, idx: i })}
                    showStats={true}
                    rowH={44}
                    activeBranch={activeBranch}
                  />
                </>
              ) : (
                <StageArea onSelDiffFile={setDiffFile} />
              )}
            </div>
            <div className="rpanel">
              {view === 'history' ? (
                <>
                  <div className="pnl-hdr">
                    <h3>Commit Detail</h3>
                    {selectedCommit && (
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                        <span style={{ fontSize: 11, color: 'var(--c-text-faint)', fontFamily: 'var(--font-mono)' }}>{selectedCommit.stats.f}f</span>
                        <span style={{ fontSize: 11, color: 'var(--c-success)', fontFamily: 'var(--font-mono)' }}>+{selectedCommit.stats.a}</span>
                        <span style={{ fontSize: 11, color: 'var(--c-danger)', fontFamily: 'var(--font-mono)' }}>−{selectedCommit.stats.d}</span>
                      </div>
                    )}
                  </div>
                  <CommitDetail commit={selectedCommit} onOpenDiff={() => setView('diff')} onCherryPick={() => setShowCherryPick(true)} onBlame={() => setView('blame')} />
                </>
              ) : (
                <DiffPanel file={diffFile} />
              )}
            </div>
          </>
        )}

        {/* Modals */}
        {showMerge       && <MergeModal onClose={() => { setShowMerge(false); notify('success', 'Merge complete', 'feature/auth merged into main') }} />}
        {showCherryPick  && selectedCommit && <CherryPickModal commit={selectedCommit} onClose={() => setShowCherryPick(false)} />}
        {showBranch      && <BranchModal initialTab={branchTab} onClose={() => setShowBranch(false)} />}
        {showRebase      && <InteractiveRebaseModal onClose={() => { setShowRebase(false); notify('info', 'Rebase complete', '6 commits rebased onto main') }} />}
        {showStash       && <StashPanel onClose={() => setShowStash(false)} />}
        {showSettings    && <SettingsPanel onClose={() => setShowSettings(false)} />}
        {showAddRepo     && <AddRepoModal onClose={() => setShowAddRepo(false)} onAdd={r => { addRepo(r); notify('success', 'Repository added', r.name) }} />}
        {showConflict    && <ConflictEditorModal onClose={() => setShowConflict(false)} onComplete={() => notify('success', 'Conflicts resolved', 'Merge can now be completed')} />}

        <NotificationStack notifs={notifs} onDismiss={dismiss} />
      </div>

      <StatusBar branch={repo?.branch || activeBranch} onSettings={() => setShowSettings(true)} />

      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} commit={ctxMenu.commit} onClose={() => setCtxMenu(null)} onAction={handleCtxAction} />}

      {showCmd && <CommandPalette onClose={() => setShowCmd(false)} onAction={handleCommand} />}
    </div>
  )
}
