import { useState, useCallback } from 'react'

export interface Notification {
  id: number
  type: 'success' | 'info' | 'warning' | 'error'
  title: string
  msg?: string
  dur: number
}

export function useNotifications() {
  const [notifs, setNotifs] = useState<Notification[]>([])

  const notify = useCallback((
    type: Notification['type'],
    title: string,
    msg?: string,
    dur = 4000
  ) => {
    const id = Date.now() + Math.random()
    setNotifs(p => [...p.slice(-3), { id, type, title, msg, dur }])
    setTimeout(() => setNotifs(p => p.filter(n => n.id !== id)), dur + 400)
  }, [])

  const dismiss = useCallback((id: number) => {
    setNotifs(p => p.filter(n => n.id !== id))
  }, [])

  return { notifs, notify, dismiss }
}
