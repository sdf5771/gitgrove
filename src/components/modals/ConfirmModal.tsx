import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Geuru } from '../Geuru'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  /** 확인 전 고를 옵션(예: 머지 방식·squash) — 메시지 아래에 렌더된다. */
  children?: ReactNode
  /** 확인 버튼 비활성(액션 진행 중 등). */
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// 파괴적 확인 다이얼로그. 패턴 시트 규칙: 파괴적일 땐 그루(conflict) + 잃는 것 명시,
// 주 액션은 danger 스타일·화살표 없음. 다른 모달/화면 위로도 뜨므로 자체 fixed 백드롭을 쓴다.
export function ConfirmModal({ title, message, confirmLabel = '확인', danger = false, children, confirmDisabled = false, onConfirm, onCancel }: Props) {
  // Escape로 닫기(=취소). in-flight 가드는 onCancel(호출부)이 담당한다.
  // 캡처 단계 + stopImmediatePropagation으로 App 전역 Escape(메뉴 닫힘/검색 초기화)와 겹치지 않게.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      e.stopPropagation()
      onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  const dangerIcon = (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="var(--c-danger)" strokeWidth="1.7">
      <path d="M8 1.5l6.5 11.5h-13z" /><path d="M8 6.5v3M8 11.3v.2" />
    </svg>
  )

  return (
    <div
      className="modal-bd"
      style={{ position: 'fixed', zIndex: 1000 }}
      onClick={onCancel}
    >
      <div className="modal-box" style={{ width: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          {danger && <span className="mic" style={{ color: 'var(--c-danger)' }}>{dangerIcon}</span>}
          <h3>{title}</h3>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body" style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
          {danger && <span style={{ flexShrink: 0 }}><Geuru expr="conflict" scale={2.2} /></span>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--c-text)' }}>{message}</div>
            {children}
          </div>
        </div>
        <div className="modal-footer">
          <button className="mbtn-cancel" onClick={onCancel}>취소</button>
          <button className={danger ? 'mbtn-danger' : 'mbtn-ok'} onClick={onConfirm} disabled={confirmDisabled}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
