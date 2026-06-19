import { useEffect, useMemo, useRef, useState } from 'react'
import type { Repo } from '../data/mockData'
import type { RecentRepoEntry, Workspace } from '../utils/repoStore'
import { parseGitHubRepo } from '../utils/github'
import { parseGitLabRepo, normalizeGitlabHost } from '../utils/gitlab'
import { getUserRepos, GithubApiError, type GithubRepoSummary } from '../utils/githubClient'
import { getProjects, GitlabApiError, type GitlabProjectSummary } from '../utils/gitlabClient'
import { ModalShell } from './modals/ModalShell'
import { ConfirmModal } from './modals/ConfirmModal'
import { GithubInbox } from './GithubInbox'
import type { GitlabConn } from '../utils/useGitlabConns'
import { Geuru, type GeuruExpr } from './Geuru'
import { Tree } from './Tree'
import { stageOf, bucketOf, type RepoActivity, type ActivityBucket } from '../utils/repoActivity'
import { TOASTS, spread } from '../toasts'

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
const IconTrash = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 4h10M6.5 4V2.5h3V4M5 4l.6 9a1 1 0 0 0 1 1h2.8a1 1 0 0 0 1-1L11 4"/></svg>
)
const IconSearch = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6.5" cy="6.5" r="4"/><path d="M10.5 10.5l3 3"/></svg>
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
// GitLab 브랜드 마크 (비침해 추상, 디자인 glMark 재현 — 식별 전용)
const GlMark = ({ size = 16 }: { size?: number }) => (
  <svg className="gl-mark" width={size} height={size} viewBox="0 0 24 24" aria-label="GitLab">
    <path d="M12 21.5l3.2-9.8H8.8L12 21.5z" fill="#fc6d26"/>
    <path d="M12 21.5L8.8 11.7H4.2L12 21.5z" fill="#e24329"/>
    <path d="M4.2 11.7L3 15.4a.8.8 0 0 0 .3.9L12 21.5 4.2 11.7z" fill="#fca326"/>
    <path d="M4.2 11.7H8.8L6.9 5.6c-.1-.3-.5-.3-.6 0L4.2 11.7z" fill="#e24329"/>
    <path d="M12 21.5l3.2-9.8h4.6L12 21.5z" fill="#e24329"/>
    <path d="M19.8 11.7L21 15.4a.8.8 0 0 1-.3.9L12 21.5l7.8-9.8z" fill="#fca326"/>
    <path d="M19.8 11.7H15.2l1.9-6.1c.1-.3.5-.3.6 0l2.1 6.1z" fill="#e24329"/>
  </svg>
)
const IconCloud = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4.6 12.5a3 3 0 0 1-.3-6 4 4 0 0 1 7.7-1 3 3 0 0 1 .3 7z"/></svg>
)
const IconServer = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2.5" y="2.5" width="11" height="4.6" rx="1"/><rect x="2.5" y="9" width="11" height="4.6" rx="1"/><path d="M5 4.8h.01M5 11.3h.01"/></svg>
)
const IconRefresh = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M13 3v3h-3M3 13v-3h3"/><path d="M12.5 6.5A5 5 0 0 0 4 5M3.5 9.5A5 5 0 0 0 12 11"/></svg>
)
const IconStarSmall = () => (
  <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" style={{ verticalAlign: -1 }}><path d="M8 1.5l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4 4.3 13.5l.8-4.2L2 6.4l4.2-.5z"/></svg>
)
const IconInbox = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 9l2-6h8l2 6M2 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9M2 9h3l1 2h4l1-2h3"/></svg>
)

// 프로바이더 식별 (카드 owner 줄의 GH/GL 마크). 식별 전용 — 인터랙션 액센트 아님.
type Provider = 'gh' | 'gl' | null

// 카드 owner 줄의 작은 GitHub 마크 (디자인 ghMark 재현, 식별 전용 회색).
const GhMarkSmall = ({ size = 11 }: { size?: number }) => (
  <svg className="prov-mark-svg" width={size} height={size} viewBox="0 0 16 16" fill="#8b96b4" aria-label="GitHub">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.69-.01-1.36-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.7-.01 1.93 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
  </svg>
)
const GlMarkSmall = ({ size = 11 }: { size?: number }) => (
  <svg className="prov-mark-svg" width={size} height={size} viewBox="0 0 24 24" aria-label="GitLab">
    <path d="M12 21.5l3.2-9.8H8.8L12 21.5z" fill="#fc6d26"/>
    <path d="M12 21.5L8.8 11.7H4.2L12 21.5z" fill="#e24329"/>
    <path d="M4.2 11.7L3 15.4a.8.8 0 0 0 .3.9L12 21.5 4.2 11.7z" fill="#fca326"/>
    <path d="M4.2 11.7H8.8L6.9 5.6c-.1-.3-.5-.3-.6 0z" fill="#e24329"/>
    <path d="M12 21.5l3.2-9.8h4.6L12 21.5z" fill="#e24329"/>
    <path d="M19.8 11.7L21 15.4a.8.8 0 0 1-.3.9L12 21.5z" fill="#fca326"/>
  </svg>
)

const IconFolderOpen = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 7h6M5 10h4"/></svg>
)
const IconSyncUp = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 13V4M4 7l4-4 4 4"/></svg>
)
const IconSyncDown = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 3v9M4 9l4 4 4-4"/></svg>
)

// 빈 daily(활동 미로딩) 폴백.
const EMPTY_ACTIVITY: RepoActivity = { daily: [], total: 0, lastCommit: null }

// 카드 그루(마스코트) 상태 — dirty→conflict / behind→think / 활발→happy / 조용→sleepy / 그외 idle.
// 정본 geuruFor() 포팅. total은 활동(14일 합), dirty/behind는 동기 상태.
function geuruForCard(opts: { dirty: number; behind: number; total: number }): { expr: GeuruExpr; text: string } {
  if (opts.dirty > 0) return { expr: 'conflict', text: `변경 ${opts.dirty}개 대기 중` }
  if (opts.behind > 0) return { expr: 'think', text: `${opts.behind} 커밋 뒤처짐 · pull 필요` }
  if (opts.total >= 40) return { expr: 'happy', text: '무럭무럭 자라는 중' }
  if (opts.total <= 4) return { expr: 'sleepy', text: '한동안 조용해요' }
  return { expr: 'idle', text: '건강하게 자라고 있어요' }
}

// 스파크라인 막대 색 (정본 barColor): 0=회색, 비율>0.66 grove, >0.33 gold-400, else gold-500.
function sparkColor(v: number, max: number): string {
  if (v === 0) return 'var(--c-border)'
  const r = v / max
  if (r > 0.66) return 'var(--c-grove)'
  if (r > 0.33) return 'var(--c-gold-400)'
  return 'var(--c-gold-500)'
}

// 사이드바 선택: 내장 보기('all'/'favorites'/'recent') 또는 사용자 워크스페이스(id)
type View = 'all' | 'favorites' | 'recent'
type Selection =
  | { kind: 'view'; view: View }
  | { kind: 'workspace'; id: string }
  | { kind: 'github' }
  | { kind: 'gitlab' }
  | { kind: 'inbox' }

/** GitLab 인스턴스(연결된 host) — gitlab.com=SaaS, 그 외=Self-hosted */
export interface GitlabInstance {
  /** 정규화 host (예: "https://gitlab.com") */
  host: string
  /** 표시용 host (스킴 제거, 예: "gitlab.com") */
  display: string
  type: 'SaaS' | 'Self-hosted'
}

// path → 표시용 레포 정보(이름/브랜치). 열린 레포가 우선, 없으면 최근 캐시, 둘 다 없으면 폴더명.
interface RepoDesc { name: string; branch: string; dirty?: number; open: boolean }
function basename(p: string): string {
  const seg = p.split(/[\\/]/).filter(Boolean).pop()
  return seg || p
}

// ── 그로브 카드 (디자인 정본 .card 재현) ──
interface CardModel {
  path: string
  name: string
  owner?: string
  provider: Provider
  branch: string
  dirty: number      // 변경 파일 수(열린 레포는 1로 근사, 닫힌 레포는 0)
  ahead: number
  behind: number
  open: boolean
  activity: RepoActivity
}

interface GroveCardProps {
  model: CardModel
  isFavorite: boolean
  isSelected: boolean
  dim?: boolean
  onSelect: () => void
  onToggleStar: () => void
  onOpen: () => void
  onMenu: (e: React.MouseEvent) => void
}
function GroveCard({ model, isFavorite, isSelected, dim, onSelect, onToggleStar, onOpen, onMenu }: GroveCardProps) {
  const { name, owner, provider, branch, dirty, ahead, behind, open, activity } = model
  const total = activity.total
  const stage = stageOf(total)
  const isMain = branch === 'main' || branch === 'master'
  const geuru = geuruForCard({ dirty, behind, total })
  const daily = activity.daily
  const max = Math.max(1, ...daily)
  const branchDisp = branch.length > 24 ? branch.slice(0, 23) + '…' : (branch || '—')
  return (
    <div
      className={`rm-card${isSelected ? ' sel' : ''}${dim ? ' dim' : ''}`}
      data-name={name}
      title="더블클릭으로 열기"
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <button
        type="button"
        className={`rm-card-star${isFavorite ? ' on' : ''}`}
        title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        aria-pressed={isFavorite}
        onClick={e => { e.stopPropagation(); onToggleStar() }}
      >
        <IconStar filled={isFavorite} />
      </button>

      <div className="rm-card-top">
        <div className="rm-tree-tile">
          <Tree stage={stage} scale={2.6} />
          <div className="rm-tree-ground" />
        </div>
        <div className="rm-card-id">
          <div className="rm-card-name-row">
            <span className="rm-card-name">{name}</span>
          </div>
          <div className="rm-card-owner">
            {provider && (
              <span className="prov-mark">{provider === 'gl' ? <GlMarkSmall /> : <GhMarkSmall />}</span>
            )}
            <span className="rm-card-owner-txt">
              {owner || '—'}{activity.lastCommit ? ` · ${activity.lastCommit}` : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="rm-card-meta">
        <span className={`rm-branch-chip${isMain ? ' rm-bc-main' : ''}`}>
          <IconBranch /><span className="rm-bname">{branchDisp}</span>
        </span>
        {dirty > 0 && (
          <span className="rm-dirty-badge">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 2v7M8 12v.5"/></svg>
            <span>{dirty}</span>
          </span>
        )}
        {(ahead > 0 || behind > 0) && (
          <span className="rm-sync-chip" title={`ahead ${ahead} · behind ${behind}`}>
            {ahead > 0 && <><IconSyncUp />{ahead}</>}
            {behind > 0 && <><IconSyncDown />{behind}</>}
          </span>
        )}
      </div>

      <div className="rm-activity">
        <div className="rm-act-label">
          <span>최근 14일 활동</span><span>{total} commits</span>
        </div>
        <div className="rm-act-row">
          {daily.length === 0
            ? Array.from({ length: 14 }, (_, i) => (
                <div key={i} className="rm-act-bar" style={{ height: 2, background: 'var(--c-border)' }} />
              ))
            : daily.map((v, i) => (
                <div
                  key={i}
                  className="rm-act-bar"
                  style={{ height: v === 0 ? 2 : 4 + (v / max) * 22, background: sparkColor(v, max) }}
                />
              ))}
        </div>
      </div>

      <div className="rm-card-foot">
        <div className="rm-geuru-state">
          <span className="rm-gs-sprite"><Geuru expr={geuru.expr} scale={1} title="그루" /></span>
          <span className="rm-gs-txt">{geuru.text}</span>
        </div>
        <div className="rm-foot-btns">
          <button
            type="button"
            className="rm-fbtn open"
            onClick={e => { e.stopPropagation(); onOpen() }}
          >{open ? '열기' : 'Clone'}</button>
          <button
            type="button"
            className="rm-fbtn ghost"
            title="메뉴"
            aria-label="메뉴"
            onClick={e => { e.stopPropagation(); onMenu(e) }}
          ><IconFolderOpen /></button>
        </div>
      </div>
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
            {total === 0 ? '표시할 GitHub 레포가 없어요.' : '검색 결과가 없어요.'}
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

// ── GitLab 프로젝트 브라우저 (GL5·GL6) — GithubBrowser 미러 ──
function visTagClass(v: GitlabProjectSummary['visibility']): string {
  return v === 'private' ? 'rm-gh-tag priv' : 'rm-gh-tag'
}
const visLabel: Record<GitlabProjectSummary['visibility'], string> = {
  private: 'private', internal: 'internal', public: 'public',
}
// 프로젝트 path 기반 안정 색상(아바타). 디자인은 행마다 색이 다름 → namespace 해시.
const GL_AVATAR_COLORS = ['#fc6d26', '#e24329', '#5fb8e6', '#6fcf7c', '#c39ad9', '#fca326']
function avatarColor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return GL_AVATAR_COLORS[Math.abs(h) % GL_AVATAR_COLORS.length]
}
function relativeTime(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}주 전`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}개월 전`
  return `${Math.floor(day / 365)}년 전`
}

interface GitlabBrowserProps {
  instances: GitlabInstance[]
  activeHost: string | null
  onSelectInstance: (host: string) => void
  onAddInstance: () => void
  /** 미연결(연결된 인스턴스가 없음) */
  disconnected: boolean
  projects: GitlabProjectSummary[]
  loading: boolean
  error: string | null
  query: string
  hasMore: boolean
  loadingMore: boolean
  cloningRepo: string | null
  isLocal: (fullPath: string) => boolean
  onQueryChange: (q: string) => void
  onRefresh: () => void
  onLoadMore: () => void
  onAction: (proj: GitlabProjectSummary) => void
  onOpenSettings: () => void
}
function GitlabBrowser({
  instances, activeHost, onSelectInstance, onAddInstance, disconnected,
  projects, loading, error, query, hasMore, loadingMore, cloningRepo,
  isLocal, onQueryChange, onRefresh, onLoadMore, onAction, onOpenSettings,
}: GitlabBrowserProps) {
  if (disconnected) {
    return (
      <div className="rm-empty-big">
        <Geuru expr="idle" scale={3.4} title="그루" />
        <b>GitLab이 연결되지 않았어요</b>
        <span>설정 → GitLab 탭에서 GitLab.com 또는 Self-hosted 인스턴스를 연결하면 프로젝트를 여기서 바로 열 수 있어요.</span>
        <button className="rm-action-btn open" style={{ minWidth: 'auto', padding: '8px 16px' }} onClick={onOpenSettings}>
          설정 열기 ↗
        </button>
      </div>
    )
  }
  const activeInstance = instances.find(i => i.host === activeHost) ?? null
  return (
    <>
      {/* 인스턴스 셀렉터 바 */}
      <div className="gl-inst-bar">
        {instances.map(inst => {
          const on = inst.host === activeHost
          return (
            <button
              key={inst.host}
              className={`gl-inst${on ? ' on' : ''}`}
              onClick={() => onSelectInstance(inst.host)}
              title={`${inst.display} (${inst.type})`}
            >
              <span className="gl-inst-ic">{inst.type === 'SaaS' ? <IconCloud /> : <IconServer />}</span>
              <span className="gl-inst-info">
                <span className="gl-inst-host">
                  <b>{inst.display}</b>
                  <span className={`gl-inst-type${inst.type === 'Self-hosted' ? ' self' : ''}`}>{inst.type}</span>
                </span>
                <span className="gl-inst-sub"><span className="gl-inst-dot" />연결됨</span>
              </span>
            </button>
          )
        })}
        <button className="gl-inst-add" onClick={onAddInstance} title="설정에서 GitLab 인스턴스 추가">
          ＋ 인스턴스 추가
        </button>
      </div>

      {/* 필터 바 */}
      <div className="rm-filter-bar">
        <div className="rm-search-wrap">
          <IconSearch />
          <input
            type="text"
            placeholder="GitLab 프로젝트 검색 (namespace/name)…"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
          />
        </div>
        <button className="pr-refresh-btn" title="새로고침" disabled={loading} onClick={onRefresh}>
          <span style={loading ? { display: 'inline-block', animation: 'spin 600ms linear infinite' } : undefined}>⟳</span>
        </button>
        {projects.length > 0 && <span className="rm-gh-count">{projects.length}개</span>}
      </div>

      {/* 리스트 / 상태 */}
      <div className="rm-list">
        {loading && projects.length === 0 ? (
          [0, 1, 2, 3, 4].map(i => (
            <div key={i} className="skel-row">
              <div className="skel" style={{ width: 34, height: 34 }} />
              <div style={{ flex: 1 }}>
                <div className="skel" style={{ width: '42%', height: 13, marginBottom: 7 }} />
                <div className="skel" style={{ width: '26%', height: 11 }} />
              </div>
              <div className="skel" style={{ width: 74, height: 30 }} />
            </div>
          ))
        ) : error ? (
          <div className="rm-empty-big">
            <Geuru expr="conflict" scale={3.4} title="그루" />
            <b>불러오지 못했어요</b>
            <span className="rm-empty-err">{(activeInstance?.display ?? activeHost ?? '')} · {error}</span>
            <span>토큰이 만료됐거나 <code>api</code> scope가 없을 수 있어요. 설정에서 다시 검증하세요.</span>
            <button className="rm-action-btn clone" style={{ minWidth: 'auto', padding: '8px 16px' }} onClick={onRefresh}>
              <IconRefresh /> 다시 시도
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="rm-empty-big">
            <Geuru expr="sleepy" scale={3.4} title="그루" />
            <b>{query.trim() ? '검색 결과가 없어요' : '프로젝트가 없어요'}</b>
            <span>
              {query.trim()
                ? '다른 검색어로 시도해 보세요.'
                : `${activeInstance?.display ?? ''} 에서 접근 가능한 프로젝트가 없어요. 프로젝트를 만들거나 그룹에 합류해 보세요.`}
            </span>
          </div>
        ) : (
          <>
            {projects.map(proj => {
              const local = isLocal(proj.path_with_namespace)
              const cloning = cloningRepo === proj.path_with_namespace
              return (
                <div key={proj.id} className="rm-gh-row">
                  <div
                    className="rm-gh-avatar"
                    style={{ background: `linear-gradient(135deg, ${avatarColor(proj.path_with_namespace)}, ${avatarColor(proj.path_with_namespace)}99)` }}
                  >
                    {proj.name.slice(0, 2)}
                  </div>
                  <div className="rm-gh-info">
                    <div className="rm-gh-title">
                      <span className="rm-gh-name">{proj.path_with_namespace}</span>
                      <span className={visTagClass(proj.visibility)}>{visLabel[proj.visibility]}</span>
                    </div>
                    <div className="rm-gh-sub">
                      <span><IconStarSmall /> {proj.star_count}</span>
                      {proj.last_activity_at && <span className="rm-gh-dot">·</span>}
                      {proj.last_activity_at && <span>{relativeTime(proj.last_activity_at)}</span>}
                    </div>
                  </div>
                  <div className="rm-gh-action">
                    <button
                      className={`rm-action-btn ${local ? 'open' : 'clone'}`}
                      disabled={cloning}
                      onClick={() => onAction(proj)}
                    >
                      {cloning ? <span className="sett-spinner" /> : local ? '열기' : 'Clone'}
                    </button>
                  </div>
                </div>
              )
            })}
            {hasMore && (
              <div className="rm-loadmore">
                <button disabled={loadingMore} onClick={onLoadMore}>
                  {loadingMore ? '불러오는 중…' : '더 보기'}
                </button>
              </div>
            )}
          </>
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
  /** GitLab 연결 여부(연결된 host가 1개 이상) — 사이드바 활성/점 표시용 */
  gitlabConnected: boolean
  /** 연결된 GitLab 인스턴스(host+token+username) — 통합 인박스용 */
  gitlabInstances?: GitlabConn[]
  /** 외부 브라우저로 URL 열기 (인박스 항목 클릭) */
  onOpenUrl: (url: string) => void
  /** GitHub 탭이 있는 Settings 패널 열기 (미연결 유도 / 토큰 등록) */
  onOpenGithubSettings: () => void
  /** GitLab 탭이 있는 Settings 패널 열기 (GL5 미연결 유도 / 인스턴스 추가) */
  onOpenGitlabSettings: () => void
  notify: (
    type: 'info' | 'success' | 'warning' | 'error',
    title: string,
    msg?: string,
    onClick?: (() => void) | number,
    dur?: number,
    geuru?: GeuruExpr,
  ) => void
}

export function RepoManager({
  repos, activeRepo, githubConnected, githubToken, githubLogin, gitlabConnected, gitlabInstances = [], recents, favorites, workspaces,
  onToggleFavorite, onOpenPath, onRemoveRepo, onCreateWorkspace, onRenameWorkspace,
  onDeleteWorkspace, onToggleRepoInWorkspace, onClone, onBrowse, onOpenUrl, onOpenGithubSettings, onOpenGitlabSettings, notify,
}: RepoManagerProps) {
  const [sel, setSel] = useState<Selection>({ kind: 'view', view: 'all' })
  const [query, setQuery] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | null>(repos[activeRepo]?.path ?? null)
  // 카드 그리드 세그먼트(전체/열림/즐겨찾기/최근/변경) + 정렬.
  const [seg, setSeg] = useState<'all' | 'open' | 'fav' | 'recent' | 'dirty'>('all')
  const [sort, setSort] = useState<'activity' | 'name'>('activity')
  // path → owner (remote에서 lazily 추출)
  const [owners, setOwners] = useState<Record<string, string>>({})
  // path → provider ('gh'|'gl'|''(미상)). owners와 같은 getRemotes 호출에서 함께 해석.
  const [providers, setProviders] = useState<Record<string, Provider | ''>>({})
  // path → 14일 활동 (getActivityBatch). 미로딩 path는 EMPTY_ACTIVITY 폴백.
  const [activity, setActivity] = useState<Record<string, RepoActivity>>({})
  // 행 케밥 메뉴 / 모달 상태
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null)
  const [wsModal, setWsModal] = useState<{ pendingPath: string | null } | null>(null)
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

  // ── GitLab 프로젝트 브라우저 상태 (GL5·GL6) ──
  // 연결된 인스턴스(host) 목록 — 마운트 시 gitlabListHosts()로 로드.
  const [glInstances, setGlInstances] = useState<GitlabInstance[] | null>(null)
  const [glActiveHost, setGlActiveHost] = useState<string | null>(null)
  // host → 토큰 캐시(연결됨 인스턴스)
  const [glTokens, setGlTokens] = useState<Record<string, string>>({})
  const [glProjects, setGlProjects] = useState<GitlabProjectSummary[] | null>(null)
  const [glLoading, setGlLoading] = useState(false)
  const [glLoadingMore, setGlLoadingMore] = useState(false)
  const [glError, setGlError] = useState<string | null>(null)
  const [glQuery, setGlQuery] = useState('')
  const [glPage, setGlPage] = useState(1)
  const [glHasMore, setGlHasMore] = useState(false)
  const [glCloning, setGlCloning] = useState<string | null>(null)
  // path(host)#fullPath(소문자) Set — 로컬 보유 GitLab 프로젝트
  const [glLocal, setGlLocal] = useState<Record<string, string>>({})

  const favSet = useMemo(() => new Set(favorites), [favorites])

  // 선택된 워크스페이스가 삭제되면 '모든 저장소'로 복귀
  useEffect(() => {
    if (sel.kind === 'workspace' && !workspaces.some(w => w.id === sel.id)) {
      setSel({ kind: 'view', view: 'all' })
    }
  }, [workspaces, sel])

  // ── 레포 소유자 + 프로바이더를 remote에서 추출 (열린 레포 + 최근, 가벼운 로컬 조회) ──
  // 카드 owner 줄과 GH/GL 마크에 사용. 같은 getRemotes 호출로 owner·provider를 함께 해석.
  useEffect(() => {
    let cancelled = false
    const paths = new Set<string>([...repos.map(r => r.path), ...recents.map(r => r.path)])
    paths.forEach(path => {
      if (owners[path] !== undefined) return
      window.gitAPI?.getRemotes(path)
        .then(remotes => {
          if (cancelled) return
          const origin = remotes.find(rm => rm.name === 'origin') ?? remotes[0]
          const gh = origin && parseGitHubRepo(origin.url)
          const gl = !gh && origin ? parseGitLabRepo(origin.url) : null
          const owner = gh?.owner ?? (gl ? gl.fullPath.split('/')[0] : '') ?? ''
          const provider: Provider | '' = gh ? 'gh' : gl ? 'gl' : ''
          setOwners(prev => ({ ...prev, [path]: owner }))
          setProviders(prev => ({ ...prev, [path]: provider }))
        })
        .catch(() => {
          if (cancelled) return
          setOwners(prev => ({ ...prev, [path]: '' }))
          setProviders(prev => ({ ...prev, [path]: '' }))
        })
    })
    return () => { cancelled = true }
  }, [repos, recents, owners])

  // ── 14일 활동 일괄 조회 (열린·최근·즐겨찾기 path, N+1 완화) ──
  // RM1 계약: getActivityBatch(paths) → Record<path, RepoActivity>. 실패/비-git은 폴백(전부 0).
  useEffect(() => {
    let cancelled = false
    const all = new Set<string>([...repos.map(r => r.path), ...recents.map(r => r.path), ...favorites])
    const missing = [...all].filter(p => activity[p] === undefined)
    if (missing.length === 0) return
    const batch = window.gitAPI?.getActivityBatch
    if (!batch) return
    batch(missing, { days: 14 })
      .then(map => {
        if (cancelled) return
        setActivity(prev => {
          const next = { ...prev }
          missing.forEach(p => { next[p] = map[p] ?? EMPTY_ACTIVITY })
          return next
        })
      })
      .catch(() => {
        if (cancelled) return
        setActivity(prev => {
          const next = { ...prev }
          missing.forEach(p => { next[p] = EMPTY_ACTIVITY })
          return next
        })
      })
    return () => { cancelled = true }
  }, [repos, recents, favorites, activity])

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

  // ── GitLab: 연결된 인스턴스(host+토큰) 로드 (마운트/탭 진입) ──
  useEffect(() => {
    let cancelled = false
    if (sel.kind !== 'gitlab' || glInstances !== null) return
    void (async () => {
      try {
        const hosts = await window.appAPI?.gitlabListHosts() ?? []
        // gitlab.com(SaaS)을 먼저 정렬
        const sorted = [...hosts].sort((a, b) => {
          const an = normalizeGitlabHost(a) === 'https://gitlab.com' ? 0 : 1
          const bn = normalizeGitlabHost(b) === 'https://gitlab.com' ? 0 : 1
          return an - bn
        })
        const tokenEntries = await Promise.all(sorted.map(async h => {
          const norm = normalizeGitlabHost(h)
          const token = await window.appAPI?.gitlabGetToken(h) ?? null
          return { norm, token }
        }))
        if (cancelled) return
        const tokens: Record<string, string> = {}
        const insts: GitlabInstance[] = []
        tokenEntries.forEach(({ norm, token }) => {
          if (!norm || !token) return
          tokens[norm] = token
          const display = norm.replace(/^https?:\/\//, '')
          insts.push({ host: norm, display, type: norm === 'https://gitlab.com' ? 'SaaS' : 'Self-hosted' })
        })
        setGlTokens(tokens)
        setGlInstances(insts)
        setGlActiveHost(prev => prev ?? insts[0]?.host ?? null)
      } catch {
        if (!cancelled) { setGlInstances([]); setGlActiveHost(null) }
      }
    })()
    return () => { cancelled = true }
  }, [sel, glInstances])

  // ── GitLab: 로컬 보유 프로젝트 해석 (열린 레포 + 최근, getRemotes → parseGitLabRepo) ──
  // 키 = "{host}#{fullPath}"(소문자). 활성 host의 path_with_namespace와 매칭.
  useEffect(() => {
    let cancelled = false
    const paths = new Set<string>([...repos.map(r => r.path), ...recents.map(r => r.path)])
    paths.forEach(path => {
      if (glLocal[path] !== undefined) return
      window.gitAPI?.getRemotes(path)
        .then(remotes => {
          if (cancelled) return
          const origin = remotes.find(rm => rm.name === 'origin') ?? remotes[0]
          const info = origin && parseGitLabRepo(origin.url)
          setGlLocal(prev => ({ ...prev, [path]: info ? `${info.host}#${info.fullPath}`.toLowerCase() : '' }))
        })
        .catch(() => { if (!cancelled) setGlLocal(prev => ({ ...prev, [path]: '' })) })
    })
    return () => { cancelled = true }
  }, [repos, recents, glLocal])

  // "{host}#{fullPath}"(소문자) → 로컬 path. 추가로 포트 제외 hostname 키도 둔다.
  // SSH remote가 `ssh://git@host:2222/...`처럼 SSH 포트를 host에 싣는 경우,
  // 저장된 API host(포트 없음)와 exact 키가 어긋나므로 hostname 폴백으로 보정.
  const { glLocalByKey, glLocalByHostname } = useMemo(() => {
    const byKey = new Map<string, string>()
    const byName = new Map<string, string>()
    Object.entries(glLocal).forEach(([path, key]) => {
      if (!key) return
      byKey.set(key, path)
      // key = "{host}#{fullPath}" → host의 포트를 제거한 hostname 키
      const hashAt = key.indexOf('#')
      if (hashAt > 0) {
        const host = key.slice(0, hashAt)
        const rest = key.slice(hashAt) // "#fullPath"
        const authority = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
        const colon = authority.lastIndexOf(':')
        const hostname = colon > 0 ? authority.slice(0, colon) : authority
        byName.set(`${hostname}${rest}`, path)
      }
    })
    return { glLocalByKey: byKey, glLocalByHostname: byName }
  }, [glLocal])

  // 활성 host + fullPath로 로컬 보유 경로를 찾는다(exact → hostname 폴백).
  const glLocalLookup = (fullPath: string): string | undefined => {
    if (!glActiveHost) return undefined
    const exact = glLocalByKey.get(`${glActiveHost}#${fullPath}`.toLowerCase())
    if (exact) return exact
    const authority = glActiveHost.replace(/^https?:\/\//, '')
    const colon = authority.lastIndexOf(':')
    const hostname = colon > 0 ? authority.slice(0, colon) : authority
    return glLocalByHostname.get(`${hostname}#${fullPath}`.toLowerCase())
  }

  const isGlLocal = (fullPath: string): boolean => glLocalLookup(fullPath) !== undefined

  // ── GitLab: 프로젝트 목록 fetch ──
  const loadGitlabProjects = useMemo(() => {
    return async (host: string, opts: { force?: boolean; search?: string; page?: number; append?: boolean }) => {
      const token = glTokens[host]
      if (!token) return
      const page = opts.page ?? 1
      if (opts.append) setGlLoadingMore(true)
      else { setGlLoading(true); setGlError(null) }
      try {
        const list = await getProjects(host, token, {
          membership: true,
          search: opts.search?.trim() || undefined,
          page,
          perPage: 30,
          cache: opts.force ? false : undefined,
        })
        setGlHasMore(list.length === 30)
        setGlProjects(prev => (opts.append && prev ? [...prev, ...list] : list))
      } catch (err) {
        const msg = err instanceof GitlabApiError
          ? err.message
          : err instanceof Error ? err.message : String(err)
        if (opts.append) setGlError(msg)
        else { setGlError(msg); setGlProjects([]) }
      } finally {
        if (opts.append) setGlLoadingMore(false)
        else setGlLoading(false)
      }
    }
  }, [glTokens])

  // 활성 host 변경 / 검색어 변경 시 1페이지 로드 (검색은 디바운스)
  useEffect(() => {
    if (sel.kind !== 'gitlab' || !glActiveHost || !glTokens[glActiveHost]) return
    const handle = setTimeout(() => {
      setGlPage(1)
      void loadGitlabProjects(glActiveHost, { search: glQuery, page: 1 })
    }, glQuery ? 300 : 0)
    return () => clearTimeout(handle)
  }, [sel.kind, glActiveHost, glQuery, glTokens, loadGitlabProjects])

  const handleGlSelectInstance = (host: string) => {
    if (host === glActiveHost) return
    setGlActiveHost(host)
    setGlProjects(null)
    setGlQuery('')
    setGlPage(1)
    setGlError(null)
  }

  const handleGlRefresh = () => {
    if (!glActiveHost) return
    setGlPage(1)
    void loadGitlabProjects(glActiveHost, { force: true, search: glQuery, page: 1 })
  }

  const handleGlLoadMore = () => {
    if (!glActiveHost || glLoadingMore) return
    const next = glPage + 1
    setGlPage(next)
    void loadGitlabProjects(glActiveHost, { search: glQuery, page: next, append: true })
  }

  const handleGlAction = async (proj: GitlabProjectSummary) => {
    const localPath = glLocalLookup(proj.path_with_namespace)
    if (localPath) {
      onOpenPath(localPath, proj.name, proj.default_branch)
      return
    }
    if (glCloning) return
    setGlCloning(proj.path_with_namespace)
    try {
      const ok = await onClone(proj.http_url_to_repo)
      if (!ok) setGlCloning(null) // 성공 시 매니저가 닫히며 언마운트
    } catch {
      setGlCloning(null)
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

  const getActivity = (path: string): RepoActivity => activity[path] ?? EMPTY_ACTIVITY

  // path 집합 → 카드 모델 목록. 열린 레포가 우선(open/dirty/ahead/behind 반영), 없으면 최근 캐시.
  const buildCard = (path: string): CardModel => {
    const open = repos.find(r => r.path === path)
    if (open) {
      return {
        path, name: open.name, owner: owners[path], provider: providers[path] || null,
        branch: open.branch, dirty: open.dirty ? 1 : 0, ahead: open.ahead, behind: open.behind,
        open: true, activity: getActivity(path),
      }
    }
    const rec = recents.find(r => r.path === path)
    const name = rec?.name ?? basename(path)
    return {
      path, name, owner: owners[path], provider: providers[path] || null,
      branch: rec?.branch ?? '', dirty: 0, ahead: 0, behind: 0,
      open: false, activity: getActivity(path),
    }
  }

  // 세그/검색/정렬을 적용한 카드 목록. (그리드 뷰 전용)
  const cardModels = useMemo(() => {
    // 전체 path 합집합(열린 + 최근 + 즐겨찾기), 중복 제거.
    const paths = new Set<string>([...repos.map(r => r.path), ...recents.map(r => r.path), ...favorites])
    let list = [...paths].map(buildCard)
    // 세그먼트 필터
    if (seg === 'open') list = list.filter(c => c.open)
    else if (seg === 'fav') list = list.filter(c => favSet.has(c.path))
    else if (seg === 'recent') list = list.filter(c => recents.some(r => r.path === c.path))
    else if (seg === 'dirty') list = list.filter(c => c.dirty > 0)
    // 검색
    const q = query.trim().toLowerCase()
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || (c.owner ?? '').toLowerCase().includes(q))
    // 정렬
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
    else list.sort((a, b) => b.activity.total - a.activity.total || a.name.localeCompare(b.name))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos, recents, favorites, favSet, owners, providers, activity, seg, sort, query])

  // 세그먼트 카운트(검색 무시 — 전체 기준)
  const segCounts = useMemo(() => {
    const paths = new Set<string>([...repos.map(r => r.path), ...recents.map(r => r.path), ...favorites])
    const all = [...paths]
    return {
      all: all.length,
      open: repos.length,
      fav: all.filter(p => favSet.has(p)).length,
      recent: all.filter(p => recents.some(r => r.path === p)).length,
      dirty: repos.filter(r => r.dirty).length,
    }
  }, [repos, recents, favorites, favSet])

  // 그로브 현황(사이드바 카드) — bucketOf 집계.
  const groveBuckets = useMemo(() => {
    const paths = new Set<string>([...repos.map(r => r.path), ...recents.map(r => r.path), ...favorites])
    const acc: Record<ActivityBucket, number> = { active: 0, moderate: 0, dormant: 0 }
    paths.forEach(p => { acc[bucketOf(getActivity(p).total)] += 1 })
    return acc
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos, recents, favorites, activity])

  // "이번 주 N commits" (상태바) — 14일 daily 마지막 7칸 합.
  const weekCommits = useMemo(() => {
    const paths = new Set<string>([...repos.map(r => r.path), ...recents.map(r => r.path), ...favorites])
    let sum = 0
    paths.forEach(p => {
      const d = getActivity(p).daily
      sum += d.slice(-7).reduce((a, b) => a + b, 0)
    })
    return sum
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos, recents, favorites, activity])

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
    notify(...spread(TOASTS.workspaceCreated(name)))
  }

  const startRename = (w: Workspace) => { setRenamingWs(w.id); setRenameVal(w.name) }
  const commitRename = () => {
    if (renamingWs) {
      const t = renameVal.trim()
      if (t) onRenameWorkspace(renamingWs, t)
    }
    setRenamingWs(null)
  }

  const placeholder = (label: string) => () => notify(...spread(TOASTS.comingSoon(label)))

  // 메인 렌더 분기
  const isView = sel.kind === 'view'
  const activeWs = sel.kind === 'workspace' ? workspaces.find(w => w.id === sel.id) ?? null : null
  // 워크스페이스(그룹) 카드 — 검색/정렬 적용.
  const wsCards = useMemo(() => {
    if (!activeWs) return []
    let list = activeWs.paths.map(buildCard)
    const q = query.trim().toLowerCase()
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || (c.owner ?? '').toLowerCase().includes(q))
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
    else list.sort((a, b) => b.activity.total - a.activity.total || a.name.localeCompare(b.name))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWs, repos, recents, owners, providers, activity, query, sort])
  const menuTarget = menu ? describe(menu.path) : null
  const isGithub = sel.kind === 'github'
  const isGitlab = sel.kind === 'gitlab'
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
        <div className="rm-sidebar-label">그로브</div>
        <div className="rm-sidebar-section">
          <div
            className={`rm-sidebar-item${isView && seg === 'all' ? ' active' : ''}`}
            onClick={() => { setSel({ kind: 'view', view: 'all' }); setSeg('all') }}
          >
            <IconAllRepos />모든 저장소
            <span className={`rm-badge-count${isView && seg === 'all' ? ' active' : ''}`}>{segCounts.all}</span>
          </div>
          <div
            className={`rm-sidebar-item${isView && seg === 'fav' ? ' active' : ''}`}
            onClick={() => { setSel({ kind: 'view', view: 'favorites' }); setSeg('fav') }}
          >
            <IconStar />즐겨찾기
            <span className={`rm-badge-count${isView && seg === 'fav' ? ' active' : ''}`}>{segCounts.fav}</span>
          </div>
          <div
            className={`rm-sidebar-item${isView && seg === 'recent' ? ' active' : ''}`}
            onClick={() => { setSel({ kind: 'view', view: 'recent' }); setSeg('recent') }}
          >
            <IconClock />최근 열람
            <span className={`rm-badge-count${isView && seg === 'recent' ? ' active' : ''}`}>{segCounts.recent}</span>
          </div>
          <div
            className={`rm-sidebar-item${isView && seg === 'dirty' ? ' active' : ''}`}
            onClick={() => { setSel({ kind: 'view', view: 'all' }); setSeg('dirty') }}
          >
            <IconBranch />변경 있음
            <span className={`rm-badge-count${isView && seg === 'dirty' ? ' active' : ''}`}>{segCounts.dirty}</span>
          </div>
        </div>

        <div className="rm-sidebar-divider" />
        <div className="rm-sidebar-label">
          그룹
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
            <div
              className="rm-sidebar-item rm-disabled"
              title="내 작업 — GitHub 연결 필요 (설정에서 토큰 등록)"
              onClick={onOpenGithubSettings}
              style={{ cursor: 'pointer' }}
            >
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
            <div
              className="rm-sidebar-item rm-disabled"
              title="GitHub 연결 필요 (설정에서 토큰 등록)"
              onClick={onOpenGithubSettings}
              style={{ cursor: 'pointer' }}
            >
              <IconGitHub />GitHub
            </div>
          )}
          {gitlabConnected ? (
            <div
              className={`rm-sidebar-item${isGitlab ? ' active' : ''}`}
              title="내 GitLab 프로젝트 둘러보기"
              onClick={() => setSel({ kind: 'gitlab' })}
            >
              <GlMark size={15} />GitLab
              <span className="rm-svc-dot gl" />
            </div>
          ) : (
            <div
              className="rm-sidebar-item rm-disabled"
              title="GitLab 연결 필요 (설정 → GitLab 탭에서 인스턴스 등록)"
              onClick={onOpenGitlabSettings}
              style={{ cursor: 'pointer' }}
            >
              <IconGitLab />GitLab
            </div>
          )}
        </div>

        {/* ── 그로브 현황 카드 (활발/보통/휴면 — bucketOf 집계) ── */}
        <div className="rm-grove-card">
          <div className="rm-grove-card-top">
            <Geuru expr="idle" scale={1.4} title="그루" />
            <div className="rm-gc-txt">
              <b>그로브 현황</b>
              <span>이번 주 {weekCommits} 커밋</span>
            </div>
          </div>
          <div className="rm-grove-bar">
            {(() => {
              const tot = Math.max(1, groveBuckets.active + groveBuckets.moderate + groveBuckets.dormant)
              return (
                <>
                  <i style={{ width: `${groveBuckets.active / tot * 100}%`, background: 'var(--c-grove)' }} />
                  <i style={{ width: `${groveBuckets.moderate / tot * 100}%`, background: 'var(--c-gold-400)' }} />
                  <i style={{ width: `${groveBuckets.dormant / tot * 100}%`, background: 'var(--c-border-strong)' }} />
                </>
              )
            })()}
          </div>
          <div className="rm-grove-legend">
            <span><i style={{ background: 'var(--c-grove)' }} />활발</span>
            <span><i style={{ background: 'var(--c-gold-400)' }} />보통</span>
            <span><i style={{ background: 'var(--c-border-strong)' }} />휴면</span>
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="rm-main">
        <div className="rm-content-header">
          <div className="rm-head-top">
            <span className="rm-head-geuru"><Geuru expr="happy" scale={2.6} title="그루" /></span>
            <div className="rm-head-titles">
              <h1>내 그로브<span className="en">Repository</span></h1>
              <p><b>{segCounts.all}그루</b>가 자라고 있어요 · {segCounts.open} 열림 · {segCounts.dirty} 변경 대기</p>
            </div>
            <div className="rm-head-actions">
              <button className="rm-action-btn rm-primary" onClick={() => { void onClone('') }} title="원격 저장소 클론">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 8a6 6 0 1 1 12 0"/><path d="M8 3v2M5.5 4.5L7 6M10.5 4.5L9 6"/></svg>
                Clone
              </button>
              <button className="rm-action-btn" onClick={onBrowse} title="폴더 열기">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2 5.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/></svg>
                Browse
              </button>
              <button className="rm-action-btn rm-disabled" onClick={placeholder('Init')} title="준비 중">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 3v10M3 8h10"/></svg>
                Init
              </button>
            </div>
          </div>
        </div>

        {isInbox ? (
          <GithubInbox
            githubToken={githubToken}
            githubLogin={githubLogin}
            gitlabInstances={gitlabInstances}
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
        ) : isGitlab ? (
          <GitlabBrowser
            instances={glInstances ?? []}
            activeHost={glActiveHost}
            onSelectInstance={handleGlSelectInstance}
            onAddInstance={onOpenGitlabSettings}
            disconnected={glInstances !== null && glInstances.length === 0}
            projects={glProjects ?? []}
            loading={glLoading || glInstances === null}
            error={glError}
            query={glQuery}
            hasMore={glHasMore}
            loadingMore={glLoadingMore}
            cloningRepo={glCloning}
            isLocal={isGlLocal}
            onQueryChange={setGlQuery}
            onRefresh={handleGlRefresh}
            onLoadMore={handleGlLoadMore}
            onAction={proj => void handleGlAction(proj)}
            onOpenSettings={onOpenGitlabSettings}
          />
        ) : activeWs ? (
        /* ── 워크스페이스(그룹) 카드 그리드 ── */
        <>
          <div className="rm-filter-bar">
            <div className="rm-search-wrap">
              <IconSearch />
              <input
                type="text"
                placeholder="저장소 검색…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <button className="rm-sort-btn" onClick={() => setSort(s => s === 'activity' ? 'name' : 'activity')} title="정렬 전환">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 4v8M4 12l-2-2M4 12l2-2M10 4h4M10 8h3M10 12h2"/></svg>
              {sort === 'name' ? '이름순' : '최근 활동순'}
            </button>
          </div>
          <div className="rm-field">
            {wsCards.length === 0 ? (
              <div className="rm-empty-big">
                <Geuru expr="sleepy" scale={3.4} title="그루" />
                <b>이 그룹은 비어 있어요</b>
                <span>레포 카드의 ⋯ 메뉴 → 워크스페이스에서 이 그룹에 추가하세요.</span>
              </div>
            ) : (
              <div className="rm-grid">
                {wsCards.map(c => (
                  <GroveCard
                    key={c.path}
                    model={c}
                    isFavorite={favSet.has(c.path)}
                    isSelected={selectedPath === c.path}
                    dim={!c.open}
                    onSelect={() => setSelectedPath(c.path)}
                    onToggleStar={() => onToggleFavorite(c.path)}
                    onOpen={() => handleOpen(c.path, c.name, c.branch)}
                    onMenu={e => openMenu(c.path, e)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
        ) : (
        /* ── 그로브 카드 그리드 (전체/열림/즐겨찾기/최근/변경) ── */
        <>
          {/* 필터 바: 세그먼트 + 검색 + 정렬 */}
          <div className="rm-filter-bar">
            <div className="rm-seg">
              {([['all', '전체'], ['open', '열림'], ['fav', '즐겨찾기'], ['recent', '최근'], ['dirty', '변경']] as const).map(([k, label]) => (
                <button
                  key={k}
                  className={seg === k ? 'on' : ''}
                  onClick={() => { setSeg(k); setSel({ kind: 'view', view: k === 'fav' ? 'favorites' : k === 'recent' ? 'recent' : 'all' }) }}
                >
                  {label}<span className="c">{segCounts[k]}</span>
                </button>
              ))}
            </div>
            <div className="rm-search-wrap">
              <IconSearch />
              <input
                type="text"
                placeholder="저장소 검색…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <button className="rm-sort-btn" onClick={() => setSort(s => s === 'activity' ? 'name' : 'activity')} title="정렬 전환">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 4v8M4 12l-2-2M4 12l2-2M10 4h4M10 8h3M10 12h2"/></svg>
              {sort === 'name' ? '이름순' : '최근 활동순'}
            </button>
          </div>

          {/* 카드 필드 */}
          <div className="rm-field">
            {cardModels.length === 0 ? (
              <div className="rm-empty-big">
                <Geuru expr={query ? 'conflict' : 'sleepy'} scale={4} title="그루" />
                <b>{query ? '검색 결과가 없어요' : '이 그로브는 비어 있어요'}</b>
                <span>
                  {query
                    ? `"${query}" 와 일치하는 저장소가 없어요. 다른 키워드로 찾아보세요.`
                    : '저장소를 Clone 하거나 폴더를 열어 첫 나무를 심어보세요. 커밋 하나, 새싹 하나.'}
                </span>
                {!query && (
                  <button className="rm-action-btn rm-primary" style={{ marginTop: 4 }} onClick={() => { void onClone('') }}>저장소 Clone</button>
                )}
              </div>
            ) : seg === 'all' ? (
              /* 전체: 열린 저장소 / 다른 나무들 그룹 구분 */
              (() => {
                const open = cardModels.filter(c => c.open)
                const rest = cardModels.filter(c => !c.open)
                const renderGrid = (list: CardModel[]) => (
                  <div className="rm-grid">
                    {list.map(c => (
                      <GroveCard
                        key={c.path}
                        model={c}
                        isFavorite={favSet.has(c.path)}
                        isSelected={selectedPath === c.path}
                        dim={!c.open}
                        onSelect={() => setSelectedPath(c.path)}
                        onToggleStar={() => onToggleFavorite(c.path)}
                        onOpen={() => handleOpen(c.path, c.name, c.branch)}
                        onMenu={e => openMenu(c.path, e)}
                      />
                    ))}
                  </div>
                )
                return (
                  <>
                    {open.length > 0 && (
                      <>
                        <div className="rm-group-head">
                          <span className="rm-gh-title">열린 저장소</span>
                          <span className="rm-gh-count">{open.length}</span>
                          <span className="rm-gh-line" />
                        </div>
                        {renderGrid(open)}
                      </>
                    )}
                    {rest.length > 0 && (
                      <>
                        <div className="rm-group-head">
                          <span className="rm-gh-title">그로브의 다른 나무들</span>
                          <span className="rm-gh-count">{rest.length}</span>
                          <span className="rm-gh-line" />
                        </div>
                        {renderGrid(rest)}
                      </>
                    )}
                  </>
                )
              })()
            ) : (
              <div className="rm-grid">
                {cardModels.map(c => (
                  <GroveCard
                    key={c.path}
                    model={c}
                    isFavorite={favSet.has(c.path)}
                    isSelected={selectedPath === c.path}
                    dim={!c.open}
                    onSelect={() => setSelectedPath(c.path)}
                    onToggleStar={() => onToggleFavorite(c.path)}
                    onOpen={() => handleOpen(c.path, c.name, c.branch)}
                    onMenu={e => openMenu(c.path, e)}
                  />
                ))}
              </div>
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
            {workspaces.length === 0 && <div className="rm-menu-hint">아직 워크스페이스가 없어요 · 아래에서 만들어 보세요</div>}
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
      {deleteWsConfirm && (
        <ConfirmModal
          title="워크스페이스 삭제"
          message={`'${deleteWsConfirm.name}' 워크스페이스를 삭제해요. 저장소 파일은 삭제되지 않아요.`}
          confirmLabel="삭제"
          danger={true}
          onConfirm={() => {
            onDeleteWorkspace(deleteWsConfirm.id)
            notify(...spread(TOASTS.workspaceDeleted(deleteWsConfirm.name)))
            setDeleteWsConfirm(null)
          }}
          onCancel={() => setDeleteWsConfirm(null)}
        />
      )}
      {removeRepoConfirm && (
        <ConfirmModal
          title="GitGrove에서 제거"
          message={`'${removeRepoConfirm.name}'을(를) 최근/즐겨찾기/워크스페이스에서 제거해요. 디스크의 파일은 삭제되지 않아요.`}
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
