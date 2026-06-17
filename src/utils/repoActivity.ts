// Repository Management(RM1) — per-repo 14일 활동 데이터 순수 로직.
//
// main 프로세스의 git:activity IPC가 `git log --since --date=short`로 얻은
// 커밋 일자(YYYY-MM-DD) 목록을, "오늘 기준 과거 days일을 0으로 채운 길이 days 배열"
// (과거→현재 순)로 정규화한다. 카드의 스파크라인/성장단계/그로브현황이 이 결과를 쓴다.
//
// git 호출 자체는 통합테스트가 곤란하므로, 정규화·성장단계·버킷 경계만 순수 함수로
// 빼서 vitest로 단위검증한다.

// per-repo 활동 결과 (git:activity IPC 반환 형태와 동일)
export interface RepoActivity {
  daily: number[]          // 길이 days. index 0 = (days-1)일 전, 마지막 = 오늘. (과거→현재)
  total: number            // daily 합 = 최근 days일 커밋 수
  lastCommit: string | null // 가장 최근 커밋 상대시간(예: "2d ago") 또는 null(커밋 없음)
}

// 나무 성장단계 (0~3). 디자인 정본 기준 14일 총 커밋 수로 결정.
//   >=55 → 3(flourishing) / >=30 → 2(grown) / >=10 → 1(young) / else 0(seedling)
export type GrowthStage = 0 | 1 | 2 | 3

export function stageOf(total: number): GrowthStage {
  if (total >= 55) return 3
  if (total >= 30) return 2
  if (total >= 10) return 1
  return 0
}

// 그로브 현황 버킷. 사이드바 "활발/보통/휴면" 카드용.
//   >=40 → active(활발) / >=10 → moderate(보통) / else dormant(휴면)
export type ActivityBucket = 'active' | 'moderate' | 'dormant'

export function bucketOf(total: number): ActivityBucket {
  if (total >= 40) return 'active'
  if (total >= 10) return 'moderate'
  return 'dormant'
}

// 로컬 타임존 기준 YYYY-MM-DD 포맷. git의 `--date=short`와 동일 표기.
// (UTC가 아니라 로컬 날짜로 맞춰야 일자 카운트가 어긋나지 않는다.)
export function toShortDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 커밋 일자(YYYY-MM-DD) 목록 → 길이 days 일별 카운트 배열(과거→현재).
//
// - today: 기준일(기본 현재). 마지막 칸 = today.
// - 범위(과거 days-1일 ~ today) 밖의 날짜는 무시(안전).
// - 같은 날 여러 커밋은 누적 카운트.
export function normalizeDailyCounts(
  dates: string[],
  days: number,
  today: Date = new Date(),
): number[] {
  const n = Math.max(0, Math.floor(days))
  if (n === 0) return []

  // today의 시작(자정)을 로컬 기준으로 잡아, 날짜 단위 인덱스를 안정적으로 만든다.
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  // 범위 내 날짜 문자열 → 배열 인덱스 맵 (index 0 = 가장 과거, n-1 = 오늘)
  const indexOf = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() - (n - 1 - i))
    indexOf.set(toShortDate(d), i)
  }

  const daily = new Array<number>(n).fill(0)
  for (const raw of dates) {
    const key = raw.trim()
    if (!key) continue
    const idx = indexOf.get(key)
    if (idx !== undefined) daily[idx] += 1
  }
  return daily
}
