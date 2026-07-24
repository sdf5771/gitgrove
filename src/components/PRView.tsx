import { useState, useEffect, useCallback } from 'react'
import type { PullRequest } from '../data/mockData'
import { FilePath } from './FilePath'
import { Markdown } from './Markdown'
import { Geuru } from './Geuru'
import { parseGitHubRepo } from '../utils/github'
import { getGithubToken } from '../utils/githubToken'
import { getPulls, mergePull, createReview, createIssueComment, GithubApiError } from '../utils/githubClient'
import { ConfirmModal } from './modals/ConfirmModal'
import { TOASTS, spread } from '../toasts'
import type { NotifyFn } from '../hooks/useNotifications'

type GhAction = 'approve' | 'request' | 'merge' | 'comment'

// 쓰기 액션 실패 사유 → 사용자 안내 문구(사유 먼저). err.status + 액션 종류로 분기.
function ghActionError(err: unknown, action: GhAction): string {
  const status = err instanceof GithubApiError ? err.status : 0
  if (status === 403) return '토큰에 쓰기 권한(GitHub `repo` 스코프)이 필요해요'
  if (status === 404) return '대상을 찾지 못했어요 · 이미 닫혔거나 접근 권한이 없을 수 있어요'
  if (status === 405) {
    return action === 'merge'
      ? '지금은 머지할 수 없어요 · 충돌·브랜치 보호 규칙을 확인해주세요'
      : '지금은 처리할 수 없는 상태예요 · 대상 상태를 확인해주세요'
  }
  if (status === 409) return 'PR이 그새 바뀌었어요 · 새로고침 후 다시 시도해주세요'
  if (status === 422) return '요청을 처리하지 못했어요 · 입력 내용을 확인해주세요'
  return err instanceof Error ? err.message : String(err)
}

interface PostedComment { id: number; author: string; time: string; body: string }

interface GHPullRequest {
  number: number
  title: string
  state: 'open' | 'closed'
  merged_at: string | null
  user: { login: string }
  head: { ref: string }
  base: { ref: string }
  body: string | null
  created_at: string
  comments: number
  labels: Array<{ name: string }>
}

// 공용 클라이언트로 일원화(B8). PR 목록은 수동 새로고침(B16)에서 항상 최신이어야
// 하므로 cache:false로 bypass한다. 에러는 기존과 동일하게 throw → setPRError가 처리.
async function fetchGitHubPRs(owner: string, repo: string, token: string): Promise<GHPullRequest[]> {
  const { data } = await getPulls<GHPullRequest[]>(owner, repo, token, { cache: false })
  return data
}

interface Props {
  onOpenConflict?: () => void
  repoPath?: string | null
  notify: NotifyFn
}

export function PRView({ onOpenConflict, repoPath, notify }: Props) {
  const [filter, setFilter] = useState<'open' | 'merged' | 'all'>('open')
  // 탭 진입 시 아무것도 선택하지 않은 상태가 기본. 목록에서 클릭해야 상세가 뜬다.
  const [selId, setSelId] = useState<number | null>(null)
  const [dtab, setDtab] = useState<'overview' | 'files' | 'comments' | 'checks'>('overview')
  // 리뷰 결과 — 실제 API 성공 후에만 세팅(스텁 토글 아님). 선택 변경 시 초기화.
  const [reviewState, setReviewState] = useState<'approved' | 'changes_requested' | null>(null)
  const [busy, setBusy] = useState<null | 'approve' | 'request' | 'merge' | 'comment'>(null)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [requestBody, setRequestBody] = useState('')
  const [showMergeConfirm, setShowMergeConfirm] = useState(false)
  const [mergeMethod, setMergeMethod] = useState<'merge' | 'squash' | 'rebase'>('merge')
  // 승인은 원격을 바꾸는 액션이라 클릭 즉시 호출하지 않고 확인 다이얼로그를 먼저 띄운다.
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  // 코멘트 GET 클라이언트가 없어(백엔드 계약은 쓰기만) 방금 올린 코멘트를 낙관적으로 표시.
  const [postedComments, setPostedComments] = useState<PostedComment[]>([])

  const [realPRs, setRealPRs] = useState<PullRequest[] | null>(null)
  const [prLoading, setPRLoading] = useState(false)
  const [prError, setPRError] = useState<string | null>(null)
  const [ghInfo, setGhInfo] = useState<{ owner: string; repo: string } | null>(null)

  // 토큰: safeStorage 우선 비동기 조회 후 state 보관 (평문 localStorage 미러 제거 v1.7.0)
  const [token, setToken] = useState<string>('')
  useEffect(() => {
    let cancelled = false
    const loadToken = () => { getGithubToken().then(t => { if (!cancelled) setToken(t) }).catch(() => {}) }
    loadToken()
    window.addEventListener('gitgrove:settings-changed', loadToken)
    return () => {
      cancelled = true
      window.removeEventListener('gitgrove:settings-changed', loadToken)
    }
  }, [])

  // PR 목록 fetch — 자동(repo/token 변경) + 수동 새로고침 버튼(B16)에서 공유.
  const loadPRs = useCallback(async () => {
    if (!repoPath || !token) return
    try {
      const remotes = await window.gitAPI?.getRemotes(repoPath) ?? []
      const origin = remotes.find(r => r.name === 'origin')
      if (!origin) return
      const info = parseGitHubRepo(origin.url)
      if (!info) return
      setGhInfo(info)

      setPRLoading(true)
      try {
        const prs = await fetchGitHubPRs(info.owner, info.repo, token)
        setRealPRs(prs.map(pr => ({
          id: pr.number,
          title: pr.title,
          author: pr.user.login,
          initials: pr.user.login.slice(0, 2).toUpperCase(),
          ac: '#5fb8e6',
          from: pr.head.ref,
          to: pr.base.ref,
          status: pr.merged_at ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
          created: new Date(pr.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
          comments: pr.comments,
          additions: 0,
          deletions: 0,
          labels: pr.labels.map(l => l.name),
          body: pr.body ?? '',
          reviewers: [],
          checks: [],
          files: [],
          threads: [],
        } as PullRequest)))
        setPRError(null)
      } catch (err) {
        setPRError((err as Error).message)
      } finally {
        setPRLoading(false)
      }
    } catch {
      // getRemotes 실패는 조용히 무시(비-GitHub 레포 등)
    }
  }, [repoPath, token])

  useEffect(() => { void loadPRs() }, [loadPRs])

  // 최초 로드(아직 PR 없음)에는 전체화면 로더. 수동 새로고침(B16)은 목록을 유지한 채
  // 헤더의 ⟳ 버튼만 회전시킨다.
  if (prLoading && !realPRs) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--c-text-muted)' }}>
        <span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite', fontSize: 16 }}>⟳</span>
        GitHub PR 불러오는 중…
      </div>
    )
  }

  if (!token) {
    return (
      <div className="pr-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--c-text)', marginBottom: 6 }}>GitHub 토큰이 설정되지 않았어요</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>Settings → GitHub 탭에서 토큰을 입력해주세요</div>
        </div>
      </div>
    )
  }

  if (prError) {
    return (
      <div className="pr-empty">
        <div style={{ color: 'var(--c-danger)' }}>⚠ {prError}</div>
      </div>
    )
  }

  const prData = realPRs ?? []

  // ghInfo가 로드됐지만 PR이 없는 경우 (빈 배열)
  const openCount = prData.filter(p => p.status === 'open').length

  const filtered = prData.filter(p => filter === 'all' || p.status === filter || (filter === 'open' && p.status === 'open'))
  // selId가 null이면 미선택 — 폴백 없이 sel은 undefined로 두고 빈 상태를 렌더한다.
  const sel = selId == null ? undefined : prData.find(p => p.id === selId)

  const statusIcon = { pass: '✓', fail: '✗', pend: '…' } as const
  const statusCls = { pass: 'pass', fail: 'fail', pend: 'pend' } as const

  // ── 쓰기 액션(승인·변경요청·머지·코멘트). owner/repo는 ghInfo, number는 sel.id, token 재사용. ──
  const handleApprove = async () => {
    if (!ghInfo || !sel || busy) return
    setBusy('approve')
    try {
      await createReview(ghInfo.owner, ghInfo.repo, sel.id, token, 'APPROVE')
      setReviewState('approved')
      setShowApproveConfirm(false)
      notify(...spread(TOASTS.prApproved()))
      await loadPRs()
    } catch (err) {
      notify(...spread(TOASTS.reviewActionFailed('승인 실패', ghActionError(err, 'approve'))))
    } finally {
      setBusy(null)
    }
  }

  const handleRequestChanges = async () => {
    if (!ghInfo || !sel || busy) return
    const body = requestBody.trim()
    if (!body) return // GitHub는 REQUEST_CHANGES에 body 필수
    setBusy('request')
    try {
      await createReview(ghInfo.owner, ghInfo.repo, sel.id, token, 'REQUEST_CHANGES', body)
      setReviewState('changes_requested')
      setShowRequestForm(false)
      setRequestBody('')
      notify(...spread(TOASTS.prChangesRequested()))
      await loadPRs()
    } catch (err) {
      notify(...spread(TOASTS.reviewActionFailed('변경 요청 실패', ghActionError(err, 'request'))))
    } finally {
      setBusy(null)
    }
  }

  const handleMerge = async () => {
    if (!ghInfo || !sel || busy) return
    setBusy('merge')
    try {
      const res = await mergePull(ghInfo.owner, ghInfo.repo, sel.id, token, mergeMethod)
      if (!res.merged) throw new Error(res.message || '머지가 거부됐어요')
      setShowMergeConfirm(false)
      notify(...spread(TOASTS.merged()))
      await loadPRs()
    } catch (err) {
      notify(...spread(TOASTS.reviewActionFailed('머지 실패', ghActionError(err, 'merge'))))
    } finally {
      setBusy(null)
    }
  }

  const handleComment = async () => {
    if (!ghInfo || !sel || busy) return
    const body = commentBody.trim()
    if (!body) return
    setBusy('comment')
    try {
      const c = await createIssueComment(ghInfo.owner, ghInfo.repo, sel.id, token, body)
      setPostedComments(prev => [...prev, {
        id: c.id,
        author: c.user?.login ?? '나',
        time: new Date(c.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
        body: c.body,
      }])
      setCommentBody('')
      notify(...spread(TOASTS.prCommented()))
      await loadPRs()
    } catch (err) {
      notify(...spread(TOASTS.reviewActionFailed('코멘트 실패', ghActionError(err, 'comment'))))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="pr-wrap">
      <div className="pr-list-pane">
        {ghInfo && (
          <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--c-text-faint)', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            {ghInfo.owner}/{ghInfo.repo}
            <button
              className="pr-refresh-btn"
              onClick={() => void loadPRs()}
              disabled={prLoading}
              title="PR 목록 새로고침"
              style={{ marginLeft: 'auto' }}
            >
              <span style={prLoading ? { display: 'inline-block', animation: 'spin 600ms linear infinite' } : undefined}>⟳</span>
            </button>
          </div>
        )}
        <div className="pr-filters">
          {(['open', 'merged', 'all'] as const).map(f => (
            <button key={f} className={`pr-filter${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'open' && <span style={{ marginLeft: 4, fontFamily: 'var(--font-mono)', fontSize: 9 }}>({openCount})</span>}
            </button>
          ))}
        </div>
        <div className="pr-list-scroll">
          {filtered.map(pr => (
            <div key={pr.id} className={`pr-item${pr.id === selId ? ' on' : ''}`} onClick={() => { setSelId(pr.id); setDtab('overview'); setReviewState(null); setShowRequestForm(false); setRequestBody(''); setCommentBody(''); setPostedComments([]); setShowApproveConfirm(false); setShowMergeConfirm(false); setMergeMethod('merge') }}>
              <div className="pr-item-hd">
                <span className={`pr-status pr-${pr.status}`}>{pr.status}</span>
                <span className="pr-num">#{pr.id}</span>
                {pr.labels.map(l => <span key={l} className="pr-label">{l}</span>)}
              </div>
              <div className="pr-title">{pr.title}</div>
              <div className="pr-meta">
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: pr.ac + '22', border: `1px solid ${pr.ac}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontFamily: 'var(--font-display)', color: pr.ac, flexShrink: 0 }}>{pr.initials}</div>
                <span>{pr.author}</span><span>·</span><span>{pr.created}</span>
                {pr.comments > 0 && <><span>·</span><span>💬 {pr.comments}</span></>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="pr-empty" style={{ height: 120 }}><Geuru expr="sleepy" scale={2.4} /><span>No {filter} pull requests</span></div>}
        </div>
      </div>
      <div className="pr-detail-pane">
        {sel ? (
          <>
            <div className="pr-detail-hdr">
              <div className="pr-detail-title">{sel.title}</div>
              <div className="pr-detail-meta">
                <span className={`pr-status pr-${sel.status}`}>{sel.status}</span>
                <div className="pr-branch-arrow">
                  <span className="pr-branch-pill pr-from-pill">{sel.from}</span>
                  <span>→</span>
                  <span className="pr-branch-pill pr-to-pill">{sel.to}</span>
                </div>
                <span style={{ color: 'var(--c-text-faint)' }}>by <strong style={{ color: 'var(--c-text)' }}>{sel.author}</strong> · {sel.created}</span>
                {sel.additions > 0 && <span style={{ color: 'var(--c-success)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>+{sel.additions}</span>}
                {sel.deletions > 0 && <span style={{ color: 'var(--c-danger)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>−{sel.deletions}</span>}
              </div>
            </div>
            <div className="pr-dtabs">
              {([['overview', 'Overview'], ['files', `Files (${sel.files.length})`], ['comments', `Comments (${sel.threads.length})`], ['checks', 'Checks']] as const).map(([id, label]) => (
                <button key={id} className={`pr-dtab${dtab === id ? ' on' : ''}`} onClick={() => setDtab(id)}>{label}</button>
              ))}
            </div>
            <div className="pr-body">
              {dtab === 'overview' && (
                <>
                  <div style={{ fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--c-text-faint)', fontFamily: 'var(--font-display)' }}>Description</div>
                  {sel.body
                    ? <Markdown source={sel.body} className="pr-desc" />
                    : <div className="pr-desc" style={{ color: 'var(--c-text-faint)' }}>설명이 없어요</div>}
                  <div className="divl" />
                  <div style={{ fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--c-text-faint)', fontFamily: 'var(--font-display)' }}>Reviewers</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {sel.reviewers.map((r, i) => (
                      <div key={i} className="pr-reviewer-row">
                        <div className="pr-rv-av" style={{ background: r.ac + '22', color: r.ac, border: `1px solid ${r.ac}44` }}>{r.i}</div>
                        <span style={{ fontSize: 12, color: 'var(--c-text)', flex: 1 }}>{r.i === 'SK' ? 'Sarah Kim' : r.i === 'AC' ? 'Alex Chen' : r.i === 'ML' ? 'Mike Lee' : 'Liu Yang'}</span>
                        <span className="pr-rv-status" style={{ color: r.status === 'approved' ? 'var(--c-success)' : 'var(--c-text-faint)' }}>{r.status === 'approved' ? '✓ Approved' : '⏳ Pending'}</span>
                      </div>
                    ))}
                    {sel.reviewers.length === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>리뷰어가 없어요</div>
                    )}
                  </div>
                  {sel.status === 'open' && sel.checks.some(c => c.s === 'fail') && (
                    <div style={{ padding: '8px 12px', background: 'rgba(255,107,107,.08)', border: '1px solid rgba(255,107,107,.3)', borderRadius: 'var(--r2)', fontSize: 12, color: 'var(--c-danger)', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span>⚡</span>
                      <span>Some checks failed. <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-gold-300)', fontSize: 12, padding: 0, textDecoration: 'underline' }} onClick={onOpenConflict}>Resolve conflicts</button></span>
                    </div>
                  )}
                </>
              )}
              {dtab === 'files' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {sel.files.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--c-text-faint)', padding: '12px 0' }}>파일 목록을 불러오려면 개별 PR을 조회해야 합니다</div>
                  )}
                  {sel.files.map(f => (
                    <div key={f.p} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', background: 'var(--c-bg-elevated)', border: '1px solid var(--c-border)', borderRadius: 'var(--r2)', cursor: 'pointer', transition: 'border-color 80ms' }}>
                      <span className={`fst fst-${f.s}`}>{f.s}</span>
                      <FilePath path={f.p} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--c-success)', flexShrink: 0 }}>+{f.a}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--c-danger)', flexShrink: 0 }}>−{f.d}</span>
                    </div>
                  ))}
                </div>
              )}
              {dtab === 'comments' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sel.threads.length === 0 && postedComments.length === 0 && (
                    <div className="pr-empty" style={{ height: 120 }}><Geuru expr="sleepy" scale={2.2} /><span>No comments yet</span></div>
                  )}
                  {sel.threads.map(t => (
                    <div key={t.id} className="pr-comment">
                      <div className="pr-comment-hd">
                        <div className="pr-comment-av" style={{ background: t.ac + '22', color: t.ac, border: `1px solid ${t.ac}44` }}>{t.i}</div>
                        <span style={{ fontSize: 12, color: 'var(--c-text-strong)', fontWeight: 600 }}>{t.author}</span>
                        <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{t.time}</span>
                        {t.file && <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-info)' }}>{t.file.split('/').pop()}:{t.line}</span>}
                      </div>
                      <Markdown source={t.body} className="pr-comment-body" />
                    </div>
                  ))}
                  {postedComments.map(c => (
                    <div key={`posted-${c.id}`} className="pr-comment">
                      <div className="pr-comment-hd">
                        <div className="pr-comment-av" style={{ background: '#5fb8e622', color: '#5fb8e6', border: '1px solid #5fb8e644' }}>{c.author.slice(0, 2).toUpperCase()}</div>
                        <span style={{ fontSize: 12, color: 'var(--c-text-strong)', fontWeight: 600 }}>{c.author}</span>
                        <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{c.time}</span>
                      </div>
                      <Markdown source={c.body} className="pr-comment-body" />
                    </div>
                  ))}
                  <div className="pr-comment-form">
                    <textarea
                      className="pr-comment-input"
                      placeholder="코멘트를 남겨 보세요"
                      value={commentBody}
                      onChange={e => setCommentBody(e.target.value)}
                      rows={3}
                    />
                    <button className="pr-comment-send" disabled={!commentBody.trim() || busy === 'comment'} onClick={() => void handleComment()}>
                      {busy === 'comment' ? <span className="pr-spin">⟳</span> : '보내기'}
                    </button>
                  </div>
                </div>
              )}
              {dtab === 'checks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sel.checks.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--c-text-faint)', padding: '12px 0' }}>CI 체크 정보가 없어요</div>
                  )}
                  {sel.checks.map((c, i) => (
                    <div key={i} className="pr-check">
                      <div className={`pr-check-dot ${statusCls[c.s]}`}>{statusIcon[c.s]}</div>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--c-text)' }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: c.s === 'pass' ? 'var(--c-success)' : c.s === 'fail' ? 'var(--c-danger)' : 'var(--c-warning)', fontFamily: 'var(--font-mono)' }}>{c.s === 'pass' ? 'Passed' : c.s === 'fail' ? 'Failed' : 'Running'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {sel.status === 'open' && (
              <>
                {showRequestForm && (
                  <div className="pr-request-form">
                    <textarea
                      className="pr-comment-input"
                      placeholder="변경 요청 사유를 적어 주세요 (필수)"
                      value={requestBody}
                      onChange={e => setRequestBody(e.target.value)}
                      rows={2}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="mbtn-cancel" onClick={() => { setShowRequestForm(false); setRequestBody('') }}>취소</button>
                      <button className="pr-comment-send" disabled={!requestBody.trim() || busy === 'request'} onClick={() => void handleRequestChanges()}>
                        {busy === 'request' ? <span className="pr-spin">⟳</span> : '변경 요청 보내기'}
                      </button>
                    </div>
                  </div>
                )}
                <div className="pr-approve-row">
                  <button className="pr-request-btn" disabled={!!busy}
                    onClick={() => setShowRequestForm(v => !v)}
                    style={reviewState === 'changes_requested' ? { background: 'rgba(255,107,107,.25)' } : {}}>
                    {reviewState === 'changes_requested' ? '✓ Changes Requested' : 'Request Changes'}
                  </button>
                  <button className="pr-approve-btn" disabled={!!busy} onClick={() => setShowApproveConfirm(true)}
                    style={reviewState === 'approved' ? { filter: 'brightness(1.1)' } : {}}>
                    {busy === 'approve' ? <span className="pr-spin">⟳</span> : reviewState === 'approved' ? '✓ Approved' : 'Approve'}
                  </button>
                  <button className="pr-merge-btn" disabled={!!busy} onClick={() => setShowMergeConfirm(true)}
                    title={sel.checks.some(c => c.s === 'fail') ? '체크 실패 · 머지가 거부될 수 있어요' : undefined}>Merge</button>
                </div>
              </>
            )}
          </>
        ) : <div className="pr-empty"><Geuru expr="idle" scale={2.8} /><span>왼쪽에서 PR을 고르면 여기에 보여요</span></div>}
      </div>
      {showApproveConfirm && sel && (
        <ConfirmModal
          title="이 PR을 승인할까요?"
          message={`#${sel.id} · ${sel.title} 를 승인해요 · 원격에 리뷰가 바로 등록돼요.`}
          confirmLabel={busy === 'approve' ? '승인 중…' : '승인'}
          confirmDisabled={busy === 'approve'}
          onConfirm={() => void handleApprove()}
          onCancel={() => { if (busy !== 'approve') setShowApproveConfirm(false) }}
        />
      )}
      {showMergeConfirm && sel && (
        <ConfirmModal
          title={`PR #${sel.id} 머지`}
          message="이 PR을 대상 브랜치에 머지해요 · 원격에 바로 반영되는 작업이에요."
          confirmLabel={busy === 'merge' ? '머지 중…' : '머지'}
          danger
          confirmDisabled={busy === 'merge'}
          onConfirm={() => void handleMerge()}
          onCancel={() => { if (busy !== 'merge') setShowMergeConfirm(false) }}
        >
          <div className="pr-merge-methods">
            {(['merge', 'squash', 'rebase'] as const).map(m => (
              <label key={m} className={`pr-merge-method${mergeMethod === m ? ' on' : ''}`}>
                <input type="radio" name="pr-merge-method" checked={mergeMethod === m} onChange={() => setMergeMethod(m)} />
                {m === 'merge' ? '머지 커밋' : m === 'squash' ? 'Squash' : 'Rebase'}
              </label>
            ))}
          </div>
        </ConfirmModal>
      )}
    </div>
  )
}
