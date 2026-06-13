import { useEffect, useMemo, useState } from 'react'
import type { Repo } from '../data/mockData'
import type { RecentRepoEntry } from '../utils/repoStore'
import { parseGitHubRepo } from '../utils/github'

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
const IconClose = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4l8 8M12 4l-8 8"/></svg>
)
const IconSearch = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6.5" cy="6.5" r="4"/><path d="M10.5 10.5l3 3"/></svg>
)
const IconChevron = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4"/></svg>
)
const IconGitHub = () => (
  <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
)
const IconGitLab = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="5" height="8" rx="1"/><rect x="9" y="3" width="5" height="10" rx="1"/><path d="M7 9h2"/></svg>
)

type Filter = 'all' | 'favorites' | 'recent'

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
  showClose?: boolean
  onSelect: () => void
  onToggleStar: () => void
  onOpen: () => void
  onClose?: () => void
}
function RepoRow({ name, owner, branch, dirty, isFavorite, isSelected, faded, showClose, onSelect, onToggleStar, onOpen, onClose }: RowProps) {
  return (
    <div
      className={`rm-row${isSelected ? ' selected' : ''}`}
      style={faded ? { opacity: 0.82 } : undefined}
      onClick={onSelect}
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
        <span className="rm-row-name-text" onClick={e => { e.stopPropagation(); onOpen() }}>{name}</span>
      </div>
      <div className="rm-row-owner">{owner || '—'}</div>
      <div className="rm-row-branch"><BranchChip branch={branch} dirty={dirty} /></div>
      <div className="rm-row-actions">
        <button className="rm-row-action-btn" title="열기" onClick={e => { e.stopPropagation(); onOpen() }}><IconOpenExternal /></button>
        {showClose && onClose && (
          <button className="rm-row-action-btn danger" title="닫기" onClick={e => { e.stopPropagation(); onClose() }}><IconClose /></button>
        )}
      </div>
    </div>
  )
}

interface SectionProps {
  id: string
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

export interface RepoManagerProps {
  repos: Repo[]
  activeRepo: number
  githubConnected: boolean
  githubLogin?: string
  recents: RecentRepoEntry[]
  favorites: string[]
  onToggleFavorite: (path: string) => void
  onOpenPath: (path: string, name?: string, branch?: string) => void
  onCloseRepo: (index: number) => void
  onBrowse: () => void
  onClose: () => void
  notify: (type: 'info' | 'success' | 'warning' | 'error', title: string, body: string) => void
}

export function RepoManager({
  repos, activeRepo, githubConnected, githubLogin, recents, favorites,
  onToggleFavorite, onOpenPath, onCloseRepo, onBrowse, onClose, notify,
}: RepoManagerProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | null>(repos[activeRepo]?.path ?? null)
  // path → owner (remote에서 lazily 추출)
  const [owners, setOwners] = useState<Record<string, string>>({})

  const favSet = useMemo(() => new Set(favorites), [favorites])

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

  const matchesQuery = (name: string) => {
    const q = query.trim().toLowerCase()
    return !q || name.toLowerCase().includes(q)
  }

  const openRepos = repos.filter(r => matchesQuery(r.name))
  const favoriteRepos = repos.filter(r => favSet.has(r.path) && matchesQuery(r.name))
  const filteredRecents = recents.filter(r => matchesQuery(r.name))

  const dirtyCount = repos.filter(r => r.dirty).length

  const handleOpen = (path: string, name?: string, branch?: string) => {
    onOpenPath(path, name, branch)
  }

  const placeholder = (label: string) => () => notify('info', `${label} 준비 중`, '다음 버전에서 제공됩니다.')

  const showOpen = filter === 'all'
  const showFavorites = filter === 'all' || filter === 'favorites'
  const showRecent = filter === 'all' || filter === 'recent'

  return (
    <div className="rm-body">
      {/* ── Sidebar ── */}
      <div className="rm-sidebar">
        <div className="rm-sidebar-label">워크스페이스</div>
        <div className="rm-sidebar-section">
          <div className={`rm-sidebar-item${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
            <IconAllRepos />모든 저장소
            <span className={`rm-badge-count${filter === 'all' ? ' active' : ''}`}>{repos.length}</span>
          </div>
          <div className={`rm-sidebar-item${filter === 'favorites' ? ' active' : ''}`} onClick={() => setFilter('favorites')}>
            <IconStar />즐겨찾기
            <span className={`rm-badge-count${filter === 'favorites' ? ' active' : ''}`}>{favoriteRepos.length}</span>
          </div>
          <div className={`rm-sidebar-item${filter === 'recent' ? ' active' : ''}`} onClick={() => setFilter('recent')}>
            <IconClock />최근 열람
            <span className={`rm-badge-count${filter === 'recent' ? ' active' : ''}`}>{recents.length}</span>
          </div>
        </div>

        <div className="rm-sidebar-divider" />
        <div className="rm-sidebar-label">그룹</div>
        <div className="rm-sidebar-section">
          <div className="rm-sidebar-item rm-disabled" title="준비 중">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="12" height="9" rx="1.5"/><path d="M5 5V4a3 3 0 0 1 6 0v1"/></svg>
            개인 프로젝트
          </div>
          <div className="rm-sidebar-item rm-disabled" title="준비 중">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="7" r="2.5"/><circle cx="11" cy="5" r="2"/><path d="M1 14c0-2.5 2-4 5-4s5 1.5 5 4"/><path d="M11 9c2 0 4 1 4 3"/></svg>
            팀 / 회사
          </div>
        </div>

        <div className="rm-sidebar-divider" />
        <div className="rm-sidebar-label">서비스 연결</div>
        <div className="rm-sidebar-section">
          <div className="rm-sidebar-item rm-disabled" title="준비 중">
            <IconGitHub />GitHub
            {githubConnected && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--c-success)' }}>●</span>}
          </div>
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
            <button className="rm-action-btn rm-disabled" onClick={placeholder('Clone')} title="다음 버전 예정">
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
            <button className="rm-action-btn rm-disabled" onClick={placeholder('New Workspace')} title="준비 중">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="4" width="12" height="8" rx="1.5"/><path d="M5 4V3a3 3 0 0 1 6 0v1"/></svg>
              New Workspace
            </button>
            <button className="rm-action-btn rm-disabled" onClick={placeholder('Integrations')} title="준비 중">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 2"/></svg>
              Integrations
            </button>
          </div>
        </div>

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
          <button className="rm-close-manager" onClick={onClose} title="매니저 닫기">닫기 ✕</button>
        </div>

        {/* Repo list */}
        <div className="rm-list">
          {showOpen && (
            <Section id="open" title="Open repositories" count={openRepos.length}>
              {openRepos.length === 0 ? (
                <div className="rm-empty-section">열린 저장소가 없습니다. Browse 로 추가하세요.</div>
              ) : openRepos.map(r => {
                const idx = repos.findIndex(rp => rp.path === r.path)
                return (
                  <RepoRow
                    key={r.path}
                    name={r.name}
                    owner={owners[r.path]}
                    branch={r.branch}
                    dirty={r.dirty ? 1 : 0}
                    isFavorite={favSet.has(r.path)}
                    isSelected={selectedPath === r.path}
                    showClose={repos.length > 1}
                    onSelect={() => setSelectedPath(r.path)}
                    onToggleStar={() => onToggleFavorite(r.path)}
                    onOpen={() => handleOpen(r.path, r.name, r.branch)}
                    onClose={() => onCloseRepo(idx)}
                  />
                )
              })}
            </Section>
          )}

          {showFavorites && (
            <Section id="fav" title="Favorites" count={favoriteRepos.length}>
              {favoriteRepos.length === 0 ? (
                <div className="rm-empty-section">즐겨찾기한 저장소가 없습니다. ☆ 를 클릭해 추가하세요.</div>
              ) : favoriteRepos.map(r => {
                const idx = repos.findIndex(rp => rp.path === r.path)
                return (
                  <RepoRow
                    key={r.path}
                    name={r.name}
                    owner={owners[r.path]}
                    branch={r.branch}
                    dirty={r.dirty ? 1 : 0}
                    isFavorite
                    isSelected={selectedPath === r.path}
                    showClose={repos.length > 1}
                    onSelect={() => setSelectedPath(r.path)}
                    onToggleStar={() => onToggleFavorite(r.path)}
                    onOpen={() => handleOpen(r.path, r.name, r.branch)}
                    onClose={() => onCloseRepo(idx)}
                  />
                )
              })}
            </Section>
          )}

          {showRecent && (
            <Section id="recent" title="Recent repositories" count={filteredRecents.length} lastBranchLabel>
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
                />
              ))}
            </Section>
          )}
        </div>

        {/* Status bar */}
        <div className="rm-status-bar">
          <div className="rm-status-dot green" />
          <span>{repos.length} repositories</span>
          <span style={{ color: 'var(--c-text-faint)' }}>·</span>
          <span>{repos.length} open · {dirtyCount} with changes</span>
          <div className="rm-status-bar-right">
            <span style={{ color: 'var(--c-text-faint)' }}>{githubConnected ? 'GitHub 연결됨' : 'GitHub 미연결'}</span>
            {githubConnected && <><div className="rm-status-dot gold" /><span>{githubLogin || ''}</span></>}
          </div>
        </div>
      </div>
    </div>
  )
}
