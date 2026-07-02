import { useState, useEffect, useCallback, useRef } from 'react'
import { Geuru } from '../Geuru'
import { GhMark, GlMark } from '../ProviderMark'
import { getUser } from '../../utils/githubClient'
import { getCurrentUser as getGitlabUser } from '../../utils/gitlabClient'
import { normalizeGitlabHost } from '../../utils/gitlab'

interface Props {
  onClose: () => void
}

type Tab = 'ssh' | 'https'
type ToastVariant = 'success' | 'warning'
interface ToastState { text: string; variant: ToastVariant }

interface HttpsCred {
  provider: 'github' | 'gitlab'
  host: string
  login: string | null
  tokenMasked: string
  valid: boolean | null   // null=검증 전/실패, true=유효
}

const errText = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback
const maskToken = (t: string): string => (t.length > 4 ? `••••••••${t.slice(-4)}` : '••••')

const svg = (d: React.ReactNode) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">{d}</svg>
const I = {
  key: svg(<><circle cx="5.5" cy="10.5" r="3" /><path d="M7.6 8.4L13 3M11 5l1.5 1.5M9.5 6.5L11 8" /></>),
  test: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 8.5l3 3 7-8" /></svg>,
  copy: svg(<><rect x="5" y="5" width="9" height="9" rx="1.5" /><path d="M11 5V3.5a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" /></>),
  trash: svg(<><path d="M3 5h10M6 5V3.5h4V5M5 5l.6 8.5h4.8L11 5" /></>),
  lock: svg(<><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>),
}

export function AuthManagerModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('ssh')
  const [toast, setToast] = useState<ToastState | null>(null)
  const [busy, setBusy] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ── SSH ──
  const [sshKeys, setSshKeys] = useState<SshKeyEntry[]>([])
  const [sshLoading, setSshLoading] = useState(true)
  const [testResults, setTestResults] = useState<Record<string, { state: 'run' | 'ok' | 'err'; message: string }>>({})
  const [delKey, setDelKey] = useState<string | null>(null)
  const [genName, setGenName] = useState('')
  const [genPass, setGenPass] = useState('')

  // ── HTTPS ──
  const [creds, setCreds] = useState<HttpsCred[]>([])
  const [httpsLoading, setHttpsLoading] = useState(true)
  const [addHost, setAddHost] = useState('')
  const [addToken, setAddToken] = useState('')
  const [showAddToken, setShowAddToken] = useState(false)

  const showToast = useCallback((text: string, variant: ToastVariant = 'success') => {
    setToast({ text, variant })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const loadSsh = useCallback(async () => {
    setSshLoading(true)
    try { setSshKeys(await window.appAPI?.sshKeys() ?? []) }
    catch { setSshKeys([]) }
    finally { setSshLoading(false) }
  }, [])

  const loadHttps = useCallback(async () => {
    setHttpsLoading(true)
    const list: HttpsCred[] = []
    try {
      const ghToken = await window.appAPI?.githubGetToken()
      if (ghToken) {
        let login: string | null = null
        let valid: boolean | null = null
        try { const { data } = await getUser<{ login: string }>(ghToken); login = data?.login ?? null; valid = !!data }
        catch { valid = false }
        list.push({ provider: 'github', host: 'github.com', login, tokenMasked: maskToken(ghToken), valid })
      }
      const hosts = await window.appAPI?.gitlabListHosts() ?? []
      for (const host of hosts) {
        const t = await window.appAPI?.gitlabGetToken(host)
        if (!t) continue
        let login: string | null = null
        let valid: boolean | null = null
        try { const u = await getGitlabUser(host, t); login = u.username; valid = true }
        catch { valid = false }
        list.push({ provider: 'gitlab', host, login, tokenMasked: maskToken(t), valid })
      }
    } catch { /* 부분 실패는 목록에 담긴 만큼만 */ }
    setCreds(list)
    setHttpsLoading(false)
  }, [])

  useEffect(() => { loadSsh(); loadHttps() }, [loadSsh, loadHttps])

  // ── SSH 액션 ──
  const copyPub = (key: SshKeyEntry) => {
    navigator.clipboard?.writeText(key.publicKey).catch(() => {})
    showToast(`${key.name} 공개키를 복사했어요`)
  }

  const testKey = async (key: SshKeyEntry) => {
    setTestResults(prev => ({ ...prev, [key.name]: { state: 'run', message: 'github.com 에 연결 확인 중…' } }))
    try {
      const r = await window.appAPI?.sshTest('github.com') ?? { ok: false, message: '응답이 없어요' }
      setTestResults(prev => ({ ...prev, [key.name]: { state: r.ok ? 'ok' : 'err', message: r.message } }))
    } catch (e) {
      setTestResults(prev => ({ ...prev, [key.name]: { state: 'err', message: errText(e, '연결하지 못했어요') } }))
    }
  }

  const deleteKey = async (name: string) => {
    if (busy) return
    setBusy(true)
    try {
      await window.appAPI?.sshDelete(name)
      setDelKey(null)
      showToast(`${name} 키를 삭제했어요`)
      await loadSsh()
    } catch (e) {
      showToast(errText(e, '삭제하지 못했어요'), 'warning')
    } finally { setBusy(false) }
  }

  const generate = async () => {
    if (busy) return
    const name = genName.trim() || 'id_ed25519'
    setBusy(true)
    try {
      const r = await window.appAPI?.sshGenerate(name, genPass || undefined)
      if (r?.publicKey) navigator.clipboard?.writeText(r.publicKey).catch(() => {})
      setGenName(''); setGenPass('')
      showToast('새 키를 만들었어요 · 공개키를 복사했어요')
      await loadSsh()
    } catch (e) {
      showToast(errText(e, '키를 만들지 못했어요'), 'warning')
    } finally { setBusy(false) }
  }

  // ── HTTPS 액션 ──
  const validateCred = async (c: HttpsCred) => {
    setCreds(prev => prev.map(x => (x.host === c.host && x.provider === c.provider ? { ...x, valid: null } : x)))
    try {
      if (c.provider === 'github') {
        const t = await window.appAPI?.githubGetToken()
        const { data } = await getUser<{ login: string }>(t ?? '')
        setCreds(prev => prev.map(x => (x.host === c.host && x.provider === 'github' ? { ...x, valid: !!data, login: data?.login ?? x.login } : x)))
      } else {
        const t = await window.appAPI?.gitlabGetToken(c.host)
        const u = await getGitlabUser(c.host, t ?? '')
        setCreds(prev => prev.map(x => (x.host === c.host && x.provider === 'gitlab' ? { ...x, valid: true, login: u.username } : x)))
      }
      showToast('자격증명이 유효해요')
    } catch {
      setCreds(prev => prev.map(x => (x.host === c.host && x.provider === c.provider ? { ...x, valid: false } : x)))
      showToast('자격증명을 확인하지 못했어요', 'warning')
    }
  }

  const deleteCred = async (c: HttpsCred) => {
    if (busy) return
    setBusy(true)
    try {
      if (c.provider === 'github') await window.appAPI?.githubSetToken('')
      else await window.appAPI?.gitlabRemoveToken(c.host)
      window.dispatchEvent(new CustomEvent('gitgrove:settings-changed'))
      showToast(`${c.host} 자격증명을 지웠어요`)
      await loadHttps()
    } catch (e) {
      showToast(errText(e, '지우지 못했어요'), 'warning')
    } finally { setBusy(false) }
  }

  const addCred = async () => {
    if (busy) return
    const host = addHost.trim()
    const token = addToken.trim()
    if (!host || !token) { showToast('호스트와 토큰을 적어 주세요', 'warning'); return }
    setBusy(true)
    try {
      if (host === 'github.com' || /(^|\.)github\.com$/i.test(host)) {
        await window.appAPI?.githubSetToken(token)
      } else {
        await window.appAPI?.gitlabSetToken(normalizeGitlabHost(host), token)
      }
      window.dispatchEvent(new CustomEvent('gitgrove:settings-changed'))
      setAddHost(''); setAddToken('')
      showToast('자격증명을 저장했어요')
      await loadHttps()
    } catch (e) {
      showToast(errText(e, '저장하지 못했어요'), 'warning')
    } finally { setBusy(false) }
  }

  return (
    <div className="am-scrim" onClick={onClose}>
      <div className="am-dlg" onClick={e => e.stopPropagation()}>
        <div className="am-hdr">
          <span className="am-ico">{I.lock}</span>
          <h3>인증 관리</h3>
          <span className="am-sub">SSH · HTTPS 자격증명</span>
          <button className="am-x" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="am-tabs">
          <button className={`am-tab${tab === 'ssh' ? ' on' : ''}`} onClick={() => setTab('ssh')}>{I.key}SSH 키<span className="am-cnt">{sshKeys.length}</span></button>
          <button className={`am-tab${tab === 'https' ? ' on' : ''}`} onClick={() => setTab('https')}>{I.lock}HTTPS 자격증명<span className="am-cnt">{creds.length}</span></button>
        </div>

        <div className="am-body">
          {tab === 'ssh' ? (
            <>
              <div className="am-group">
                <div className="am-group-ttl">등록된 키<span className="line" /></div>
                {sshLoading && <div className="am-load"><span className="am-spin">⟳</span></div>}
                {!sshLoading && sshKeys.length === 0 && (
                  <div className="am-empty"><Geuru expr="sleepy" scale={3} /><b>~/.ssh에 키가 없어요</b><span>아래에서 새 ED25519 키를 만들면 공개키를 자동으로 복사해 드려요.</span></div>
                )}
                {sshKeys.map(k => {
                  const tr = testResults[k.name]
                  return (
                    <div key={k.name} className={`am-card${tr?.state === 'ok' ? ' ok' : tr?.state === 'err' ? ' err' : ''}`}>
                      <div className="am-card-main">
                        <div className="am-card-ic">{I.key}</div>
                        <div className="am-card-info">
                          <div className="am-nm">{k.name}<span className="am-badge b-ssh">{k.type}</span>{tr?.state === 'ok' && <span className="am-badge b-ok">✓ 인증됨</span>}{k.hasPassphrase === false ? null : k.hasPassphrase ? <span className="am-badge b-warn">패스프레이즈</span> : null}</div>
                          <div className="am-fp">{k.fingerprint || '(지문 확인 불가)'} · {k.pubPath}</div>
                          {k.comment && <div className="am-meta">{k.comment}</div>}
                        </div>
                        <div className="am-card-acts">
                          <button className="am-ab ghost" onClick={() => testKey(k)} disabled={tr?.state === 'run'}>{I.test} 연결 테스트</button>
                          <button className="am-ab icon ghost" title="공개키 복사" onClick={() => copyPub(k)}>{I.copy}</button>
                          {delKey === k.name ? (
                            <span className="am-delconfirm">삭제할까요?<button className="am-ab danger" onClick={() => deleteKey(k.name)} disabled={busy}>삭제</button><button className="am-ab ghost" onClick={() => setDelKey(null)}>취소</button></span>
                          ) : (
                            <button className="am-ab icon danger" title="삭제" onClick={() => setDelKey(k.name)}>{I.trash}</button>
                          )}
                        </div>
                      </div>
                      {tr && tr.state !== 'ok' && tr.state === 'run' && (
                        <div className="am-testline run"><span className="am-tspin" />{tr.message}</div>
                      )}
                      {tr && tr.state === 'ok' && <div className="am-testline ok">{I.test} {tr.message}</div>}
                      {tr && tr.state === 'err' && <div className="am-testline err">{tr.message}</div>}
                    </div>
                  )
                })}
              </div>

              <div className="am-group">
                <div className="am-group-ttl">키 추가<span className="line" /></div>
                <div className="am-gen-row">
                  <span className="am-gg"><Geuru expr="happy" scale={1.4} /></span>
                  <div className="am-gen-txt"><b>새 ED25519 키를 만들어요</b> 공개키는 자동으로 복사돼요 — GitHub/GitLab 설정에 붙여넣기만 하면 돼요.</div>
                </div>
                <div className="am-addbox">
                  <div className="am-field">
                    <span className="am-flabel">키 이름<span className="hint">~/.ssh 아래 파일명</span></span>
                    <input className="am-inp" placeholder="id_ed25519" value={genName} onChange={e => setGenName(e.target.value)} />
                  </div>
                  <div className="am-field">
                    <span className="am-flabel">패스프레이즈<span className="hint">비우면 없이 생성</span></span>
                    <div className="am-row">
                      <input className="am-inp" style={{ flex: 1 }} type="password" placeholder="(선택)" value={genPass} onChange={e => setGenPass(e.target.value)} />
                      <button className="am-mbtn gold" onClick={generate} disabled={busy}>새 키 생성</button>
                    </div>
                  </div>
                  <span className="am-hint-line">~/.ssh에 이미 있는 키는 위 목록에 자동으로 나타나요.</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="am-group">
                <div className="am-group-ttl">호스트별 자격증명<span className="line" /></div>
                {httpsLoading && <div className="am-load"><span className="am-spin">⟳</span></div>}
                {!httpsLoading && creds.length === 0 && (
                  <div className="am-empty"><Geuru expr="sleepy" scale={3} /><b>저장된 자격증명이 없어요</b><span>호스트별 토큰을 저장해두면 HTTPS clone·push에 자동으로 쓰여요.</span></div>
                )}
                {creds.map(c => (
                  <div key={`${c.provider}:${c.host}`} className={`am-card${c.valid ? ' ok' : c.valid === false ? ' err' : ''}`}>
                    <div className="am-card-main">
                      <div className="am-card-ic host">{c.provider === 'gitlab' ? <GlMark size={18} /> : <GhMark size={18} />}</div>
                      <div className="am-card-info">
                        <div className="am-nm">{c.host}<span className="am-badge b-https">HTTPS</span>{c.valid ? <span className="am-badge b-ok">✓ 유효</span> : c.valid === false ? <span className="am-badge b-err">확인 실패</span> : null}</div>
                        <div className="am-fp">{c.login ? `@${c.login} · ` : ''}{c.tokenMasked}</div>
                      </div>
                      <div className="am-card-acts">
                        <button className="am-ab ghost" onClick={() => validateCred(c)}>{I.test} 검증</button>
                        <button className="am-ab icon danger" title="삭제" onClick={() => deleteCred(c)} disabled={busy}>{I.trash}</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="am-group">
                <div className="am-group-ttl">자격증명 추가<span className="line" /></div>
                <div className="am-addbox">
                  <div className="am-field">
                    <span className="am-flabel">호스트</span>
                    <input className="am-inp" placeholder="github.com / gitlab.com / gitlab.내부" value={addHost} onChange={e => setAddHost(e.target.value)} />
                  </div>
                  <div className="am-field">
                    <span className="am-flabel">토큰 · 비밀번호</span>
                    <div className="am-row">
                      <div className="am-tok-wrap">
                        <input className="am-inp" style={{ paddingRight: 36 }} type={showAddToken ? 'text' : 'password'} placeholder="ghp_… / glpat-…" value={addToken} onChange={e => setAddToken(e.target.value)} />
                        <button className="am-tok-eye" onClick={() => setShowAddToken(v => !v)} aria-label="토큰 표시 전환"><Geuru expr={showAddToken ? 'idle' : 'sleepy'} scale={1.05} /></button>
                      </div>
                      <button className="am-mbtn gold" onClick={addCred} disabled={busy}>저장 · 검증</button>
                    </div>
                    <span className="am-hint-line">키체인에 저장되고, 해당 호스트 clone·push에 자동으로 쓰여요.</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="am-footer">
          <span className="am-keych">{I.lock}비밀번호·패스프레이즈는 macOS 키체인에 안전하게 저장돼요</span>
          <button className="am-mbtn ghost" onClick={onClose}>닫기</button>
        </div>

        {toast && <div className={`am-toast ${toast.variant}`}>{toast.text}</div>}
      </div>
    </div>
  )
}
