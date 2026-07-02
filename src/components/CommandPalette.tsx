import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { COMMANDS } from '../data/mockData'
import { Geuru, type GeuruExpr } from './Geuru'
import { HighlightMatch } from './HighlightMatch'

interface CmdContext {
  behind?: number
  conflicts?: number
}

interface Props {
  onClose: () => void
  onAction: (id: string) => void
  // 저장소 현재 상태 — "지금 상황" 제안 계산용. 없으면 제안 섹션 생략.
  context?: CmdContext
}

interface Row {
  id: string
  icon: ReactNode
  label: string
  desc?: string
  kbd?: string | null
  why?: string
  tag?: 'sync' | 'conf'
  ctx?: boolean
}

const RECENTS_KEY = 'gitgrove:cmd-recents'

function loadRecents(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]'); return Array.isArray(v) ? v.slice(0, 3) : [] }
  catch { return [] }
}
function recordRecent(id: string) {
  try {
    const prev = loadRecents().filter(x => x !== id)
    localStorage.setItem(RECENTS_KEY, JSON.stringify([id, ...prev].slice(0, 3)))
  } catch { /* localStorage 접근 실패는 무시 */ }
}

const pullIcon = <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 2v8M5 7l3 3 3-3M3 13h10" /></svg>
const conflictIcon = <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 1.5l6.5 11.5h-13z" /><path d="M8 6.5v3M8 11.3v.2" /></svg>

export function CommandPalette({ onClose, onAction, context }: Props) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])

  const recents = useMemo(() => loadRecents(), [])

  // 명령을 표시용 Row로. 아이콘은 기존 문자 아이콘(cmd.icon)을 그대로 살린다.
  const cmdRow = (c: typeof COMMANDS[number]): Row => ({ id: c.id, icon: c.icon, label: c.label, desc: c.desc, kbd: c.kbd || null })

  const ctxRows = useMemo<Row[]>(() => {
    const rows: Row[] = []
    if (context?.behind) rows.push({ id: 'pull', icon: pullIcon, label: `Pull · origin에서 ${context.behind} 커밋 받기`, desc: '브랜치가 뒤처져 있어요', why: `↓${context.behind} 뒤처짐`, kbd: '⌘⇧P', tag: 'sync', ctx: true })
    if (context?.conflicts) rows.push({ id: 'conflict', icon: conflictIcon, label: '충돌 해결 열기', desc: `${context.conflicts}개 파일이 충돌 상태예요`, why: `충돌 ${context.conflicts}`, tag: 'conf', ctx: true })
    return rows
  }, [context])

  const recentRows = useMemo<Row[]>(() =>
    recents.map(id => COMMANDS.find(c => c.id === id)).filter((c): c is typeof COMMANDS[number] => !!c).map(cmdRow),
    [recents])

  const hits = useMemo(() => {
    if (!q.trim()) return null
    const lq = q.toLowerCase()
    return COMMANDS.filter(c => c.label.toLowerCase().includes(lq) || c.cat.toLowerCase().includes(lq) || (c.desc ?? '').toLowerCase().includes(lq))
  }, [q])

  // 표시 섹션 + 평탄 리스트(키보드 내비 인덱스 기준).
  const sections = useMemo<Array<{ title: string; ctx?: boolean; rows: Row[] }>>(() => {
    if (hits) {
      const byCat: Record<string, Row[]> = {}
      hits.forEach(c => { (byCat[c.cat] = byCat[c.cat] ?? []).push(cmdRow(c)) })
      return Object.entries(byCat).map(([title, rows]) => ({ title, rows }))
    }
    const s: Array<{ title: string; ctx?: boolean; rows: Row[] }> = []
    if (ctxRows.length) s.push({ title: '✦ 지금 상황 — 그루의 제안', ctx: true, rows: ctxRows })
    if (recentRows.length) s.push({ title: '최근', rows: recentRows })
    s.push({ title: '전체 명령', rows: COMMANDS.map(cmdRow) })
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, ctxRows, recentRows])

  const flat = useMemo(() => sections.flatMap(s => s.rows), [sections])
  const count = hits ? hits.length : flat.length

  const run = (id: string) => { recordRecent(id); onAction(id); onClose() }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && flat[idx]) run(flat[idx].id)
    else if (e.key === 'Escape') onClose()
  }

  // 검색어 상태로 그루 표정: 결과 있음=happy · 없음=conflict · 기본=idle
  const expr: GeuruExpr = !q.trim() ? 'idle' : count === 0 ? 'conflict' : 'happy'

  let li = 0
  return (
    <div className="cmd-bd" onMouseDown={onClose}>
      <div className="cmd-box" onMouseDown={e => e.stopPropagation()}>
        <div className="cmd-inp-wrap">
          <span className="cmd-geuru"><Geuru expr={expr} scale={1.5} /></span>
          <input ref={ref} className="cmd-inp" placeholder="무엇을 할까요? 명령 · 브랜치 · 커밋 검색…" value={q}
            onChange={e => { setQ(e.target.value); setIdx(0) }} onKeyDown={handleKey} />
          <span className="cmd-esc">ESC</span>
        </div>
        <div className="cmd-list">
          {count === 0 ? (
            <div className="cmd-empty">
              <Geuru expr="conflict" scale={2.6} />
              <b>"{q}" 에 맞는 명령이 없어요</b>
              <span>다른 키워드로 찾아보세요.</span>
              <div className="try">
                <button onMouseDown={() => { setQ('pull'); setIdx(0) }}>pull</button>
                <button onMouseDown={() => { setQ('브랜치'); setIdx(0) }}>브랜치</button>
                <button onMouseDown={() => { setQ('stash'); setIdx(0) }}>stash</button>
              </div>
            </div>
          ) : (
            sections.map(sec => (
              <div key={sec.title}>
                <div className={`cmd-cat${sec.ctx ? ' ctx' : ''}`}>{sec.title}</div>
                {sec.rows.map(row => {
                  const cur = li++
                  const on = cur === idx
                  return (
                    <div key={`${sec.title}:${row.id}`} className={`cmd-row${on ? ' on' : ''}`}
                      onMouseEnter={() => setIdx(cur)} onMouseDown={() => run(row.id)}>
                      <div className={`cmd-icon${row.ctx ? ' ctx-ic' : ''}`}>{row.icon}</div>
                      <div className="cmd-body">
                        <div className="cmd-label"><HighlightMatch text={row.label} query={q} /></div>
                        {row.desc && <div className="cmd-desc">{row.desc}</div>}
                        {row.why && <div className="cmd-why">⚡ {row.why}</div>}
                      </div>
                      {row.tag && <span className={`cmd-tag tag-${row.tag}`}>{row.tag === 'sync' ? '동기화 필요' : '충돌'}</span>}
                      {row.kbd && <span className="cmd-ckbd">{row.kbd}</span>}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
        <div className="cmd-footer">
          <span><span className="cmd-fkey">↑↓</span>이동</span>
          <span><span className="cmd-fkey">↵</span>실행</span>
          <span><span className="cmd-fkey">ESC</span>닫기</span>
          <span className="cmd-count">{count}개 명령</span>
        </div>
      </div>
    </div>
  )
}
