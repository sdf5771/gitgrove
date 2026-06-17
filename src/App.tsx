import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import './App.css'
import { COMMITS, type Commit, type Repo, type FileEntry, type CommitLabel, type Branch } from './data/mockData'
import { Geuru, type GeuruExpr } from './components/Geuru'

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
import { MRView } from './components/MRView'
import { StatusBar, type GithubUser } from './components/StatusBar'
import { parseGitHubRepo, permissionToRole } from './utils/github'
import { parseGitLabRepo } from './utils/gitlab'
import type { RepoPermissions } from './utils/github'
import { getGithubToken } from './utils/githubToken'
import { useGitlabConns } from './utils/useGitlabConns'
import { getUser, getRepo } from './utils/githubClient'
import { NotificationStack } from './components/NotificationStack'
import { ContextMenu } from './components/ContextMenu'
import { BranchContextMenu, type BranchMenuAction } from './components/BranchContextMenu'
import { CommandPalette } from './components/CommandPalette'
import { MergeModal } from './components/modals/MergeModal'
import { CherryPickModal } from './components/modals/CherryPickModal'
import { StashPanel } from './components/modals/StashPanel'
import { BranchModal } from './components/modals/BranchModal'
import { InteractiveRebaseModal } from './components/modals/InteractiveRebaseModal'
import { SettingsPanel, type SettingsTab } from './components/modals/SettingsPanel'
import { AddRepoModal } from './components/modals/AddRepoModal'
import { ConflictEditorModal } from './components/modals/ConflictEditorModal'
import { RepoManager } from './components/RepoManager'
import { NotificationBell } from './components/NotificationBell'
import { loadFavorites, saveFavorites, loadRecents, saveRecents, pushRecent, loadWorkspaces, saveWorkspaces, createWorkspaceId, type RecentRepoEntry, type Workspace } from './utils/repoStore'
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
      <div className="repo-tabs" role="tablist">
        {repos.map((r, i) => (
          <div
            key={r.id}
            className={`repo-tab${i === active ? ' on' : ''}`}
            role="tab"
            tabIndex={0}
            aria-selected={i === active}
            onClick={() => onSelect(i)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i) } }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: .7, flexShrink: 0 }}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
            {r.dirty && <span className="repo-tab-dirty" title="Uncommitted changes" />}
            <span>{r.name}</span>
            {r.behind > 0 && <span style={{ fontSize: 9, color: 'var(--c-warning)', fontFamily: 'var(--font-mono)' }}>↓{r.behind}</span>}
            <button className="repo-tab-close" aria-label={`${r.name} 탭 닫기`} onClick={e => { e.stopPropagation(); onClose(i) }}>×</button>
          </div>
        ))}
      </div>
      <button className="repo-tab-add" onClick={onAdd} aria-label="저장소 추가" title="Add repository">+</button>
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

  // ── Repository Manager (풀스크린) 진입/즐겨찾기/최근 ──
  const [showRepoManager, setShowRepoManager] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites())
  const [recents, setRecents] = useState<RecentRepoEntry[]>(() => loadRecents())
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => loadWorkspaces())

  const toggleFavorite = useCallback((path: string) => {
    setFavorites(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
      saveFavorites(next)
      return next
    })
  }, [])

  // ── 워크스페이스 CRUD (변경 시 localStorage 영속) ──
  const persistWorkspaces = useCallback((updater: (prev: Workspace[]) => Workspace[]) => {
    setWorkspaces(prev => {
      const next = updater(prev)
      saveWorkspaces(next)
      return next
    })
  }, [])

  const createWorkspace = useCallback((name: string): string => {
    const id = createWorkspaceId()
    persistWorkspaces(prev => [...prev, { id, name: name.trim(), paths: [] }])
    return id
  }, [persistWorkspaces])

  const renameWorkspace = useCallback((id: string, name: string) => {
    persistWorkspaces(prev => prev.map(w => (w.id === id ? { ...w, name: name.trim() } : w)))
  }, [persistWorkspaces])

  const deleteWorkspace = useCallback((id: string) => {
    persistWorkspaces(prev => prev.filter(w => w.id !== id))
  }, [persistWorkspaces])

  const toggleRepoInWorkspace = useCallback((id: string, path: string) => {
    persistWorkspaces(prev => prev.map(w => {
      if (w.id !== id) return w
      const has = w.paths.includes(path)
      return { ...w, paths: has ? w.paths.filter(p => p !== path) : [...w.paths, path] }
    }))
  }, [persistWorkspaces])

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

  // ── 커밋 로그 페이지네이션 / 전체 브랜치 토글 ──
  const LOG_PAGE = 50
  const [logLimit, setLogLimit] = useState(LOG_PAGE)
  const [showAllBranches, setShowAllBranches] = useState(true)
  const [hasMoreCommits, setHasMoreCommits] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // loadRepo가 최신 값을 읽도록 ref로 보관 (closure 정체 방지)
  const logLimitRef = useRef(logLimit)
  const showAllBranchesRef = useRef(showAllBranches)
  useEffect(() => { logLimitRef.current = logLimit }, [logLimit])
  useEffect(() => { showAllBranchesRef.current = showAllBranches }, [showAllBranches])
  // hunk 단위 stage/unstage 진행 상태
  // (StageArea는 controlled — realUnstaged/realStaged prop 변경으로 자동 반영되므로
  //  더 이상 remount key 트릭에 의존하지 않는다. B14)
  const [applyingHunk, setApplyingHunk] = useState<number | null>(null)
  const [diffFileStaged, setDiffFileStaged] = useState(false)
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
  // 포커스 복귀 자동 새로고침 시 열려있는 diff를 재로딩하기 위한 ref (B15)
  const diffFileRef = useRef<FileEntry | null>(null)
  const diffFileStagedRef = useRef(false)

  // ── CommitDetail 파일 diff 미리보기 ──
  const [commitDiffPreview, setCommitDiffPreview] = useState<string>('')
  const [loadingPreview, setLoadingPreview] = useState(false)

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
  const [settingsTab,    setSettingsTab]    = useState<SettingsTab | undefined>(undefined)
  const [showAddRepo,    setShowAddRepo]    = useState(false)
  const [showConflict,   setShowConflict]   = useState(false)
  const [showCmd,        setShowCmd]        = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; commit: Commit; idx: number } | null>(null)
  const [branchCtxMenu, setBranchCtxMenu] = useState<{ x: number; y: number; name: string; type: 'local' | 'remote' | 'tag'; isCurrent: boolean } | null>(null)

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
      try { localStorage.setItem(STORAGE_KEYS.rpanelWidth, String(rpanelWidthRef.current)) } catch { /* ignore */ }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  // ── 원격 연산 로딩 상태 ──
  const [remoteOp, setRemoteOp] = useState<'pull' | 'push' | 'fetch' | null>(null)

  // refs to avoid stale closure — adding repos/repoPath to loadRepo deps would
  // cause a loop: loadRepo → setRepos → repos changes → loadRepo recreated → effect fires again
  const reposRef = useRef(repos)
  useEffect(() => { reposRef.current = repos }, [repos])
  const repoPathRef = useRef(repoPath)
  useEffect(() => { repoPathRef.current = repoPath }, [repoPath])
  // loadRepo 호출마다 증가하는 시퀀스. await 직후 "내가 여전히 최신 요청인가"를
  // 검사해 늦게 도착한 stale 응답이 최신 화면을 덮어쓰지 못하게 한다(async 레이스 가드).
  const loadSeqRef = useRef(0)
  // 현재 로드 중(in-flight)인 path. 같은 경로의 이중 로드를 막는다.
  const loadingPathRef = useRef<string | null>(null)

  // ── git 데이터 로드 ──
  // loadRepo는 git 데이터 로드 + repos 목록 갱신만 책임진다.
  // "어느 탭을 active로 둘지"는 호출자가 opts.activate로 소유한다(디커플링).
  const loadRepo = useCallback(async (path: string, opts: { silent?: boolean; activate?: boolean } = {}) => {
    const { silent = false, activate = false } = opts
    // 이 호출의 시퀀스를 발급하고 in-flight path를 기록한다.
    const mySeq = ++loadSeqRef.current
    loadingPathRef.current = path
    if (!silent) setIsLoading(true)
    setLoadError(null)

    // ── 유효성 검사 ── .git 없는 빈/삭제된 디렉토리를 broken 상태로 만들지 않는다.
    // (Browse·Clone·최근목록·탭전환·.git 중도삭제 등 모든 진입점을 한곳에서 방어)
    const valid = await window.gitAPI?.isRepo?.(path)
    if (valid === false) {
      if (mySeq === loadSeqRef.current) {
        notify('error', 'Git 저장소가 아닙니다', `${path}\n.git 폴더가 없거나 삭제되었습니다.`)
        loadingPathRef.current = null
        if (!silent) setIsLoading(false)
      }
      return false
    }

    try {
      const limit = logLimitRef.current
      const [gitCommits, gitBranches, gitStatus] = await Promise.all([
        window.gitAPI?.getLog(path, { limit, all: showAllBranchesRef.current }) ?? Promise.resolve([]),
        window.gitAPI?.getBranches(path) ?? Promise.resolve({ current: '', local: [], remote: [], tags: [] }),
        (window.gitAPI?.getStatus(path) as Promise<{ staged: Array<{ path: string; status: string; additions: number; deletions: number }>; unstaged: Array<{ path: string; status: string; additions: number; deletions: number }> }> | undefined) ?? Promise.resolve({ staged: [] as Array<{ path: string; status: string; additions: number; deletions: number }>, unstaged: [] as Array<{ path: string; status: string; additions: number; deletions: number }> }),
      ])

      // ── 레이스 가드 ── 응답이 도착한 시점에 더 늦은 loadRepo 호출이 있었다면
      // 이 응답은 stale이다. 모든 setState(활성 탭 포함)를 스킵하고 조기 return해
      // last-write-wins 덮어쓰기와 activate 되돌림을 모두 차단한다.
      if (mySeq !== loadSeqRef.current) return false

      const hashes = gitCommits.map(c => c.id)
      const laneMap = computeLanes(gitCommits)
      const appCommits = gitCommits.map(c => toAppCommit(c, hashes, laneMap))
      const appBranches = toAppBranches(gitBranches)

      setRealCommits(appCommits)
      setHasMoreCommits(gitCommits.length >= limit)
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
          // 기존 엔트리의 id를 유지한다(Date.now() 교체 시 key 변경 → 탭 remount 방지).
          next[existing] = { ...newRepo, id: prev[existing].id }
          return next
        }
        return [...prev, newRepo]
      })
      // 최근 열람 목록(localStorage) 갱신 — 경로/이름/마지막 브랜치 영속.
      setRecents(pushRecent({ path, name, branch: currentBranch }))
      // active 탭 결정은 호출자가 activate로 명시할 때만 수행한다.
      // stale `repos`가 아니라 fresh `reposRef.current`로 인덱스를 계산한다.
      if (activate) {
        const list = reposRef.current
        const existingIdx = list.findIndex(r => r.path === path)
        setActiveRepo(existingIdx >= 0 ? existingIdx : list.length)
      }
      return true
    } catch (err) {
      if (mySeq === loadSeqRef.current) setLoadError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      // 최신 호출일 때만 in-flight 표식을 해제한다(나보다 늦은 호출이 진행 중이면 그쪽이 소유).
      if (mySeq === loadSeqRef.current) loadingPathRef.current = null
      if (!silent) setIsLoading(false)
    }
  }, [notify])

  const handleOpenRepo = useCallback(async () => {
    const picked = await window.gitAPI?.openDialog()
    if (picked) await loadRepo(picked, { activate: true })
  }, [loadRepo])

  // ── 레포 탭 닫기 (인덱스 보정 + 표시 중이던 레포면 새 활성 레포 로드) ──
  // 첫 탭(index 0)이 활성일 때 닫으면 setActiveRepo(0)가 no-op이라 탭전환 effect가
  // 안 떠서 화면이 안 바뀌고 repoPath가 닫은 레포에 남는 버그를 막는다.
  const handleCloseRepoTab = useCallback((i: number) => {
    const closedPath = repos[i]?.path
    const remaining = repos.filter((_, j) => j !== i)
    closeRepo(i)
    // 마지막 레포까지 닫으면 빈 상태(레포 미선택 화면)로 전환한다.
    if (remaining.length === 0) {
      setActiveRepo(0)
      if (closedPath === repoPath) {
        setRepoPath(null)
        setRealCommits([])
        setRealBranches([])
        setRealStaged([])
        setRealUnstaged([])
        setRealRemotes([])
        setRealTags([])
      }
      return
    }
    const newIdx = i <= activeRepo ? Math.max(0, activeRepo - 1) : activeRepo
    setActiveRepo(newIdx)
    // 닫은 탭이 현재 표시 중이던 레포면, activeRepo 값이 안 바뀌어도(예: 첫 탭 닫기)
    // 새 활성 레포를 명시적으로 로드해 화면을 갱신한다.
    if (closedPath && closedPath === repoPath && remaining[newIdx]) {
      void loadRepo(remaining[newIdx].path, { silent: true })
    }
  }, [repos, activeRepo, repoPath, closeRepo, loadRepo])

  // ── GitGrove에서 레포 완전 제거(디스크 파일은 보존) ──
  // 열려 있으면 탭을 닫고, 최근/즐겨찾기/모든 워크스페이스에서 path를 제거한다.
  const removeRepoFromGitgrove = useCallback((path: string) => {
    const idx = repos.findIndex(r => r.path === path)
    if (idx >= 0) handleCloseRepoTab(idx)
    setRecents(prev => {
      const next = prev.filter(r => r.path !== path)
      saveRecents(next)
      return next
    })
    setFavorites(prev => {
      const next = prev.filter(p => p !== path)
      saveFavorites(next)
      return next
    })
    persistWorkspaces(prev => prev.map(w => ({ ...w, paths: w.paths.filter(p => p !== path) })))
  }, [repos, handleCloseRepoTab, persistWorkspaces])

  // ── 원격 저장소 Clone (부모 폴더 선택 → git clone → 활성화) ──
  const handleClone = useCallback(async (url: string): Promise<boolean> => {
    const parent = await window.gitAPI?.pickDirectory('Clone 대상 폴더 선택')
    if (!parent) return false // 사용자가 폴더 선택을 취소 → 모달 유지
    notify('info', 'Clone 시작', `${url}`)
    try {
      const res = await window.gitAPI!.clone(url, parent)
      notify('success', 'Clone 완료', res.name)
      setShowRepoManager(false)
      await loadRepo(res.path, { activate: true })
      return true
    } catch (err) {
      notify('error', 'Clone 실패', err instanceof Error ? err.message : String(err))
      return false
    }
  }, [loadRepo, notify])

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
      notify('success', 'Push 완료', result?.summary ?? '', undefined, 4000, 'merge')
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
  // 이중 로드 방지: lastPath가 이미 탭 목록에 있으면 activeRepo만 맞추고
  // 실제 데이터 로드는 탭전환 effect에 일임한다. 목록에 없을 때만 loadRepo로 추가/활성화.
  useEffect(() => {
    const lastPath = localStorage.getItem(STORAGE_KEYS.lastRepoPath)
    const list = reposRef.current
    if (lastPath) {
      const idx = list.findIndex(r => r.path === lastPath)
      if (idx >= 0) {
        // 탭전환 effect가 repos[activeRepo]를 로드한다.
        setActiveRepo(idx)
      } else {
        // lastPath가 탭에 없으면 로드해서 복원. 실패(.git 삭제 등)하고 남은 탭도 없으면 매니저로.
        void loadRepo(lastPath, { silent: true, activate: true }).then(ok => {
          if (!ok) {
            try { localStorage.removeItem(STORAGE_KEYS.lastRepoPath) } catch { /* ignore */ }
            if (reposRef.current.length === 0) setShowRepoManager(true)
          }
        })
      }
      return
    }
    // 복원할 레포가 전혀 없으면(최초 실행/모두 닫힌 상태) 리포지토리 매니저를 랜딩 화면으로.
    if (list.length === 0) setShowRepoManager(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 마운트 시 1회만

  // ── 새 버전 알림 ──
  useEffect(() => {
    window.appAPI?.onUpdateAvailable(({ version, url }) => {
      notify('info', `GitGrove ${version} 출시`, '새 버전이 있습니다', () => window.appAPI?.openReleaseUrl(url), 8000)
    })
  }, [notify])

  // ── 탭 전환 시 해당 레포 로드 ──
  // 탭 클릭 → onSelect=setActiveRepo → 이 effect가 데이터만 교체(activate:false).
  // loadRepo가 active 탭을 되돌리지 않게 activate를 넘기지 않는다.
  useEffect(() => {
    const path = reposRef.current[activeRepo]?.path
    // 이미 표시 중이거나(repoPathRef) 로드 중인(loadingPathRef) 경로면 중복 로드하지 않는다.
    if (path && path !== repoPathRef.current && path !== loadingPathRef.current) {
      loadRepo(path, { silent: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRepo])

  // ── GitHub 토큰 (safeStorage 우선 비동기 조회 후 state 보관) ──
  // 평문 localStorage 미러 제거(v1.7.0): 소비자는 동기 조회 대신 이 state 사용.
  const [githubToken, setGithubToken] = useState<string>('')
  useEffect(() => {
    let cancelled = false
    const loadToken = () => { getGithubToken().then(t => { if (!cancelled) setGithubToken(t) }).catch(() => {}) }
    loadToken()
    window.addEventListener('gitgrove:settings-changed', loadToken)
    return () => {
      cancelled = true
      window.removeEventListener('gitgrove:settings-changed', loadToken)
    }
  }, [])

  // ── GitLab 연결 여부 (연결된 host가 1개 이상이면 RepoManager GitLab 활성) ──
  const [gitlabConnected, setGitlabConnected] = useState(false)
  useEffect(() => {
    let cancelled = false
    const loadHosts = () => {
      window.appAPI?.gitlabListHosts()
        .then(hosts => { if (!cancelled) setGitlabConnected(hosts.length > 0) })
        .catch(() => {})
    }
    loadHosts()
    window.addEventListener('gitgrove:settings-changed', loadHosts)
    return () => {
      cancelled = true
      window.removeEventListener('gitgrove:settings-changed', loadHosts)
    }
  }, [])

  // 연결된 GitLab 인스턴스(host+token+username) — 인박스·알림 벨 통합용.
  const { instances: gitlabInstances } = useGitlabConns(gitlabConnected)

  // ── GitHub 사용자 정보 ──
  const [githubUser, setGithubUser] = useState<GithubUser | null>(null)

  const fetchGithubUser = useCallback(async () => {
    const token = await getGithubToken()
    if (!token) { setGithubUser(null); return }
    // 공용 클라이언트로 일원화(B8). 기존 동작 유지: 실패/비-ok 시 null.
    getUser<GithubUser & Record<string, unknown>>(token)
      .then(({ data }) => setGithubUser(data ? {
        login: data.login,
        avatar_url: data.avatar_url,
        name: data.name,
        bio: data.bio,
        company: data.company,
        location: data.location,
        blog: data.blog,
        twitter_username: data.twitter_username,
        email: data.email,
        followers: data.followers,
        following: data.following,
        public_repos: data.public_repos,
        created_at: data.created_at,
      } : null))
      .catch(() => setGithubUser(null))
  }, [])

  useEffect(() => { void fetchGithubUser() }, [fetchGithubUser])
  useEffect(() => {
    const handler = () => { void fetchGithubUser() }
    window.addEventListener('gitgrove:settings-changed', handler)
    return () => window.removeEventListener('gitgrove:settings-changed', handler)
  }, [fetchGithubUser])

  // ── 현재 레포에서 본인 권한(역할) ──
  const [repoRole, setRepoRole] = useState<string | null>(null)

  useEffect(() => {
    if (!repoPath || !githubToken) { setRepoRole(null); return }
    let cancelled = false
    window.gitAPI?.getRemotes(repoPath)
      .then(remotes => {
        const origin = remotes.find(r => r.name === 'origin') ?? remotes[0]
        const info = origin && parseGitHubRepo(origin.url)
        if (!info) { setRepoRole(null); return }
        // 공용 클라이언트로 일원화(B8). 권한 배지는 자주 안 바뀌므로 캐시 허용.
        return getRepo<{ permissions?: RepoPermissions }>(info.owner, info.repo, githubToken)
          .then(({ data }) => { if (!cancelled) setRepoRole(permissionToRole(data?.permissions)) })
      })
      .catch(() => { if (!cancelled) setRepoRole(null) })
    return () => { cancelled = true }
  }, [repoPath, githubToken])

  // ── 활성 레포의 provider 감지 (PR 탭에서 GitHub PRView ↔ GitLab MRView 분기) ──
  // origin이 GitLab이고 그 host가 연결돼 있으면 'gitlab', 아니면 'github'(기존 동작).
  const [repoProvider, setRepoProvider] = useState<'github' | 'gitlab'>('github')
  useEffect(() => {
    if (!repoPath) { setRepoProvider('github'); return }
    let cancelled = false
    ;(async () => {
      try {
        const remotes = await window.gitAPI?.getRemotes(repoPath) ?? []
        const origin = remotes.find(r => r.name === 'origin') ?? remotes[0]
        const glInfo = origin && parseGitLabRepo(origin.url)
        if (glInfo) {
          const hosts = await window.appAPI?.gitlabListHosts() ?? []
          const matched = hosts.some(h => h.replace(/\/+$/, '') === glInfo.host.replace(/\/+$/, ''))
          if (!cancelled) { setRepoProvider(matched ? 'gitlab' : 'github'); return }
        }
        if (!cancelled) setRepoProvider('github')
      } catch {
        if (!cancelled) setRepoProvider('github')
      }
    })()
    return () => { cancelled = true }
  }, [repoPath, gitlabConnected])

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

  // ── 파일 선택 시 diff 로드 (staged 여부에 맞는 diff 사용) ──
  const handleSelDiffFile = useCallback(async (f: FileEntry, staged = false) => {
    setDiffFile(f)
    setDiffFileStaged(staged)
    diffFileRef.current = f
    diffFileStagedRef.current = staged
    if (!repoPath) return
    setLoadingDiff(true)
    try {
      const raw = await window.gitAPI?.getFileDiff(repoPath, f.p, staged) ?? ''
      setDiffContent(raw)
    } catch (e) {
      console.error('getFileDiff failed:', e)
      setDiffContent('')
    } finally {
      setLoadingDiff(false)
    }
  }, [repoPath])

  // ── 열려있는 diff 재로딩 (B15) ──
  // 포커스 복귀 자동 새로고침 시 외부 편집 결과를 반영한다. 스피너는 띄우지 않고
  // (silent) 조용히 내용만 교체한다. 파일이 더 이상 변경목록에 없으면 빈 diff가 와
  // 자연스럽게 빈 상태가 된다.
  const refreshOpenDiff = useCallback(async () => {
    const f = diffFileRef.current
    if (!f || !repoPathRef.current) return
    try {
      const raw = await window.gitAPI?.getFileDiff(repoPathRef.current, f.p, diffFileStagedRef.current) ?? ''
      setDiffContent(raw)
    } catch (e) {
      console.error('refreshOpenDiff failed:', e)
    }
  }, [])

  // ── 윈도우 포커스 복귀 시 자동 새로고침 ──
  useEffect(() => {
    const handleFocus = () => {
      if (!repoPath) return
      // status/목록 갱신(Stage 목록은 controlled prop으로 자동 반영) + 열려있는 diff 재로딩(B15)
      loadRepo(repoPath, { silent: true }).then(() => refreshOpenDiff())
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [repoPath, loadRepo, refreshOpenDiff])

  // ── hunk 단위 stage/unstage ──
  const handleApplyHunk = useCallback(async (hunkIndex: number) => {
    if (!repoPath || !diffFile || applyingHunk != null) return
    setApplyingHunk(hunkIndex)
    try {
      await window.gitAPI?.applyHunk(repoPath, diffFile.p, hunkIndex, diffFileStaged)
      // 실제 git 상태 갱신 → StageArea는 realUnstaged/realStaged prop 변경으로 자동 반영.
      // 현재 파일 diff도 재로딩.
      await loadRepo(repoPath, { silent: true })
      const raw = await window.gitAPI?.getFileDiff(repoPath, diffFile.p, diffFileStaged) ?? ''
      setDiffContent(raw)
      notify('success', diffFileStaged ? 'Hunk unstaged' : 'Hunk staged', diffFile.p)
    } catch (e) {
      notify('error', 'Hunk 적용 실패', e instanceof Error ? e.message : String(e))
    } finally {
      setApplyingHunk(null)
    }
  }, [repoPath, diffFile, diffFileStaged, applyingHunk, loadRepo, notify])

  // ── 커밋 로그 추가 로드 (페이지네이션) ──
  const loadMoreCommits = useCallback(async () => {
    if (!repoPath || loadingMore) return
    const nextLimit = logLimit + LOG_PAGE
    setLoadingMore(true)
    try {
      const gitCommits = await window.gitAPI?.getLog(repoPath, { limit: nextLimit, all: showAllBranches }) ?? []
      const hashes = gitCommits.map(c => c.id)
      const laneMap = computeLanes(gitCommits)
      setRealCommits(gitCommits.map(c => toAppCommit(c, hashes, laneMap)))
      setLogLimit(nextLimit)
      setHasMoreCommits(gitCommits.length >= nextLimit)
    } catch (e) {
      notify('error', '커밋 로드 실패', e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingMore(false)
    }
  }, [repoPath, loadingMore, logLimit, showAllBranches, notify])

  // ── 전체 브랜치 표시 토글 ──
  const toggleAllBranches = useCallback(() => {
    const next = !showAllBranchesRef.current
    showAllBranchesRef.current = next
    setShowAllBranches(next)
    logLimitRef.current = LOG_PAGE
    setLogLimit(LOG_PAGE)
    if (repoPathRef.current) loadRepo(repoPathRef.current, { silent: true })
  }, [loadRepo])

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

  // ── CommitDetail Diff 버튼: 커밋 특정 파일 diff 로드 (git:commit-file-diff) ──
  const handleOpenCommitFileDiff = useCallback(async (filePath: string) => {
    const commit = filteredCommits[selIdx] ?? null
    if (!repoPath || !commit || !filePath) return
    setLoadingDiff(true)
    setDiffContent('')
    setView('diff')
    try {
      const raw = await window.gitAPI?.getCommitFileDiff(repoPath, commit.id, filePath) ?? ''
      setDiffContent(raw)
      setDiffFile({ p: filePath, s: 'M', a: 0, d: 0 } as FileEntry)
    } catch (e) {
      console.error('getCommitFileDiff failed:', e)
      setDiffContent('')
    } finally {
      setLoadingDiff(false)
    }
  }, [repoPath, filteredCommits, selIdx])

  // ── CommitDetail 파일 선택 시 diff 미리보기 로드 ──
  const handleCommitFileSelect = useCallback(async (filePath: string) => {
    const commit = filteredCommits[selIdx] ?? null
    if (!repoPath || !commit || !filePath) return
    setLoadingPreview(true)
    setCommitDiffPreview('')
    try {
      const raw = await window.gitAPI?.getCommitFileDiff(repoPath, commit.id, filePath) ?? ''
      setCommitDiffPreview(raw)
    } catch (e) {
      setCommitDiffPreview('')
    } finally {
      setLoadingPreview(false)
    }
  }, [repoPath, filteredCommits, selIdx])

  // ── 커밋 선택 시 파일 목록 로드 (git:files) ──
  const handleSelectCommit = useCallback(async (idx: number) => {
    setSelIdx(idx)
    const commit = filteredCommits[idx]
    if (!commit || !repoPath) return

    setCommitDiffPreview('')
    setLoadingFiles(true)
    try {
      const files = await window.gitAPI?.getFiles(repoPath, commit.id) ?? []
      setCommitFiles(files)
      if (files[0]?.path) {
        setLoadingPreview(true)
        const raw = await window.gitAPI?.getCommitFileDiff(repoPath, commit.id, files[0].path) ?? ''
        setCommitDiffPreview(raw)
        setLoadingPreview(false)
      }
    } catch (e) {
      console.error('getFiles failed:', e)
      setCommitFiles([])
      setLoadingPreview(false)
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
        else if (showRepoManager) setShowRepoManager(false)
        else if (searchQuery) { setSearchQuery(''); srchRef.current?.focus() }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '1') { e.preventDefault(); setView('history') }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') { e.preventDefault(); setView('commit') }
      if ((e.metaKey || e.ctrlKey) && e.key === '3') { e.preventDefault(); setView('diff') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [showCmd, ctxMenu, showMerge, showCherryPick, showStash, showBranch, showRebase, showSettings, showAddRepo, showConflict, showRepoManager, searchQuery])

  // ── 히스토리 뷰: 방향키 위/아래로 커밋 선택, Enter로 해당 커밋 Diff 열기 ──
  useEffect(() => {
    if (view !== 'history') return
    const h = (e: KeyboardEvent) => {
      // 포커스가 인터랙티브 요소(입력/버튼/탭 등 자체 키 처리)에 있으면 양보.
      const t = e.target as HTMLElement | null
      if (t && t.closest('input, textarea, select, button, a, [role="tab"], [contenteditable="true"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (showCmd || ctxMenu || showMerge || showCherryPick || showStash || showBranch ||
          showRebase || showSettings || showAddRepo || showConflict || showRepoManager) return
      const n = filteredCommits.length
      if (n === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = Math.min(selIdx + 1, n - 1)
        if (next !== selIdx) void handleSelectCommit(next)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = Math.max(selIdx - 1, 0)
        if (prev !== selIdx) void handleSelectCommit(prev)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        void handleSelectCommit(selIdx)
        setView('diff')
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [view, filteredCommits, selIdx, handleSelectCommit, showCmd, ctxMenu, showMerge,
      showCherryPick, showStash, showBranch, showRebase, showSettings, showAddRepo, showConflict, showRepoManager])

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
  }, [handlePull, handlePush, handleFetch])

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
    else if (action === 'revert' && ctxMenu && repoPath) {
      window.gitAPI?.revert(repoPath, ctxMenu.commit.id)
        .then(() => { notify('success', 'Reverted', `Changes from ${ctxMenu.commit.id} staged for revert`); return loadRepo(repoPath, { silent: true }) })
        .catch(err => notify('error', 'Revert 실패', err instanceof Error ? err.message : String(err)))
    }
    else if (action?.startsWith('reset-') && ctxMenu && repoPath) {
      const mode = action.split('-')[1] as 'soft' | 'mixed' | 'hard'
      window.gitAPI?.reset(repoPath, mode, ctxMenu.commit.id)
        .then(() => { notify('warning', `Reset (${mode})`, `HEAD reset to ${ctxMenu.commit.id}`); return loadRepo(repoPath, { silent: true }) })
        .catch(err => notify('error', 'Reset 실패', err instanceof Error ? err.message : String(err)))
    }
    else if (action === 'tag-here' && ctxMenu && repoPath) {
      const tagName = prompt('Tag name:')
      if (tagName?.trim()) {
        window.gitAPI?.createTag(repoPath, tagName.trim(), ctxMenu.commit.id)
          .then(() => { notify('success', 'Tag created', `'${tagName}' → ${ctxMenu.commit.id}`); return loadRepo(repoPath, { silent: true }) })
          .catch(err => notify('error', 'Tag 실패', err instanceof Error ? err.message : String(err)))
      }
    }
  }, [ctxMenu, notify, repoPath, loadRepo])

  const handleBranchAction = useCallback((mode: BranchTab) => { setBranchTab(mode); setShowBranch(true) }, [])

  const handleBranchCtxAction = useCallback((action: BranchMenuAction, name: string) => {
    if (action === 'checkout') { handleBranchSwitch(name) }
    else if (action === 'new-branch-from') { setBranchTab('create'); setShowBranch(true) }
    else if (action === 'merge-into-current') { setShowMerge(true) }
    else if (action === 'rebase-onto') { setShowMerge(true) }
    else if (action === 'rename') { setBranchTab('rename'); setShowBranch(true) }
    else if (action === 'delete') { setBranchTab('delete'); setShowBranch(true) }
    else if (action === 'copy-name') {
      navigator.clipboard?.writeText(name).catch(() => {})
      notify('success', '복사됨', name)
    }
    else if (action === 'push' && repoPath) {
      window.gitAPI?.push(repoPath)
        .then(() => notify('success', 'Push 완료', name, undefined, 4000, 'merge'))
        .catch(e => notify('error', 'Push 실패', e instanceof Error ? e.message : String(e)))
    }
    else if (action === 'pull' && repoPath) {
      window.gitAPI?.pull(repoPath)
        .then(() => { notify('success', 'Pull 완료', name); loadRepo(repoPath) })
        .catch(e => notify('error', 'Pull 실패', e instanceof Error ? e.message : String(e)))
    }
  }, [handleBranchSwitch, repoPath, notify, loadRepo])

  const repo = repos[activeRepo] || null
  const displayBranch = repo?.branch || activeBranch

  // 저장소 상태 → 그루 표정 1:1 매핑 (디자인: clean→sleepy, syncing→think, conflict→conflict)
  const geuruState: GeuruExpr = showConflict
    ? 'conflict'
    : remoteOp
      ? 'think'
      : repo?.dirty
        ? 'idle'
        : 'sleepy'

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
        <span className="app-name" style={{ marginRight: 10, display: 'flex', alignItems: 'center', gap: 7 }}><span className="mark-slot"><Geuru expr="happy" scale={1} title="GitGrove" /></span>GitGrove</span>
        <div style={{ width: 1, height: 20, background: 'var(--c-border)', flexShrink: 0, marginRight: 6 }} />
        <div
          className={`tb-repos-tab${showRepoManager ? ' on' : ''}`}
          onClick={() => setShowRepoManager(true)}
          title="Repository Manager"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="5.5" height="5.5" rx="1"/><rect x="8.5" y="2" width="5.5" height="5.5" rx="1"/><rect x="2" y="8.5" width="5.5" height="5.5" rx="1"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1"/></svg>
          Repositories
        </div>
        <RepoTabs
          repos={repos}
          active={showRepoManager ? -1 : activeRepo}
          onSelect={i => { setShowRepoManager(false); setActiveRepo(i) }}
          onAdd={() => setShowAddRepo(true)}
          onClose={handleCloseRepoTab}
        />
        <div className="sep" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--c-text-faint)', fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: 'var(--c-gold-300)' }}>⎇</span>{displayBranch}
          {repo && repo.ahead > 0 && <span style={{ color: 'var(--c-success)' }}>↑{repo.ahead}</span>}
          {repo && repo.behind > 0 && <span>↓{repo.behind}</span>}
        </div>
        <NotificationBell
          githubToken={githubToken}
          gitlabInstances={gitlabInstances}
          onOpenUrl={url => window.appAPI?.openReleaseUrl(url)}
        />
      </div>

      {/* Action bar — Repository Manager 활성 시 숨김 */}
      {!showRepoManager && (
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
      )}

      {/* App body */}
      <div className="app-body" style={{ position: 'relative' }}>

        {showRepoManager ? (
          <RepoManager
            repos={repos}
            activeRepo={activeRepo}
            githubConnected={!!githubToken}
            githubToken={githubToken}
            githubLogin={githubUser?.login ?? null}
            gitlabConnected={gitlabConnected}
            gitlabInstances={gitlabInstances}
            recents={recents}
            favorites={favorites}
            workspaces={workspaces}
            onToggleFavorite={toggleFavorite}
            onOpenPath={(path) => { setShowRepoManager(false); void loadRepo(path, { activate: true }) }}
            onRemoveRepo={removeRepoFromGitgrove}
            onCreateWorkspace={createWorkspace}
            onRenameWorkspace={renameWorkspace}
            onDeleteWorkspace={deleteWorkspace}
            onToggleRepoInWorkspace={toggleRepoInWorkspace}
            onClone={handleClone}
            onBrowse={() => {
              void (async () => {
                const picked = await window.gitAPI?.openDialog()
                if (picked) { setShowRepoManager(false); await loadRepo(picked, { activate: true }) }
              })()
            }}
            onOpenUrl={url => window.appAPI?.openReleaseUrl(url)}
            onOpenGitlabSettings={() => { setSettingsTab('gitlab'); setShowSettings(true) }}
            notify={notify}
          />
        ) : isLoading ? renderLoading() : !repoPath ? renderEmptyState() : (
          <>
            <BranchSidebar
              activeBranch={activeBranch}
              onBranchAction={handleBranchAction}
              onBranchContextMenu={(e, name, type, isCurrent) => {
                e.preventDefault()
                setBranchCtxMenu({ x: e.clientX, y: e.clientY, name, type, isCurrent })
              }}
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
              repoProvider === 'gitlab' ? (
                <MRView repoPath={repoPath} onOpenUrl={url => window.appAPI?.openReleaseUrl(url)} />
              ) : (
                <PRView onOpenConflict={() => setShowConflict(true)} repoPath={repoPath} />
              )
            ) : view === 'blame' ? (
              <>
                <BlameView
                  onSelectCommit={i => { setSelIdx(i); setView('history') }}
                  repoPath={repoPath}
                  commits={filteredCommits}
                  filePath={diffFile?.p || selectedCommit?.files?.[0]?.p || (repoPath ? undefined : 'src/auth/jwt.ts')}
                />
              </>
            ) : view === 'diff' ? (
              <DiffExplorer commit={selectedCommit} repoPath={repoPath} commitFiles={repoPath ? commitFiles : undefined} />
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
                        {repoPath && (
                          <button
                            className={`allbranch-toggle${showAllBranches ? ' on' : ''}`}
                            onClick={toggleAllBranches}
                            title={showAllBranches ? '전체 브랜치 표시 중 (현재 브랜치만 보기)' : '현재 브랜치만 표시 중 (전체 브랜치 보기)'}
                          >
                            ⎇ All branches
                          </button>
                        )}
                        <span className="gha">Author</span>
                        <span className="ght">Time</span>
                      </div>
                      <CommitGraph
                        commits={filteredCommits}
                        selectedIdx={selIdx}
                        onSelect={handleSelectCommit}
                        onActivate={i => { void handleSelectCommit(i); setView('diff') }}
                        onContextMenu={(e, c, i) => setCtxMenu({ x: e.clientX, y: e.clientY, commit: c, idx: i })}
                        showStats={true}
                        rowH={rowH}
                        activeBranch={activeBranch}
                      />
                      {repoPath && hasMoreCommits && !searchQuery && (
                        <button className="loadmore-btn" onClick={loadMoreCommits} disabled={loadingMore}>
                          {loadingMore
                            ? <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>Loading…</span>
                            : `↓ Load ${LOG_PAGE} more commits`}
                        </button>
                      )}
                    </>
                  ) : (
                    <StageArea
                      onSelDiffFile={handleSelDiffFile}
                      unstaged={realUnstaged}
                      staged={realStaged}
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
                        fileDiffPreview={repoPath ? commitDiffPreview : undefined}
                        loadingPreview={loadingPreview}
                        onFileSelect={handleCommitFileSelect}
                        onOpenDiff={handleOpenCommitFileDiff}
                        onCherryPick={() => setShowCherryPick(true)}
                        onBlame={() => setView('blame')}
                      />
                    </>
                  ) : (
                    <DiffPanel
                      file={diffFile}
                      rawDiff={repoPath ? diffContent : undefined}
                      loading={loadingDiff}
                      staged={diffFileStaged}
                      onApplyHunk={repoPath ? handleApplyHunk : undefined}
                      applyingHunk={applyingHunk}
                    />
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Modals */}
        {showMerge       && <MergeModal
          onClose={() => setShowMerge(false)}
          onSuccess={() => { if (repoPath) { loadRepo(repoPath, { silent: true }); notify('success', 'Merge complete', '', undefined, 4000, 'merge') } }}
          branches={realBranches.length > 0 ? realBranches : undefined}
          repoPath={repoPath}
          currentBranch={activeBranch}
        />}
        {showCherryPick  && selectedCommit && <CherryPickModal
          commit={selectedCommit}
          onClose={() => setShowCherryPick(false)}
          onSuccess={() => { if (repoPath) { loadRepo(repoPath, { silent: true }); notify('success', 'Cherry-pick applied', selectedCommit.id) } }}
          repoPath={repoPath}
          currentBranch={activeBranch}
        />}
        {showBranch      && <BranchModal
          initialTab={branchTab}
          onClose={() => setShowBranch(false)}
          onSuccess={() => { if (repoPath) loadRepo(repoPath, { silent: true }) }}
          branches={realBranches.length > 0 ? realBranches : undefined}
          repoPath={repoPath}
        />}
        {showRebase      && <InteractiveRebaseModal
          onClose={() => setShowRebase(false)}
          onSuccess={() => { if (repoPath) { loadRepo(repoPath, { silent: true }); notify('info', 'Rebase complete', '') } }}
          repoPath={repoPath}
          commits={realCommits.length > 0 ? realCommits : undefined}
          currentBranch={activeBranch}
        />}
        {showStash       && <StashPanel onClose={() => setShowStash(false)} repoPath={repoPath} currentBranch={activeBranch} />}
        {showSettings    && <SettingsPanel onClose={() => { setShowSettings(false); setSettingsTab(undefined) }} repoPath={repoPath} initialTab={settingsTab} />}
        {showAddRepo     && (
          <AddRepoModal
            onClose={() => setShowAddRepo(false)}
            onAdd={r => { addRepo(r); notify('success', 'Repository added', r.name) }}
            onOpenPath={async (path) => {
              setShowAddRepo(false)
              await loadRepo(path, { activate: true })
            }}
            recentPaths={repos.map(r => ({ name: r.name, path: r.path }))}
          />
        )}
        {showConflict    && <ConflictEditorModal onClose={() => setShowConflict(false)} onComplete={() => notify('success', 'Conflicts resolved', 'Merge can now be completed')} />}

        <NotificationStack notifs={notifs} onDismiss={dismiss} />
      </div>

      <StatusBar
        branch={displayBranch}
        ahead={repo?.ahead}
        behind={repo?.behind}
        remote={repo ? `origin/${repo.branch}` : undefined}
        onSettings={() => setShowSettings(true)}
        githubUser={githubUser}
        repoRole={repoRole}
        repoSummary={showRepoManager ? { total: repos.length, dirty: repos.filter(r => r.dirty).length } : null}
        geuruState={showRepoManager ? 'idle' : geuruState}
      />

      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} commit={ctxMenu.commit} onClose={() => setCtxMenu(null)} onAction={handleCtxAction} />}

      {branchCtxMenu && (
        <BranchContextMenu
          x={branchCtxMenu.x}
          y={branchCtxMenu.y}
          branchName={branchCtxMenu.name}
          branchType={branchCtxMenu.type}
          isCurrent={branchCtxMenu.isCurrent}
          onClose={() => setBranchCtxMenu(null)}
          onAction={(action, name) => { handleBranchCtxAction(action, name); setBranchCtxMenu(null) }}
        />
      )}

      {showCmd && <CommandPalette onClose={() => setShowCmd(false)} onAction={handleCommand} />}
    </div>
  )
}
