import { useState } from 'react'
import { type Commit } from '../../data/mockData'
import { Geuru, type GeuruExpr } from '../Geuru'
import { Tree } from '../Tree'

type Action = 'pick' | 'squash' | 'fixup' | 'edit' | 'drop'
const ACTIONS: Action[] = ['pick', 'squash', 'fixup', 'edit', 'drop']
const ACTION_KO: Record<Action, string> = {
  pick: '그대로', squash: '위와 합침·메시지 유지', fixup: '위와 합침·메시지 버림', edit: '멈춰서 수정', drop: '버림',
}

interface Item { id: string; msg: string; action: Action }
interface PNode { id: string; msg: string; edit: boolean; folded: Array<{ id: string; mode: 'squash' | 'fixup' }> }

// squash/fixup을 바로 위 생존 커밋(pick/edit)으로 접어 넣어 리베이스 후 트리를 계산한다.
function computePreview(items: Item[]): PNode[] {
  const out: PNode[] = []
  for (const it of items) {
    if (it.action === 'drop') continue
    if ((it.action === 'squash' || it.action === 'fixup') && out.length) {
      out[out.length - 1].folded.push({ id: it.id, mode: it.action })
      continue
    }
    out.push({ id: it.id, msg: it.msg, edit: it.action === 'edit', folded: [] })
  }
  return out
}

interface Props {
  onClose: () => void
  onSuccess?: () => void
  repoPath?: string | null
  commits?: Commit[]
  currentBranch?: string
}

export function InteractiveRebaseModal({ onClose, onSuccess, repoPath, commits, currentBranch }: Props) {
  const lane0 = (commits ?? []).filter(c => c.lane === 0)
  const sourceCommits = lane0.slice(0, 6)
  const baseHash = lane0[6]?.id ?? 'unknown'

  const [items, setItems] = useState<Item[]>(() =>
    sourceCommits.map(c => ({ id: c.id, msg: c.msg, action: 'pick' as Action })),
  )
  const [scene, setScene] = useState<'edit' | 'running' | 'done'>('edit')
  const [error, setError] = useState('')

  const cycleAction = (id: string) =>
    setItems(p => p.map(c => c.id === id ? { ...c, action: ACTIONS[(ACTIONS.indexOf(c.action) + 1) % ACTIONS.length] } : c))

  const move = (i: number, dir: number) => {
    const ni = i + dir
    if (ni < 0 || ni >= items.length) return
    setItems(p => { const a = [...p]; [a[i], a[ni]] = [a[ni], a[i]]; return a })
  }

  const counts = () => {
    const c: Record<Action, number> = { pick: 0, squash: 0, fixup: 0, edit: 0, drop: 0 }
    items.forEach(i => c[i.action]++)
    return c
  }

  const execute = async () => {
    setError('')
    setScene('running')
    try {
      if (repoPath) {
        await window.gitAPI!.rebaseInteractive(repoPath, items.map(c => ({ hash: c.id, action: c.action, msg: c.msg })))
      } else {
        await new Promise(r => setTimeout(r, 1400))
      }
      onSuccess?.()
      setScene('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setScene('edit')
    }
  }

  const branch = currentBranch ?? 'main'
  const header = (expr: GeuruExpr) => (
    <div className="modal-hdr reb-hd">
      <span className="hdr-geuru"><Geuru expr={expr} scale={1.6} /></span>
      <h3>대화형 리베이스</h3>
      <span className="hdr-branch">⎇ {branch}</span>
      <span className="hdr-sub">최근 {items.length}개 커밋 가지치기</span>
      <button className="modal-close" onClick={onClose}>×</button>
    </div>
  )

  const wrap = (children: React.ReactNode) => (
    <div className="modal-bd" onClick={scene === 'running' ? undefined : onClose}>
      <div className="reb-dlg" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )

  if (scene === 'running') {
    return wrap(<>
      {header('think')}
      <div className="reb-center">
        <Geuru expr="think" scale={3} />
        <b>가지를 다듬는 중…</b>
        <span className="cfl-spin" />
        <span>커밋을 순서대로 다시 심고 있어요 · 잠시만요.</span>
      </div>
    </>)
  }

  const preview = computePreview(items)
  const c = counts()

  if (scene === 'done') {
    return wrap(<>
      {header('merge')}
      <div className="reb-center">
        <div className="reb-done-tree">
          <span className="t" style={{ animationDelay: '.05s' }}><Tree stage={3} scale={2.2} /></span>
          <span className="t" style={{ animationDelay: '.18s' }}><Tree stage={3} scale={2.8} /></span>
          <span className="t" style={{ animationDelay: '.3s' }}><Tree stage={3} scale={2.2} /></span>
        </div>
        <b>가지치기 완료 · 히스토리가 깔끔해졌어요</b>
        <span>{items.length}개 커밋 → <b style={{ color: 'var(--c-grove)' }}>{preview.length}개</b> · 합침 {c.squash + c.fixup} · 버림 {c.drop}</span>
        <button className="mbtn-ok" style={{ marginTop: 4 }} onClick={onClose}>확인</button>
      </div>
    </>)
  }

  const guideDanger = c.drop >= 3
  return wrap(<>
    {header(guideDanger ? 'think' : 'idle')}
    <div className="reb-body">
      {/* 좌: 계획 편집기 */}
      <div className="reb-pane">
        <div className="reb-pane-lbl">커밋 계획 · 최신이 위<span className="hint">배지 클릭=동작 변경 · ▲▼=순서</span></div>
        {error && (
          <div style={{ margin: '4px 10px 0', padding: '8px 12px', background: 'rgba(255,107,107,.1)', border: '1px solid rgba(255,107,107,.35)', borderRadius: 'var(--r2)', fontSize: 11, color: 'var(--c-danger)' }}>{error}</div>
        )}
        <div className="reb-wrap">
          {items.map((it, i) => (
            <div key={it.id} className={`reb-row is-${it.action}`}>
              <span className="reb-drag">⠿</span>
              <span className={`reb-action reb-${it.action}`} title={ACTION_KO[it.action]} onClick={() => cycleAction(it.id)}>{it.action}</span>
              <span className="reb-hash">{it.id}</span>
              <span className="reb-msg">{it.msg}</span>
              <div className="reb-arrows">
                <button className="reb-arrow" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
                <button className="reb-arrow" onClick={() => move(i, 1)} disabled={i === items.length - 1}>▼</button>
              </div>
            </div>
          ))}
        </div>
        <div className="reb-base"><span className="lock">⚓</span>기준 커밋 · {baseHash} <span style={{ color: 'var(--c-text-faint)' }}>— 여기까지는 건드리지 않아요</span></div>
        <div className="reb-legend">
          <span className="leg"><i style={{ background: 'var(--c-info)' }} />pick 그대로</span>
          <span className="leg"><i style={{ background: 'var(--c-warning)' }} />squash/fixup 위와 합침</span>
          <span className="leg"><i style={{ background: 'var(--c-purple)' }} />edit 멈춰서 수정</span>
          <span className="leg"><i style={{ background: 'var(--c-danger)' }} />drop 버림</span>
        </div>
      </div>

      {/* 우: 결과 미리보기 트리 */}
      <div className="prev-pane">
        <div className="reb-pane-lbl">결과 미리보기 · {preview.length} 커밋</div>
        <div className="prev-scroll">
          <div className="prev-tree">
            {preview.map((n, i) => (
              <div key={n.id} className={`pnode${n.folded.length ? ' combo' : ''}${n.edit ? ' edit' : ''}`} style={{ animationDelay: `${i * 45}ms` }}>
                <div className="pmsg">{n.msg}</div>
                <div className="pmeta">
                  <span>{n.id}</span>
                  {n.folded.map(f => <span key={f.id} className="combo-tag">+ {f.id} {f.mode === 'fixup' ? '(메시지 버림)' : ''}</span>)}
                  {n.edit && <span className="edit-tag">✎ 여기서 멈춤</span>}
                </div>
              </div>
            ))}
            <div className="prev-base">⚓ {baseHash} · 기준</div>
          </div>
        </div>
        <div className="prev-stats">
          <span><b>{items.length}</b> → <b style={{ color: 'var(--c-grove)' }}>{preview.length}</b> 커밋</span>
          <span>·</span><span className="warn">{c.squash + c.fixup} 합침</span>
          <span>·</span><span className="drop">{c.drop} 버림</span>
          {c.edit > 0 && <><span>·</span><span style={{ color: 'var(--c-purple)' }}>{c.edit} 수정 대기</span></>}
        </div>
        <div className="prev-guide">
          <span className="gg"><Geuru expr={guideDanger ? 'think' : 'idle'} scale={1.3} /></span>
          <p>{guideDanger
            ? <>많이 버리네요 — <b>버린 커밋은 복구하기 어려워요</b>. 한 번 더 확인해 주세요.</>
            : <>squash한 커밋은 <b>바로 위 커밋으로 합쳐져요</b> · 오른쪽이 리베이스 후의 모습이에요.</>}
          </p>
        </div>
      </div>
    </div>
    <div className="reb-footer">
      <span className="reb-foot-summary">
        <span style={{ color: 'var(--c-info)' }}>{c.pick} pick</span>
        <span style={{ color: 'var(--c-warning)' }}>{c.squash} squash · {c.fixup} fixup</span>
        <span style={{ color: 'var(--c-purple)' }}>{c.edit} edit</span>
        <span style={{ color: 'var(--c-danger)' }}>{c.drop} drop</span>
      </span>
      <button className="mbtn-cancel" onClick={onClose}>취소</button>
      <button className="mbtn-ok" onClick={execute} disabled={items.length === 0}>리베이스 시작 →</button>
    </div>
  </>)
}
