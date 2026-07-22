import { useState, useEffect, useCallback, useRef } from 'react'
import { Geuru } from '../Geuru'
import { ConfirmModal } from './ConfirmModal'

interface Props {
  onClose: () => void
  repoPath?: string | null
  // 현재 브랜치가 추적 중인 upstream 원격 이름(예 'origin'). 이 원격을 삭제하면
  // Pull/Push 대상이 사라지므로 확인 문구에 경고를 덧붙인다. 판별 불가 시 null.
  currentUpstreamRemote?: string | null
}

type ToastVariant = 'success' | 'warning'
interface ToastState { text: string; variant: ToastVariant }

// repoPath 없을 때(테스트/목업)용 폴백.
const MOCK_REMOTES: GitRemoteInfo[] = [
  { name: 'origin', url: 'git@github.com:test/gitgrove.git' },
  { name: 'upstream', url: 'https://github.com/sdf5771/gitgrove.git' },
]

const errText = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback

const svg = (d: React.ReactNode) => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">{d}</svg>
const I = {
  copy: svg(<><rect x="5" y="5" width="9" height="9" rx="1.5" /><path d="M11 5V3.5a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" /></>),
  trash: svg(<path d="M3 5h10M6 5V3.5h4V5M5 5l.6 8.5h4.8L11 5" />),
  check: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8.5l3 3 7-8" /></svg>,
}

// git@host:owner/repo.git 또는 https://host/owner/repo.git → host 표시(SSH/HTTPS 배지).
function remoteKind(url: string): 'ssh' | 'https' | 'other' {
  if (/^https?:\/\//i.test(url)) return 'https'
  if (/^(git@|ssh:\/\/)/i.test(url) || /^[\w.-]+@[\w.-]+:/.test(url)) return 'ssh'
  return 'other'
}

export function RemoteManagerModal({ onClose, repoPath, currentUpstreamRemote }: Props) {
  const [remotes, setRemotes] = useState<GitRemoteInfo[]>(() => (repoPath ? [] : MOCK_REMOTES))
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState(0)
  const [mode, setMode] = useState<'detail' | 'add'>('detail')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [delTarget, setDelTarget] = useState<GitRemoteInfo | null>(null)

  // detail 편집(이름·URL)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  // add 폼
  const [addName, setAddName] = useState('')
  const [addUrl, setAddUrl] = useState('')

  const showToast = useCallback((text: string, variant: ToastVariant = 'success') => {
    setToast({ text, variant })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // 삭제 확인창이 열려 있으면 Escape는 확인창만 취소한다. 상위 App의 Escape 체인(모달 전체 닫기)보다
  // 먼저 처리하려 capture 단계에서 잡고 전파를 멈춘다(중첩 모달 우선순위).
  useEffect(() => {
    if (!delTarget) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setDelTarget(null) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [delTarget])

  const reload = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    try {
      const list = await window.gitAPI.getRemotes(repoPath)
      setRemotes(list)
    } catch {
      setRemotes([])
    } finally {
      setLoading(false)
    }
  }, [repoPath])
  useEffect(() => { reload() }, [reload])

  // 목록이 바뀌면 선택 보정(범위 밖이면 0으로).
  useEffect(() => { setSel(prev => (prev < remotes.length ? prev : 0)) }, [remotes])

  const selRemote = remotes[sel] ?? null

  // 선택이 바뀌면 편집 입력을 선택값으로 채운다.
  useEffect(() => {
    setEditName(selRemote?.name ?? '')
    setEditUrl(selRemote?.url ?? '')
  }, [selRemote?.name, selRemote?.url])

  const selectRemote = (r: GitRemoteInfo) => { setSel(remotes.indexOf(r)); setMode('detail') }

  const copyUrl = (url: string) => {
    navigator.clipboard?.writeText(url).catch(() => {})
    showToast('URL을 복사했어요')
  }

  const addRemote = async () => {
    if (busy) return
    const name = addName.trim()
    const url = addUrl.trim()
    if (!name) { showToast('원격 이름을 적어 주세요', 'warning'); return }
    if (!url) { showToast('원격 URL을 적어 주세요', 'warning'); return }
    setBusy(true)
    try {
      if (repoPath) { await window.gitAPI.remoteAdd(repoPath, name, url); await reload() }
      else { setRemotes(prev => [...prev, { name, url }]) }
      setMode('detail')
      setAddName(''); setAddUrl('')
      showToast(`원격 ${name}을(를) 추가했어요`)
    } catch (e) {
      showToast(errText(e, '원격을 추가하지 못했어요'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  const renameRemote = async () => {
    if (busy || !selRemote) return
    const next = editName.trim()
    if (!next || next === selRemote.name) return
    setBusy(true)
    try {
      if (repoPath) { await window.gitAPI.remoteRename(repoPath, selRemote.name, next); await reload() }
      else { setRemotes(prev => prev.map(r => (r.name === selRemote.name ? { ...r, name: next } : r))) }
      showToast(`이름을 ${next}(으)로 바꿨어요`)
    } catch (e) {
      showToast(errText(e, '이름을 바꾸지 못했어요'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  const setUrl = async () => {
    if (busy || !selRemote) return
    const next = editUrl.trim()
    if (!next || next === selRemote.url) return
    setBusy(true)
    try {
      if (repoPath) { await window.gitAPI.remoteSetUrl(repoPath, selRemote.name, next); await reload() }
      else { setRemotes(prev => prev.map(r => (r.name === selRemote.name ? { ...r, url: next } : r))) }
      showToast('URL을 바꿨어요')
    } catch (e) {
      showToast(errText(e, 'URL을 바꾸지 못했어요'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  const removeRemote = async (r: GitRemoteInfo) => {
    if (busy) return
    setBusy(true)
    try {
      if (repoPath) { await window.gitAPI.remoteRemove(repoPath, r.name); await reload() }
      else { setRemotes(prev => prev.filter(x => x.name !== r.name)) }
      setDelTarget(null)
      showToast(`원격 ${r.name}을(를) 삭제했어요`)
    } catch (e) {
      setDelTarget(null)
      showToast(errText(e, '삭제하지 못했어요'), 'warning')
    } finally {
      setBusy(false)
    }
  }

  const kindBadge = (url: string) => {
    const k = remoteKind(url)
    return <span className={`rmt-kind k-${k}`}>{k === 'ssh' ? 'SSH' : k === 'https' ? 'HTTPS' : 'URL'}</span>
  }

  const nameDirty = !!selRemote && editName.trim() !== '' && editName.trim() !== selRemote.name
  const urlDirty = !!selRemote && editUrl.trim() !== '' && editUrl.trim() !== selRemote.url

  return (
    <>
    <div className="rmt-scrim" onClick={onClose}>
      <div className="rmt-dlg" onClick={e => e.stopPropagation()}>
        <div className="rmt-hdr">
          <span className="rmt-ico">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="4" cy="8" r="2" /><circle cx="12" cy="4" r="2" /><circle cx="12" cy="12" r="2" /><path d="M6 8h2.5M10.5 5L8.5 7M10.5 11L8.5 9" /></svg>
          </span>
          <h3>원격</h3>
          <span className="rmt-count">{remotes.length}</span>
          <button className="rmt-x" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="rmt-body">
          <div className="rmt-list">
            <div className="rmt-scroll">
              {loading && !remotes.length && <div className="rmt-list-load"><span className="rmt-spin">⟳</span></div>}
              {!loading && !remotes.length && <div className="rmt-list-empty">아직 원격이 없어요<span>오른쪽에서 원격을 추가해 보세요</span></div>}
              {remotes.map(r => (
                <div key={r.name} className={`rmt-item${remotes.indexOf(r) === sel && mode === 'detail' ? ' on' : ''}`} onClick={() => selectRemote(r)}>
                  <div className="rmt-item-info">
                    <div className="rmt-item-name">{r.name}{kindBadge(r.url)}</div>
                    <div className="rmt-item-url">{r.url}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rmt-main">
            <div className="rmt-tabs">
              <button className={`rmt-tab${mode === 'detail' ? ' on' : ''}`} onClick={() => setMode('detail')}>상세</button>
              <button className={`rmt-tab${mode === 'add' ? ' on' : ''}`} onClick={() => setMode('add')}>＋ 원격 추가</button>
            </div>

            {mode === 'detail' ? (
              <div className="rmt-pane">
                {selRemote ? (
                  <>
                    <div className="rmt-detail-head">
                      <div className="rmt-detail-nm">{selRemote.name}{kindBadge(selRemote.url)}</div>
                    </div>
                    <div className="rmt-field">
                      <span className="rmt-flabel">이름</span>
                      <div className="rmt-inline">
                        <input className="rmt-inp" value={editName} onChange={e => setEditName(e.target.value)} placeholder="origin" />
                        <button className="rmt-ab gold" onClick={renameRemote} disabled={busy || !nameDirty}>이름 변경</button>
                      </div>
                    </div>
                    <div className="rmt-field">
                      <span className="rmt-flabel">URL</span>
                      <div className="rmt-inline">
                        <input className="rmt-inp" value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="git@github.com:user/repo.git" />
                        <button className="rmt-ab gold" onClick={setUrl} disabled={busy || !urlDirty}>URL 변경</button>
                      </div>
                    </div>
                    <div className="rmt-acts">
                      <button className="rmt-ab ghost" onClick={() => copyUrl(selRemote.url)}>{I.copy} URL 복사</button>
                      <button className="rmt-ab danger" onClick={() => setDelTarget(selRemote)} disabled={busy}>{I.trash} 삭제</button>
                    </div>
                  </>
                ) : (
                  <div className="rmt-detail-none"><Geuru expr="sleepy" scale={3} /><span>왼쪽에서 원격을 골라 보세요</span></div>
                )}
              </div>
            ) : (
              <div className="rmt-pane">
                <div className="rmt-field">
                  <span className="rmt-flabel">이름<span className="hint">보통 origin · upstream</span></span>
                  <input className="rmt-inp" placeholder="origin" value={addName} onChange={e => setAddName(e.target.value)} />
                </div>
                <div className="rmt-field">
                  <span className="rmt-flabel">URL<span className="hint">SSH 또는 HTTPS</span></span>
                  <input className="rmt-inp" placeholder="git@github.com:user/repo.git" value={addUrl} onChange={e => setAddUrl(e.target.value)} />
                </div>
              </div>
            )}

            <div className="rmt-footer">
              {mode === 'detail' ? (
                <span className="rmt-hint"><Geuru expr="idle" scale={1.2} />원격은 나무가 자라는 정원이에요 · push · pull로 오가요</span>
              ) : (
                <>
                  <span className="rmt-hint"><Geuru expr="happy" scale={1.2} />새 원격을 이어 볼까요?</span>
                  <button className="rmt-mbtn ghost" onClick={() => setMode('detail')}>취소</button>
                  <button className="rmt-mbtn gold" onClick={addRemote} disabled={busy}>{I.check} 원격 추가</button>
                </>
              )}
            </div>
          </div>
        </div>

        {toast && <div className={`rmt-toast ${toast.variant}`}>{toast.text}</div>}
      </div>
    </div>

      {delTarget && (
        <ConfirmModal
          danger
          title="원격 삭제"
          message={`원격 ${delTarget.name}을(를) 삭제할까요? · 로컬 연결만 지우고 원격 저장소는 그대로예요${delTarget.name === currentUpstreamRemote ? ' · 지금 브랜치가 이 원격을 추적 중이라 Pull · Push 대상이 사라져요' : ''}`}
          confirmLabel="삭제"
          onConfirm={() => removeRemote(delTarget)}
          onCancel={() => setDelTarget(null)}
        />
      )}
    </>
  )
}
