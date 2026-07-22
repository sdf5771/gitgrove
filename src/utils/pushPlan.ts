// 푸시 대상(refspec) 계획(순수 로직).
//
// 배경: 맨 `git push`는 git 기본 설정 push.default=simple 을 따르는데, 현재 브랜치의
// upstream 브랜치명이 로컬 브랜치명과 다르면("main"이 "origin/develop"을 추적하는 등)
// "upstream branch does not match the name of your current branch" 로 거부한다.
// 그래서 추적 중인 upstream 이 있으면 그 브랜치로 명시 푸시(HEAD:<upstream>)하고,
// upstream 이 없으면 같은 이름의 원격 브랜치로 푸시하며 upstream 을 설정(-u)한다.

// 강제 푸시 모드. 'lease'=--force-with-lease(원격이 예상 커밋일 때만 덮어씀, 안전),
// 'force'=--force(무조건 덮어씀). 미설정=일반(무-force) 푸시(기존 동작).
export type PushForce = 'lease' | 'force'

export interface PushPlan {
  remote: string | null    // 푸시할 원격. null 이면 기본 push 폴백.
  refspec: string | null   // 'HEAD:<branch>' 형태. null 이면 기본 push 폴백.
  setUpstream: boolean     // -u (첫 푸시에서 upstream 설정)
  force?: PushForce        // 강제 푸시 모드. 미설정=일반 푸시(기존 계약).
}

export function planPush(opts: {
  currentBranch: string | null   // detached HEAD 면 null
  upstreamRemote: string | null  // branch.<cur>.remote (없으면 null)
  upstreamBranch: string | null  // branch.<cur>.merge 에서 refs/heads/ 제거 (없으면 null)
  defaultRemote: string | null   // upstream 없을 때 쓸 원격(보통 'origin')
  force?: PushForce              // 강제 푸시 모드. 미전달=일반 푸시.
}): PushPlan {
  const { currentBranch, upstreamRemote, upstreamBranch, defaultRemote, force } = opts

  // force 미전달이면 결과 객체에 force 키 자체를 넣지 않는다(기존 무-force 계약·테스트 형태 보존).
  const forcePart: { force?: PushForce } = force ? { force } : {}

  // 1) upstream 이 설정돼 있으면 그 브랜치로 명시 푸시(이름 불일치 무관).
  if (upstreamRemote && upstreamBranch) {
    return { remote: upstreamRemote, refspec: `HEAD:${upstreamBranch}`, setUpstream: false, ...forcePart }
  }

  // 2) upstream 없음 + 현재 브랜치 있음 → 같은 이름 원격 브랜치로 푸시하며 upstream 설정.
  if (currentBranch && defaultRemote) {
    return { remote: defaultRemote, refspec: `HEAD:${currentBranch}`, setUpstream: true, ...forcePart }
  }

  // 3) 그 외(detached 등)는 기본 push 로 폴백.
  return { remote: null, refspec: null, setUpstream: false, ...forcePart }
}
