import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import './App.css'
import { COMMITS, type Commit, type Repo, type FileEntry, type CommitLabel, type Branch } from './data/mockData'
import { LogoIcon } from './components/LogoIcon'

// ──────────────────────────────────────────────
// localStorage 키 상수
// ──────────────────────────────────────────────
const STORAGE_KEYS = {
  rpanelWidth: 'gitgrove:rpanelWidth',
  repos: 'gitgrove:repos',
  lastRepoPath: 'gitgrove:lastRepoPath',
  sidebarWidth: 'gitgrove:sidebarWidth',
} as const
import { computeLanes } from './utils/computeLanes'
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

// ──────────────────────────────────────────────
// 변환 함수
// ──────────────────────────────────────────────

function toAppCommit(c: GitCommit, allHashes: string[], laneMap: Map<string, number>): Commit {
  const labels: CommitLabel[] = c.refs.map(ref => {
    if (ref.startsWith('HEAD ->')) return { text: ref, type: 'head' as const }
    if (ref.startsWith('origin/') || ref.startsWith('upstream/')) return { text: ref, type: 'remote' as const }
    if (ref.match(/^v\d/)) return { text: ref, type: 'tag' as const }
    return { text: ref, type: 'branch' as const }
  })

  const parentIndices = c.parents
    .map(ph => allHashes.findIndex(h => h === ph))
    .filter(i => i >= 0)

  return {
    id: c.id,
    lane: laneMap.get(c.id) ?? 0,
    msg: c.msg,
    author: c.author,
    time: c.time,
    parents: parentIndices,
    labels,
    stats: { f: c.stats.files, a: c.stats.insertions, d: c.stats.deletions },
    files: [],
  }
}

function toAppBranches(result: GitBranchResult): Branch[] {
  return result.local.map((b, i) => ({
    name: b.name,
    lane: i,
    current: b.name === result.current,
    ahead: b.ahead,
    behind: b.behind,
  }))
}

function statusToFileEntry(
  files: Array<{ path: string; status: string; additions: number; deletions: number }>
): FileEntry[] {
  return files.map(f => ({
    p: f.path,
    s: f.status as 'M' | 'A' | 'D',
    a: f.additions,
    d: f.deletions,
  }))
}

// ──────────────────────────────────────────────
// RepoTabs 컴포넌트
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
// 메인 App
// ──────────────────────────────────────────────

export default function App() {
  // ── 레포 목록 (탭) — localStorage에서 초기값 로드 ──
  const [repos, setRepos] = useState<Repo[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.repos)
      return saved ? (JSON.parse(saved) as Repo[]) : []
    } catch {
      return []
    }
  })
  const [activeRepo, setActiveRepo] = useState(0)
  const addRepo = useCallback((r: Repo) => setRepos(p => [...p, r]), [])

  // ── 사이드바 너비 ──
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.sidebarWidth)
      return saved ? parseInt(saved, 10) : 220
    } catch {
      return 220
    }
  })
  const sidebarWidthRef = useRef(sidebarWidth)
  useEffect(() => { sidebarWidthRef.current = sidebarWidth }, [sidebarWidth])
  const isResizing = useRef(false)

  // ── real git 상태 ──
  const [repoPath, setRepoPath] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── 레포 탭 닫기 (repoPath 선언 이후에 정의) ──
  const closeRepo = useCallback((i: number) => {
    setRepos(p => {
      const next = p.filter((_, j) => j !== i)
      if (p[i]?.path === repoPath) {
        try { localStorage.removeItem(STORAGE_KEYS.lastRepoPath) } catch { /* ignore */ }
      }
      return next
    })
  }, [repoPath])

  const [realCommits, setRealCommits] = useState<Commit[]>([])
  const [realBranches, setRealBranches] = useState<Branch[]>([])
  const [realRemotes, setRealRemotes] = useState<string[]>([])
  const [realTags, setRealTags] = useState<string[]>([])
  const [realUnstaged, setRealUnstaged] = useState<FileEntry[]>([])
  const [realStaged, setRealStaged] = useState<FileEntry[]>([])

  // ── 커밋 파일 목록 (git:files IPC) ──
  const [commitFiles, setCommitFiles] = useState<GitFileEntry[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  // ── diff 내용 (git:diff IPC) ──
  const [diffContent, setDiffContent] = useState<string>('')
  const [loadingDiff, setLoadingDiff] = useState(false)

  // ── UI 상태 ──
  const [view, setView] = useState<View>('history')
  const [selIdx, setSelIdx] = useState(0)
  const [activeBranch, setActiveBranch] = useState('main')
  const [diffFile, setDiffFile] = useState<FileEntry | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const srchRef = useRef<HTMLInputElement>(null)

  const [showMerge,      setShowMerge]      = useState(false)
  const [showCherryPick, setShowCherryPick] = useState(false)
  const [showStash,      setShowStash]      = useState(false)
  const [showBranch,     setShowBranch]     = useState(false)
  const [branchTab,      setBranchTab]      = useState<BranchTab>('create')
  const [showRebase,     setShowRebase]     = useState(false)
  const [showSettings,   setShowSettings]   = useState(false)
  const [showAddRepo,    setShowAddRepo]    = useState(false)
  const [showConflict,   setShowConflict]   = useState(false)
  const [showCmd,        setShowCmd]        = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; commit: Commit; idx: number } | null>(null)

  const { notifs, notify, dismiss } = useNotifications()

  // ── Row density 설정 반영 ──
  const [rowH, setRowH] = useState<number>(() => {
    try {
      const s = JSON.parse(localStorage.getItem('gitgrove:settings') ?? '{}') as Record<string, unknown>
      return s.density === 'compact' ? 34 : 44
    } catch { return 44 }
  })

  useEffect(() => {
    const handler = (e: Event) => {
      const { density } = (e as CustomEvent<{ density: string; fontSize: string }>).detail
      setRowH(density === 'compact' ? 34 : 44)
    }
    window.addEventListener('gitgrove:settings-changed', handler)
    return () => window.removeEventListener('gitgrove:settings-changed', handler)
  }, [])

  // ── 오른쪽 패널 너비 ──
  const [rpanelWidth, setRpanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.rpanelWidth)
      return saved ? parseInt(saved, 10) : 300
    } catch { return 300 }
  })
  const rpanelWidthRef = useRef(rpanelWidth)
  useEffect(() => { rpanelWidthRef.current = rpanelWidth }, [rpanelWidth])

  const handleRpanelResizerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    const startX = e.clientX
    const startWidth = rpanelWidthRef.current

    const onMouseMove = (ev: MouseEvent) => {
      // rpanel은 오른쪽 고정이므로 왼쪽으로 드래그하면 넓어짐
      const delta = startX - ev.clientX
      const newWidth = Math.max(220, Math.min(600, startWidth + delta))
      setRpanelWidth(newWidth)
    }
    const onMouseUp = () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      try { localStorage.setItem(STORAGE_KEYS.rpanelWidth, String(rpanelWidthRef.current)) } catch {}
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  // ── 원격 연산 로딩 상태 ──
  const [remoteOp, setRemoteOp] = useState<'pull' | 'push' | 'fetch' | null>(null)

  // ── git 데이터 로드 ──
  const loadRepo = useCallback(async (path: string, silent = false) => {
    if (!silent) setIsLoading(true)
    setLoadError(null)
    try {
      const [gitCommits, gitBranches, gitStatus] = await Promise.all([
        window.gitAPI?.getLog(path) ?? Promise.resolve([]),
        window.gitAPI?.getBranches(path) ?? Promise.resolve({ current: '', local: [], remote: [], tags: [] }),
        (window.gitAPI?.getStatus(path) as Promise<{ staged: Array<{ path: string; status: string; additions: number; deletions: number }>; unstaged: Array<{ path: string; status: string; additions: number; deletions: number }> }> | undefined) ?? Promise.resolve({ staged: [] as Array<{ path: string; status: string; additions: number; deletions: number }>, unstaged: [] as Array<{ path: string; status: string; additions: number; deletions: number }> }),
      ])

      const hashes = gitCommits.map(c => c.id)
      const laneMap = computeLanes(gitCommits)
      const appCommits = gitCommits.map(c => toAppCommit(c, hashes, laneMap))
      const appBranches = toAppBranches(gitBranches)

      setRealCommits(appCommits)
      setRealBranches(appBranches)
      setRealRemotes(gitBranches.remote)
      setRealTags(gitBranches.tags)
      setRealUnstaged(statusToFileEntry(gitStatus.unstaged))
      setRealStaged(statusToFileEntry(gitStatus.staged))
      setRepoPath(path)
      try { localStorage.setItem(STORAGE_KEYS.lastRepoPath, path) } catch { /* ignore */ }

      const currentBranch = gitBranches.current || 'main'
      setActiveBranch(currentBranch)

      // 탭에 레포 추가
      const name = path.split('/').pop() || path
      const newRepo: Repo = {
        id: String(Date.now()),
        name,
        path,
        branch: currentBranch,
        dirty: gitStatus.staged.length > 0 || gitStatus.unstaged.length > 0,
        ahead: appBranches.find(b => b.current)?.ahead ?? 0,
        behind: appBranches.find(b => b.current)?.behind ?? 0,
      }
      setRepos(prev => {
        const existing = prev.findIndex(r => r.path === path)
        if (existing >= 0) {
          const next = [...prev]
          next[existing] = newRepo
          return next
        }
        return [...prev, newRepo]
      })
      const existingIdx = repos.findIndex(r => r.path === path)
      setActiveRepo(existingIdx >= 0 ? existingIdx : repos.length)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [repos])

  const handleOpenRepo = useCallback(async () => {
    const picked = await window.gitAPI?.openDialog()
    if (picked) await loadRepo(picked)
  }, [loadRepo])

  // ── 원격 연산 핸들러 ──
  const handlePull = useCallback(async () => {
    if (!repoPath || remoteOp) return
    setRemoteOp('pull')
    try {
      const result = await window.gitAPI?.pull(repoPath)
      notify('success', 'Pull 완료', result?.summary ?? '')
      await loadRepo(repoPath)
    } catch (err) {
      notify('error', 'Pull 실패', err instanceof Error ? err.message : String(err))
    } finally {
      setRemoteOp(null)
    }
  }, [repoPath, remoteOp, loadRepo, notify])

  const handlePush = useCallback(async () => {
    if (!repoPath || remoteOp) return
    setRemoteOp('push')
    try {
      const result = await window.gitAPI?.push(repoPath)
      notify('success', 'Push 완료', result?.summary ?? '')
    } catch (err) {
      notify('error', 'Push 실패', err instanceof Error ? err.message : String(err))
    } finally {
      setRemoteOp(null)
    }
  }, [repoPath, remoteOp, notify])

  const handleFetch = useCallback(async () => {
    if (!repoPath || remoteOp) return
    setRemoteOp('fetch')
    try {
      const result = await window.gitAPI?.fetch(repoPath)
      notify('info', 'Fetch 완료', result?.summary ?? '')
      await loadRepo(repoPath)
    } catch (err) {
      notify('error', 'Fetch 실패', err instanceof Error ? err.message : String(err))
    } finally {
      setRemoteOp(null)
    }
  }, [repoPath, remoteOp, loadRepo, notify])

  // ── 브랜치 체크아웃 핸들러 ──
  const handleBranchSwitch = useCallback(async (name: string) => {
    if (!repoPath || name === activeBranch) return
    try {
      await window.gitAPI?.checkout(repoPath, name)
      setActiveBranch(name)
      await loadRepo(repoPath)
      notify('success', `Switched to ${name}`, '')
    } catch (err) {
      notify('error', 'Checkout 실패', err instanceof Error ? err.message : String(err))
    }
  }, [repoPath, activeBranch, loadRepo, notify])

  // ── repos 변경 시 localStorage 자동 저장 ──
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.repos, JSON.stringify(repos)) } catch { /* ignore */ }
  }, [repos])

  // ── 앱 시작 시 마지막 레포 자동 복원 ──
  useEffect(() => {
    const lastPath = localStorage.getItem(STORAGE_KEYS.lastRepoPath)
    if (lastPath) {
      loadRepo(lastPath, true).catch(() => {
        try { localStorage.removeItem(STORAGE_KEYS.lastRepoPath) } catch { /* ignore */ }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 마운트 시 1회만

  // ── 윈도우 포커스 복귀 시 자동 새로고침 ──
  useEffect(() => {
    const handleFocus = () => {
      if (repoPath) loadRepo(repoPath, true)
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [repoPath, loadRepo])

  // ── 사이드바 리사이저 핸들러 ──
  const handleResizerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    const startX = e.clientX
    const startWidth = sidebarWidthRef.current

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const newWidth = Math.max(160, Math.min(400, startWidth + (ev.clientX - startX)))
      setSidebarWidth(newWidth)
    }

    const onMouseUp = () => {
      isResizing.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      try { localStorage.setItem(STORAGE_KEYS.sidebarWidth, String(sidebarWidthRef.current)) } catch { /* ignore */ }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  // ── 파일 선택 시 diff 로드 (git:diff) ──
  const handleSelDiffFile = useCallback(async (f: FileEntry) => {
    setDiffFile(f)
    if (!repoPath) return
    setLoadingDiff(true)
    try {
      const raw = await window.gitAPI?.getDiff(repoPath, f.p) ?? ''
      setDiffContent(raw)
    } catch (e) {
      console.error('getDiff failed:', e)
      setDiffContent('')
    } finally {
      setLoadingDiff(false)
    }
  }, [repoPath])

  // ── 표시할 커밋 목록 결정 ──
  const baseCommits = repoPath ? realCommits : COMMITS

  const filteredCommits = useMemo(() => {
    if (!searchQuery.trim()) return baseCommits
    const q = searchQuery.toLowerCase()
    return baseCommits.filter(c =>
      c.msg.toLowerCase().includes(q) || c.author.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) || c.files.some(f => f.p.toLowerCase().includes(q))
    ).map(c => ({ ...c, _q: searchQuery }))
  }, [searchQuery, baseCommits])

  // ── 커밋 선택 시 파일 목록 로드 (git:files) ──
  const handleSelectCommit = useCallback(async (idx: number) => {
    setSelIdx(idx)
    const commit = filteredCommits[idx]
    if (!commit || !repoPath) return

    setLoadingFiles(true)
    try {
      const files = await window.gitAPI?.getFiles(repoPath, commit.id) ?? []
      setCommitFiles(files)
    } catch (e) {
      console.error('getFiles failed:', e)
      setCommitFiles([])
    } finally {
      setLoadingFiles(false)
    }
  }, [filteredCommits, repoPath])

  useEffect(() => { if (selIdx >= filteredCommits.length) setSelIdx(Math.max(0, filteredCommits.length - 1)) }, [filteredCommits, selIdx])
  const selectedCommit = filteredCommits[selIdx] ?? null

  // ── 키보드 단축키 ──
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
      'pull':          () => void handlePull(),
      'push':          () => void handlePush(),
      'fetch':         () => void handleFetch(),
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
  }, [notify, handlePull, handlePush, handleFetch])

  const handleCtxAction = useCallback((action: string) => {
    if (action === 'cherry-pick') setShowCherryPick(true)
    else if (action === 'rebase') setShowRebase(true)
    else if (action === 'branch-here') { setBranchTab('create'); setShowBranch(true) }
    else if (action === 'copy-hash' && ctxMenu) {
      navigator.clipboard?.writeText(ctxMenu.commit.id).catch(() => {})
      notify('success', 'Hash copied', ctxMenu.commit.id)
    }
    else if (action === 'copy-msg' && ctxMenu) {
      navigator.clipboard?.writeText(ctxMenu.commit.msg).catch(() => {})
      notify('success', '메시지 복사됨', ctxMenu.commit.msg.slice(0, 60))
    }
    else if (action === 'revert') notify('warning', 'Revert', 'Reverted ' + ctxMenu?.commit?.id)
    else if (action?.startsWith('reset-')) notify('warning', 'Reset', 'Repository reset (' + action.split('-')[1] + ')')
  }, [ctxMenu, notify])

  const handleBranchAction = useCallback((mode: BranchTab) => { setBranchTab(mode); setShowBranch(true) }, [])

  const repo = repos[activeRepo] || null
  const displayBranch = repo?.branch || activeBranch

  // ── 빈 화면 (레포 미선택, 로딩 중이 아님) ──
  const renderEmptyState = () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'var(--c-text-faint)' }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ opacity: 0.35 }}>
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      </svg>
      <div style={{ fontSize: 15, color: 'var(--c-text)' }}>레포지토리를 열어주세요</div>
      {loadError && <div style={{ fontSize: 12, color: 'var(--c-danger)', maxWidth: 320, textAlign: 'center' }}>{loadError}</div>}
      <button className="mbtn-ok" onClick={handleOpenRepo}>폴더 열기</button>
    </div>
  )

  // ── 로딩 화면 ──
  const renderLoading = () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--c-text-muted)' }}>
      <span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite', fontSize: 18 }}>⟳</span>
      <span>Loading repository…</span>
    </div>
  )

  return (
    <div className="git-window">
      {/* Title bar */}
      <div className="title-bar">
        <div className="tl">
          <div className="td td-r" onClick={() => window.ipcRenderer?.send('win-close')} />
          <div className="td td-y" onClick={() => window.ipcRenderer?.send('win-minimize')} />
          <div className="td td-g" onClick={() => window.ipcRenderer?.send('win-maximize')} />
        </div>
        <span className="app-name" style={{ marginRight: 10, display: 'flex', alignItems: 'center', gap: 7 }}><LogoIcon size={22} />GitGrove</span>
        <div style={{ width: 1, height: 20, background: 'var(--c-border)', flexShrink: 0, marginRight: 6 }} />
        <RepoTabs
          repos={repos}
          active={activeRepo}
          onSelect={setActiveRepo}
          onAdd={() => setShowAddRepo(true)}
          onClose={i => { closeRepo(i); if (activeRepo >= i) setActiveRepo(Math.max(0, activeRepo - 1)) }}
        />
        <div className="sep" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--c-text-faint)', fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: 'var(--c-gold-300)' }}>⎇</span>{displayBranch}
          {repo && repo.ahead > 0 && <span style={{ color: 'var(--c-success)' }}>↑{repo.ahead}</span>}
          {repo && repo.behind > 0 && <span>↓{repo.behind}</span>}
        </div>
      </div>

      {/* Action bar */}
      <div className="action-bar">
        <button className="abt" onClick={handlePull} disabled={!repoPath || !!remoteOp} style={remoteOp === 'pull' ? { opacity: .6 } : {}}>
          {remoteOp === 'pull'
            ? <span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>
            : <span style={{ fontSize: 14, lineHeight: 1 }}>↓</span>}Pull
        </button>
        <button className="abt" onClick={handlePush} disabled={!repoPath || !!remoteOp} style={remoteOp === 'push' ? { opacity: .6 } : {}}>
          {remoteOp === 'push'
            ? <span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>
            : <span style={{ fontSize: 14, lineHeight: 1 }}>↑</span>}Push
        </button>
        <button className="abt" onClick={handleFetch} disabled={!repoPath || !!remoteOp} style={remoteOp === 'fetch' ? { opacity: .6 } : {}}>
          {remoteOp === 'fetch'
            ? <span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>
            : <span style={{ fontSize: 14, lineHeight: 1 }}>⟳</span>}Fetch
        </button>
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

        {isLoading ? renderLoading() : !repoPath ? renderEmptyState() : (
          <>
            <BranchSidebar
              activeBranch={activeBranch}
              onBranch={handleBranchSwitch}
              onBranchAction={handleBranchAction}
              localBranches={realBranches.length > 0 ? realBranches : undefined}
              remoteBranches={realRemotes.length > 0 ? realRemotes : undefined}
              tags={realTags.length > 0 ? realTags : undefined}
              style={{ width: sidebarWidth }}
            />

            {/* 사이드바 리사이저 핸들 */}
            <div
              onMouseDown={handleResizerMouseDown}
              style={{
                width: 4,
                flexShrink: 0,
                cursor: 'col-resize',
                background: 'transparent',
                transition: 'background 120ms',
                position: 'relative',
                zIndex: 10,
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'var(--c-gold-border)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'transparent' }}
            />

            {view === 'pr' ? (
              <PRView onOpenConflict={() => setShowConflict(true)} repoPath={repoPath} />
            ) : view === 'blame' ? (
              <>
                <BlameView
                  onSelectCommit={i => { setSelIdx(i); setView('history') }}
                  repoPath={repoPath}
                  filePath={diffFile?.p || (selectedCommit?.files?.[0]?.p ?? 'src/auth/jwt.ts')}
                />
              </>
            ) : view === 'diff' ? (
              <DiffExplorer commit={selectedCommit} repoPath={repoPath} />
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
                        onSelect={handleSelectCommit}
                        onContextMenu={(e, c, i) => setCtxMenu({ x: e.clientX, y: e.clientY, commit: c, idx: i })}
                        showStats={true}
                        rowH={rowH}
                        activeBranch={activeBranch}
                      />
                    </>
                  ) : (
                    <StageArea
                      onSelDiffFile={handleSelDiffFile}
                      initialUnstaged={realUnstaged.length > 0 || realStaged.length > 0 ? realUnstaged : undefined}
                      initialStaged={realUnstaged.length > 0 || realStaged.length > 0 ? realStaged : undefined}
                      repoPath={repoPath}
                      onCommitDone={async () => {
                        if (repoPath) {
                          await loadRepo(repoPath)
                          notify('success', 'Committed', '변경사항이 커밋되었습니다')
                        }
                      }}
                    />
                  )}
                </div>
                {/* 오른쪽 패널 리사이저 */}
                <div
                  onMouseDown={handleRpanelResizerMouseDown}
                  style={{
                    width: 4,
                    flexShrink: 0,
                    cursor: 'col-resize',
                    background: 'transparent',
                    transition: 'background 120ms',
                    zIndex: 10,
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = 'var(--c-gold-border)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                />
                <div className="rpanel" style={{ width: rpanelWidth }}>
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
                      <CommitDetail
                        commit={selectedCommit}
                        files={repoPath ? commitFiles : undefined}
                        loadingFiles={loadingFiles}
                        onOpenDiff={() => setView('diff')}
                        onCherryPick={() => setShowCherryPick(true)}
                        onBlame={() => setView('blame')}
                      />
                    </>
                  ) : (
                    <DiffPanel
                      file={diffFile}
                      rawDiff={repoPath ? diffContent : undefined}
                      loading={loadingDiff}
                    />
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Modals */}
        {showMerge       && <MergeModal onClose={() => { setShowMerge(false); notify('success', 'Merge complete', 'feature/auth merged into main') }} branches={realBranches.length > 0 ? realBranches : undefined} />}
        {showCherryPick  && selectedCommit && <CherryPickModal commit={selectedCommit} onClose={() => setShowCherryPick(false)} />}
        {showBranch      && <BranchModal initialTab={branchTab} onClose={() => setShowBranch(false)} branches={realBranches.length > 0 ? realBranches : undefined} />}
        {showRebase      && <InteractiveRebaseModal onClose={() => { setShowRebase(false); notify('info', 'Rebase complete', '6 commits rebased onto main') }} />}
        {showStash       && <StashPanel onClose={() => setShowStash(false)} />}
        {showSettings    && <SettingsPanel onClose={() => setShowSettings(false)} />}
        {showAddRepo     && (
          <AddRepoModal
            onClose={() => setShowAddRepo(false)}
            onAdd={r => { addRepo(r); notify('success', 'Repository added', r.name) }}
            onOpenPath={async (path) => {
              setShowAddRepo(false)
              await loadRepo(path)
            }}
            recentPaths={repos.map(r => ({ name: r.name, path: r.path }))}
          />
        )}
        {showConflict    && <ConflictEditorModal onClose={() => setShowConflict(false)} onComplete={() => notify('success', 'Conflicts resolved', 'Merge can now be completed')} />}

        <NotificationStack notifs={notifs} onDismiss={dismiss} />
      </div>

      <StatusBar branch={displayBranch} onSettings={() => setShowSettings(true)} />

      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} commit={ctxMenu.commit} onClose={() => setCtxMenu(null)} onAction={handleCtxAction} />}

      {showCmd && <CommandPalette onClose={() => setShowCmd(false)} onAction={handleCommand} />}
    </div>
  )
}
