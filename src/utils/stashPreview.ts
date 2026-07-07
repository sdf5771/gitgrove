// 보관(stash) 전 "현재 워킹트리 변경" 프리뷰 파싱(순수 로직).
//
// 배경: Stash 관리의 "새로 보관"은 무엇이 보관될지 안 보여주고 즉시 워킹트리를 통째로
// 치웠다. 이 함수는 git status 파일 목록을 보관 대상 관점으로 나눈다:
//   - tracked: `git stash push` 가 항상 보관하는 변경(스테이지·미스테이지 tracked)
//   - untracked: 새 파일 — 기본 stash 는 안 담고 `-u` 일 때만 보관한다.
// 파일당 한 행(경로 기준)으로 접어 프리뷰를 간결하게 유지한다.

export interface StashPreviewFile {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | 'C'
  staged: boolean
}

export interface StashPreview {
  tracked: StashPreviewFile[]
  untracked: StashPreviewFile[]
}

// git porcelain XY 문자 → 표시 상태. 알 수 없으면 'M'(수정)로 폴백.
function normStatus(c: string): StashPreviewFile['status'] {
  if (c === 'A') return 'A'
  if (c === 'D') return 'D'
  if (c === 'R') return 'R'
  if (c === 'C') return 'C'
  return 'M'
}

// files: simple-git status().files (index=X, working_dir=Y).
export function buildStashPreview(
  files: Array<{ path: string; index: string; working_dir: string }>,
): StashPreview {
  const tracked: StashPreviewFile[] = []
  const untracked: StashPreviewFile[] = []
  for (const f of files ?? []) {
    const X = f.index || ' '
    const Y = f.working_dir || ' '
    if (X === '?' && Y === '?') {
      untracked.push({ path: f.path, status: 'A', staged: false })
      continue
    }
    const staged = X !== ' ' && X !== '?'
    // 표시 상태는 워킹트리 변경 우선, 없으면 인덱스 변경.
    const ch = Y !== ' ' && Y !== '?' ? Y : X
    tracked.push({ path: f.path, status: normStatus(ch), staged })
  }
  return { tracked, untracked }
}

// 주어진 프리뷰 + '새 파일 포함' 여부로 실제 보관될 게 있는지.
// tracked 변경이 있거나, untracked 를 포함하기로 했고 새 파일이 있으면 true.
export function hasStashableChanges(preview: StashPreview, includeUntracked: boolean): boolean {
  return preview.tracked.length > 0 || (includeUntracked && preview.untracked.length > 0)
}
