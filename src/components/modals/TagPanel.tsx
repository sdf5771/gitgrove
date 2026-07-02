import { useState, useEffect, useCallback, useRef } from 'react'
import { Geuru } from '../Geuru'
import type { Commit } from '../../data/mockData'

interface Props {
  onClose: () => void
  repoPath?: string | null
  // 새 태그의 기본 대상 커밋(보통 HEAD). 없으면 대상 카드 자리표시.
  commits?: Commit[]
  // 태그 생성·삭제로 그래프의 태그 라벨이 바뀌면 App이 저장소를 다시 읽게 한다.
  onChanged?: () => void
}

type ToastVariant = 'success' | 'warning'
interface ToastState { text: string; variant: ToastVariant }

// repoPath 없을 때(테스트/목업)용 폴백.
const MOCK_TAGS: GitTagEntry[] = [
  { name: 'v1.8.0', annotated: true, commit: 'a1f3c9d', date: '2026-06-28', tagger: 'seobisback', message: '그루 상태 매핑 + 인증 관리자 릴리스', subject: 'StatusBar 그루 동기화 상태 매핑', pushed: true },
  { name: 'v1.7.0', annotated: true, commit: 'b91f06c', date: '2026-06-20', tagger: 'seobisback', message: '토스트 카탈로그 · 온보딩', subject: 'toasts.ts 카탈로그 도입', pushed: true },
  { name: 'v1.6.2', annotated: false, commit: '5d8e1c0', date: '2026-06-14', subject: 'MR 뷰 파이프라인 배지', pushed: true },
  { name: 'nightly-0612', annotated: false, commit: '09ab7f2', date: '2026-06-12', subject: '임시 빌드', pushed: false },
]

const errText = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback

// 픽셀 열매 — 주석 태그=골드 사과, 경량 태그=초록 열매.
function TagFruit({ annotated, scale = 1.5 }: { annotated: boolean; scale?: number }) {
  const rows = annotated
    ? ['......GG........', '.....GHHG.......', '....l..l........', '...GGGGGGGG.....', '..GGHHGGGGGG....', '..GGGGGGGGGG....', '..GGGGGGGGGG....', '..GGGGGGGGGG....', '...GGGGGGGG.....', '....GGGGGG......']
    : ['......l.........', '.....ll.........', '....LLLL........', '...LLLLLL.......', '...LLHLLL.......', '...LLLLLL.......', '....LLLL........']
  const pal: Record<string, string | null> = {
    '.': null,
    G: annotated ? '#e6a536' : '#6fcf7c',
    H: annotated ? '#ffd770' : '#8fe09a',
    L: '#6fcf7c',
    l: '#3f9550',
  }
  const rects: React.ReactNode[] = []
  rows.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      const c = pal[row[x]]
      if (c) rects.push(<rect key={`${x},${y}`} x={x} y={y} width={1.04} height={1.04} fill={c} />)
    }
  })
  return (
    <svg className="sprite" width={16 * scale} height={rows.length * scale} viewBox={`0 0 16 ${rows.length}`} shapeRendering="crispEdges" aria-hidden>
      {rects}
    </svg>
  )
}

const svg = (d: React.ReactNode) => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">{d}</svg>
const I = {
  copy: svg(<><rect x="5" y="5" width="9" height="9" rx="1.5" /><path d="M11 5V3.5a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" /></>),
  push: svg(<path d="M8 14V6M5 9l3-3 3 3M3 3h10" />),
  trash: svg(<path d="M3 5h10M6 5V3.5h4V5M5 5l.6 8.5h4.8L11 5" />),
  check: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8.5l3 3 7-8" /></svg>,
}

export function TagPanel({ onClose, repoPath, commits, onChanged }: Props) {
  const [tags, setTags] = useState<GitTagEntry[]>(() => (repoPath ? [] : MOCK_TAGS))
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState(0)
  const [mode, setMode] = useState<'detail' | 'create'>('detail')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [delConfirm, setDelConfirm] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // create form
  const [createName, setCreateName] = useState('')
  const [createKind, setCreateKind] = useState<'anno' | 'light'>('anno')
  const [createMsg, setCreateMsg] = useState('')
  const [pushOn, setPushOn] = useState(true)

  const headCommit = commits && commits.length > 0 ? commits[0] : null

  const showToast = useCallback((text: string, variant: ToastVariant = 'success') => {
    setToast({ text, variant })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }, [])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const reload = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    try {
      const list = await window.gitAPI.listTags(repoPath)
      setTags(list)
    } catch {
      setTags([])
    } finally {
      setLoading(false)
    }
  }, [repoPath])
  useEffect(() => { reload() }, [reload])

  // 목록이 바뀌면 선택 보정(범위 밖이면 0으로).
  useEffect(() => { setSel(prev => (prev < tags.length ? prev : 0)); setDelConfirm(false) }, [tags])

  const filtered = search.trim()
    ? tags.filter(t => t.name.toLowerCase().includes(search.trim().toLowerCase()))
    : tags
  const releases = filtered.filter(t => !t.name.toLowerCase().startsWith('nightly'))
  const others = filtered.filter(t => t.name.toLowerCase().startsWith('nightly'))
  const selTag = tags[sel] ?? null

  const selectTag = (t: GitTagEntry) => { setSel(tags.indexOf(t)); setMode('detail'); setDelConfirm(false) }

  const copyHash = (hash: string) => {
    navigator.clipboard?.writeText(hash).catch(() => {})
    showToast('해시를 복사했어요')
  }

  const pushTag = async (name: string) => {
    if (busy) return
    setBusy(true)
    try {
      if (repoPath) { await window.gitAPI.pushTag(repoPath, name); await reload() }
      else { setTags(prev => prev.map(t => (t.name === name ? { ...t, pushed: true } : t))) }
      showToast(`${name}을(를) origin에 푸시했어요`)
    } catch (e) {
      showToast(errText(e, '푸시하지 못했어요'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  const checkoutTag = async (name: string) => {
    if (busy) return
    setBusy(true)
    try {
      if (repoPath) await window.gitAPI.checkout(repoPath, name)
      showToast(`${name}을(를) 체크아웃했어요`)
      onChanged?.()
    } catch (e) {
      showToast(errText(e, '체크아웃하지 못했어요'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  const deleteTag = async (t: GitTagEntry) => {
    if (busy) return
    setBusy(true)
    try {
      if (repoPath) { await window.gitAPI.deleteTag(repoPath, t.name, t.pushed === true); await reload() }
      else { setTags(prev => prev.filter(x => x.name !== t.name)) }
      setDelConfirm(false)
      showToast(t.pushed ? `${t.name}을(를) 로컬·origin에서 삭제했어요` : `${t.name}을(를) 삭제했어요`)
      onChanged?.()
    } catch (e) {
      showToast(errText(e, '삭제하지 못했어요'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (busy) return
    const name = createName.trim()
    if (!name) { showToast('태그 이름을 적어 주세요', 'warning'); return }
    const target = headCommit?.id
    if (!target) { showToast('가리킬 커밋이 없어요', 'warning'); return }
    const annotated = createKind === 'anno'
    setBusy(true)
    try {
      if (repoPath) {
        await window.gitAPI.createTag(repoPath, name, target, { annotated, message: annotated ? createMsg : undefined, push: pushOn })
        await reload()
        setSel(0)
      } else {
        setTags(prev => [{ name, annotated, commit: target.slice(0, 7), date: new Date().toISOString().slice(0, 10), tagger: annotated ? 'me' : undefined, message: annotated ? createMsg : undefined, subject: headCommit?.msg, pushed: pushOn }, ...prev])
      }
      setMode('detail')
      setCreateName(''); setCreateMsg('')
      showToast(pushOn ? `${name} 태그를 만들고 푸시했어요` : `${name} 태그를 만들었어요`)
      onChanged?.()
    } catch (e) {
      showToast(errText(e, '태그를 만들지 못했어요'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  const kindBadge = (annotated: boolean) => (
    <span className={`tg-kind ${annotated ? 'k-anno' : 'k-light'}`}>{annotated ? '주석' : '경량'}</span>
  )

  const row = (t: GitTagEntry) => (
    <div key={t.name} className={`tg-item${tags.indexOf(t) === sel && mode === 'detail' ? ' on' : ''}`} onClick={() => selectTag(t)}>
      <span className="tg-fruit"><TagFruit annotated={t.annotated} scale={1.5} /></span>
      <div className="tg-item-info">
        <div className="tg-item-name">{t.name}{kindBadge(t.annotated)}</div>
        <div className="tg-item-sub">{t.commit} · {t.date}</div>
      </div>
      <span className={`tg-push ${t.pushed ? 'yes' : t.pushed === false ? 'no' : 'unknown'}`} title={t.pushed ? '푸시됨' : t.pushed === false ? '로컬만' : '원격 확인 불가'}>
        {t.pushed ? '●' : t.pushed === false ? '○' : '·'}
      </span>
    </div>
  )

  return (
    <div className="tg-scrim" onClick={onClose}>
      <div className="tg-dlg" onClick={e => e.stopPropagation()}>
        <div className="tg-hdr">
          <span className="tg-ico"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 6.5l5.2-4a1.3 1.3 0 0 1 1.6 0L14 6.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5z" /><circle cx="8" cy="7.5" r="1.6" /></svg></span>
          <h3>태그</h3>
          <span className="tg-count">{tags.length}</span>
          <button className="tg-x" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="tg-body">
          <div className="tg-list">
            <div className="tg-list-top">
              <div className="tg-search">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6.5" cy="6.5" r="4" /><path d="M10.5 10.5l3 3" /></svg>
                <input placeholder="태그 검색…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="tg-scroll">
              {loading && !tags.length && <div className="tg-list-load"><span className="tg-spin">⟳</span></div>}
              {!loading && !tags.length && <div className="tg-list-empty">아직 태그가 없어요</div>}
              {releases.length > 0 && <div className="tg-sec">릴리스</div>}
              {releases.map(row)}
              {others.length > 0 && <div className="tg-sec">기타</div>}
              {others.map(row)}
            </div>
          </div>

          <div className="tg-main">
            <div className="tg-tabs">
              <button className={`tg-tab${mode === 'detail' ? ' on' : ''}`} onClick={() => setMode('detail')}>상세</button>
              <button className={`tg-tab${mode === 'create' ? ' on' : ''}`} onClick={() => setMode('create')}>＋ 새 태그</button>
            </div>

            {mode === 'detail' ? (
              <div className="tg-pane">
                {selTag ? (
                  <>
                    <div className="tg-detail-head">
                      <span className="tg-detail-fruit"><TagFruit annotated={selTag.annotated} scale={3} /></span>
                      <div className="tg-detail-titles">
                        <div className="tg-detail-nm">{selTag.name}{kindBadge(selTag.annotated)}</div>
                        <div className="tg-detail-sub">{selTag.pushed ? 'origin에 푸시됨' : selTag.pushed === false ? '로컬에만 있음' : '원격 상태 확인 불가'}</div>
                      </div>
                    </div>
                    <div className="tg-meta">
                      {selTag.annotated && selTag.tagger && (
                        <div className="tg-mrow"><span className="l">Tagger</span><span className="v"><span className="tg-av">{selTag.tagger.charAt(0).toUpperCase()}</span>{selTag.tagger}</span></div>
                      )}
                      <div className="tg-mrow"><span className="l">날짜</span><span className="v">{selTag.date}</span></div>
                      <div className="tg-mrow"><span className="l">가리킴</span><span className="v">{selTag.commit}</span></div>
                    </div>
                    {selTag.annotated && selTag.message && (
                      <div className="tg-annobox"><div className="tg-anno-ttl">태그 메시지</div>{selTag.message}</div>
                    )}
                    {selTag.subject && (
                      <div className="tg-commit-card"><span className="dot" /><span className="msg">{selTag.subject}</span><span className="hash">{selTag.commit}</span></div>
                    )}
                    <div className="tg-acts">
                      <button className="tg-ab ghost" onClick={() => copyHash(selTag.commit)}>{I.copy} 해시 복사</button>
                      {selTag.pushed !== true && <button className="tg-ab gold" onClick={() => pushTag(selTag.name)} disabled={busy}>{I.push} origin에 푸시</button>}
                      <button className="tg-ab ghost" onClick={() => checkoutTag(selTag.name)} disabled={busy}>이 태그로 체크아웃</button>
                      {delConfirm ? (
                        <span className="tg-delconfirm">
                          {selTag.pushed ? '로컬·origin에서 삭제할까요?' : '삭제할까요?'}
                          <button className="tg-ab danger" onClick={() => deleteTag(selTag)} disabled={busy}>삭제</button>
                          <button className="tg-ab ghost" onClick={() => setDelConfirm(false)}>취소</button>
                        </span>
                      ) : (
                        <button className="tg-ab danger" onClick={() => setDelConfirm(true)}>{I.trash} 삭제</button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="tg-detail-none"><Geuru expr="sleepy" scale={3} /><span>왼쪽에서 태그를 골라 보세요</span></div>
                )}
              </div>
            ) : (
              <div className="tg-pane">
                <div className="tg-field">
                  <span className="tg-flabel">태그 이름<span className="hint">보통 v1.9.0 형식</span></span>
                  <input className="tg-inp" placeholder="v1.9.0" value={createName} onChange={e => setCreateName(e.target.value)} />
                </div>
                <div className="tg-field">
                  <span className="tg-flabel">종류</span>
                  <div className="tg-kind-seg">
                    <div className={`tg-kind-opt${createKind === 'anno' ? ' on' : ''}`} onClick={() => setCreateKind('anno')}>
                      <span className="tg-kind-radio" /><div className="tg-kind-txt"><b>주석 태그</b><span>작성자·날짜·메시지 포함 · 릴리스에 권장</span></div>
                    </div>
                    <div className={`tg-kind-opt${createKind === 'light' ? ' on' : ''}`} onClick={() => setCreateKind('light')}>
                      <span className="tg-kind-radio" /><div className="tg-kind-txt"><b>경량 태그</b><span>커밋을 가리키는 이름표만 · 임시용</span></div>
                    </div>
                  </div>
                </div>
                <div className="tg-field">
                  <span className="tg-flabel">태그 메시지</span>
                  <textarea className="tg-inp area" disabled={createKind !== 'anno'} placeholder={createKind === 'anno' ? '이 릴리스의 요약을 적어요…' : '경량 태그는 메시지가 없어요'} value={createKind === 'anno' ? createMsg : ''} onChange={e => setCreateMsg(e.target.value)} />
                </div>
                <div className="tg-field">
                  <span className="tg-flabel">대상 커밋<span className="hint">현재 HEAD</span></span>
                  <div className="tg-target">
                    <span className="dot" />
                    <span className="msg">{headCommit?.msg ?? '가리킬 커밋이 없어요'}</span>
                    {headCommit && <span className="hash">{headCommit.id.slice(0, 7)}</span>}
                  </div>
                </div>
                <div className="tg-push-toggle">
                  <div className="txt"><b>만들고 바로 origin에 푸시</b><span>끄면 로컬에만 태그를 남겨요</span></div>
                  <button className={`tg-sw ${pushOn ? 'on' : 'off'}`} onClick={() => setPushOn(v => !v)} aria-label="푸시 토글" aria-pressed={pushOn} />
                </div>
              </div>
            )}

            <div className="tg-footer">
              {mode === 'detail' ? (
                <span className="tg-hint"><Geuru expr="idle" scale={1.2} />태그는 나무에 맺힌 열매 같아요 · 이정표가 되는 커밋을 표시해요</span>
              ) : (
                <>
                  <span className="tg-hint"><Geuru expr="happy" scale={1.2} />열매를 하나 맺어 볼까요?</span>
                  <button className="tg-mbtn ghost" onClick={() => setMode('detail')}>취소</button>
                  <button className="tg-mbtn gold" onClick={create} disabled={busy}>{I.check} 태그 만들기</button>
                </>
              )}
            </div>
          </div>
        </div>

        {toast && <div className={`tg-toast ${toast.variant}`}>{toast.text}</div>}
      </div>
    </div>
  )
}
