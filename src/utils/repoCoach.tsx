// 저장소 코치 배너 상태 파생 — 디자인 정본(메인 작업 뷰.html)의 SCENES를 실데이터로 매핑.
// 문구는 docs/WRITING_GUIDE.md 준수(해요체·가운뎃점·느낌표/이모지 없음·에러 사유 먼저).
// 컴포넌트와 분리해 순수 파생 로직을 vitest로 단위검증한다.
import type { ReactNode } from 'react'
import type { GeuruExpr } from '../components/Geuru'

export type CoachKind = 'conflict' | 'behind' | 'dirty' | 'clean'

export interface CoachAct {
  key: 'primary' | 'ghost'
  label: string
  onClick: () => void
  icon?: boolean
}

export interface CoachState {
  kind: CoachKind
  geuru: GeuruExpr
  title: string
  /** 부제(JSX — mono 강조 포함 가능). */
  sub: ReactNode
  acts: CoachAct[]
}

export interface RepoCoachInput {
  conflict: boolean
  behind: number
  dirty: boolean
  /** 변경 파일 수(unstaged + staged). dirty 문구에 표시. */
  changeCount: number
  /** 충돌 파일 수. 0이면 표시 생략. */
  conflictCount: number
  branch: string
}

export interface CoachHandlers {
  onPull: () => void
  onViewChanges: () => void
  onResolveConflict: () => void
  onDismiss: () => void
}

// 상태 파생. 우선순위 conflict > behind > dirty > clean.
export function deriveCoach(input: RepoCoachInput, handlers: CoachHandlers): CoachState {
  const { conflict, behind, dirty, changeCount, conflictCount, branch } = input
  if (conflict) {
    const n = conflictCount > 0 ? conflictCount : null
    return {
      kind: 'conflict',
      geuru: 'conflict',
      title: n ? `충돌난 파일 ${n}개 · 해결이 필요해요` : '충돌 · 해결이 필요해요',
      sub: <>양쪽에서 바뀐 파일이 있어요 · 충돌을 풀어 다시 심어요.</>,
      acts: [
        { key: 'primary', label: '충돌 해결', onClick: handlers.onResolveConflict },
        { key: 'ghost', label: '중단', onClick: handlers.onDismiss },
      ],
    }
  }
  if (behind > 0) {
    return {
      kind: 'behind',
      geuru: 'think',
      title: `origin보다 ${behind} 커밋 뒤처졌어요`,
      sub: <><span className="mono">{branch}</span>에 받을 커밋이 있어요 · Pull로 따라잡아요.</>,
      acts: [
        { key: 'primary', label: 'Pull 하기', onClick: handlers.onPull, icon: true },
        { key: 'ghost', label: '나중에', onClick: handlers.onDismiss },
      ],
    }
  }
  if (dirty) {
    const n = changeCount > 0 ? changeCount : null
    return {
      kind: 'dirty',
      geuru: 'idle',
      title: n ? `변경 ${n}개 · 커밋할 준비가 됐어요` : '커밋할 준비가 됐어요',
      sub: <>변경 탭에서 메시지를 적고 심어요.</>,
      acts: [{ key: 'primary', label: '변경 보기', onClick: handlers.onViewChanges }],
    }
  }
  return {
    kind: 'clean',
    geuru: 'happy',
    title: '다 정리됐어요 · 최신 상태예요',
    sub: <>변경도, 받을 커밋도 없어요 · 그루가 한숨 돌릴게요.</>,
    acts: [],
  }
}
