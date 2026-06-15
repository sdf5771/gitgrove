import { useState, useEffect, useCallback } from 'react'
import { PR_DATA } from '../data/mockData'
import type { PullRequest } from '../data/mockData'
import { FilePath } from './FilePath'
import { Markdown } from './Markdown'
import { parseGitHubRepo } from '../utils/github'
import { getGithubToken } from '../utils/githubToken'
import { getPulls } from '../utils/githubClient'

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
}

export function PRView({ onOpenConflict, repoPath }: Props) {
  const [filter, setFilter] = useState<'open' | 'merged' | 'all'>('open')
  const [selId, setSelId] = useState(42)
  const [dtab, setDtab] = useState<'overview' | 'files' | 'comments' | 'checks'>('overview')
  const [approved, setApproved] = useState(false)
  const [requested, setRequested] = useState(false)

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
          <div style={{ color: 'var(--c-text)', marginBottom: 6 }}>GitHub 토큰이 설정되지 않았습니다</div>
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

  const prData = realPRs ?? PR_DATA

  // ghInfo가 로드됐지만 PR이 없는 경우 (빈 배열)
  const openCount = prData.filter(p => p.status === 'open').length

  const filtered = prData.filter(p => filter === 'all' || p.status === filter || (filter === 'open' && p.status === 'open'))
  const sel = prData.find(p => p.id === selId) || prData[0]

  const statusIcon = { pass: '✓', fail: '✗', pend: '…' } as const
  const statusCls = { pass: 'pass', fail: 'fail', pend: 'pend' } as const

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
            <div key={pr.id} className={`pr-item${pr.id === selId ? ' on' : ''}`} onClick={() => { setSelId(pr.id); setDtab('overview'); setApproved(false); setRequested(false) }}>
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
          {filtered.length === 0 && <div className="pr-empty" style={{ height: 120 }}><span style={{ fontSize: 24 }}>🔍</span><span>No {filter} pull requests</span></div>}
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
                    : <div className="pr-desc" style={{ color: 'var(--c-text-faint)' }}>설명이 없습니다</div>}
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
                      <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>리뷰어가 없습니다</div>
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
                sel.threads.length === 0
                  ? <div className="pr-empty" style={{ height: 120 }}><span style={{ fontSize: 22 }}>💬</span><span>No comments yet</span></div>
                  : sel.threads.map(t => (
                    <div key={t.id} className="pr-comment">
                      <div className="pr-comment-hd">
                        <div className="pr-comment-av" style={{ background: t.ac + '22', color: t.ac, border: `1px solid ${t.ac}44` }}>{t.i}</div>
                        <span style={{ fontSize: 12, color: 'var(--c-text-strong)', fontWeight: 600 }}>{t.author}</span>
                        <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{t.time}</span>
                        {t.file && <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-info)' }}>{t.file.split('/').pop()}:{t.line}</span>}
                      </div>
                      <Markdown source={t.body} className="pr-comment-body" />
                    </div>
                  ))
              )}
              {dtab === 'checks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sel.checks.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--c-text-faint)', padding: '12px 0' }}>CI 체크 정보가 없습니다</div>
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
              <div className="pr-approve-row">
                <button className="pr-request-btn" onClick={() => { setRequested(true); setApproved(false) }}
                  style={requested ? { background: 'rgba(255,107,107,.25)' } : {}}>
                  {requested ? '✓ Changes Requested' : 'Request Changes'}
                </button>
                <button className="pr-approve-btn" onClick={() => { setApproved(true); setRequested(false) }}
                  style={approved ? { filter: 'brightness(1.1)' } : {}}>
                  {approved ? '✓ Approved' : 'Approve'}
                </button>
              </div>
            )}
          </>
        ) : <div className="pr-empty"><span style={{ fontSize: 28 }}>📋</span><span>Select a pull request</span></div>}
      </div>
    </div>
  )
}
