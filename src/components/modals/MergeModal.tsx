import { useState } from 'react'
import { type Branch } from '../../data/mockData'
import { ModalShell, SuccessState } from './ModalShell'

interface Props {
  onClose: () => void
  onSuccess?: () => void
  branches?: Branch[]
  repoPath?: string | null
  currentBranch?: string
}

export function MergeModal({ onClose, onSuccess, branches, repoPath, currentBranch }: Props) {
  const opts = (branches ?? []).filter(b => !b.current)
  const [from, setFrom] = useState(opts[0]?.name ?? '')
  const [strategy, setStrategy] = useState<'merge' | 'rebase' | 'squash'>('merge')
  const [doing, setDoing] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [error, setError] = useState('')

  const target = currentBranch ?? 'current'

  const execute = async () => {
    setError('')
    setDoing(true)
    try {
      if (repoPath) {
        await window.gitAPI!.merge(repoPath, from, strategy)
      } else {
        await new Promise(r => setTimeout(r, 1300))
      }
      setIsDone(true)
      onSuccess?.()
      setTimeout(() => onClose(), 2100)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDoing(false)
    }
  }

  const strategies = [
    ['merge', '머지 커밋', '머지 커밋을 만들어요 · 브랜치 히스토리 보존'],
    ['rebase', '리베이스', '대상 위에 커밋을 다시 얹어요 · 선형 히스토리'],
    ['squash', '스쿼시 머지', '커밋을 하나로 합쳐요 · 깔끔한 트렁크 히스토리'],
  ] as const

  const doneLabel = { merge: '머지 완료', rebase: '리베이스 완료', squash: '스쿼시 완료' }[strategy]
  const runLabel = { merge: '머지', rebase: '리베이스', squash: '스쿼시' }[strategy]

  const icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold-300)" strokeWidth="2.2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 012 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>

  return (
    <ModalShell title="머지 · 리베이스" width={440} onClose={onClose} icon={icon}>
      {isDone ? (
        <SuccessState msg={doneLabel}
          sub={<><strong style={{ color: 'var(--c-text)' }}>{from}</strong> → <strong style={{ color: 'var(--c-text)' }}>{target}</strong></>} />
      ) : (
        <>
          <div className="modal-body">
            {error && (
              <div style={{ marginBottom: 10, padding: '8px 12px', background: 'rgba(255,107,107,.1)', border: '1px solid rgba(255,107,107,.35)', borderRadius: 'var(--r2)', fontSize: 11, color: 'var(--c-danger)' }}>
                {error}
              </div>
            )}
            <div className="mfield">
              <label>대상</label>
              <div className="mval"><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e6a536', flexShrink: 0, display: 'inline-block' }} />{target}</div>
            </div>
            <div className="mfield">
              <label>가져올 브랜치</label>
              <select className="mselect" value={from} onChange={e => setFrom(e.target.value)}>
                {opts.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            <div className="mfield">
              <label>방식</label>
              <div className="mradio-group">
                {strategies.map(([val, title, desc]) => (
                  <div key={val} className={`mradio${strategy === val ? ' on' : ''}`} onClick={() => setStrategy(val)}>
                    <span className="mradio-bullet">{strategy === val ? '●' : '○'}</span>
                    <div><div className="mradio-title">{title}</div><div className="mradio-desc">{desc}</div></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="minfo">
              <span className="minfo-icon">ℹ</span>
              <span><strong style={{ color: 'var(--c-text-strong)' }}>{from}</strong> → <strong style={{ color: 'var(--c-text-strong)' }}>{target}</strong> 로 커밋을 가져와요</span>
            </div>
          </div>
          <div className="modal-footer">
            <button className="mbtn-cancel" onClick={onClose}>취소</button>
            <button className={`mbtn-ok${doing ? ' doing' : ''}`} onClick={execute} disabled={doing}>
              {doing
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span>진행 중…</span>
                : `${runLabel} →`}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  )
}
