// 알림 사운드 설정 — `gitgrove:settings`(JSON, localStorage)에서 읽고
// `gitgrove:settings-changed` 이벤트로 변경을 구독한다. (기존 설정 패턴 그대로)

const SETTINGS_KEY = 'gitgrove:settings'

// macOS 시스템 사운드 옵션. SettingsPanel 드롭다운과 동일하게 유지할 것.
export const NOTIFICATION_SOUNDS = [
  'Glass', 'Ping', 'Hero', 'Submarine', 'Basso', 'Blow', 'Bottle',
  'Frog', 'Funk', 'Morse', 'Pop', 'Purr', 'Sosumi', 'Tink',
] as const

export type NotificationSound = (typeof NOTIFICATION_SOUNDS)[number]

export interface NotifSoundSettings {
  /** 알림 소리 on/off (기본 true) */
  enabled: boolean
  /** macOS 시스템 사운드 이름 (기본 'Glass') */
  sound: string
}

export const DEFAULT_NOTIF_SOUND: NotifSoundSettings = { enabled: true, sound: 'Glass' }

// localStorage에서 현재 알림 사운드 설정을 읽는다. 누락/파싱 실패 시 기본값.
export function readNotifSoundSettings(): NotifSoundSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>
    const enabled = typeof raw.notificationSoundEnabled === 'boolean'
      ? raw.notificationSoundEnabled
      : DEFAULT_NOTIF_SOUND.enabled
    const sound = typeof raw.notificationSound === 'string' && raw.notificationSound
      ? raw.notificationSound
      : DEFAULT_NOTIF_SOUND.sound
    return { enabled, sound }
  } catch {
    return { ...DEFAULT_NOTIF_SOUND }
  }
}
