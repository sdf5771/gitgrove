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
  staged: Array<{ path: string; status: string }>    // status: 'M' | 'A' | 'D'
  unstaged: Array<{ path: string; status: string }>
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

// ──────────────────────────────────────────────
// Window 타입 보강
// ──────────────────────────────────────────────

interface Window {
  ipcRenderer: import('electron').IpcRenderer
  gitAPI: {
    openDialog: () => Promise<string | null>
    getLog: (repoPath: string) => Promise<GitCommit[]>
    getBranches: (repoPath: string) => Promise<GitBranchResult>
    getStatus: (repoPath: string) => Promise<GitStatusResult>
    getDiff: (repoPath: string, filePath: string) => Promise<string>
    getFiles: (repoPath: string, commitHash: string) => Promise<GitFileEntry[]>
    stage: (repoPath: string, files: string[]) => Promise<void>
    unstage: (repoPath: string, files: string[]) => Promise<void>
    commit: (repoPath: string, message: string) => Promise<void>
    pull: (repoPath: string) => Promise<GitRemoteResult>
    push: (repoPath: string) => Promise<GitRemoteResult>
    fetch: (repoPath: string) => Promise<GitRemoteResult>
    checkout: (repoPath: string, branch: string) => Promise<void>
    blame: (repoPath: string, filePath: string) => Promise<GitBlameLine[]>
  }
}
