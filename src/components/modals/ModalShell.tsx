import type { ReactNode } from 'react'
import { Geuru } from '../Geuru'

interface Props {
  title: string
  icon?: ReactNode
  // 헤더 우측의 mono 보조 문구(예: 커밋 해시 · 출처). 없으면 미표시.
  sub?: ReactNode
  width?: number
  onClose: () => void
  children: ReactNode
}

export function ModalShell({ title, icon, sub, width = 440, onClose, children }: Props) {
  return (
    <div className="modal-bd" onClick={onClose}>
      <div className="modal-box" style={{ width }} onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          {icon && <span className="mic">{icon}</span>}
          <h3>{title}</h3>
          {sub && <span className="sub">{sub}</span>}
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// 공통 페이오프 — ✓ 원 대신 그루가 등장한다(패턴 시트 규칙).
export function SuccessState({ msg, sub, expr = 'merge' }: { msg: string; sub?: ReactNode; expr?: 'merge' | 'happy' }) {
  return (
    <div className="success-state">
      <Geuru expr={expr} scale={2.6} />
      <div className="msg">{msg}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}
