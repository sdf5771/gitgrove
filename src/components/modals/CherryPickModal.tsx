import { useState } from 'react'
import type { Commit } from '../../data/mockData'
import { ModalShell, SuccessState } from './ModalShell'

interface Props {
  commit: Commit
  onClose: () => void
  onSuccess?: () => void
  repoPath?: string | null
  currentBranch?: string
}

export function CherryPickModal({ commit, onClose, onSuccess, repoPath, currentBranch }: Props) {
  const [noCommit, setNoCommit] = useState(false)
  const [doing, setDoing] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState('')

  const execute = async () => {
    setError('')
    setDoing(true)
    try {
      if (repoPath) {
        await window.gitAPI!.cherryPick(repoPath, commit.id, noCommit)
      } else {
        await new Promise(r => setTimeout(r, 1200))
        if (commit.parents.length >= 2) { setConflict(true); setDoing(false); return }
      }
      setIsDone(true)
      onSuccess?.()
      setTimeout(() => onClose(), 1800)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.toLowerCase().includes('conflict') || msg.toLowerCase().includes('cherry-pick')) {
        setConflict(true)
      } else {
        setError(msg)
      }
    } finally {
      setDoing(false)
    }
  }

  const branch = currentBranch ?? '현재 브랜치'
  const icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold-300)" strokeWidth="2.2"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>

  return (
    <ModalShell title="체리픽" width={420} onClose={onClose} icon={icon}>
      {conflict ? (
        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="warn-strip" style={{ background: 'rgba(255,107,107,.1)', borderColor: 'rgba(255,107,107,.35)' }}>
            <span style={{ fontSize: 16, color: 'var(--c-danger)', lineHeight: 1 }}>⚡</span>
            <div><div style={{ fontSize: 13, color: 'var(--c-danger)' }}>충돌이 났어요</div><div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 2 }}>파일을 직접 해결해야 해요.</div></div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="mbtn-cancel" onClick={onClose} style={{ flex: 1 }}>중단</button>
            <button className="mbtn-ok" onClick={onClose} style={{ flex: 1 }}>충돌 해결 열기</button>
          </div>
        </div>
      ) : isDone ? (
        <SuccessState msg="체리픽 완료"
          sub={<>커밋 <strong style={{ color: 'var(--c-gold-300)', fontFamily: 'var(--font-mono)' }}>{commit.id}</strong> → {branch}</>} />
      ) : (
        <>
          <div className="modal-body">
            {error && (
              <div style={{ marginBottom: 10, padding: '8px 12px', background: 'rgba(255,107,107,.1)', border: '1px solid rgba(255,107,107,.35)', borderRadius: 'var(--r2)', fontSize: 11, color: 'var(--c-danger)' }}>
                {error}
              </div>
            )}
            <div className="mfield">
              <label>가져올 커밋</label>
              <div className="commit-card">
                <span className="dot" />
                <span className="msg">{commit.msg}</span>
                <span className="hash">{commit.id}</span>
              </div>
            </div>
            <div className="mfield">
              <label>적용 위치</label>
              <div className="mrow"><span style={{ color: 'var(--c-text-faint)' }}>적용 위치</span><span className="mchip chip-gold">{branch} · 현재</span></div>
            </div>
            <div className="mfield">
              <label>옵션</label>
              <div className={`mcheckrow${noCommit ? ' on' : ''}`} onClick={() => setNoCommit(v => !v)}>
                <div className="mcheckbox">{noCommit ? '✓' : ''}</div>
                <div>
                  <div className="mcheck-lbl">커밋 없이 적용</div>
                  <div className="mcheck-sub"><code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>--no-commit</code> · 변경만 스테이지에 올려요</div>
                </div>
              </div>
            </div>
            <div className="mhint">이 커밋 하나만 복사해 <b>{branch}</b> 위에 새로 심어요 · 충돌이 나면 해결 창이 열려요.</div>
          </div>
          <div className="modal-footer">
            <button className="mbtn-cancel" onClick={onClose}>취소</button>
            <button className={`mbtn-ok${doing ? ' doing' : ''}`} onClick={execute} disabled={doing}>
              {doing ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>적용 중…</span> : '체리픽 →'}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  )
}
