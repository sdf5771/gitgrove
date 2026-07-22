import { Geuru } from '../Geuru'

interface Props {
  // 현재 브랜치명(표시용). 없으면 일반 문구.
  branch?: string
  onPull: () => void
  onForce: () => void
  onCancel: () => void
}

// non-fast-forward 로 push 가 거부됐을 때 뜨는 안전 확인 모달.
// 두 갈래: 먼저 받기(Pull, 안전) · 강제 푸시(force-with-lease, 파괴적=빨강).
// ConfirmModal 정본 패턴(.modal-* · .mbtn-danger · 그루 conflict)을 그대로 따른다.
// --force(non-lease)는 노출하지 않는다 — lease 안전장치만 제공.
export function ForcePushModal({ branch, onPull, onForce, onCancel }: Props) {
  const dangerIcon = (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="var(--c-danger)" strokeWidth="1.7">
      <path d="M8 1.5l6.5 11.5h-13z" /><path d="M8 6.5v3M8 11.3v.2" />
    </svg>
  )
  return (
    <div className="modal-bd" style={{ position: 'fixed', zIndex: 1000 }} onClick={onCancel}>
      <div className="modal-box" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <span className="mic" style={{ color: 'var(--c-danger)' }}>{dangerIcon}</span>
          <h3>Push가 거부됐어요</h3>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0 }}><Geuru expr="conflict" scale={2.2} /></span>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--c-text)' }}>
              원격에 내게 없는 커밋이 있어 일반 push가 거부됐어요{branch ? ` · ${branch}` : ''}.<br />
              먼저 받아 합치거나, 강제로 덮어쓸 수 있어요.
            </div>
          </div>
          <div className="warn-strip danger">
            <span style={{ flexShrink: 0 }}>{dangerIcon}</span>
            <div>
              <b>강제 푸시는 원격 이력을 덮어써요</b> · force-with-lease가 남의 새 커밋은 막아 주지만, 덮어쓴 커밋은 되돌리기 어려워요.
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="mbtn-cancel" onClick={onCancel}>취소</button>
          <button className="mbtn-ok" onClick={onPull}>먼저 받기(Pull)</button>
          <button className="mbtn-danger" onClick={onForce}>강제 푸시</button>
        </div>
      </div>
    </div>
  )
}
