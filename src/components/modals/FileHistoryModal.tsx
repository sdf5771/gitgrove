import { useEffect, useMemo, useState } from 'react'
import { ModalShell } from './ModalShell'
import { HL } from '../../utils/syntaxHighlight'

// getFileLog 각 커밋에 그 시점 파일 경로(path)가 실린다(backend 리네임 추적, --follow).
// 아직 미제공인 환경도 있어 옵셔널로 두고 현재 경로로 폴백한다.
type FileLogCommit = GitCommit & { path?: string }

interface Props {
  repoPath: string
  filePath: string
  onClose: () => void
  // 커밋 선택 — App이 로드셋에 있으면 그 커밋을 고르고, 없으면 diff를 직접 연다.
  onOpenCommit: (commit: GitCommit) => void
  // 이 시점 blame으로 진입(full hash 전달).
  onBlameAtRev: (filePath: string, rev: string) => void
}

const HistoryIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 106 5.3L3 8" /><path d="M12 7v5l3 2" />
  </svg>
)

// 커밋 파일 diff를 통합(unified)으로 가볍게 렌더 — 헤더 줄은 걸러낸다.
function renderDiff(raw: string) {
  const lines = raw.split('\n')
    .filter(l => !l.startsWith('diff ') && !l.startsWith('index ') && !l.startsWith('--- ') && !l.startsWith('+++ '))
  if (lines.length === 0) return null
  return lines.map((l, i) => {
    if (l.startsWith('@@')) return <div key={i} className="fhist-hunk">{l}</div>
    const t = l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : 'ctx'
    return <div key={i} className={`fhist-cl ${t}`}><span className="fhist-sign">{t === 'add' ? '+' : t === 'del' ? '−' : ' '}</span><span className="fhist-ctext"><HL s={t === 'ctx' ? l : l.slice(1)} /></span></div>
  })
}

export function FileHistoryModal({ repoPath, filePath, onClose, onOpenCommit, onBlameAtRev }: Props) {
  const [log, setLog] = useState<FileLogCommit[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selHash, setSelHash] = useState<string | null>(null)
  const [rawDiff, setRawDiff] = useState<string>('')
  const [diffLoading, setDiffLoading] = useState(false)

  // getFileLog는 --follow라 리네임 이전 커밋도 포함한다. 각 커밋의 "그 시점 경로"(path)를
  // 써야 과거 경로가 다르던 커밋에서도 diff·blame이 비지 않는다. path 미제공이면 현재 경로로 폴백.
  const pathForHash = (hash: string | null): string =>
    (hash && log?.find(c => c.fullId === hash)?.path) || filePath

  // Escape로 닫기(App 모달 스택과 별개로 자체 가드).
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // 파일 이력 로드.
  useEffect(() => {
    let alive = true
    setLoading(true); setError(false)
    window.gitAPI?.getFileLog(repoPath, filePath, { limit: 100 })
      .then(cs => { if (!alive) return; setLog(cs ?? []); setSelHash(cs?.[0]?.fullId ?? null) })
      .catch(() => { if (alive) { setLog([]); setError(true) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [repoPath, filePath])

  // 선택 커밋의 그 시점 경로로 diff 로드(리네임 이전 커밋 대응).
  useEffect(() => {
    if (!selHash) { setRawDiff(''); return }
    let alive = true
    setDiffLoading(true); setRawDiff('')
    window.gitAPI?.getCommitFileDiff(repoPath, selHash, pathForHash(selHash))
      .then(raw => { if (alive) setRawDiff(raw ?? '') })
      .catch(() => { if (alive) setRawDiff('') })
      .finally(() => { if (alive) setDiffLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath, filePath, selHash, log])

  const diffBody = useMemo(() => renderDiff(rawDiff), [rawDiff])
  // 선택 커밋 시점의 경로 기준 파일명(리네임 이전이면 옛 이름이 보인다).
  const selPath = pathForHash(selHash)
  const fileName = selPath.split('/').pop() || selPath

  return (
    <ModalShell title="파일 히스토리" icon={HistoryIcon} sub={filePath} width={860} onClose={onClose}>
      <div className="fhist-body">
        <div className="fhist-list">
          {loading ? (
            <div className="fhist-msg"><span style={{ display: 'inline-block', animation: 'spin 600ms linear infinite' }}>⟳</span> 이력을 불러오는 중…</div>
          ) : error ? (
            <div className="fhist-msg">이력을 불러오지 못했어요 · 다시 열어 보세요</div>
          ) : (log?.length ?? 0) === 0 ? (
            <div className="fhist-msg">이 파일의 커밋 이력이 없어요 · 다른 파일을 골라 보세요</div>
          ) : (
            log!.map(c => {
              const on = selHash === c.fullId
              return (
                <div key={c.fullId} className={`fhist-item${on ? ' on' : ''}`} onClick={() => setSelHash(c.fullId)}>
                  <div className="fhist-item-top">
                    <span className="fhist-sha">{c.id}</span>
                    <span className="fhist-msgtxt">{c.msg.split('\n')[0]}</span>
                  </div>
                  <div className="fhist-item-meta">
                    <span className="fhist-au">{c.author}</span>
                    <span>·</span>
                    <span>{c.time}</span>
                    <span className="fhist-stats"><span className="sa">+{c.stats.insertions}</span><span className="sd">−{c.stats.deletions}</span></span>
                  </div>
                  {on && (
                    <div className="fhist-item-actions">
                      <button onClick={e => { e.stopPropagation(); onOpenCommit(c) }} title="이 커밋을 Diff 탐색기에서 열기">이 커밋 열기</button>
                      <button onClick={e => { e.stopPropagation(); onBlameAtRev(c.path ?? filePath, c.fullId) }} title="이 시점의 blame 보기">이 시점 blame</button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
        <div className="fhist-diff">
          <div className="fhist-diff-hd">
            <span className="fp">{fileName}</span>
            {selHash && <span className="fhist-diff-sha">@ {selHash.slice(0, 7)}</span>}
          </div>
          <div className="fhist-diff-body code-scroll">
            {diffLoading ? (
              <div className="fhist-msg">불러오는 중…</div>
            ) : diffBody ? (
              diffBody
            ) : (
              <div className="fhist-msg">{selHash ? '이 커밋에서 변경 내용이 없어요' : '왼쪽에서 커밋을 골라 보세요'}</div>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  )
}
