// 푸시 대상(refspec) 계획(순수 로직).
//
// 배경: 맨 `git push`는 git 기본 설정 push.default=simple 을 따르는데, 현재 브랜치의
// upstream 브랜치명이 로컬 브랜치명과 다르면("main"이 "origin/develop"을 추적하는 등)
// "upstream branch does not match the name of your current branch" 로 거부한다.
// 그래서 추적 중인 upstream 이 있으면 그 브랜치로 명시 푸시(HEAD:<upstream>)하고,
// upstream 이 없으면 같은 이름의 원격 브랜치로 푸시하며 upstream 을 설정(-u)한다.

export interface PushPlan {
  remote: string | null    // 푸시할 원격. null 이면 기본 push 폴백.
  refspec: string | null   // 'HEAD:<branch>' 형태. null 이면 기본 push 폴백.
  setUpstream: boolean     // -u (첫 푸시에서 upstream 설정)
}

export function planPush(opts: {
  currentBranch: string | null   // detached HEAD 면 null
  upstreamRemote: string | null  // branch.<cur>.remote (없으면 null)
  upstreamBranch: string | null  // branch.<cur>.merge 에서 refs/heads/ 제거 (없으면 null)
  defaultRemote: string | null   // upstream 없을 때 쓸 원격(보통 'origin')
}): PushPlan {
  const { currentBranch, upstreamRemote, upstreamBranch, defaultRemote } = opts

  // 1) upstream 이 설정돼 있으면 그 브랜치로 명시 푸시(이름 불일치 무관).
  if (upstreamRemote && upstreamBranch) {
    return { remote: upstreamRemote, refspec: `HEAD:${upstreamBranch}`, setUpstream: false }
  }

  // 2) upstream 없음 + 현재 브랜치 있음 → 같은 이름 원격 브랜치로 푸시하며 upstream 설정.
  if (currentBranch && defaultRemote) {
    return { remote: defaultRemote, refspec: `HEAD:${currentBranch}`, setUpstream: true }
  }

  // 3) 그 외(detached 등)는 기본 push 로 폴백.
  return { remote: null, refspec: null, setUpstream: false }
}
