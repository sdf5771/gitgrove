// git status --porcelain 의 XY 두 칼럼(index/working-tree)을 staged/unstaged로 분류한다.
//
// simple-git의 집계 배열(status.modified 등)은 index와 working-tree 변경을 구분하지
// 않아, 완전히 스테이징된 파일('M ' = index만 변경)도 modified에 포함시킨다. 그 결과
// 호출부가 같은 파일을 staged·unstaged 양쪽에 넣어 Stage 탭에서 중복으로 떴다.
// status.files = { path, index(X), working_dir(Y) } 는 porcelain과 1:1이라 정확하다.
//
// 규칙:
//   - X(index)에 변경이 있으면 staged.   ('?'=untracked는 제외)
//   - Y(working-tree)에 변경이 있으면 unstaged. ('?'=untracked는 'A'로 표시)
//   - 'MM'처럼 양쪽 모두 변경이면 양쪽에 표시(정당).
//   - 충돌 파일은 X/Y가 U/A/D 조합이라 별도로 unstaged에만 표시.

export interface RawFileStatus {
  path: string
  index: string        // X 칼럼
  working_dir: string  // Y 칼럼
}

export interface NumStat {
  additions: number
  deletions: number
}

export interface CategorizedFile {
  path: string
  status: string       // 'A' | 'M' | 'D'
  additions: number
  deletions: number
}

const ZERO: NumStat = { additions: 0, deletions: 0 }

// R(rename)/C(copy)/T(type change)/M → 'M', A → 'A', D → 'D'
const mapStatus = (c: string): string => (c === 'A' ? 'A' : c === 'D' ? 'D' : 'M')

export function categorizeGitStatus(
  files: RawFileStatus[],
  conflicted: string[],
  stagedStats: Map<string, NumStat>,
  unstagedStats: Map<string, NumStat>,
): { staged: CategorizedFile[]; unstaged: CategorizedFile[] } {
  const staged: CategorizedFile[] = []
  const unstaged: CategorizedFile[] = []
  const conflictedSet = new Set(conflicted)

  for (const f of files) {
    const p = f.path
    const X = f.index
    const Y = f.working_dir

    if (conflictedSet.has(p)) {
      unstaged.push({ path: p, status: 'M', ...(unstagedStats.get(p) ?? ZERO) })
      continue
    }

    // index(스테이징) 변경
    if (X !== ' ' && X !== '?') {
      staged.push({ path: p, status: mapStatus(X), ...(stagedStats.get(p) ?? ZERO) })
    }

    // working-tree(언스테이징) 변경
    if (Y === '?') {
      unstaged.push({ path: p, status: 'A', ...(unstagedStats.get(p) ?? ZERO) })
    } else if (Y !== ' ') {
      unstaged.push({ path: p, status: mapStatus(Y), ...(unstagedStats.get(p) ?? ZERO) })
    }
  }

  // 안전망: 각 리스트 내 path 중복 제거(정상 입력에선 no-op)
  const dedupe = (arr: CategorizedFile[]) =>
    arr.filter((f, i) => arr.findIndex(x => x.path === f.path) === i)

  return { staged: dedupe(staged), unstaged: dedupe(unstaged) }
}
