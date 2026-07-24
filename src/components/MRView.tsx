import { useState, useEffect, useCallback, useRef } from 'react'
import { Markdown } from './Markdown'
import { Geuru } from './Geuru'
import { parseGitLabRepo, matchGitlabHost, pipelineStatusToPipe, type PipeState } from '../utils/gitlab'
import {
  getMergeRequests,
  getMergeRequestChanges,
  getMergeRequestNotes,
  getMergeRequestPipelines,
  getMergeRequestApprovals,
  approveMergeRequest,
  unapproveMergeRequest,
  acceptMergeRequest,
  createMergeRequestNote,
  GitlabApiError,
  type GitlabMergeRequest,
  type GitlabMrChange,
  type GitlabMrNote,
  type GitlabMrApprovals,
} from '../utils/gitlabClient'
import { ConfirmModal } from './modals/ConfirmModal'
import { TOASTS, spread } from '../toasts'
import type { NotifyFn } from '../hooks/useNotifications'

type GlAction = 'approve' | 'merge' | 'note'

// 쓰기 액션 실패 사유 → 사용자 안내(사유 먼저). err.status + 액션 종류로 분기.
function glActionError(err: unknown, action: GlAction): string {
  const status = err instanceof GitlabApiError ? err.status : 0
  if (status === 403) return '토큰에 쓰기 권한(GitLab `api` 스코프)이 필요해요'
  if (status === 404) return '대상을 찾지 못했어요 · 이미 닫혔거나 접근 권한이 없을 수 있어요'
  if (status === 405 || status === 406) {
    if (action === 'merge') return '지금은 머지할 수 없어요 · 충돌·파이프라인·승인 상태를 확인해주세요'
    if (action === 'approve') return '지금은 승인할 수 없는 상태예요 · 대상 상태를 확인해주세요'
    return '지금은 처리할 수 없는 상태예요 · 대상 상태를 확인해주세요'
  }
  return err instanceof Error ? err.message : String(err)
}

// ── 뷰 모델 (디자인 MRS 데이터 형태에 맞춘 UI용 정규화 타입) ──
interface MRReviewer { n: string; i: string; ac: string; st: 'approved' | 'pending' }
interface MRFile { p: string; s: 'A' | 'M' | 'D' | 'R'; a: number; d: number }
interface MRNote { id: number; author: string; i: string; ac: string; time: string; body: string }
export interface MRItem {
  id: number          // MR iid (디자인의 `!번호`)
  projectId: number
  status: 'open' | 'merged' | 'closed'
  draft: boolean
  title: string
  labels: string[]
  author: string
  init: string
  ac: string
  from: string
  to: string
  created: string
  comments: number
  pipe: PipeState
  body: string
  webUrl: string
}

interface MRDetail {
  files: MRFile[]
  notes: MRNote[]
  reviewers: MRReviewer[]
  /** [현재 승인 수, 요구 승인 수]. 승인 기능 미지원/없음이면 null(승인 박스 숨김). */
  appr: [number, number] | null
  /** 현재 토큰 사용자가 이미 승인했는지 — 승인/취소 토글 방향. */
  hasApproved: boolean
  pipe: PipeState
  loading: boolean
  error: string | null
}

interface GitlabRepoCtx { host: string; token: string; projectPath: string; fullPath: string }

// GitLab 식별 색(주황 — MR `!`·프로젝트 점 등 식별만). 골드 아님.
const GL_ORANGE = '#fc6d26'
const AVATAR_PALETTE = ['#5fb8e6', '#c39ad9', '#6fcf7c', '#e6a536', '#fc6d26']

function colorForName(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}

function initialsOf(name: string): string {
  const t = (name || '?').trim()
  return t.slice(0, 2)
}

function relTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function mrStatus(state: GitlabMergeRequest['state']): 'open' | 'merged' | 'closed' {
  if (state === 'merged') return 'merged'
  if (state === 'closed' || state === 'locked') return 'closed'
  return 'open'
}

function mapMR(mr: GitlabMergeRequest): MRItem {
  const authorName = mr.author?.name ?? mr.author?.username ?? '?'
  return {
    id: mr.iid,
    projectId: mr.project_id,
    status: mrStatus(mr.state),
    draft: !!mr.draft,
    title: mr.title.replace(/^Draft:\s*/i, ''),
    labels: mr.labels ?? [],
    author: authorName,
    init: initialsOf(authorName),
    ac: colorForName(authorName),
    from: mr.source_branch,
    to: mr.target_branch,
    created: relTime(mr.created_at),
    comments: mr.user_notes_count ?? 0,
    pipe: 'pend',
    body: mr.description ?? '',
    webUrl: mr.web_url,
  }
}

function changeStatus(c: GitlabMrChange): MRFile['s'] {
  if (c.new_file) return 'A'
  if (c.deleted_file) return 'D'
  if (c.renamed_file) return 'R'
  return 'M'
}

function countDiff(diff?: string): { a: number; d: number } {
  if (!diff) return { a: 0, d: 0 }
  let a = 0
  let d = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) a++
    else if (line.startsWith('-') && !line.startsWith('---')) d++
  }
  return { a, d }
}

// ── pipeline badge (디자인 .pipe / .pipe-* + SVG 아이콘 미러) ──
const PIPE_LABEL: Record<PipeState, string> = { pass: 'passed', fail: 'failed', run: 'running', pend: 'pending' }
function PipeIcon({ s }: { s: PipeState }) {
  const common = { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor' } as const
  if (s === 'pass') return <svg {...common} strokeWidth="1.7"><circle cx="8" cy="8" r="6" /><path d="M5.5 8.2l1.8 1.8 3.2-3.6" /></svg>
  if (s === 'fail') return <svg {...common} strokeWidth="1.7"><circle cx="8" cy="8" r="6" /><path d="M6 6l4 4M10 6l-4 4" /></svg>
  if (s === 'run') return <svg {...common} strokeWidth="1.7"><path d="M8 2.5a5.5 5.5 0 1 1-5.2 3.7" /></svg>
  return <svg {...common} strokeWidth="1.6"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 1.5" /></svg>
}
function PipeBadge({ s }: { s: PipeState }) {
  return (
    <span className={`pipe pipe-${s}`}>
      <PipeIcon s={s} />
      {PIPE_LABEL[s]}
    </span>
  )
}

function Avatar({ init, ac, mini }: { init: string; ac: string; mini?: boolean }) {
  const size = mini ? 22 : 16
  return (
    <div
      className={mini ? 'av-mini' : undefined}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: mini ? 8 : 7, fontFamily: 'var(--font-display)',
        background: ac + '22', color: ac, border: `1px solid ${ac}44`,
      }}
    >{init}</div>
  )
}

interface Props {
  repoPath?: string | null
  onOpenUrl?: (url: string) => void
  notify: NotifyFn
}

export function MRView({ repoPath, onOpenUrl, notify }: Props) {
  const [filter, setFilter] = useState<'open' | 'merged' | 'all'>('open')
  const [selId, setSelId] = useState<number | null>(null)
  const [dtab, setDtab] = useState<'overview' | 'changes' | 'pipelines' | 'notes'>('overview')
  const [busy, setBusy] = useState<null | 'approve' | 'merge' | 'note'>(null)
  // 승인 여부 낙관적 오버라이드 — 승인 GET을 지원 안 하는 인스턴스에서도 토글 반영.
  const [approvedOverride, setApprovedOverride] = useState<boolean | null>(null)
  const [showMergeConfirm, setShowMergeConfirm] = useState(false)
  const [squash, setSquash] = useState(false)
  // 승인/승인취소도 원격을 바꾸므로 확인 다이얼로그를 먼저 띄운다.
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [noteBody, setNoteBody] = useState('')
  // 상세 강제 재조회 트리거(승인/노트 후). 값이 바뀌면 선택 MR 상세를 다시 가져온다.
  const [detailNonce, setDetailNonce] = useState(0)

  const [ctx, setCtx] = useState<GitlabRepoCtx | null>(null)
  const [mrs, setMrs] = useState<MRItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notConnected, setNotConnected] = useState(false)

  // 선택 MR의 상세(변경/노트/파이프라인) — iid → detail. 마운트마다 lazy fetch.
  const [details, setDetails] = useState<Record<number, MRDetail>>({})
  // 로드한(또는 로드 중인) iid는 ref로 추적 → effect deps에서 details 제외(자가취소 방지).
  const loadedDetailRef = useRef<Set<number>>(new Set())

  // ── 활성 레포의 GitLab host/project 해석 + 연결된 토큰 확보 ──
  const resolveCtx = useCallback(async (): Promise<GitlabRepoCtx | null> => {
    if (!repoPath) return null
    const remotes = await window.gitAPI?.getRemotes(repoPath) ?? []
    const origin = remotes.find(r => r.name === 'origin') ?? remotes[0]
    if (!origin) return null
    const info = parseGitLabRepo(origin.url)
    if (!info) return null
    const hosts = await window.appAPI?.gitlabListHosts() ?? []
    const matched = matchGitlabHost(hosts, info.host)
    if (!matched) return null
    const token = await window.appAPI?.gitlabGetToken(matched) ?? null
    if (!token) return null
    return { host: matched, token, projectPath: info.fullPath, fullPath: info.fullPath }
  }, [repoPath])

  // ── MR 목록 fetch (자동 + 수동 새로고침 공유) ──
  const loadMRs = useCallback(async () => {
    if (!repoPath) return
    let resolved: GitlabRepoCtx | null = null
    try {
      resolved = await resolveCtx()
    } catch {
      // getRemotes 실패 등은 조용히
    }
    if (!resolved) {
      setNotConnected(true)
      setMrs(null)
      return
    }
    setNotConnected(false)
    setCtx(resolved)
    setLoading(true)
    try {
      const raw = await getMergeRequests(resolved.host, resolved.token, {
        // raw 경로(group/repo)를 그대로 전달한다. 인코딩은 getMergeRequests가 1회만 수행
        // (여기서 encodeURIComponent하면 gitlabClient에서 다시 인코딩돼 group%252Frepo → 404).
        projectId: resolved.projectPath,
        state: 'all',
        cache: false,
      })
      const mapped = raw.map(mapMR)
      // 새로고침: 상세 캐시 무효화 → 선택 MR 상세를 다시 가져온다.
      loadedDetailRef.current.clear()
      setDetails({})
      setMrs(mapped)
      setError(null)
      // 자동 선택 없음 — 탭 진입 시 미선택이 기본. 목록에서 클릭해야 상세가 뜬다.
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [repoPath, resolveCtx])

  useEffect(() => { void loadMRs() }, [loadMRs])

  // ── 선택 MR 상세(변경/노트/파이프라인) lazy fetch ──
  useEffect(() => {
    if (selId == null || !ctx || !mrs) return
    const sel = mrs.find(m => m.id === selId)
    if (!sel) return
    if (loadedDetailRef.current.has(selId)) return // 이미 로드(또는 로드 중)
    loadedDetailRef.current.add(selId)
    let cancelled = false
    setDetails(d => ({ ...d, [selId]: { files: [], notes: [], reviewers: [], appr: null, hasApproved: false, pipe: sel.pipe, loading: true, error: null } }))
    ;(async () => {
      try {
        const [changes, notesRaw, pipelines, approvals] = await Promise.all([
          getMergeRequestChanges(ctx.host, ctx.token, sel.projectId, sel.id, { cache: false }).catch(() => [] as GitlabMrChange[]),
          getMergeRequestNotes(ctx.host, ctx.token, sel.projectId, sel.id, { cache: false }).catch(() => [] as GitlabMrNote[]),
          getMergeRequestPipelines(ctx.host, ctx.token, sel.projectId, sel.id, { cache: false }).catch(() => []),
          // 승인 기능 미지원 인스턴스는 403/404 → null로 graceful 처리
          getMergeRequestApprovals(ctx.host, ctx.token, sel.projectId, sel.id, { cache: false }).catch(() => null as GitlabMrApprovals | null),
        ])
        if (cancelled) return
        const files: MRFile[] = changes.map(c => {
          const { a, d } = countDiff(c.diff)
          return { p: c.new_path || c.old_path, s: changeStatus(c), a, d }
        })
        const notes: MRNote[] = notesRaw
          .filter(n => !n.system && n.body.trim())
          .map(n => {
            const name = n.author?.name ?? n.author?.username ?? '?'
            return { id: n.id, author: name, i: initialsOf(name), ac: colorForName(name), time: relTime(n.created_at), body: n.body }
          })
        const pipe = pipelines.length ? pipelineStatusToPipe(pipelines[0].status) : sel.pipe
        let appr: [number, number] | null = null
        let hasApproved = false
        const reviewers: MRReviewer[] = []
        if (approvals) {
          const required = approvals.approvals_required ?? 0
          const current = Math.max(0, required - (approvals.approvals_left ?? 0))
          appr = [current, required]
          hasApproved = !!approvals.user_has_approved
          for (const ab of approvals.approved_by ?? []) {
            const name = ab.user?.name ?? ab.user?.username ?? '?'
            reviewers.push({ n: name, i: initialsOf(name), ac: colorForName(name), st: 'approved' })
          }
        }
        setDetails(d => ({ ...d, [selId]: { files, notes, reviewers, appr, hasApproved, pipe, loading: false, error: null } }))
      } catch (err) {
        if (cancelled) return
        // 실패 시 재시도 가능하도록 추적에서 제거
        loadedDetailRef.current.delete(selId)
        setDetails(d => ({ ...d, [selId]: { files: [], notes: [], reviewers: [], appr: null, hasApproved: false, pipe: sel.pipe, loading: false, error: (err as Error).message } }))
      }
    })()
    return () => { cancelled = true }
  }, [selId, ctx, mrs, detailNonce])

  // 승인/노트 등 액션 후 선택 MR 상세를 강제 재조회한다(추적 해제 + nonce 증가).
  const refreshDetail = useCallback(() => {
    if (selId != null) loadedDetailRef.current.delete(selId)
    setDetailNonce(n => n + 1)
  }, [selId])

  // ── 상태별 화면 ──
  if (loading && !mrs) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--c-text-muted)' }}>
        <span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite', fontSize: 16 }}>⟳</span>
        GitLab MR 불러오는 중…
      </div>
    )
  }

  if (notConnected) {
    return (
      <div className="pr-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--c-text)', marginBottom: 6 }}>GitLab 인스턴스가 연결되지 않았어요</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>Settings → GitLab 탭에서 인스턴스를 연결해주세요</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pr-empty">
        <div style={{ color: 'var(--c-danger)' }}>⚠ {error}</div>
      </div>
    )
  }

  const mrData = mrs ?? []
  const openCount = mrData.filter(m => m.status === 'open').length
  const filtered = mrData.filter(m => filter === 'all' || m.status === filter)
  // selId가 null이면 미선택 — 폴백 없이 sel은 undefined로 두고 빈 상태를 렌더한다.
  const sel = selId == null ? undefined : mrData.find(m => m.id === selId)
  const detail = sel ? details[sel.id] : undefined
  const selPipe = detail?.pipe ?? sel?.pipe ?? 'pend'
  const apprMet = detail?.appr ? detail.appr[0] >= detail.appr[1] : true
  const isApproved = approvedOverride ?? detail?.hasApproved ?? false

  // ── 쓰기 액션. 인자 순서 주의: 쓰기 메서드는 (host, projectId, iid, token). ──
  const handleApproveToggle = async () => {
    if (!ctx || !sel || busy) return
    setBusy('approve')
    try {
      if (isApproved) {
        await unapproveMergeRequest(ctx.host, sel.projectId, sel.id, ctx.token)
        setApprovedOverride(false)
        notify(...spread(TOASTS.mrUnapproved()))
      } else {
        await approveMergeRequest(ctx.host, sel.projectId, sel.id, ctx.token)
        setApprovedOverride(true)
        notify(...spread(TOASTS.mrApproved()))
      }
      setShowApproveConfirm(false)
      refreshDetail()
    } catch (err) {
      notify(...spread(TOASTS.reviewActionFailed('승인 처리 실패', glActionError(err, 'approve'))))
    } finally {
      setBusy(null)
    }
  }

  const handleMerge = async () => {
    if (!ctx || !sel || busy) return
    setBusy('merge')
    try {
      // 비동기 머지(merge_when_pipeline_succeeds 등)면 200이어도 state가 아직 'merged'가
      // 아닐 수 있어, 반환 state를 보고 완료/예약을 분기한다(조기 "머지 완료" 방지).
      const mr = await acceptMergeRequest(ctx.host, sel.projectId, sel.id, ctx.token, squash ? { squash: true } : undefined)
      setShowMergeConfirm(false)
      notify(...spread(mr.state === 'merged' ? TOASTS.merged() : TOASTS.mrMergeScheduled()))
      await loadMRs()
    } catch (err) {
      notify(...spread(TOASTS.reviewActionFailed('머지 실패', glActionError(err, 'merge'))))
    } finally {
      setBusy(null)
    }
  }

  const handleNote = async () => {
    if (!ctx || !sel || busy) return
    const body = noteBody.trim()
    if (!body) return
    setBusy('note')
    try {
      await createMergeRequestNote(ctx.host, sel.projectId, sel.id, ctx.token, body)
      setNoteBody('')
      notify(...spread(TOASTS.mrNoteAdded()))
      refreshDetail()
    } catch (err) {
      notify(...spread(TOASTS.reviewActionFailed('노트 실패', glActionError(err, 'note'))))
    } finally {
      setBusy(null)
    }
  }

  const tabs: Array<[typeof dtab, string]> = [
    ['overview', '개요'],
    ['changes', `변경 (${detail?.files.length ?? 0})`],
    ['pipelines', '파이프라인'],
    ['notes', `노트 (${detail?.notes.length ?? 0})`],
  ]

  return (
    <div className="pr-wrap">
      <div className="pr-list-pane">
        <div className="pr-proj-bar">
          <span className="gl-dot" />
          {ctx?.fullPath ?? 'GitLab'}
          <button
            className="pr-refresh-btn"
            onClick={() => void loadMRs()}
            disabled={loading}
            title="MR 목록 새로고침"
            style={{ marginLeft: 'auto' }}
          >
            <span style={loading ? { display: 'inline-block', animation: 'spin 600ms linear infinite' } : undefined}>⟳</span>
          </button>
        </div>
        <div className="pr-filters">
          {(['open', 'merged', 'all'] as const).map(f => (
            <button key={f} className={`pr-filter${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'open' && <span style={{ marginLeft: 4, fontFamily: 'var(--font-mono)', fontSize: 9 }}>({openCount})</span>}
            </button>
          ))}
        </div>
        <div className="pr-list-scroll">
          {filtered.map(mr => {
            const stCls = mr.draft ? 'pr-draft' : `pr-${mr.status}`
            const stLbl = mr.draft ? 'draft' : mr.status
            return (
              <div key={mr.id} className={`pr-item${mr.id === sel?.id ? ' on' : ''}`} onClick={() => { setSelId(mr.id); setDtab('overview'); setApprovedOverride(null); setNoteBody(''); setShowMergeConfirm(false); setShowApproveConfirm(false); setSquash(false) }}>
                <div className="pr-item-hd">
                  <span className={`pr-status ${stCls}`}>{stLbl}</span>
                  <span className="pr-num" style={{ color: GL_ORANGE }}>!{mr.id}</span>
                  {mr.labels.map(l => <span key={l} className="pr-label">{l}</span>)}
                </div>
                <div className="pr-title">{mr.title}</div>
                <div className="pr-meta">
                  <Avatar init={mr.init} ac={mr.ac} />
                  <span>{mr.author}</span><span>·</span><span>{mr.created}</span>
                  {mr.comments > 0 && <><span>·</span><span>💬 {mr.comments}</span></>}
                  <span style={{ marginLeft: 'auto' }}><PipeBadge s={mr.pipe} /></span>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="pr-empty" style={{ height: 160 }}>
              <Geuru expr="sleepy" scale={2.4} />
              <span>No {filter} merge requests</span>
            </div>
          )}
        </div>
      </div>
      <div className="pr-detail-pane">
        {sel ? (
          <>
            <div className="pr-detail-hdr">
              <div className="pr-detail-title">{sel.title}</div>
              <div className="pr-detail-meta">
                <span className={`pr-status ${sel.draft ? 'pr-draft' : `pr-${sel.status}`}`}>{sel.draft ? 'draft' : sel.status}</span>
                <div className="pr-branch-arrow">
                  <span className="pr-branch-pill pr-from-pill">{sel.from}</span>
                  <span>→</span>
                  <span className="pr-branch-pill pr-to-pill">{sel.to}</span>
                </div>
                <PipeBadge s={selPipe} />
                <span style={{ color: 'var(--c-text-faint)' }}>by <strong style={{ color: 'var(--c-text)' }}>{sel.author}</strong> · {sel.created}</span>
                {sel.webUrl && onOpenUrl && (
                  <button className="pr-refresh-btn" title="GitLab에서 열기" style={{ marginLeft: 'auto' }} onClick={() => onOpenUrl(sel.webUrl)}>↗</button>
                )}
              </div>
            </div>
            <div className="pr-dtabs">
              {tabs.map(([id, label]) => (
                <button key={id} className={`pr-dtab${dtab === id ? ' on' : ''}`} onClick={() => setDtab(id)}>{label}</button>
              ))}
            </div>
            <div className="pr-body">
              {dtab === 'overview' && (
                <>
                  <div className="sec-lbl">Description</div>
                  {sel.body
                    ? <Markdown source={sel.body} className="pr-desc" />
                    : <div className="pr-desc" style={{ color: 'var(--c-text-faint)' }}>설명이 없어요</div>}
                  {detail?.appr && (
                    <>
                      <div className="divl" />
                      <div className="sec-lbl">승인 (Approvals)</div>
                      <div className={`appr-box ${apprMet ? 'met' : 'unmet'}`}>
                        <div className="appr-ring" style={{ background: apprMet ? 'rgba(111,207,124,.16)' : 'var(--c-bg-inset)', color: apprMet ? 'var(--c-success)' : 'var(--c-text-muted)' }}>{detail.appr[0]}/{detail.appr[1]}</div>
                        <div className="appr-info">
                          <b>{apprMet ? '승인 요건 충족' : '승인 대기 중'}</b>
                          <span>{detail.appr[1]}명 중 {detail.appr[0]}명 승인 · 타겟 <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{sel.to}</code></span>
                        </div>
                        <div className="appr-avs">{detail.reviewers.map((r, i) => <Avatar key={i} init={r.i} ac={r.ac} mini />)}</div>
                      </div>
                    </>
                  )}
                  {detail && detail.reviewers.length > 0 && (
                    <>
                      <div className="divl" />
                      <div className="sec-lbl">리뷰어 · Assignee</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {detail.reviewers.map((r, i) => (
                          <div key={i} className="pr-reviewer-row">
                            <div className="pr-rv-av" style={{ background: r.ac + '22', color: r.ac, border: `1px solid ${r.ac}44` }}>{r.i}</div>
                            <span className="pr-rv-name">{r.n}</span>
                            <span className="pr-rv-status" style={{ color: r.st === 'approved' ? 'var(--c-success)' : 'var(--c-text-faint)' }}>{r.st === 'approved' ? '✓ 승인함' : '⏳ 대기'}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="divl" />
                  {selPipe === 'fail' && (
                    <div style={{ padding: '9px 12px', background: 'rgba(255,107,107,.08)', border: '1px solid rgba(255,107,107,.3)', borderRadius: 'var(--r2)', fontSize: 12, color: 'var(--c-danger)', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span>⚡</span>
                      <span>파이프라인이 실패했어요.{sel.webUrl && onOpenUrl && <> <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-gold-300)', fontSize: 12, padding: 0, textDecoration: 'underline' }} onClick={() => onOpenUrl(sel.webUrl)}>실패한 job 보기</button></>}</span>
                    </div>
                  )}
                </>
              )}
              {dtab === 'changes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {detail?.loading && <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>변경 내용 불러오는 중…</div>}
                  {!detail?.loading && (detail?.files.length ?? 0) === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--c-text-faint)', padding: '12px 0' }}>변경된 파일이 없어요</div>
                  )}
                  {detail?.files.map(f => (
                    <div key={f.p} className="pr-file-row">
                      <span className={`fst fst-${f.s === 'R' ? 'M' : f.s}`}>{f.s}</span>
                      <span className="pr-file-path">{f.p}</span>
                      <span className="diffnum" style={{ color: 'var(--c-success)' }}>+{f.a}</span>
                      <span className="diffnum" style={{ color: 'var(--c-danger)' }}>−{f.d}</span>
                    </div>
                  ))}
                </div>
              )}
              {dtab === 'pipelines' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className="sec-lbl" style={{ margin: 0 }}>최근 파이프라인</span>
                    <PipeBadge s={selPipe} />
                  </div>
                  {detail?.loading && <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>파이프라인 불러오는 중…</div>}
                  {!detail?.loading && (
                    <div className="pr-check">
                      <div className={`pr-check-dot ${selPipe === 'pass' ? 'pass' : selPipe === 'fail' ? 'fail' : selPipe === 'run' ? 'run' : 'pend'}`}>
                        {selPipe === 'pass' ? '✓' : selPipe === 'fail' ? '✗' : selPipe === 'run' ? '●' : '…'}
                      </div>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--c-text)' }}>최근 실행</span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: selPipe === 'pass' ? 'var(--c-success)' : selPipe === 'fail' ? 'var(--c-danger)' : 'var(--c-info)' }}>{PIPE_LABEL[selPipe]}</span>
                    </div>
                  )}
                </>
              )}
              {dtab === 'notes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {detail?.loading && <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>노트 불러오는 중…</div>}
                  {!detail?.loading && (detail?.notes.length ?? 0) === 0 && (
                    <div className="pr-empty" style={{ height: 140 }}><Geuru expr="sleepy" scale={2.2} /><span>아직 노트가 없어요 · 첫 코멘트를 남겨 보세요</span></div>
                  )}
                  {detail?.notes.map(n => (
                    <div key={n.id} className="pr-comment">
                      <div className="pr-comment-hd">
                        <div className="pr-comment-av" style={{ background: n.ac + '22', color: n.ac, border: `1px solid ${n.ac}44` }}>{n.i}</div>
                        <span style={{ fontSize: 12, color: 'var(--c-text-strong)', fontWeight: 600 }}>{n.author}</span>
                        <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{n.time}</span>
                      </div>
                      <Markdown source={n.body} className="pr-comment-body" />
                    </div>
                  ))}
                  <div className="pr-comment-form">
                    <textarea
                      className="pr-comment-input"
                      placeholder="첫 코멘트를 남겨 보세요"
                      value={noteBody}
                      onChange={e => setNoteBody(e.target.value)}
                      rows={3}
                    />
                    <button className="pr-comment-send" disabled={!noteBody.trim() || busy === 'note'} onClick={() => void handleNote()}>
                      {busy === 'note' ? <span className="pr-spin">⟳</span> : '보내기'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {sel.status === 'open' && (
              <div className="pr-approve-row">
                <button className={`pr-approve-btn${isApproved ? ' done' : ''}`} disabled={!!busy} onClick={() => setShowApproveConfirm(true)}
                  style={isApproved ? { filter: 'brightness(1.1)' } : {}}>
                  {busy === 'approve' ? <span className="pr-spin">⟳</span> : isApproved ? '✓ 승인함' : '승인'}
                </button>
                <button className="pr-merge-btn" disabled={!!busy || sel.draft} onClick={() => setShowMergeConfirm(true)}
                  title={sel.draft ? 'Draft MR은 머지할 수 없어요' : !apprMet ? '승인 요건 미충족 · 머지가 거부될 수 있어요' : selPipe === 'fail' ? '파이프라인 실패 · 머지가 거부될 수 있어요' : undefined}>
                  {sel.draft ? 'Draft' : 'Merge'}
                </button>
              </div>
            )}
          </>
        ) : <div className="pr-empty"><Geuru expr="idle" scale={2.8} /><span>왼쪽에서 MR을 고르면 여기에 보여요</span></div>}
      </div>
      {showApproveConfirm && sel && (
        <ConfirmModal
          title={isApproved ? '승인을 취소할까요?' : '이 MR을 승인할까요?'}
          message={`!${sel.id} · ${sel.title} ${isApproved ? '의 승인을 취소해요' : '를 승인해요'} · 원격에 바로 반영돼요.`}
          confirmLabel={busy === 'approve' ? '처리 중…' : isApproved ? '승인 취소' : '승인'}
          confirmDisabled={busy === 'approve'}
          onConfirm={() => void handleApproveToggle()}
          onCancel={() => { if (busy !== 'approve') setShowApproveConfirm(false) }}
        />
      )}
      {showMergeConfirm && sel && (
        <ConfirmModal
          title={`MR !${sel.id} 머지`}
          message={`이 MR을 ${sel.to}에 머지해요 · 원격에 바로 반영되는 작업이에요.`}
          confirmLabel={busy === 'merge' ? '머지 중…' : '머지'}
          danger
          confirmDisabled={busy === 'merge'}
          onConfirm={() => void handleMerge()}
          onCancel={() => { if (busy !== 'merge') setShowMergeConfirm(false) }}
        >
          <label className="pr-merge-method" style={{ justifyContent: 'flex-start' }}>
            <input type="checkbox" checked={squash} onChange={e => setSquash(e.target.checked)} />
            커밋을 squash로 합치기
          </label>
        </ConfirmModal>
      )}
    </div>
  )
}
