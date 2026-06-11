/**
 * DAG 레인 계산 — GitKraken 스타일
 *
 * 입력: GitCommit[] 형태의 커밋 목록 (시간 역순, 최신이 index 0)
 * 출력: Map<commitId, laneNumber>
 *
 * 알고리즘:
 * - active[i] = 현재 레인 i가 기다리고 있는 커밋 id (null = 빈 레인)
 * - 각 커밋 처리 시: 자신에게 할당된 레인을 찾거나 새로 생성
 * - 첫 번째 부모: 현재 레인 계속 사용 (직선 연결)
 * - 나머지 부모: 새 레인 할당 (분기 연결)
 */
export function computeLanes(
  commits: ReadonlyArray<{ id: string; parents: string[] }>
): Map<string, number> {
  const laneOf = new Map<string, number>()
  // active[i] = 레인 i가 기다리는 커밋 id. null 이면 빈 레인
  const active: (string | null)[] = []

  /** id를 기다리는 레인을 찾거나, 없으면 빈 레인 혹은 새 레인을 생성해 반환 */
  const claimLane = (id: string): number => {
    // 이미 이 id를 기다리는 레인이 있으면 재사용
    let idx = active.indexOf(id)
    if (idx >= 0) return idx
    // 빈 레인(null) 재사용
    idx = active.indexOf(null)
    if (idx >= 0) {
      active[idx] = id
      return idx
    }
    // 새 레인 생성
    active.push(id)
    return active.length - 1
  }

  for (const c of commits) {
    // 이 커밋의 레인 확정
    const lane = claimLane(c.id)
    laneOf.set(c.id, lane)

    // 처리 완료 → 레인 해제
    active[lane] = null

    if (c.parents.length === 0) continue

    // 첫 번째 부모: 현재 레인 계속 사용 (직선 연결)
    const p0 = c.parents[0]
    if (!active.includes(p0)) {
      active[lane] = p0
    }
    // 이미 다른 레인이 p0를 기다리고 있으면 현재 레인은 빈 채로 둠 (null)

    // 두 번째 이후 부모: 새 레인 할당 (병합 연결)
    for (let i = 1; i < c.parents.length; i++) {
      const pi = c.parents[i]
      if (!active.includes(pi)) {
        claimLane(pi)
      }
    }
  }

  return laneOf
}
