// CL2 — 클론 인터랙션 모달(3상태: 폼 → 진행 HUD → 결과 나무 sprout / 에러 토큰칸).
//
// 디자인 정본("GitGrove Clone 인터랙션")의 인터랙션/문구/색을 따른다.
// CL1 백엔드 계약(window.gitAPI.clone → GitCloneResult, op:'clone' 진행률 스트리밍)을 소비한다.
//   - 진행: onRemoteProgress(op==='clone') 구독 → syncProgress 의 phase 로직 재사용(checkout="파일 펼치는 중").
//   - 성공: 흙에서 Tree sprout + "그로브에 심었어요" → onCloned(path) 로 그로브 갱신/적재.
//   - 실패: auth(인라인 PAT 토큰칸) / notfound(URL 수정) / error.
// 색 규칙: 골드=CTA/진행, 녹색=완료/나무, 빨강=실패. GitLab 주황은 프로바이더 마크에만.
import { useEffect, useRef, useState } from 'react'
import { ModalShell } from './ModalShell'
import { Geuru } from '../Geuru'
import { Tree } from '../Tree'
import {
  type ProgressModel,
  initialModel,
  applyProgress,
  overallPercent,
  isDeterminate,
  currentLabel,
  countMeta,
  rateText,
  phasesFor,
  computePhaseStatuses,
  type PhaseStatus,
} from '../../utils/syncProgress'
import {
  detectCloneTarget,
  isCloneUrlValid,
  targetLabel,
  deriveRepoName,
  mapCloneResult,
  cloneThrowToView,
  type CloneResultView,
} from '../../utils/cloneLogic'

interface Props {
  onClose: () => void
  // 성공 시 클론된 경로를 알린다(그로브 갱신 + recents 적재 + 활성화는 호출부가 책임).
  onCloned: (path: string) => void
  // 부모 폴더 선택(없으면 window.gitAPI.pickDirectory). 테스트 주입용.
  pickDirectory?: (title?: string) => Promise<string | null>
  // 폼 초기 URL(브라우저에서 특정 레포 Clone 진입 시 프리필).
  initialUrl?: string
  // 진입 시 자동으로 부모 폴더를 물어보지 않고 폼만 노출(기본). true면 URL 프리필 + 폴더 즉시 선택 스킵.
}

type Phase = 'form' | 'progress' | 'result'

// 프로바이더 마크(식별 전용). GitLab 주황은 여기에서만 허용.
const GhMark = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="#8b96b4" aria-label="GitHub">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.69-.01-1.36-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.7-.01 1.93 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
  </svg>
)
const GlMark = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-label="GitLab">
    <path d="M12 21.5l3.2-9.8H8.8L12 21.5z" fill="#fc6d26"/>
    <path d="M12 21.5L8.8 11.7H4.2L12 21.5z" fill="#e24329"/>
    <path d="M4.2 11.7L3 15.4a.8.8 0 0 0 .3.9L12 21.5 4.2 11.7z" fill="#fca326"/>
    <path d="M4.2 11.7H8.8L6.9 5.6c-.1-.3-.5-.3-.6 0L4.2 11.7z" fill="#e24329"/>
    <path d="M12 21.5l3.2-9.8h4.6L12 21.5z" fill="#e24329"/>
    <path d="M19.8 11.7L21 15.4a.8.8 0 0 1-.3.9L12 21.5l7.8-9.8z" fill="#fca326"/>
    <path d="M19.8 11.7H15.2l1.9-6.1c.1-.3.5-.3.6 0l2.1 6.1z" fill="#e24329"/>
  </svg>
)
const IconLock = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3.5" y="7" width="9" height="6" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>
)
const IconFolder = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4.5A1 1 0 0 1 3 3.5h3l1.2 1.4H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/></svg>
)

const PhaseIcon = ({ status }: { status: PhaseStatus }) => {
  if (status === 'active') return <span className="pspin" />
  if (status === 'done') return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 8.5l3.2 3.2L13 5" /></svg>
  if (status === 'err') return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M8 1.5l6.5 11.5h-13z" /><path d="M8 6.5v3M8 11.3v.2" /></svg>
  return <span className="pdot" />
}

export function CloneModal({ onClose, onCloned, pickDirectory, initialUrl }: Props) {
  const [phase, setPhase] = useState<Phase>('form')
  const [url, setUrl] = useState(initialUrl ?? '')
  const [dest, setDest] = useState('')
  const [shallow, setShallow] = useState(false)
  const [recurseSubmodules, setRecurseSubmodules] = useState(false)
  const [token, setToken] = useState('')
  const [model, setModel] = useState<ProgressModel>(() => initialModel('clone'))
  const [result, setResult] = useState<CloneResultView | null>(null)
  // 결과 나무 sprout 트리거(마운트 후 한 틱 뒤 grow).
  const [sprout, setSprout] = useState(false)
  const urlRef = useRef<HTMLInputElement>(null)

  const target = detectCloneTarget(url)
  const repoName = target.repo || deriveRepoName(url)
  const urlValid = isCloneUrlValid(url)

  useEffect(() => { urlRef.current?.focus() }, [])

  // 진행 중 onRemoteProgress(op==='clone') 구독 — 등록/해제(누수 방지).
  useEffect(() => {
    if (phase !== 'progress') return
    const off = window.gitAPI?.onRemoteProgress?.(p => {
      if (p.op !== 'clone') return
      setModel(prev => applyProgress(prev, p))
    })
    return () => { off?.() }
  }, [phase])

  // 결과 성공 진입 시 나무 sprout 애니메이션 트리거.
  useEffect(() => {
    if (phase === 'result' && result?.kind === 'success') {
      const id = window.setTimeout(() => setSprout(true), 60)
      return () => window.clearTimeout(id)
    }
  }, [phase, result])

  const pick = pickDirectory ?? ((t?: string) => window.gitAPI!.pickDirectory(t))

  const handleBrowse = async () => {
    const picked = await pick('Clone 받을 부모 폴더 선택')
    if (picked) setDest(picked)
  }

  // 실제 클론 실행. dest 없으면 폴더 선택 먼저. 성공/실패를 result 뷰로 매핑.
  const runClone = async () => {
    if (!urlValid) return
    let parent = dest.trim()
    if (!parent) {
      const picked = await pick('Clone 받을 부모 폴더 선택')
      if (!picked) return // 사용자가 폴더 선택 취소 → 폼 유지
      parent = picked
      setDest(picked)
    }
    setModel(initialModel('clone'))
    setResult(null)
    setSprout(false)
    setPhase('progress')
    try {
      const res = await window.gitAPI!.clone(url.trim(), parent, { shallow, recurseSubmodules })
      setResult(mapCloneResult(res, repoName))
      setPhase('result')
    } catch (err) {
      // 클론 전 입력검증 실패(이름 추출 불가 / 폴더 이미 존재)는 throw → error 뷰.
      setResult(cloneThrowToView(err))
      setPhase('result')
    }
  }

  // auth 실패 후 토큰을 URL에 끼워 재시도(https://<token>@host/...). ssh/미인식은 그대로.
  const retryWithToken = () => {
    const t = token.trim()
    if (t) {
      const m = url.trim().match(/^(https?:\/\/)(?:[^@/]+@)?(.+)$/)
      if (m) setUrl(`${m[1]}${encodeURIComponent(t)}@${m[2]}`)
    }
    setPhase('form')
    setResult(null)
  }

  const backToForm = () => { setPhase('form'); setResult(null) }

  const icon = (
    <span className="rm-modal-ic">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9"/><path d="M10 2h4v4M14 2l-6 6"/></svg>
    </span>
  )

  const closeable = phase !== 'progress'

  return (
    <ModalShell title="원격 저장소 클론" width={460} icon={icon} onClose={closeable ? onClose : () => {}}>
      {phase === 'form' && (
        <FormBody
          url={url} setUrl={setUrl} urlRef={urlRef} urlValid={urlValid}
          provider={target.provider} ownerRepo={targetLabel(target)} host={target.host}
          dest={dest} setDest={setDest} onBrowse={handleBrowse}
          shallow={shallow} setShallow={setShallow}
          recurse={recurseSubmodules} setRecurse={setRecurseSubmodules}
          onClose={onClose} onClone={() => void runClone()}
        />
      )}

      {phase === 'progress' && (
        <ProgressBody model={model} provider={target.provider} ownerRepo={targetLabel(target)} dest={dest} />
      )}

      {phase === 'result' && result && (
        <ResultBody
          view={result} sprout={sprout} token={token} setToken={setToken}
          onPlanted={() => { if (result.path) onCloned(result.path); onClose() }}
          onRetryToken={retryWithToken} onBack={backToForm} onClose={onClose}
        />
      )}
    </ModalShell>
  )
}

// ── 1) 폼 ──
function FormBody(props: {
  url: string; setUrl: (v: string) => void; urlRef: React.RefObject<HTMLInputElement>; urlValid: boolean
  provider: 'gh' | 'gl' | null; ownerRepo: string; host: string
  dest: string; setDest: (v: string) => void; onBrowse: () => void
  shallow: boolean; setShallow: (v: boolean) => void
  recurse: boolean; setRecurse: (v: boolean) => void
  onClose: () => void; onClone: () => void
}) {
  const { url, setUrl, urlRef, urlValid, provider, ownerRepo, host, dest, setDest, onBrowse, shallow, setShallow, recurse, setRecurse, onClose, onClone } = props
  return (
    <div className="rm-modal-body clone-form">
      <label className="rm-modal-label">저장소 URL</label>
      <input
        ref={urlRef}
        className="rm-modal-input"
        placeholder="https://github.com/owner/repo.git"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && urlValid) onClone() }}
      />
      {ownerRepo && (
        <div className="clone-detect">
          <span className="clone-prov">
            {provider === 'gl' ? <GlMark /> : provider === 'gh' ? <GhMark /> : <span className="clone-prov-dot" />}
          </span>
          <span className="clone-detect-name">{ownerRepo}</span>
          {host && <span className="clone-detect-host">{host}</span>}
        </div>
      )}

      <label className="rm-modal-label" style={{ marginTop: 12 }}>받을 위치 (부모 폴더)</label>
      <div className="repo-browse-row">
        <input className="rm-modal-input" style={{ flex: 1 }} placeholder="Browse… 로 폴더 선택" value={dest} onChange={e => setDest(e.target.value)} />
        <button className="repo-browse-btn" onClick={onBrowse}><IconFolder /> Browse…</button>
      </div>

      <div className="clone-opts">
        <label className="clone-opt">
          <input type="checkbox" checked={recurse} onChange={e => setRecurse(e.target.checked)} />
          <span>서브모듈 포함 <em>--recurse-submodules</em></span>
        </label>
        <label className="clone-opt">
          <input type="checkbox" checked={shallow} onChange={e => setShallow(e.target.checked)} />
          <span>얕은 복제 <em>--depth 1</em> · 큰 저장소에 빠름</span>
        </label>
      </div>

      <div className="rm-modal-actions">
        <button className="rm-modal-btn" onClick={onClose}>취소</button>
        <button className="rm-modal-btn rm-primary" disabled={!urlValid} onClick={onClone}>Clone</button>
      </div>
    </div>
  )
}

// ── 2) 진행 HUD (SyncHud 본문 패턴 재사용: 같은 .hud-* 클래스/유틸) ──
function ProgressBody({ model, provider, ownerRepo, dest }: {
  model: ProgressModel; provider: 'gh' | 'gl' | null; ownerRepo: string; dest: string
}) {
  const phases = phasesFor('clone')
  const statuses = computePhaseStatuses('clone', model.maxPhase)
  const pct = overallPercent(model)
  const det = isDeterminate(model)
  const meta = countMeta(model)
  const rate = rateText(model)
  const label = currentLabel(model)

  let fillClass = 'hud-bar-fill'
  if (det) fillClass += ' striped'
  else fillClass += ' indet'

  return (
    <div className="hud hud-embed" role="dialog" aria-label="Clone 진행 상황" aria-live="polite">
      <div className="hud-head">
        <span className="hud-geuru bob"><Geuru expr="think" scale={1.5} title="그루 — Clone" /></span>
        <div className="hud-titles">
          <div className="hud-op clone-prov-title">
            {provider === 'gl' ? <GlMark /> : provider === 'gh' ? <GhMark /> : null}
            <span>{ownerRepo || '저장소'}</span>
          </div>
          <div className="hud-sub">{dest ? `${dest} 에 받는 중` : '받는 중'}</div>
        </div>
        <div className="hud-pct">{pct}%</div>
      </div>

      <div className="hud-bar-wrap">
        <div className="hud-bar"><div className={fillClass} style={det ? { width: `${pct}%` } : undefined} /></div>
        <div className="hud-rate">
          <span>{label ? `${label}…` : '시작하는 중…'}</span>
          <span>{rate}</span>
        </div>
      </div>

      <div className="hud-phases">
        {phases.map((p, i) => (
          <div key={i} className={`hud-phase ${statuses[i]}`}>
            <span className="pico"><PhaseIcon status={statuses[i]} /></span>
            <span className="ptxt">{p.label}</span>
            <span className="pmeta">{statuses[i] === 'active' ? meta : ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 3) 결과 (성공=나무 sprout / 실패=auth 토큰칸·notfound·error) ──
function ResultBody({ view, sprout, token, setToken, onPlanted, onRetryToken, onBack, onClose }: {
  view: CloneResultView; sprout: boolean
  token: string; setToken: (v: string) => void
  onPlanted: () => void; onRetryToken: () => void; onBack: () => void; onClose: () => void
}) {
  const success = view.kind === 'success'
  return (
    <div className={`clone-result ${view.kind}`}>
      {success ? (
        <div className="clone-sprout">
          <div className={`clone-soil${sprout ? ' grown' : ''}`}>
            <div className="clone-tree-wrap"><Tree stage={sprout ? 1 : 0} scale={3.4} title="새로 심은 나무" /></div>
          </div>
        </div>
      ) : (
        <div className="clone-fail-geuru"><Geuru expr={view.geuru} scale={2} title="그루" /></div>
      )}

      <div className={`clone-result-title${success ? ' ok' : ' err'}`}>{view.title}</div>
      <div className="clone-result-detail">{view.detail}</div>

      {success && view.stats.length > 0 && (
        <div className="clone-stats">
          {view.stats.map(s => (
            <div key={s.label} className="clone-stat"><span>{s.label}</span><b>{s.value}</b></div>
          ))}
        </div>
      )}

      {view.needsToken && (
        <div className="clone-token">
          <label className="clone-token-label"><IconLock /> 개인 액세스 토큰 (PAT)</label>
          <input
            className="rm-modal-input"
            type="password"
            placeholder="ghp_… 또는 glpat-…"
            value={token}
            onChange={e => setToken(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && token.trim()) onRetryToken() }}
          />
        </div>
      )}

      <div className="rm-modal-actions">
        {success ? (
          <>
            <button className="rm-modal-btn" onClick={onClose}>닫기</button>
            <button className="rm-modal-btn rm-grove" onClick={onPlanted}>그로브로 →</button>
          </>
        ) : view.kind === 'auth' ? (
          <>
            <button className="rm-modal-btn" onClick={onBack}>URL 수정</button>
            <button className="rm-modal-btn rm-primary" disabled={!token.trim()} onClick={onRetryToken}>토큰으로 다시 시도</button>
          </>
        ) : view.kind === 'notfound' ? (
          <>
            <button className="rm-modal-btn" onClick={onClose}>닫기</button>
            <button className="rm-modal-btn rm-primary" onClick={onBack}>URL 수정</button>
          </>
        ) : (
          <>
            <button className="rm-modal-btn" onClick={onClose}>닫기</button>
            <button className="rm-modal-btn rm-primary" onClick={onBack}>다시 시도</button>
          </>
        )}
      </div>
    </div>
  )
}
