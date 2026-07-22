export interface FileEntry { p: string; s: 'M' | 'A' | 'D'; a: number; d: number }
export interface CommitLabel { text: string; type: 'head' | 'branch' | 'hotfix' | 'remote' | 'tag' }
export interface Commit {
  id: string; lane: number; msg: string; author: string; time: string
  parents: number[]; labels: CommitLabel[]
  stats: { f: number; a: number; d: number }; files: FileEntry[]
  _q?: string
}
export interface Branch { name: string; lane: number; current?: boolean; ahead?: number; behind?: number }
export interface DiffLine { t: 'hunk' | 'ctx' | 'add' | 'del'; s: string }
export interface Stash { idx: number; msg: string; branch: string; files: number; time: string }
export interface Repo { id: string; name: string; path: string; branch: string; dirty: boolean; ahead: number; behind: number }
export interface RecentRepo { name: string; path: string; lastOpened: string }
export interface Command { id: string; label: string; icon: string; cat: string; kbd: string; desc: string }
export interface BlameLine { n: number; hash: string; au: string; ac: string; t: string; c: string }
export interface PullRequest {
  id: number; title: string; author: string; initials: string; ac: string
  from: string; to: string; status: 'open' | 'merged' | 'closed'
  created: string; comments: number; additions: number; deletions: number; labels: string[]
  body: string
  reviewers: Array<{ i: string; ac: string; status: string }>
  checks: Array<{ name: string; s: 'pass' | 'fail' | 'pend' }>
  files: FileEntry[]
  threads: Array<{ id: number; author: string; i: string; ac: string; time: string; file: string | null; line: number | null; body: string }>
}
export interface ConflictFile {
  path: string; resolved: boolean
  conflicts: Array<{ id: string; resolved: boolean; choice: string | null; ours: string[]; theirs: string[] }>
}

export const COMMANDS: Command[] = [
  {id:'pull',label:'Pull',icon:'↓',cat:'Git',kbd:'⌘⇧P',desc:'원격에서 Pull'},
  {id:'push',label:'Push',icon:'↑',cat:'Git',kbd:'⌘P',desc:'원격으로 Push'},
  {id:'fetch',label:'Fetch',icon:'⟳',cat:'Git',kbd:'⌘⇧F',desc:'모든 원격 Fetch'},
  {id:'merge',label:'Merge / Rebase…',icon:'⎇',cat:'Git',kbd:'⌘M',desc:'브랜치 Merge 또는 Rebase'},
  {id:'stash',label:'Stash',icon:'⧉',cat:'Git',kbd:'⌘⇧S',desc:'작업 중 변경을 Stash'},
  {id:'tags',label:'태그 관리…',icon:'⌸',cat:'Git',kbd:'',desc:'태그 목록·생성·삭제'},
  {id:'auth',label:'인증 관리…',icon:'⚷',cat:'Git',kbd:'',desc:'SSH 키·HTTPS 자격증명 관리'},
  {id:'remotes',label:'원격 관리…',icon:'⇅',cat:'Git',kbd:'',desc:'원격 추가·이름변경·URL변경·삭제'},
  {id:'cherry',label:'Cherry-pick…',icon:'✦',cat:'Git',kbd:'',desc:'커밋 하나를 이 브랜치에 적용'},
  {id:'rebase',label:'Interactive Rebase…',icon:'⇄',cat:'Git',kbd:'⌘⇧R',desc:'최근 커밋 순서·내용 편집'},
  {id:'branch-new',label:'새 브랜치…',icon:'+',cat:'브랜치',kbd:'⌘⇧B',desc:'로컬 브랜치 새로 만들기'},
  {id:'branch-rename',label:'브랜치 이름 변경…',icon:'✎',cat:'브랜치',kbd:'',desc:'로컬 브랜치 이름 변경'},
  {id:'branch-delete',label:'브랜치 삭제…',icon:'×',cat:'브랜치',kbd:'',desc:'로컬 브랜치 삭제'},
  {id:'view-history',label:'히스토리',icon:'①',cat:'보기',kbd:'⌘1',desc:'커밋 히스토리 그래프'},
  {id:'view-stage',label:'스테이지',icon:'②',cat:'보기',kbd:'⌘2',desc:'변경을 올리고 커밋'},
  {id:'view-diff',label:'Diff 탐색기',icon:'③',cat:'보기',kbd:'⌘3',desc:'파일 Diff를 나란히 보기'},
  {id:'view-blame',label:'Git Blame',icon:'④',cat:'보기',kbd:'⌘⇧L',desc:'현재 파일의 Blame 보기'},
  {id:'settings',label:'설정…',icon:'⚙',cat:'앱',kbd:'⌘,',desc:'앱 환경설정 열기'},
]

// 브랜치 레인 색. 레인 인덱스를 LANE_COLORS.length로 modulo해 순환 적용한다
// (CommitGraph). 복잡한 그래프에서 색 반복을 줄이려 8색으로 확장(앞 4색은 기존 유지).
export const LANE_COLORS = [
  '#e6a536', // 0 gold
  '#5fb8e6', // 1 blue
  '#ff6b6b', // 2 red
  '#c39ad9', // 3 purple
  '#6fcf7c', // 4 green
  '#4ecdc4', // 5 teal
  '#f78fb3', // 6 pink
  '#ffa94d', // 7 orange
]
export const BRANCH_LANES: Record<string, number> = {'main':0,'feature/auth':1,'hotfix/login-fix':2,'feature/ui-redesign':3}
