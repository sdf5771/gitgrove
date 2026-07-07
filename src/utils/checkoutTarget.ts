// 브랜치 체크아웃 대상 해석(순수 로직).
//
// 배경: 사이드바 원격 브랜치는 `origin/feature-x` 같은 원격 추적 ref 문자열로 넘어온다.
// 이를 그대로 `git checkout origin/feature-x` 하면 detached HEAD 가 되어(로컬 브랜치·추적
// 없음) 사용자가 붕 뜬다. 원격 브랜치를 고르면 원격명을 떼고 로컬 추적 브랜치를 만들어
// 전환해야 한다(`git checkout -b feature-x --track origin/feature-x`). 이 함수가 로컬/원격
// 목록을 근거로 실행할 checkout 인자와 최종 로컬 브랜치명을 계산한다.

export interface CheckoutPlan {
  // simple-git checkout() 에 넘길 인자(선행 'checkout' 동사는 제외).
  args: string[]
  // 전환 후 기대되는 로컬 브랜치명(낙관적 표시·토스트용).
  branch: string
}

// branch: 체크아웃하려는 대상(로컬명 | 'origin/foo' 같은 원격 ref | 커밋/태그).
// localBranches: 로컬 브랜치명 목록. remotes: 원격 이름 목록(예: ['origin','upstream']).
export function planCheckout(
  branch: string,
  opts: { localBranches: string[]; remotes: string[] },
): CheckoutPlan {
  const name = (branch ?? '').trim()
  const locals = opts.localBranches ?? []
  const remotes = opts.remotes ?? []

  // 1) 이미 있는 로컬 브랜치면 그대로 전환(원격 접두 해석보다 우선 — 'origin/x' 로컬 방어).
  if (locals.includes(name)) return { args: [name], branch: name }

  // 2) '<remote>/<rest>' 형태 + 실제 원격이면 로컬 추적 브랜치로 해석.
  const remote = remotes.find(r => r && name.startsWith(`${r}/`))
  if (remote) {
    const localName = name.slice(remote.length + 1)
    if (localName) {
      // 동명 로컬 브랜치가 이미 있으면 그 브랜치로 전환(추적 재설정 안 함 — 비파괴).
      if (locals.includes(localName)) return { args: [localName], branch: localName }
      // 없으면 원격을 추적하는 로컬 브랜치 생성 후 전환.
      return { args: ['-b', localName, '--track', name], branch: localName }
    }
  }

  // 3) 그 외(커밋 해시·태그·기타)는 그대로.
  return { args: [name], branch: name }
}
