import { useState, useCallback } from 'react'

export interface Notification {
  id: number
  type: 'success' | 'info' | 'warning' | 'error'
  title: string
  msg?: string
  dur: number
  onClick?: () => void
}

export function useNotifications() {
  const [notifs, setNotifs] = useState<Notification[]>([])

  const notify = useCallback((
    type: Notification['type'],
    title: string,
    msg?: string,
    onClick?: (() => void) | number,
    dur = 4000
  ) => {
    const resolvedOnClick = typeof onClick === 'function' ? onClick : undefined
    const resolvedDur = typeof onClick === 'number' ? onClick : dur
    const id = Date.now() + Math.random()
    setNotifs(p => [...p.slice(-3), { id, type, title, msg, dur: resolvedDur, onClick: resolvedOnClick }])
    setTimeout(() => setNotifs(p => p.filter(n => n.id !== id)), resolvedDur + 400)
  }, [])

  const dismiss = useCallback((id: number) => {
    setNotifs(p => p.filter(n => n.id !== id))
  }, [])

  return { notifs, notify, dismiss }
}
