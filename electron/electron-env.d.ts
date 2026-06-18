/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// ──────────────────────────────────────────────
// git IPC 공유 타입
// ──────────────────────────────────────────────

interface GitCommit {
  id: string        // short hash (7자)
  fullId: string    // full hash
  msg: string       // commit subject
  author: string
  time: string      // relative time (e.g. "2m ago", "3h ago", "2d ago")
  parents: string[] // parent hashes (short)
  refs: string[]    // HEAD, branch names, tags (e.g. ["HEAD -> main", "origin/main"])
  stats: { files: number; insertions: number; deletions: number }
}

interface GitBranchResult {
  current: string
  local: Array<{ name: string; ahead: number; behind: number }>
  remote: string[]
  tags: string[]
}

interface GitStatusResult {
  staged: Array<{ path: string; status: string; additions: number; deletions: number }>
  unstaged: Array<{ path: string; status: string; additions: number; deletions: number }>
}

interface GitBlameLine {
  lineNum: number
  hash: string        // short hash (7자)
  author: string      // 작성자 이름
  authorColor: string // 작성자별 고정 색상 (hash 기반 생성)
  timeAgo: string     // 상대 시간
  content: string     // 코드 라인 내용
}

interface GitFileEntry {
  path: string
  status: 'M' | 'A' | 'D' | 'R'  // Modified / Added / Deleted / Renamed
  additions: number
  deletions: number
}

// 동기화(pull/push/fetch) 실시간 진행률 이벤트('git:remote-progress' 채널).
// backend는 simple-git가 주는 raw stage/progress에 op만 붙여 패스(가공은 frontend).
interface RemoteProgress {
  op: 'pull' | 'push' | 'fetch' | 'clone'
  stage: string       // 'remote'|'receiving'|'resolving'|'counting'|'compressing'|'writing'|'checkout' 등 raw
  progress: number    // 0~100
  processed?: number
  total?: number
}

// 원격 연산 결과(보강). 기존 success/summary는 하위호환 유지.
interface GitRemoteResult {
  success: boolean
  op: 'pull' | 'push' | 'fetch'
  summary: string
  upToDate?: boolean
  changedFiles?: number       // pull
  insertions?: number         // pull
  deletions?: number          // pull
  newCommits?: number         // pull/fetch 받은 커밋 수 (best-effort)
  pushedCommits?: number      // push 올린 커밋 수 (best-effort)
  conflict?: boolean
  conflictedFiles?: string[]
}

// 클론(CL1) 결과 — 구조화 반환. success=true면 path/name 보장, false면 errorKind/message 보장.
// errorKind: 'auth'(인증/403/자격증명) | 'notfound'(저장소 없음/404) | 'error'(그 외).
// receivedObjects/receivedBytes/fileCount는 best-effort(현재 미산출 — 옵셔널, 추후 보강 여지).
interface GitCloneResult {
  success: boolean
  path?: string
  name?: string
  receivedObjects?: number
  receivedBytes?: number
  fileCount?: number
  errorKind?: 'auth' | 'notfound' | 'error'
  message?: string
}

interface GitRemoteInfo {
  name: string   // "origin", "upstream" 등
  url: string    // "git@github.com:user/repo.git" 또는 "https://github.com/user/repo.git"
}

interface GitConfigResult {
  name: string
  email: string
  defaultBranch: string
}

interface GitStashEntry {
  index: number
  message: string
  branch: string
  time: string
}

// Repository Management(RM1) — per-repo 최근 N일 활동 (스파크라인·성장단계·그로브현황).
// 형태는 src/utils/repoActivity.ts 의 RepoActivity 와 동일하게 유지한다.
interface RepoActivity {
  daily: number[]           // 길이 days. index 0 = (days-1)일 전, 마지막 = 오늘 (과거→현재)
  total: number             // daily 합 = 최근 days일 커밋 수
  lastCommit: string | null // 가장 최근 커밋 상대시간(예: "2d ago") 또는 null
}

// ──────────────────────────────────────────────
// Window 타입 보강
// ──────────────────────────────────────────────

interface Window {
  appAPI: {
    onUpdateAvailable: (cb: (info: { version: string; url: string }) => void) => void
    openReleaseUrl: (url: string) => void
    // GitHub PAT 안전 저장 (Electron safeStorage). 미가용 환경은 localStorage 평문 fallback.
    githubIsEncryptionAvailable: () => Promise<boolean>
    githubSetToken: (token: string) => Promise<boolean>
    githubGetToken: () => Promise<string | null>
    // GitLab PAT 멀티 인스턴스 안전 저장 (host→토큰 맵, safeStorage). host는 정규화 후 키로 사용.
    gitlabIsEncryptionAvailable: () => Promise<boolean>
    gitlabSetToken: (host: string, token: string) => Promise<boolean>
    gitlabGetToken: (host: string) => Promise<string | null>
    gitlabListHosts: () => Promise<string[]>
    gitlabRemoveToken: (host: string) => Promise<boolean>
  }
  ipcRenderer: import('electron').IpcRenderer
  gitAPI: {
    openDialog: () => Promise<string | null>
    pickDirectory: (title?: string) => Promise<string | null>
    isRepo: (repoPath: string) => Promise<boolean>
    clone: (url: string, parentDir: string, opts?: { shallow?: boolean; recurseSubmodules?: boolean }) => Promise<GitCloneResult>
    getLog: (repoPath: string, opts?: { limit?: number; all?: boolean }) => Promise<GitCommit[]>
    getActivity: (repoPath: string, opts?: { days?: number }) => Promise<RepoActivity>
    getActivityBatch: (paths: string[], opts?: { days?: number }) => Promise<Record<string, RepoActivity>>
    getBranches: (repoPath: string) => Promise<GitBranchResult>
    getStatus: (repoPath: string) => Promise<GitStatusResult>
    getDiff: (repoPath: string, filePath: string) => Promise<string>
    getFileDiff: (repoPath: string, filePath: string, staged: boolean) => Promise<string>
    applyHunk: (repoPath: string, filePath: string, hunkIndex: number, reverse: boolean) => Promise<void>
    getFiles: (repoPath: string, commitHash: string) => Promise<GitFileEntry[]>
    getCommitFileDiff: (repoPath: string, commitHash: string, filePath: string) => Promise<string>
    stage: (repoPath: string, files: string[]) => Promise<void>
    unstage: (repoPath: string, files: string[]) => Promise<void>
    commit: (repoPath: string, message: string) => Promise<void>
    pull: (repoPath: string) => Promise<GitRemoteResult>
    push: (repoPath: string) => Promise<GitRemoteResult>
    fetch: (repoPath: string) => Promise<GitRemoteResult>
    // pull/push/fetch 진행률 구독. 반환된 함수를 호출해 구독 해제(effect cleanup).
    onRemoteProgress: (cb: (p: RemoteProgress) => void) => () => void
    checkout: (repoPath: string, branch: string) => Promise<void>
    blame: (repoPath: string, filePath: string) => Promise<GitBlameLine[]>
    getRemotes: (repoPath: string) => Promise<GitRemoteInfo[]>
    getConfig: (repoPath: string) => Promise<GitConfigResult>
    setConfig: (repoPath: string, cfg: Partial<GitConfigResult>) => Promise<void>
    createTag: (repoPath: string, tagName: string, commitHash: string) => Promise<void>
    stashApply: (repoPath: string, index: number) => Promise<void>
    stashDrop: (repoPath: string, index: number) => Promise<void>
    stashList: (repoPath: string) => Promise<GitStashEntry[]>
    stashPush: (repoPath: string, message?: string) => Promise<void>
    stashPop: (repoPath: string, index: number) => Promise<void>
    branchCreate: (repoPath: string, name: string, base: string, checkout: boolean) => Promise<void>
    branchRename: (repoPath: string, from: string, to: string) => Promise<void>
    branchDelete: (repoPath: string, name: string, force: boolean) => Promise<void>
    cherryPick: (repoPath: string, hash: string, noCommit: boolean) => Promise<void>
    merge: (repoPath: string, branch: string, strategy: 'merge' | 'rebase' | 'squash') => Promise<void>
    commitAmend: (repoPath: string, message?: string) => Promise<void>
    revert: (repoPath: string, hash: string) => Promise<void>
    reset: (repoPath: string, mode: 'soft' | 'mixed' | 'hard', hash: string) => Promise<void>
    rebaseInteractive: (repoPath: string, items: Array<{ hash: string; action: string; msg: string }>) => Promise<void>
  }
}
