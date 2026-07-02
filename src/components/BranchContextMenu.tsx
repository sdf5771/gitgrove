import { useEffect } from 'react'
import { LANE_COLORS } from '../data/mockData'

// 브랜치 이름에서 안정적인 레인 색을 뽑아 헤더 점에 쓴다(그래프 레인 색과 같은 팔레트).
function laneColorFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return LANE_COLORS[h % LANE_COLORS.length]
}

export type BranchMenuAction =
  | 'checkout'
  | 'new-branch-from'
  | 'merge-into-current'
  | 'rebase-onto'
  | 'rename'
  | 'delete'
  | 'copy-name'
  | 'push'
  | 'pull'

interface BranchContextMenuProps {
  x: number
  y: number
  branchName: string
  branchType: 'local' | 'remote' | 'tag'
  isCurrent: boolean
  onClose: () => void
  onAction: (action: BranchMenuAction, branchName: string) => void
}

export function BranchContextMenu({
  x, y, branchName, branchType, isCurrent, onClose, onAction,
}: BranchContextMenuProps) {
  // Escape 키로 닫기
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // 화면 경계를 넘지 않도록 위치 조정
  const menuX = Math.min(x, window.innerWidth - 220)
  const menuY = Math.min(y, window.innerHeight - 320)

  const sv = (d: React.ReactNode) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{d}</svg>
  )

  const item = (
    icon: React.ReactNode,
    label: string,
    action: BranchMenuAction,
    disabled = false,
    danger = false,
  ) => (
    <div
      key={action}
      className={`ctx-item${danger ? ' danger' : ''}`}
      style={disabled ? { opacity: 0.4, cursor: 'default', pointerEvents: 'none' } : {}}
      onMouseDown={e => {
        e.stopPropagation()
        if (!disabled) {
          onAction(action, branchName)
          onClose()
        }
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
    </div>
  )

  const sep = () => <div className="ctx-sep" />

  // 대상 헤더: 레인 색 · 이름 · local/remote/tag 배지 (커밋 메뉴엔 없고 대상이 있는 메뉴에만)
  const tagLabel = branchType === 'local' ? 'local' : branchType === 'remote' ? 'remote' : 'tag'
  const head = (
    <div className="ctx-head">
      <span className="lane" style={{ background: laneColorFor(branchName) }} />
      <span className="nm">{branchName}</span>
      <span className="tag">{tagLabel}</span>
    </div>
  )

  return (
    <>
      {/* backdrop — 클릭 시 닫기 */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onMouseDown={() => onClose()}
      />

      <div
        className="ctx-wrap"
        style={{ position: 'fixed', left: menuX, top: menuY, zIndex: 9999 }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="ctx-menu">
          {head}
          {branchType === 'local' && (
            <>
              {item(
                sv(<><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></>),
                '체크아웃',
                'checkout',
                isCurrent,
              )}
              {sep()}
              {item(
                sv(<><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></>),
                '여기서 새 브랜치',
                'new-branch-from',
              )}
              {item(
                sv(<><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 012 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></>),
                '현재 브랜치에 머지',
                'merge-into-current',
                isCurrent,
              )}
              {item(
                sv(<><polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></>),
                '현재 위로 리베이스',
                'rebase-onto',
                isCurrent,
              )}
              {sep()}
              {item(
                sv(<><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>),
                '이름 변경',
                'rename',
              )}
              {item(
                sv(<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>),
                '이름 복사',
                'copy-name',
              )}
              {item(
                sv(<><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></>),
                '삭제',
                'delete',
                isCurrent,
                true,
              )}
            </>
          )}

          {branchType === 'remote' && (
            <>
              {item(
                sv(<><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></>),
                '체크아웃',
                'checkout',
              )}
              {sep()}
              {item(
                sv(<><polyline points="8,17 3,12 8,7"/><line x1="3" y1="12" x2="21" y2="12"/></>),
                'Pull',
                'pull',
              )}
              {sep()}
              {item(
                sv(<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>),
                '이름 복사',
                'copy-name',
              )}
            </>
          )}

          {branchType === 'tag' && (
            <>
              {item(
                sv(<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>),
                '이름 복사',
                'copy-name',
              )}
              {sep()}
              {item(
                sv(<><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></>),
                '삭제',
                'delete',
                false,
                true,
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
