// 원격 워크플로 순수 로직 — Pull 전략 저장/복원 + 강제 푸시(non-fast-forward) 감지.
// UI(App.tsx·RemoteManagerModal)에서 얇게 배선하고, 판정은 여기 모아 단위검증한다.

export type PullStrategy = 'merge' | 'rebase' | 'ff-only'

const PULL_STRATEGY_KEY = 'gitgrove:pullStrategy'
const VALID: PullStrategy[] = ['merge', 'rebase', 'ff-only']

// 라벨은 라이팅 가이드대로 명사형 한국어. git 전략명은 내부값으로만 유지.
export const PULL_STRATEGY_LABEL: Record<PullStrategy, string> = {
  merge: '병합',
  rebase: '리베이스',
  'ff-only': '빨리 감기만',
}

// 드롭다운 보조 설명 — "무엇이 좋아지는지"보다 동작을 담백하게.
export const PULL_STRATEGY_DESC: Record<PullStrategy, string> = {
  merge: '원격 커밋을 병합 커밋으로 합쳐요',
  rebase: '내 커밋을 원격 뒤에 다시 얹어요',
  'ff-only': '빨리 감기가 될 때만 받아요',
}

export function loadPullStrategy(): PullStrategy {
  try {
    const v = localStorage.getItem(PULL_STRATEGY_KEY)
    return v && VALID.includes(v as PullStrategy) ? (v as PullStrategy) : 'merge'
  } catch {
    return 'merge'
  }
}

export function savePullStrategy(s: PullStrategy): void {
  try {
    localStorage.setItem(PULL_STRATEGY_KEY, s)
  } catch {
    /* localStorage 접근 실패는 무시 */
  }
}

// push 거부가 non-fast-forward(원격에 내가 없는 커밋 존재)인지 에러 메시지로 판별.
// git 영문 메시지 + 한국어 번역 문구를 모두 커버한다. 진짜 에러(인증/네트워크)와 구분해
// 강제 푸시 확인 모달을 띄울지 결정한다.
//
// ⚠️ negative-guard: 보호 브랜치·pre-receive/서버 훅·권한 거부는 'rejected'가 함께 와도
// force로 해결되지 않는다(오히려 파괴적 습관 유도) → non-ff로 보지 않는다.
// 예) `! [remote rejected] main -> main (protected branch hook declined)`,
//     `(pre-receive hook declined)`, `permission denied`.
const NON_FF_BLOCKERS = /hook|protected|permission|denied|declined|unauthorized|forbidden/

export function isNonFastForwardPush(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  if (NON_FF_BLOCKERS.test(lower)) return false
  return (
    lower.includes('non-fast-forward') ||
    lower.includes('fetch first') ||
    lower.includes('(stale info)') ||
    lower.includes('rejected') ||
    message.includes('뒤처')
  )
}
