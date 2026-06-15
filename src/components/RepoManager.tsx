import { useEffect, useMemo, useRef, useState } from 'react'
import type { Repo } from '../data/mockData'
import type { RecentRepoEntry, Workspace } from '../utils/repoStore'
import { parseGitHubRepo } from '../utils/github'
import { getUserRepos, GithubApiError, type GithubRepoSummary } from '../utils/githubClient'
import { ModalShell } from './modals/ModalShell'
import { ConfirmModal } from './modals/ConfirmModal'
import { GithubInbox } from './GithubInbox'

// ── 아이콘 (디자인 핸드오프 SVG 재현) ──
const IconAllRepos = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 3V2M11 3V2"/></svg>
)
const IconStar = ({ filled }: { filled?: boolean }) => (
  <svg viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke={filled ? undefined : 'currentColor'} strokeWidth="1.5"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10 4.4 12l.7-4L2.2 5.2l4-.6z"/></svg>
)
const IconClock = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 2"/></svg>
)
const IconBranch = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="5" cy="4" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="11" cy="4" r="2"/><path d="M5 6v4M5 6c0 2 6 2 6-2"/></svg>
)
const IconOpenExternal = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9"/><path d="M10 2h4v4M14 2l-6 6"/></svg>
)
const IconKebab = () => (
  <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13" r="1.4"/></svg>
)
const IconTrash = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 4h10M6.5 4V2.5h3V4M5 4l.6 9a1 1 0 0 0 1 1h2.8a1 1 0 0 0 1-1L11 4"/></svg>
)
const IconSearch = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6.5" cy="6.5" r="4"/><path d="M10.5 10.5l3 3"/></svg>
)
const IconChevron = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4"/></svg>
)
const IconWorkspace = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="12" height="8" rx="1.5"/><path d="M5 4V3a3 3 0 0 1 6 0v1"/></svg>
)
const IconPlus = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 3v10M3 8h10"/></svg>
)
const IconGitHub = () => (
  <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
)
const IconGitLab = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="5" height="8" rx="1"/><rect x="9" y="3" width="5" height="10" rx="1"/><path d="M7 9h2"/></svg>
)
const IconInbox = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 9l2-6h8l2 6M2 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9M2 9h3l1 2h4l1-2h3"/></svg>
)

// 사이드바 선택: 내장 보기('all'/'favorites'/'recent') 또는 사용자 워크스페이스(id)
type View = 'all' | 'favorites' | 'recent'
type Selection =
  | { kind: 'view'; view: View }
  | { kind: 'workspace'; id: string }
  | { kind: 'github' }
  | { kind: 'inbox' }

// path → 표시용 레포 정보(이름/브랜치). 열린 레포가 우선, 없으면 최근 캐시, 둘 다 없으면 폴더명.
interface RepoDesc { name: string; branch: string; dirty?: number; open: boolean }
function basename(p: string): string {
  const seg = p.split(/[\\/]/).filter(Boolean).pop()
  return seg || p
}

interface BranchChipProps { branch: string; dirty?: number }
function BranchChip({ branch, dirty }: BranchChipProps) {
  const isMain = branch === 'main' || branch === 'master'
  return (
    <>
      <span className={`rm-branch-chip${isMain ? ' rm-bc-main' : ''}`}>
        <IconBranch />
        <span className="rm-bname">{branch || '—'}</span>
      </span>
      {dirty != null && dirty > 0 && (
        <span className="rm-dirty-badge">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 2v8M8 13v1"/></svg>
          <span>{dirty}</span>
        </span>
      )}
    </>
  )
}

interface RowProps {
  name: string
  owner?: string
  branch: string
  dirty?: number
  isFavorite: boolean
  isSelected: boolean
  faded?: boolean
  onSelect: () => void
  onToggleStar: () => void
  onOpen: () => void
  onMenu: (e: React.MouseEvent) => void
}
function RepoRow({ name, owner, branch, dirty, isFavorite, isSelected, faded, onSelect, onToggleStar, onOpen, onMenu }: RowProps) {
  return (
    <div
      className={`rm-row${isSelected ? ' selected' : ''}`}
      style={faded ? { opacity: 0.82 } : undefined}
      title="더블클릭으로 열기"
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <div className="rm-row-checks">
        <span
          className={`rm-row-star${isFavorite ? ' active' : ''}`}
          title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          onClick={e => { e.stopPropagation(); onToggleStar() }}
        >
          <IconStar filled={isFavorite} />
        </span>
      </div>
      <div className="rm-row-name">
        <span className="rm-row-name-text">{name}</span>
      </div>
      <div className="rm-row-owner">{owner || '—'}</div>
      <div className="rm-row-branch"><BranchChip branch={branch} dirty={dirty} /></div>
      <div className="rm-row-actions">
        <button className="rm-row-action-btn" title="메뉴" onClick={e => { e.stopPropagation(); onMenu(e) }}><IconKebab /></button>
      </div>
    </div>
  )
}

interface SectionProps {
  title: string
  count: number
  children: React.ReactNode
  hasHeaderColumns?: boolean
  lastBranchLabel?: boolean
}
function Section({ title, count, children, hasHeaderColumns = true, lastBranchLabel }: SectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="rm-section">
      <div className="rm-section-header" onClick={() => setCollapsed(c => !c)}>
        <span className={`rm-section-chevron${collapsed ? ' collapsed' : ''}`}><IconChevron /></span>
        <span className="rm-section-title">{title}</span>
        <span className="rm-section-count">{count}</span>
      </div>
      {!collapsed && (
        <div>
          {hasHeaderColumns && (
            <div className="rm-table-header">
              <span />
              <span>이름</span>
              <span>소유자</span>
              <span>{lastBranchLabel ? '마지막 브랜치' : '브랜치'}</span>
              <span />
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

// ── New Workspace 모달 ──
function NewWorkspaceModal({ onCreate, onClose }: { onCreate: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const submit = () => { const t = name.trim(); if (t) onCreate(t) }
  return (
    <ModalShell title="새 워크스페이스" icon={<span className="rm-modal-ic"><IconWorkspace /></span>} width={400} onClose={onClose}>
      <div className="rm-modal-body">
        <label className="rm-modal-label">워크스페이스 이름</label>
        <input
          ref={ref}
          className="rm-modal-input"
          placeholder="예: 회사, 개인 프로젝트, 백엔드…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
        />
        <div className="rm-modal-actions">
          <button className="rm-modal-btn" onClick={onClose}>취소</button>
          <button className="rm-modal-btn rm-primary" disabled={!name.trim()} onClick={submit}>만들기</button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Clone 모달 ──
function CloneModal({ onClone, onClose }: { onClone: (url: string) => Promise<boolean>; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const submit = async () => {
    const t = url.trim()
    if (!t || busy) return
    setBusy(true)
    const ok = await onClone(t)
    if (!ok) setBusy(false) // 성공 시엔 매니저가 닫히며 언마운트됨
  }
  return (
    <ModalShell title="원격 저장소 클론" icon={<span className="rm-modal-ic"><IconOpenExternal /></span>} width={460} onClose={busy ? () => {} : onClose}>
      <div className="rm-modal-body">
        <label className="rm-modal-label">저장소 URL</label>
        <input
          ref={ref}
          className="rm-modal-input"
          placeholder="https://github.com/owner/repo.git"
          value={url}
          disabled={busy}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape' && !busy) onClose() }}
        />
        <div className="rm-modal-hint">{busy ? '클론 중…' : '다음 단계에서 저장할 부모 폴더를 선택합니다.'}</div>
        <div className="rm-modal-actions">
          <button className="rm-modal-btn" disabled={busy} onClick={onClose}>취소</button>
          <button className="rm-modal-btn rm-primary" disabled={!url.trim() || busy} onClick={() => void submit()}>
            {busy ? '클론 중…' : '폴더 선택 후 클론'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── GitHub 레포 브라우저 (B18) ──
const IconLock = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3.5" y="7" width="9" height="6" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>
)

interface GithubBrowserProps {
  repos: GithubRepoSummary[]
  total: number
  loading: boolean
  error: string | null
  query: string
  cloningFullName: string | null
  isLocal: (fullName: string) => boolean
  onQueryChange: (q: string) => void
  onRefresh: () => void
  onAction: (repo: GithubRepoSummary) => void
}
function GithubBrowser({
  repos, total, loading, error, query, cloningFullName,
  isLocal, onQueryChange, onRefresh, onAction,
}: GithubBrowserProps) {
  return (
    <>
      <div className="rm-filter-bar">
        <div className="rm-search-wrap">
          <IconSearch />
          <input
            type="text"
            placeholder="GitHub 레포 검색 (이름 / owner/name)…"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
          />
        </div>
        <button
          className="pr-refresh-btn"
          title="새로고침"
          disabled={loading}
          onClick={onRefresh}
        >
          <span style={loading ? { display: 'inline-block', animation: 'spin 600ms linear infinite' } : undefined}>⟳</span>
        </button>
        {total > 0 && <span className="rm-gh-count">{repos.length} / {total}</span>}
      </div>

      <div className="rm-list">
        {loading && repos.length === 0 ? (
          <div className="rm-gh-status"><span className="sett-spinner" /> 레포 목록 불러오는 중…</div>
        ) : error ? (
          <div className="rm-gh-status rm-gh-error">{error}</div>
        ) : repos.length === 0 ? (
          <div className="rm-empty-section">
            {total === 0 ? '표시할 GitHub 레포가 없습니다.' : '검색 결과가 없습니다.'}
          </div>
        ) : (
          repos.map(repo => {
            const local = isLocal(repo.full_name)
            const cloning = cloningFullName === repo.full_name
            return (
              <div key={repo.id} className="rm-gh-row">
                <div className="rm-gh-info">
                  <div className="rm-gh-title">
                    <span className="rm-gh-name">{repo.name}</span>
                    {repo.private && <span className="rm-gh-meta-ic" title="비공개"><IconLock /></span>}
                    {repo.archived && <span className="rm-gh-tag">archived</span>}
                    {repo.fork && <span className="rm-gh-tag">fork</span>}
                  </div>
                  <div className="rm-gh-sub">
                    <span className="rm-gh-full">{repo.full_name}</span>
                    {repo.language && <span className="rm-gh-dot">·</span>}
                    {repo.language && <span>{repo.language}</span>}
                    {repo.stargazers_count > 0 && <span className="rm-gh-dot">·</span>}
                    {repo.stargazers_count > 0 && <span>★ {repo.stargazers_count}</span>}
                  </div>
                </div>
                <div className="rm-gh-action">
                  <button
                    className={`rm-action-btn${local ? '' : ' rm-primary'}`}
                    disabled={cloning}
                    onClick={() => onAction(repo)}
                  >
                    {cloning ? <span className="sett-spinner" /> : local ? '열기' : 'Clone'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

export interface RepoManagerProps {
  repos: Repo[]
  activeRepo: number
  githubConnected: boolean
  githubToken: string
  /** 본인 GitHub login (인박스 검색 쿼리용). 미연결이면 null */
  githubLogin: string | null
  recents: RecentRepoEntry[]
  favorites: string[]
  workspaces: Workspace[]
  onToggleFavorite: (path: string) => void
  onOpenPath: (path: string, name?: string, branch?: string) => void
  onRemoveRepo: (path: string) => void
  onCreateWorkspace: (name: string) => string
  onRenameWorkspace: (id: string, name: string) => void
  onDeleteWorkspace: (id: string) => void
  onToggleRepoInWorkspace: (id: string, path: string) => void
  onClone: (url: string) => Promise<boolean>
  onBrowse: () => void
  /** 외부 브라우저로 URL 열기 (인박스 항목 클릭) */
  onOpenUrl: (url: string) => void
  notify: (type: 'info' | 'success' | 'warning' | 'error', title: string, body: string) => void
}

export function RepoManager({
  repos, activeRepo, githubConnected, githubToken, githubLogin, recents, favorites, workspaces,
  onToggleFavorite, onOpenPath, onRemoveRepo, onCreateWorkspace, onRenameWorkspace,
  onDeleteWorkspace, onToggleRepoInWorkspace, onClone, onBrowse, onOpenUrl, notify,
}: RepoManagerProps) {
  const [sel, setSel] = useState<Selection>({ kind: 'view', view: 'all' })
  const [query, setQuery] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | null>(repos[activeRepo]?.path ?? null)
  // path → owner (remote에서 lazily 추출)
  const [owners, setOwners] = useState<Record<string, string>>({})
  // 행 케밥 메뉴 / 모달 상태
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null)
  const [wsModal, setWsModal] = useState<{ pendingPath: string | null } | null>(null)
  const [cloneOpen, setCloneOpen] = useState(false)
  // 파괴적 액션 확인 모달
  const [deleteWsConfirm, setDeleteWsConfirm] = useState<Workspace | null>(null)
  const [removeRepoConfirm, setRemoveRepoConfirm] = useState<{ path: string; name: string } | null>(null)
  // 워크스페이스 인라인 이름변경
  const [renamingWs, setRenamingWs] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')

  // ── GitHub 레포 브라우저 상태 (B18) ──
  // path → "owner/name"(소문자). 로컬 매칭 판정용. 열린 레포 + 최근 캐시 모두 lazy 해석.
  const [ghLocal, setGhLocal] = useState<Record<string, string>>({})
  const [ghRepos, setGhRepos] = useState<GithubRepoSummary[] | null>(null)
  const [ghLoading, setGhLoading] = useState(false)
  const [ghError, setGhError] = useState<string | null>(null)
  const [ghQuery, setGhQuery] = useState('')
  const [ghCloning, setGhCloning] = useState<string | null>(null)

  const favSet = useMemo(() => new Set(favorites), [favorites])

  // 선택된 워크스페이스가 삭제되면 '모든 저장소'로 복귀
  useEffect(() => {
    if (sel.kind === 'workspace' && !workspaces.some(w => w.id === sel.id)) {
      setSel({ kind: 'view', view: 'all' })
    }
  }, [workspaces, sel])

  // ── 열린 레포의 소유자를 remote에서 추출 (가벼운 로컬 조회, 원격 호출 없음) ──
  useEffect(() => {
    let cancelled = false
    repos.forEach(r => {
      if (owners[r.path] !== undefined) return
      window.gitAPI?.getRemotes(r.path)
        .then(remotes => {
          if (cancelled) return
          const origin = remotes.find(rm => rm.name === 'origin') ?? remotes[0]
          const info = origin && parseGitHubRepo(origin.url)
          setOwners(prev => ({ ...prev, [r.path]: info?.owner ?? '' }))
        })
        .catch(() => { if (!cancelled) setOwners(prev => ({ ...prev, [r.path]: '' })) })
    })
    return () => { cancelled = true }
  }, [repos, owners])

  // ── 로컬 레포의 "owner/name" 해석 (열린 레포 + 최근, remote에서 lazy) ──
  // GitHub 브라우저의 열기 vs Clone 판정에 사용. 원격 호출 없이 getRemotes만.
  useEffect(() => {
    let cancelled = false
    const paths = new Set<string>([...repos.map(r => r.path), ...recents.map(r => r.path)])
    paths.forEach(path => {
      if (ghLocal[path] !== undefined) return
      window.gitAPI?.getRemotes(path)
        .then(remotes => {
          if (cancelled) return
          const origin = remotes.find(rm => rm.name === 'origin') ?? remotes[0]
          const info = origin && parseGitHubRepo(origin.url)
          setGhLocal(prev => ({ ...prev, [path]: info ? `${info.owner}/${info.repo}`.toLowerCase() : '' }))
        })
        .catch(() => { if (!cancelled) setGhLocal(prev => ({ ...prev, [path]: '' })) })
    })
    return () => { cancelled = true }
  }, [repos, recents, ghLocal])

  // full_name(소문자) → 로컬 path 매핑
  const localByFullName = useMemo(() => {
    const m = new Map<string, string>()
    Object.entries(ghLocal).forEach(([path, fullName]) => {
      if (fullName) m.set(fullName, path)
    })
    return m
  }, [ghLocal])

  // ── GitHub 레포 목록 fetch (마운트/선택/수동 새로고침) ──
  const loadGithubRepos = useMemo(() => {
    return async (force: boolean) => {
      if (!githubToken) return
      setGhLoading(true)
      setGhError(null)
      try {
        const list = await getUserRepos(githubToken, force ? { cache: false } : undefined)
        setGhRepos(list)
      } catch (err) {
        const msg = err instanceof GithubApiError
          ? err.message
          : err instanceof Error ? err.message : String(err)
        setGhError(msg)
      } finally {
        setGhLoading(false)
      }
    }
  }, [githubToken])

  useEffect(() => {
    if (sel.kind === 'github' && ghRepos === null && !ghLoading && !ghError) {
      void loadGithubRepos(false)
    }
  }, [sel, ghRepos, ghLoading, ghError, loadGithubRepos])

  const handleGhAction = async (repo: GithubRepoSummary) => {
    const localPath = localByFullName.get(repo.full_name.toLowerCase())
    if (localPath) {
      onOpenPath(localPath, repo.name, repo.default_branch)
      return
    }
    if (ghCloning) return
    setGhCloning(repo.full_name)
    try {
      const ok = await onClone(repo.clone_url)
      if (!ok) setGhCloning(null) // 성공 시 매니저가 닫히며 언마운트
    } catch {
      setGhCloning(null)
    }
  }

  // path → 표시정보 조회 (열린 레포 우선 → 최근 → 폴더명)
  const repoByPath = useMemo(() => {
    const m = new Map<string, RepoDesc>()
    repos.forEach(r => m.set(r.path, { name: r.name, branch: r.branch, dirty: r.dirty ? 1 : 0, open: true }))
    recents.forEach(r => { if (!m.has(r.path)) m.set(r.path, { name: r.name, branch: r.branch, open: false }) })
    return m
  }, [repos, recents])
  const describe = (path: string): RepoDesc => repoByPath.get(path) ?? { name: basename(path), branch: '', open: false }

  const matchesQuery = (name: string) => {
    const q = query.trim().toLowerCase()
    return !q || name.toLowerCase().includes(q)
  }

  const openRepos = repos.filter(r => matchesQuery(r.name))
  const favoriteRepos = repos.filter(r => favSet.has(r.path) && matchesQuery(r.name))
  const filteredRecents = recents.filter(r => matchesQuery(r.name))

  const handleOpen = (path: string, name?: string, branch?: string) => onOpenPath(path, name, branch)

  const openMenu = (path: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ path, x: rect.right, y: rect.bottom + 4 })
  }

  const handleCreateWorkspace = (name: string) => {
    const id = onCreateWorkspace(name)
    if (wsModal?.pendingPath) onToggleRepoInWorkspace(id, wsModal.pendingPath)
    setSel({ kind: 'workspace', id })
    setWsModal(null)
    notify('success', '워크스페이스 생성', name)
  }

  const startRename = (w: Workspace) => { setRenamingWs(w.id); setRenameVal(w.name) }
  const commitRename = () => {
    if (renamingWs) {
      const t = renameVal.trim()
      if (t) onRenameWorkspace(renamingWs, t)
    }
    setRenamingWs(null)
  }

  const placeholder = (label: string) => () => notify('info', `${label} 준비 중`, '다음 버전에서 제공됩니다.')

  // 메인 리스트 렌더 분기
  const isView = sel.kind === 'view'
  const showOpen = isView && sel.view === 'all'
  const showFavorites = isView && (sel.view === 'all' || sel.view === 'favorites')
  const showRecent = isView && (sel.view === 'all' || sel.view === 'recent')
  const activeWs = sel.kind === 'workspace' ? workspaces.find(w => w.id === sel.id) ?? null : null
  const wsPaths = activeWs ? activeWs.paths.filter(p => matchesQuery(describe(p).name)) : []
  const menuTarget = menu ? describe(menu.path) : null
  const isGithub = sel.kind === 'github'
  const isInbox = sel.kind === 'inbox'

  const ghFiltered = useMemo(() => {
    if (!ghRepos) return []
    const q = ghQuery.trim().toLowerCase()
    if (!q) return ghRepos
    return ghRepos.filter(r =>
      r.name.toLowerCase().includes(q) || r.full_name.toLowerCase().includes(q))
  }, [ghRepos, ghQuery])

  return (
    <div className="rm-body">
      {/* ── Sidebar ── */}
      <div className="rm-sidebar">
        <div className="rm-sidebar-label">보기</div>
        <div className="rm-sidebar-section">
          <div className={`rm-sidebar-item${isView && sel.view === 'all' ? ' active' : ''}`} onClick={() => setSel({ kind: 'view', view: 'all' })}>
            <IconAllRepos />모든 저장소
            <span className={`rm-badge-count${isView && sel.view === 'all' ? ' active' : ''}`}>{repos.length}</span>
          </div>
          <div className={`rm-sidebar-item${isView && sel.view === 'favorites' ? ' active' : ''}`} onClick={() => setSel({ kind: 'view', view: 'favorites' })}>
            <IconStar />즐겨찾기
            <span className={`rm-badge-count${isView && sel.view === 'favorites' ? ' active' : ''}`}>{favoriteRepos.length}</span>
          </div>
          <div className={`rm-sidebar-item${isView && sel.view === 'recent' ? ' active' : ''}`} onClick={() => setSel({ kind: 'view', view: 'recent' })}>
            <IconClock />최근 열람
            <span className={`rm-badge-count${isView && sel.view === 'recent' ? ' active' : ''}`}>{recents.length}</span>
          </div>
        </div>

        <div className="rm-sidebar-divider" />
        <div className="rm-sidebar-label">
          워크스페이스
          <button className="rm-ws-add" title="새 워크스페이스" onClick={() => setWsModal({ pendingPath: null })}><IconPlus /></button>
        </div>
        <div className="rm-sidebar-section">
          {workspaces.length === 0 && (
            <div className="rm-ws-empty">+ 로 워크스페이스를 만들어<br />레포를 분류하세요.</div>
          )}
          {workspaces.map(w => {
            const active = sel.kind === 'workspace' && sel.id === w.id
            if (renamingWs === w.id) {
              return (
                <div key={w.id} className="rm-sidebar-item">
                  <IconWorkspace />
                  <input
                    className="rm-ws-rename-input"
                    autoFocus
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingWs(null) }}
                  />
                </div>
              )
            }
            return (
              <div
                key={w.id}
                className={`rm-sidebar-item rm-ws-item${active ? ' active' : ''}`}
                onClick={() => setSel({ kind: 'workspace', id: w.id })}
                onDoubleClick={() => startRename(w)}
                title="더블클릭으로 이름 변경"
              >
                <IconWorkspace /><span className="rm-ws-name">{w.name}</span>
                <span className={`rm-badge-count${active ? ' active' : ''}`}>{w.paths.length}</span>
                <button
                  className="rm-ws-del"
                  title="워크스페이스 삭제"
                  onClick={e => { e.stopPropagation(); setDeleteWsConfirm(w) }}
                ><IconTrash /></button>
              </div>
            )
          })}
        </div>

        <div className="rm-sidebar-divider" />
        <div className="rm-sidebar-label">서비스 연결</div>
        <div className="rm-sidebar-section">
          {githubConnected && githubLogin ? (
            <div
              className={`rm-sidebar-item${isInbox ? ' active' : ''}`}
              title="모든 레포의 내 PR/이슈 모아보기"
              onClick={() => setSel({ kind: 'inbox' })}
            >
              <IconInbox />내 작업
            </div>
          ) : (
            <div className="rm-sidebar-item rm-disabled" title="내 작업 — GitHub 연결 필요 (설정에서 토큰 등록)">
              <IconInbox />내 작업
            </div>
          )}
          {githubConnected ? (
            <div
              className={`rm-sidebar-item${isGithub ? ' active' : ''}`}
              title="내 GitHub 레포 둘러보기"
              onClick={() => setSel({ kind: 'github' })}
            >
              <IconGitHub />GitHub
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--c-success)' }}>●</span>
            </div>
          ) : (
            <div className="rm-sidebar-item rm-disabled" title="GitHub 연결 필요 (설정에서 토큰 등록)">
              <IconGitHub />GitHub
            </div>
          )}
          <div className="rm-sidebar-item rm-disabled" title="준비 중">
            <IconGitLab />GitLab
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="rm-main">
        <div className="rm-content-header">
          <div className="rm-content-title">Repository Management</div>
          <div className="rm-action-bar">
            <button className="rm-action-btn" onClick={() => setCloneOpen(true)} title="원격 저장소 클론">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 8a6 6 0 1 1 12 0"/><path d="M8 3v2M5 4.5l1.5 1.5M11 4.5L9.5 6"/></svg>
              Clone
            </button>
            <button className="rm-action-btn rm-primary" onClick={onBrowse}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 13h10M8 3v7M5 7l3-4 3 4"/></svg>
              Browse
            </button>
            <button className="rm-action-btn rm-disabled" onClick={placeholder('Init')} title="준비 중">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 2v12M2 8h12"/></svg>
              Init
            </button>
            <div className="rm-action-sep" />
            <button className="rm-action-btn" onClick={() => setWsModal({ pendingPath: null })} title="새 워크스페이스 만들기">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="4" width="12" height="8" rx="1.5"/><path d="M5 4V3a3 3 0 0 1 6 0v1"/></svg>
              New Workspace
            </button>
            <button className="rm-action-btn rm-disabled" onClick={placeholder('Integrations')} title="준비 중">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 2"/></svg>
              Integrations
            </button>
          </div>
        </div>

        {isInbox ? (
          <GithubInbox
            githubToken={githubToken}
            githubLogin={githubLogin}
            onOpenUrl={onOpenUrl}
          />
        ) : isGithub ? (
          <GithubBrowser
            repos={ghFiltered}
            total={ghRepos?.length ?? 0}
            loading={ghLoading}
            error={ghError}
            query={ghQuery}
            cloningFullName={ghCloning}
            isLocal={fullName => localByFullName.has(fullName.toLowerCase())}
            onQueryChange={setGhQuery}
            onRefresh={() => void loadGithubRepos(true)}
            onAction={repo => void handleGhAction(repo)}
          />
        ) : (
        <>
        {/* Filter bar */}
        <div className="rm-filter-bar">
          <div className="rm-search-wrap">
            <IconSearch />
            <input
              type="text"
              placeholder="Search repositories…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Repo list */}
        <div className="rm-list">
          {showOpen && (
            <Section title="Open repositories" count={openRepos.length}>
              {openRepos.length === 0 ? (
                <div className="rm-empty-section">열린 저장소가 없습니다. Browse 로 추가하세요.</div>
              ) : openRepos.map(r => (
                <RepoRow
                  key={r.path}
                  name={r.name}
                  owner={owners[r.path]}
                  branch={r.branch}
                  dirty={r.dirty ? 1 : 0}
                  isFavorite={favSet.has(r.path)}
                  isSelected={selectedPath === r.path}
                  onSelect={() => setSelectedPath(r.path)}
                  onToggleStar={() => onToggleFavorite(r.path)}
                  onOpen={() => handleOpen(r.path, r.name, r.branch)}
                  onMenu={e => openMenu(r.path, e)}
                />
              ))}
            </Section>
          )}

          {showFavorites && (
            <Section title="Favorites" count={favoriteRepos.length}>
              {favoriteRepos.length === 0 ? (
                <div className="rm-empty-section">즐겨찾기한 저장소가 없습니다. ☆ 를 클릭해 추가하세요.</div>
              ) : favoriteRepos.map(r => (
                <RepoRow
                  key={r.path}
                  name={r.name}
                  owner={owners[r.path]}
                  branch={r.branch}
                  dirty={r.dirty ? 1 : 0}
                  isFavorite
                  isSelected={selectedPath === r.path}
                  onSelect={() => setSelectedPath(r.path)}
                  onToggleStar={() => onToggleFavorite(r.path)}
                  onOpen={() => handleOpen(r.path, r.name, r.branch)}
                  onMenu={e => openMenu(r.path, e)}
                />
              ))}
            </Section>
          )}

          {showRecent && (
            <Section title="Recent repositories" count={filteredRecents.length} lastBranchLabel>
              {filteredRecents.length === 0 ? (
                <div className="rm-empty-section">최근 열람한 저장소가 없습니다.</div>
              ) : filteredRecents.map(r => (
                <RepoRow
                  key={r.path}
                  name={r.name}
                  owner={owners[r.path]}
                  branch={r.branch}
                  isFavorite={favSet.has(r.path)}
                  isSelected={selectedPath === r.path}
                  faded
                  onSelect={() => setSelectedPath(r.path)}
                  onToggleStar={() => onToggleFavorite(r.path)}
                  onOpen={() => handleOpen(r.path, r.name, r.branch)}
                  onMenu={e => openMenu(r.path, e)}
                />
              ))}
            </Section>
          )}

          {activeWs && (
            <Section title={activeWs.name} count={wsPaths.length}>
              {wsPaths.length === 0 ? (
                <div className="rm-empty-section">이 워크스페이스에 저장소가 없습니다. 레포 행의 ⋯ 메뉴 → 워크스페이스에서 추가하세요.</div>
              ) : wsPaths.map(p => {
                const d = describe(p)
                return (
                  <RepoRow
                    key={p}
                    name={d.name}
                    owner={owners[p]}
                    branch={d.branch}
                    dirty={d.dirty}
                    isFavorite={favSet.has(p)}
                    isSelected={selectedPath === p}
                    faded={!d.open}
                    onSelect={() => setSelectedPath(p)}
                    onToggleStar={() => onToggleFavorite(p)}
                    onOpen={() => handleOpen(p, d.name, d.branch)}
                    onMenu={e => openMenu(p, e)}
                  />
                )
              })}
            </Section>
          )}
        </div>
        </>
        )}
      </div>

      {/* ── 행 케밥 메뉴 ── */}
      {menu && menuTarget && (
        <>
          <div className="rm-menu-backdrop" onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null) }} />
          <div className="rm-menu" style={{ left: menu.x, top: menu.y, transform: 'translateX(-100%)' }} onClick={e => e.stopPropagation()}>
            <div className="rm-menu-item" onClick={() => { handleOpen(menu.path, menuTarget.name, menuTarget.branch); setMenu(null) }}>
              <IconOpenExternal />리포지토리로 이동
            </div>
            <div className="rm-menu-sep" />
            <div className="rm-menu-label">워크스페이스</div>
            {workspaces.length === 0 && <div className="rm-menu-hint">아직 워크스페이스가 없습니다.</div>}
            {workspaces.map(w => {
              const inWs = w.paths.includes(menu.path)
              return (
                <div key={w.id} className="rm-menu-item rm-menu-check" onClick={() => onToggleRepoInWorkspace(w.id, menu.path)}>
                  <span className={`rm-check${inWs ? ' on' : ''}`}>{inWs ? '✓' : ''}</span>
                  <span className="rm-menu-wsname">{w.name}</span>
                </div>
              )
            })}
            <div className="rm-menu-item rm-menu-sub" onClick={() => { const p = menu.path; setMenu(null); setWsModal({ pendingPath: p }) }}>
              <IconPlus />새 워크스페이스…
            </div>
            <div className="rm-menu-sep" />
            <div className="rm-menu-item danger" onClick={() => { setRemoveRepoConfirm({ path: menu.path, name: menuTarget.name }); setMenu(null) }}>
              <IconTrash />GitGrove에서 제거
            </div>
          </div>
        </>
      )}

      {wsModal && (
        <NewWorkspaceModal onCreate={handleCreateWorkspace} onClose={() => setWsModal(null)} />
      )}
      {cloneOpen && (
        <CloneModal
          onClone={async url => { const ok = await onClone(url); return ok }}
          onClose={() => setCloneOpen(false)}
        />
      )}
      {deleteWsConfirm && (
        <ConfirmModal
          title="워크스페이스 삭제"
          message={`'${deleteWsConfirm.name}' 워크스페이스를 삭제합니다. 저장소 파일은 삭제되지 않습니다.`}
          confirmLabel="삭제"
          danger={true}
          onConfirm={() => {
            onDeleteWorkspace(deleteWsConfirm.id)
            notify('info', '워크스페이스 삭제', `'${deleteWsConfirm.name}' 삭제됨 (저장소는 보존)`)
            setDeleteWsConfirm(null)
          }}
          onCancel={() => setDeleteWsConfirm(null)}
        />
      )}
      {removeRepoConfirm && (
        <ConfirmModal
          title="GitGrove에서 제거"
          message={`'${removeRepoConfirm.name}'을(를) 최근/즐겨찾기/워크스페이스에서 제거합니다. 디스크의 파일은 삭제되지 않습니다.`}
          confirmLabel="제거"
          danger={true}
          onConfirm={() => {
            onRemoveRepo(removeRepoConfirm.path)
            setRemoveRepoConfirm(null)
          }}
          onCancel={() => setRemoveRepoConfirm(null)}
        />
      )}
    </div>
  )
}
