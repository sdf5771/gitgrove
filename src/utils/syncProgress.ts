// SY2 — 동기화 진행 HUD의 순수 표현 로직.
//
// backend(SY1)는 simple-git raw stage 문자열에 op만 붙여 패스한다(가공 없음).
// 여기서 stage→한글 라벨·determinate 여부·진행바 모드·rate 표기를 매핑하고,
// op별 단계(phase) 시퀀스와 "현재 stage가 몇 번째 phase인지"를 판정한다.
// 모두 순수 함수로 분리해 vitest로 검증한다(디자인 정본의 phase 로그/문구를 따름).

import type { RemoteOp, RemoteProgress, GitRemoteResult } from './syncResult'

export type { RemoteOp, RemoteProgress, GitRemoteResult }

// 단계 상태: 아직 안 옴 / 진행 중 / 끝남 / 실패.
export type PhaseStatus = 'pending' | 'active' | 'done' | 'err'

// HUD가 그리는 단계 한 칸.
export interface PhaseSpec {
  // simple-git raw stage 키들(이 stage가 오면 이 phase로 친다). 비면 op 시작 시 첫 칸.
  stages: string[]
  label: string
  // determinate(받는 양을 아는) 단계인지 — 줄무늬 width% 바 + 카운트/rate 표기.
  determinate: boolean
  // 카운트 단위 라벨(없으면 표기 생략). 'objects' | 'deltas' 등.
  unit?: string
}

// 디자인 정본의 phase 로그/문구 그대로. op별 단계 시퀀스.
const PULL_PHASES: PhaseSpec[] = [
  { stages: ['remote'], label: '원격에 연결하는 중', determinate: false },
  { stages: ['counting', 'enumerating'], label: '객체 세는 중', determinate: false },
  { stages: ['compressing'], label: '객체 압축하는 중', determinate: true, unit: 'objects' },
  { stages: ['receiving'], label: '객체 받는 중', determinate: true, unit: 'objects' },
  { stages: ['resolving'], label: '델타 적용하는 중', determinate: true, unit: 'deltas' },
  { stages: ['merging', 'checkout', 'updating'], label: '변경사항 병합하는 중', determinate: false },
]

const FETCH_PHASES: PhaseSpec[] = [
  { stages: ['remote'], label: '원격에 연결하는 중', determinate: false },
  { stages: ['counting', 'enumerating'], label: '객체 세는 중', determinate: false },
  { stages: ['compressing'], label: '객체 압축하는 중', determinate: true, unit: 'objects' },
  { stages: ['receiving'], label: '객체 받는 중', determinate: true, unit: 'objects' },
  { stages: ['resolving'], label: '델타 적용하는 중', determinate: true, unit: 'deltas' },
]

const PUSH_PHASES: PhaseSpec[] = [
  { stages: ['remote', 'preparing'], label: '변경사항 준비하는 중', determinate: false },
  { stages: ['compressing'], label: '객체 압축하는 중', determinate: true, unit: 'objects' },
  { stages: ['writing', 'sending'], label: '객체 올리는 중', determinate: true, unit: 'objects' },
  { stages: ['updating', 'resolving'], label: '원격 갱신하는 중', determinate: false },
]

// CL2 — clone 단계. 디자인 정본의 진행 로그(연결→세기→받기→델타→파일 펼치는 중).
// pull과 유사하나 마지막이 'checkout'(작업트리에 파일을 펼치는 단계)로 끝난다.
const CLONE_PHASES: PhaseSpec[] = [
  { stages: ['remote'], label: '원격에 연결하는 중', determinate: false },
  { stages: ['counting', 'enumerating'], label: '객체 세는 중', determinate: false },
  { stages: ['compressing'], label: '객체 압축하는 중', determinate: true, unit: 'objects' },
  { stages: ['receiving'], label: '객체 받는 중', determinate: true, unit: 'objects' },
  { stages: ['resolving'], label: '델타 적용하는 중', determinate: true, unit: 'deltas' },
  { stages: ['checkout', 'updating'], label: '파일 펼치는 중', determinate: true, unit: 'files' },
]

export function phasesFor(op: RemoteOp): PhaseSpec[] {
  if (op === 'push') return PUSH_PHASES
  if (op === 'fetch') return FETCH_PHASES
  if (op === 'clone') return CLONE_PHASES
  return PULL_PHASES
}

// raw stage 문자열을 정규화(소문자, simple-git가 'remote:'처럼 콜론을 붙이기도 함).
export function normalizeStage(stage: string): string {
  // 양끝 공백 제거 후, 첫 콜론/내부 공백 이전까지를 키로 사용한다
  // (simple-git가 'remote: Counting' / 'Receiving objects'처럼 뒤에 설명을 붙이기도 함).
  return (stage || '').trim().toLowerCase().replace(/[:\s].*$/, '')
}

// 주어진 op에서 raw stage가 몇 번째 phase인지. 매칭 실패 시 -1(전이 안 함).
export function phaseIndexForStage(op: RemoteOp, stage: string): number {
  const norm = normalizeStage(stage)
  const phases = phasesFor(op)
  return phases.findIndex(p => p.stages.some(s => norm === s || norm.startsWith(s)))
}

// op + 그동안 본 stage들로 각 phase의 status를 계산한다.
// "지금까지 도달한 최대 phase 인덱스"(maxReached)와 진행 이벤트의 마지막 stage로
// active를 판정: maxReached보다 앞은 done, 같으면 active, 뒤는 pending.
//
// done(완료) 시: 실제 진입(maxReached까지 도달)한 phase만 done으로 찍는다.
// 도달 안 한 뒤쪽 phase는 중립(pending)으로 둔다 — indeterminate만 거치고 빠르게
// 끝난 경우 도달 안 한 단계까지 녹색 체크되는 m3 버그 방지. (디자인 "실제 단계 로그" 의도.)
export function computePhaseStatuses(
  op: RemoteOp,
  maxReached: number,
  opts: { done?: boolean; errorAt?: number } = {},
): PhaseStatus[] {
  const phases = phasesFor(op)
  const { done = false, errorAt } = opts
  return phases.map((_, i) => {
    if (errorAt !== undefined) {
      if (i < errorAt) return 'done'
      if (i === errorAt) return 'err'
      return 'pending'
    }
    if (done) return i <= maxReached ? 'done' : 'pending'
    if (i < maxReached) return 'done'
    if (i === maxReached) return 'active'
    return 'pending'
  })
}

// 진행 이벤트 누적 상태(HUD가 들고 다니는 모델).
export interface ProgressModel {
  op: RemoteOp
  // 지금까지 도달한 최대 phase 인덱스(역행 방지).
  maxPhase: number
  // 현재 phase 내 progress(0~100). determinate 단계의 바·카운트에 사용.
  phaseProgress: number
  processed?: number
  total?: number
}

export function initialModel(op: RemoteOp): ProgressModel {
  return { op, maxPhase: 0, phaseProgress: 0, processed: undefined, total: undefined }
}

// 새 진행 이벤트를 모델에 반영(역행 금지 — 늦게 온 이전 phase 이벤트 무시).
export function applyProgress(model: ProgressModel, p: RemoteProgress): ProgressModel {
  const idx = phaseIndexForStage(model.op, p.stage)
  // 매칭 안 되는 stage는 현재 phase 유지하되 progress만 반영.
  const nextPhase = idx >= 0 ? Math.max(model.maxPhase, idx) : model.maxPhase
  // phase가 뒤로 갈 수 없으므로, 더 앞 phase의 progress 이벤트는 무시.
  if (idx >= 0 && idx < model.maxPhase) {
    return model
  }
  return {
    op: model.op,
    maxPhase: nextPhase,
    phaseProgress: clampPct(p.progress),
    processed: p.processed,
    total: p.total,
  }
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

// 전체 진행률(%). phase 균등 분할 + 현재 phase 내 진행률.
// determinate 단계가 아니면 phase 경계만 반영(흐르는 막대는 별도로 표시).
export function overallPercent(model: ProgressModel): number {
  const phases = phasesFor(model.op)
  const n = phases.length
  if (n === 0) return 0
  const cur = phases[Math.min(model.maxPhase, n - 1)]
  const base = (model.maxPhase / n) * 100
  const within = cur?.determinate ? (model.phaseProgress / 100) * (100 / n) : 0
  return Math.min(100, Math.round(base + within))
}

// 현재 단계가 determinate인지(진행바 모드: 줄무늬 width% vs 흐르는 막대).
export function isDeterminate(model: ProgressModel): boolean {
  const phases = phasesFor(model.op)
  return phases[Math.min(model.maxPhase, phases.length - 1)]?.determinate ?? false
}

// 현재 단계 라벨(rate 줄 좌측 "…중" 문구에 사용).
export function currentLabel(model: ProgressModel): string {
  const phases = phasesFor(model.op)
  return phases[Math.min(model.maxPhase, phases.length - 1)]?.label ?? ''
}

// 카운트 meta("74/128") — determinate 단계 + total>0 일 때만.
export function countMeta(model: ProgressModel): string {
  if (!isDeterminate(model)) return ''
  const { processed, total } = model
  if (typeof processed === 'number' && typeof total === 'number' && total > 0) {
    return `${processed}/${total}`
  }
  return ''
}

// 전송률 표기. determinate 단계에서 KiB/MiB-per-second 추정(processed/total → KiB 가정 없이
// 카운트 기반). simple-git는 byte rate를 항상 주지 않으므로, total 카운트가 있으면 "n/total unit"을,
// 없으면 빈 문자열. (디자인의 rate 줄 우측.)
export function rateText(model: ProgressModel): string {
  if (!isDeterminate(model)) return ''
  const phases = phasesFor(model.op)
  const unit = phases[Math.min(model.maxPhase, phases.length - 1)]?.unit ?? ''
  const { processed, total } = model
  if (typeof processed === 'number' && typeof total === 'number' && total > 0) {
    return unit ? `${processed}/${total} ${unit}` : `${processed}/${total}`
  }
  return ''
}

// ── 결과 매핑 ──

export type ResultKind = 'success' | 'uptodate' | 'conflict' | 'error'
export type ToastClass = 'success' | 'info' | 'warning' | 'error'

export interface ResultView {
  kind: ResultKind
  // 결과 그루 표정.
  geuru: 'merge' | 'happy' | 'conflict'
  // HUD 푸터 제목.
  title: string
  // HUD 푸터 상세(plain text; insertions/deletions는 별도 필드로).
  detail: string
  insertions?: number
  deletions?: number
  changedFiles?: number
  commits?: number
  // 토스트.
  toast: { cls: ToastClass; geuru: 'merge' | 'happy' | 'conflict'; title: string; msg: string }
}

// GitRemoteResult → HUD/토스트 표현으로 매핑. 디자인 정본의 문구를 따른다.
export function mapResult(result: GitRemoteResult): ResultView {
  const op = result.op

  // 충돌(pull) — throw가 아니라 정상 반환된 conflict 결과.
  if (result.conflict) {
    const n = result.conflictedFiles?.length ?? 0
    const filesTxt = n > 0 ? `${n}개 파일` : '여러 파일'
    return {
      kind: 'conflict',
      geuru: 'conflict',
      title: '병합 충돌이 생겼어요',
      detail: `${filesTxt}이 양쪽에서 바뀌었어요 · 직접 해결이 필요해요`,
      toast: { cls: 'warning', geuru: 'conflict', title: '충돌 발생', msg: n > 0 ? `${n}개 파일 · 해결이 필요해요` : '해결이 필요해요' },
    }
  }

  // 이미 최신(받을 변경 없음).
  if (result.upToDate || (op !== 'push' && isEmptyDiff(result))) {
    return {
      kind: 'uptodate',
      geuru: 'happy',
      title: '이미 최신 상태예요',
      detail: opTarget(op).from + ' 과 같은 커밋이에요 · 받을 변경사항이 없어요',
      toast: { cls: 'info', geuru: 'happy', title: '이미 최신', msg: '변경사항 없음 · 최신 상태' },
    }
  }

  if (op === 'push') {
    const commits = result.pushedCommits
    const commitTxt = typeof commits === 'number' ? `${commits} 커밋 · ` : ''
    return {
      kind: 'success',
      geuru: 'merge',
      title: 'origin 에 올렸어요',
      detail: `${commitTxt}푸시 완료`,
      commits,
      toast: {
        cls: 'success', geuru: 'merge', title: 'Push 완료',
        msg: typeof commits === 'number' ? `${commits} 커밋 → origin` : 'origin 갱신됨',
      },
    }
  }

  // pull/fetch 성공(변경 받음).
  const commits = result.newCommits
  const files = result.changedFiles
  const commitTxt = typeof commits === 'number' ? `${commits} 커밋` : '변경사항'
  const fileTxt = typeof files === 'number' ? ` · ${files} files` : ''
  return {
    kind: 'success',
    geuru: 'merge',
    title: op === 'fetch' ? '원격 변경을 가져왔어요' : '최신으로 맞췄어요',
    detail: `${commitTxt}${fileTxt}`,
    insertions: result.insertions,
    deletions: result.deletions,
    changedFiles: files,
    commits,
    toast: {
      cls: op === 'fetch' ? 'info' : 'success',
      geuru: 'merge',
      title: op === 'fetch' ? 'Fetch 완료' : 'Pull 완료',
      msg: typeof commits === 'number'
        ? `${commits} 커밋${typeof files === 'number' ? ` · ${files} files` : ''} 업데이트`
        : (result.summary || '업데이트 완료'),
    },
  }
}

function isEmptyDiff(r: GitRemoteResult): boolean {
  const c = r.changedFiles ?? 0
  const i = r.insertions ?? 0
  const d = r.deletions ?? 0
  const n = r.newCommits
  // 명시적으로 0 커밋이거나, diff stat이 전부 0이면 up-to-date로 간주.
  if (n === 0) return true
  if (n === undefined && c + i + d === 0) return true
  return false
}

// op별 HUD 헤더 sub("origin/main → main" 형태)의 from/to 부분.
export function opTarget(op: RemoteOp, branch = 'main'): { from: string; to: string; sub: string } {
  if (op === 'push') {
    return { from: branch, to: `origin/${branch}`, sub: `${branch} → origin/${branch}` }
  }
  return { from: `origin/${branch}`, to: branch, sub: `origin/${branch} → ${branch}` }
}

export const OP_TITLE: Record<RemoteOp, string> = {
  pull: 'Pull',
  push: 'Push',
  fetch: 'Fetch',
  clone: 'Clone',
}
