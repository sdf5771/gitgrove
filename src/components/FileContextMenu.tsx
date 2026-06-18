import { useEffect } from 'react'
import type { FileEntry } from '../data/mockData'
import { fileExtension } from '../utils/fileExtension'

export type FileMenuAction =
  | 'discard'
  | 'ignore-file'
  | 'ignore-ext'
  | 'copy-abs-path'
  | 'copy-rel-path'
  | 'reveal'
  | 'open-default'

interface FileContextMenuProps {
  x: number
  y: number
  file: FileEntry
  repoPath: string
  onClose: () => void
  onAction: (action: FileMenuAction, file: FileEntry) => void
}

export function FileContextMenu({
  x, y, file, onClose, onAction,
}: FileContextMenuProps) {
  // Escape 키로 닫기
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // 화면 경계를 넘지 않도록 위치 조정
  const menuX = Math.min(x, window.innerWidth - 240)
  const menuY = Math.min(y, window.innerHeight - 300)

  const ext = fileExtension(file.p)

  const sv = (d: React.ReactNode) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{d}</svg>
  )

  const item = (
    icon: React.ReactNode,
    label: string,
    action: FileMenuAction,
    danger = false,
  ) => (
    <div
      key={action}
      className={`ctx-item${danger ? ' danger' : ''}`}
      onMouseDown={e => {
        e.stopPropagation()
        onAction(action, file)
        onClose()
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
    </div>
  )

  const sep = () => <div className="ctx-sep" />

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
          {item(
            sv(<><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></>),
            '변경 되돌리기…',
            'discard',
            true,
          )}
          {sep()}
          {item(
            sv(<><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>),
            '파일 무시 (.gitignore에 추가)',
            'ignore-file',
          )}
          {ext && item(
            sv(<><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>),
            `이 확장자 무시 · .${ext} (.gitignore에 추가)`,
            'ignore-ext',
          )}
          {sep()}
          {item(
            sv(<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>),
            '파일 경로 복사',
            'copy-abs-path',
          )}
          {item(
            sv(<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>),
            '상대 경로 복사',
            'copy-rel-path',
          )}
          {sep()}
          {item(
            sv(<><path d="M3 7V5a2 2 0 012-2h2"/><path d="M17 3h2a2 2 0 012 2v2"/><path d="M21 17v2a2 2 0 01-2 2h-2"/><path d="M7 21H5a2 2 0 01-2-2v-2"/><circle cx="12" cy="12" r="3"/></>),
            'Finder에서 보기',
            'reveal',
          )}
          {item(
            sv(<><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></>),
            '기본 앱으로 열기',
            'open-default',
          )}
        </div>
      </div>
    </>
  )
}
