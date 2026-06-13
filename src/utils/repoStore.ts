// Repository Manager 영속 저장(localStorage) 유틸
// - 즐겨찾기: path 배열
// - 최근 열람: { path, name, branch } 목록 (최신순)

export interface RecentRepoEntry {
  path: string
  name: string
  branch: string
}

const FAVORITES_KEY = 'gitgrove:favoriteRepos'
const RECENT_KEY = 'gitgrove:recentRepos'
const RECENT_LIMIT = 20

export function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

export function saveFavorites(paths: string[]): void {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(paths)) } catch { /* ignore */ }
}

export function loadRecents(): RecentRepoEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (r): r is RecentRepoEntry =>
          !!r && typeof r === 'object' &&
          typeof (r as RecentRepoEntry).path === 'string' &&
          typeof (r as RecentRepoEntry).name === 'string',
      )
      .map(r => ({ path: r.path, name: r.name, branch: r.branch ?? '' }))
  } catch {
    return []
  }
}

export function saveRecents(entries: RecentRepoEntry[]): void {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(entries)) } catch { /* ignore */ }
}

// 최근 열람 목록에 항목을 추가/갱신한다(중복 path는 최신으로 끌어올림).
export function pushRecent(entry: RecentRepoEntry): RecentRepoEntry[] {
  const list = loadRecents().filter(r => r.path !== entry.path)
  const next = [entry, ...list].slice(0, RECENT_LIMIT)
  saveRecents(next)
  return next
}
