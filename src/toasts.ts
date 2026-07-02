// 토스트 카탈로그 — 앱 전역 알림(notify)의 단일 출처.
//
// 흩어진 inline notify() 호출(그루 사용·영한·지속시간 제각각)을 한곳에 모아
// 브랜딩(그루 표정)·카피(docs/WRITING_GUIDE.md)·지속시간을 일관되게 강제한다.
//
// 사용: notify(...spread(TOASTS.branchSwitched('main')))
//   각 팩토리는 Toast 객체를 만들고, spread()가 DEFAULTS로 빈 칸을 채워
//   notify(type, title, msg, onClick, dur, geuru) 인자 튜플로 펼친다.
//
// 동기화 토스트(Pull·Push·Fetch·Clone)는 src/utils/syncProgress.ts mapResult()가
// 정본이라 이 카탈로그에 포함하지 않는다(이미 규칙 준수).

import type { GeuruExpr } from './components/Geuru'
import type { Notification } from './hooks/useNotifications'

// 타입별 기본 표정·지속시간 (격상은 개별 항목에서 override).
const DEFAULTS = {
  success: { geuru: 'happy', dur: 4000 },
  info: { geuru: 'idle', dur: 4000 },
  warning: { geuru: 'think', dur: 4000 },
  error: { geuru: 'conflict', dur: 8000 },
} as const satisfies Record<Notification['type'], { geuru: GeuruExpr; dur: number }>

export type Toast = {
  type: Notification['type']
  title: string
  msg?: string
  geuru?: GeuruExpr
  dur?: number
  onClick?: () => void
}

export const TOASTS = {
  // ── 브랜치 ──
  branchSwitched: (name: string): Toast => ({ type: 'success', title: `브랜치 전환 · ${name}`, geuru: 'happy', dur: 3000 }),
  branchSwitchFailed: (e: string): Toast => ({ type: 'error', title: '브랜치 전환 실패', msg: e }),
  branchNameCopied: (name: string): Toast => ({ type: 'success', title: '브랜치 이름 복사됨', msg: name, dur: 3000 }),
  // 원격 명령(영문 유지 — 툴바 버튼 라벨과 일치). 큰 성취라 merge로 격상.
  branchPushed: (name: string): Toast => ({ type: 'success', title: 'Push 완료', msg: name, geuru: 'merge' }),
  branchPushFailed: (e: string): Toast => ({ type: 'error', title: 'Push 실패', msg: e }),
  branchPulled: (name: string): Toast => ({ type: 'success', title: 'Pull 완료', msg: name, geuru: 'merge' }),
  branchPullFailed: (e: string): Toast => ({ type: 'error', title: 'Pull 실패', msg: e }),
  fetchFailed: (e: string): Toast => ({ type: 'error', title: 'Fetch 실패', msg: e }),

  // ── 스테이지/커밋 ──
  committed: (): Toast => ({ type: 'success', title: '커밋 완료', msg: '변경을 심었어요' }),
  hunkStaged: (path: string): Toast => ({ type: 'success', title: '헝크 올림', msg: path, dur: 3000 }),
  hunkUnstaged: (path: string): Toast => ({ type: 'success', title: '헝크 내림', msg: path, dur: 3000 }),
  hunkFailed: (e: string): Toast => ({ type: 'error', title: '헝크 적용 실패', msg: e }),

  // ── 병합/리베이스 ──
  merged: (): Toast => ({ type: 'success', title: '머지 완료', geuru: 'merge' }),
  cherryPicked: (hash: string): Toast => ({ type: 'success', title: '체리픽 완료', msg: hash }),
  rebased: (): Toast => ({ type: 'info', title: '리베이스 완료' }),
  conflictResolved: (): Toast => ({ type: 'success', title: '충돌 해결됨', msg: '이제 머지할 수 있어요' }),

  // ── 히스토리 ──
  reverted: (hash: string): Toast => ({ type: 'success', title: `되돌리기 · ${hash}`, msg: '되돌리기 커밋을 만들었어요', geuru: 'happy' }),
  revertFailed: (e: string): Toast => ({ type: 'error', title: '되돌리기 실패', msg: e, geuru: 'conflict' }),
  resetDone: (mode: string, hash: string): Toast => ({ type: 'warning', title: `리셋 · ${mode}`, msg: `HEAD를 ${hash}로 옮겼어요` }),
  resetFailed: (e: string): Toast => ({ type: 'error', title: '리셋 실패', msg: e, geuru: 'conflict' }),
  tagCreated: (tag: string, hash: string): Toast => ({ type: 'success', title: `태그 생성 · '${tag}'`, msg: `${tag} → ${hash}` }),
  tagFailed: (e: string): Toast => ({ type: 'error', title: '태그 생성 실패', msg: e }),
  commitLoadFailed: (e: string): Toast => ({ type: 'error', title: '커밋 로드 실패', msg: e, geuru: 'conflict' }),
  copied: (what: string, value: string): Toast => ({ type: 'success', title: `${what} 복사됨`, msg: value, dur: 3000 }),

  // ── 저장소/워크스페이스 ──
  repoAdded: (name: string): Toast => ({ type: 'success', title: '저장소 추가됨', msg: name }),
  workspaceCreated: (name: string): Toast => ({ type: 'success', title: '워크스페이스 생성', msg: name }),
  workspaceDeleted: (name: string): Toast => ({ type: 'info', title: '워크스페이스 삭제', msg: `'${name}' 삭제됨 · 저장소는 보존됐어요` }),
  comingSoon: (label: string): Toast => ({ type: 'info', title: `${label} 준비 중`, msg: '다음 버전에서 제공돼요' }),
  notARepo: (): Toast => ({ type: 'error', title: 'Git 저장소가 아니에요', msg: '.git 폴더가 없거나 삭제됐어요', geuru: 'conflict' }),

  // ── 업데이트 ──
  updateAvailable: (ver: string, onClick: () => void): Toast => ({ type: 'info', title: `GitGrove ${ver} 출시`, msg: '클릭해서 받기', onClick, dur: 8000 }),
  downloadDone: (): Toast => ({ type: 'success', title: '다운로드 완료', msg: '설치 창이 열렸어요 · 안내대로 교체해 주세요', geuru: 'merge', dur: 6000 }),
  updateFailed: (): Toast => ({ type: 'error', title: '업데이트 다운로드 실패', msg: '다시 클릭하면 재시도해요', dur: 8000 }),
} as const

// Toast → notify(...) 인자 튜플. type별 DEFAULTS로 dur·geuru의 빈 칸을 채운다.
// onClick(함수/undefined)은 4번째, dur(숫자)는 5번째로 넘어가므로
// notify의 오버로드(4번째가 함수면 onClick·숫자면 dur)와 충돌하지 않는다.
export function spread(t: Toast) {
  const d = DEFAULTS[t.type]
  return [t.type, t.title, t.msg, t.onClick, t.dur ?? d.dur, t.geuru ?? d.geuru] as const
}
