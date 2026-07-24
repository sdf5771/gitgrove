import { useState, useCallback } from 'react'
import type { GeuruExpr } from '../components/Geuru'

export interface Notification {
  id: number
  type: 'success' | 'info' | 'warning' | 'error'
  title: string
  msg?: string
  dur: number
  onClick?: () => void
  // 토스트 좌측 그루 표정. 머지/푸시 성공 등에서 'merge'로 지정.
  geuru?: GeuruExpr
}

export function useNotifications() {
  const [notifs, setNotifs] = useState<Notification[]>([])

  const notify = useCallback((
    type: Notification['type'],
    title: string,
    msg?: string,
    onClick?: (() => void) | number,
    dur = 4000,
    geuru?: GeuruExpr
  ) => {
    const resolvedOnClick = typeof onClick === 'function' ? onClick : undefined
    const resolvedDur = typeof onClick === 'number' ? onClick : dur
    const id = Date.now() + Math.random()
    setNotifs(p => [...p.slice(-3), { id, type, title, msg, dur: resolvedDur, onClick: resolvedOnClick, geuru }])
    setTimeout(() => setNotifs(p => p.filter(n => n.id !== id)), resolvedDur + 400)
  }, [])

  const dismiss = useCallback((id: number) => {
    setNotifs(p => p.filter(n => n.id !== id))
  }, [])

  return { notifs, notify, dismiss }
}

/** notify 함수 시그니처 — PRView/MRView 등 자식이 prop으로 받을 때 쓰는 타입. */
export type NotifyFn = ReturnType<typeof useNotifications>['notify']
