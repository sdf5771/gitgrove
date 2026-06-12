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

interface GitRemoteResult {
  success: boolean
  summary: string
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

// ──────────────────────────────────────────────
// Window 타입 보강
// ──────────────────────────────────────────────

interface Window {
  appAPI: {
    onUpdateAvailable: (cb: (info: { version: string; url: string }) => void) => void
    openReleaseUrl: (url: string) => void
  }
  ipcRenderer: import('electron').IpcRenderer
  gitAPI: {
    openDialog: () => Promise<string | null>
    getLog: (repoPath: string, opts?: { limit?: number; all?: boolean }) => Promise<GitCommit[]>
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
