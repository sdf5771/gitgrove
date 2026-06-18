// SY1 — 동기화(pull/push/fetch) 진행률 매핑 + 결과 보강의 순수 로직.
//
// simple-git 실호출은 jsdom/CI에서 불가하므로, 핸들러가 의존하는 가공 로직을
// 순수 함수로 분리해 vitest 단위테스트로 검증한다. electron/main.ts 핸들러는
// 여기 헬퍼를 그대로 사용해, 가공 규칙을 한 곳에서 관리한다.

export type RemoteOp = 'pull' | 'push' | 'fetch'

// 프론트가 소비하는 진행률 이벤트(가공 없이 raw stage에 op만 붙인다).
export interface RemoteProgress {
  op: RemoteOp
  stage: string
  progress: number
  processed?: number
  total?: number
}

// 보강된 원격 연산 결과. 기존 success/summary는 하위호환 유지.
export interface GitRemoteResult {
  success: boolean
  op: RemoteOp
  summary: string
  upToDate?: boolean
  changedFiles?: number
  insertions?: number
  deletions?: number
  newCommits?: number     // pull/fetch 받은 커밋 수 (best-effort)
  pushedCommits?: number  // push 올린 커밋 수 (best-effort)
  conflict?: boolean
  conflictedFiles?: string[]
}

// simple-git SimpleGitProgressEvent 의 필요한 부분만(테스트에서 mock하기 쉽게).
export interface SimpleGitProgressLike {
  method?: string
  stage: string
  progress: number
  processed?: number
  total?: number
}

// ProgressEvent → RemoteProgress 매핑. raw stage/progress를 그대로 패스하고 op만 붙인다.
export function mapProgress(op: RemoteOp, ev: SimpleGitProgressLike): RemoteProgress {
  return {
    op,
    stage: ev.stage,
    progress: ev.progress,
    processed: ev.processed,
    total: ev.total,
  }
}

// pull/merge 충돌 에러 판별. git.pull() reject 메시지로 충돌과 진짜 에러를 구분한다.
// 충돌이면 throw하지 않고 conflict 결과로 변환하기 위함.
export function isConflictError(message: string): boolean {
  const m = message || ''
  return /CONFLICT/i.test(m) || /Automatic merge failed/i.test(m)
}

// git status 의 conflicted/unmerged 파일 목록을 추출한다.
// simple-git StatusResult.conflicted 는 string[]; 방어적으로 정규화한다.
export function extractConflictedFiles(conflicted: unknown): string[] {
  if (!Array.isArray(conflicted)) return []
  return conflicted.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

// PullResult 의 summary/files 에서 diff stat을 추출한다.
// changedFiles 는 files.length 우선(없으면 summary.changes), upToDate 는 합이 0인지로 판단.
export interface PullSummaryLike {
  summary?: { changes?: number; insertions?: number; deletions?: number }
  files?: string[]
}

export interface DiffStat {
  changedFiles: number
  insertions: number
  deletions: number
  upToDate: boolean
}

export function extractDiffStat(result: PullSummaryLike): DiffStat {
  const changes = result.summary?.changes ?? 0
  const insertions = result.summary?.insertions ?? 0
  const deletions = result.summary?.deletions ?? 0
  const changedFiles = result.files?.length ?? changes
  return {
    changedFiles,
    insertions,
    deletions,
    upToDate: changes + insertions + deletions === 0,
  }
}

// `git rev-list --count <range>` 출력(또는 임의 문자열)을 음이 아닌 정수로 파싱한다.
// upstream 없음/에러 등으로 파싱 불가하면 undefined(필드 생략 → best-effort).
export function parseRevCount(raw: string | null | undefined): number | undefined {
  if (raw == null) return undefined
  const n = Number.parseInt(String(raw).trim(), 10)
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

// fetch 전/후 behind 값으로 받은 커밋 수(델타)를 계산한다.
// 둘 중 하나라도 미상(undefined)이면 생략. 음수 방지(0 clamp).
export function computeFetchDelta(
  before: number | undefined,
  after: number | undefined,
): number | undefined {
  if (before == null || after == null) return undefined
  return Math.max(0, after - before)
}

// 사람이 읽는 summary 문자열 생성(프론트가 별도 가공할 수도 있으나 기본 제공).
export function buildPullSummary(stat: DiffStat): string {
  return stat.upToDate
    ? 'Already up to date'
    : `Fast-forward: ${stat.changedFiles} file(s) changed`
}
