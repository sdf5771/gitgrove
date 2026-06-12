import { ipcRenderer, contextBridge } from 'electron'

// --------- App update bridge ---------
contextBridge.exposeInMainWorld('appAPI', {
  onUpdateAvailable: (cb: (info: { version: string; url: string }) => void) => {
    ipcRenderer.on('app:update-available', (_e, info) => cb(info))
  },
  openReleaseUrl: (url: string) => ipcRenderer.send('app:open-release-url', url),
})

// --------- Expose ipcRenderer to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

// --------- Expose gitAPI to the Renderer process ---------
contextBridge.exposeInMainWorld('gitAPI', {
  openDialog: () => ipcRenderer.invoke('git:open-dialog'),
  getLog: (repoPath: string, opts?: { limit?: number; all?: boolean }) => ipcRenderer.invoke('git:log', repoPath, opts),
  getBranches: (repoPath: string) => ipcRenderer.invoke('git:branches', repoPath),
  getStatus: (repoPath: string) => ipcRenderer.invoke('git:status', repoPath),
  getDiff: (repoPath: string, filePath: string) => ipcRenderer.invoke('git:diff', repoPath, filePath),
  getFileDiff: (repoPath: string, filePath: string, staged: boolean) => ipcRenderer.invoke('git:file-diff', repoPath, filePath, staged),
  applyHunk: (repoPath: string, filePath: string, hunkIndex: number, reverse: boolean) => ipcRenderer.invoke('git:apply-hunk', repoPath, filePath, hunkIndex, reverse),
  getFiles: (repoPath: string, commitHash: string) => ipcRenderer.invoke('git:files', repoPath, commitHash),
  getCommitFileDiff: (repoPath: string, commitHash: string, filePath: string) => ipcRenderer.invoke('git:commit-file-diff', repoPath, commitHash, filePath),
  stage: (repoPath: string, files: string[]) => ipcRenderer.invoke('git:stage', repoPath, files),
  unstage: (repoPath: string, files: string[]) => ipcRenderer.invoke('git:unstage', repoPath, files),
  commit: (repoPath: string, message: string) => ipcRenderer.invoke('git:commit', repoPath, message),
  pull: (repoPath: string) => ipcRenderer.invoke('git:pull', repoPath),
  push: (repoPath: string) => ipcRenderer.invoke('git:push', repoPath),
  fetch: (repoPath: string) => ipcRenderer.invoke('git:fetch', repoPath),
  checkout: (repoPath: string, branch: string) => ipcRenderer.invoke('git:checkout', repoPath, branch),
  blame: (repoPath: string, filePath: string) => ipcRenderer.invoke('git:blame', repoPath, filePath),
  getRemotes: (repoPath: string) => ipcRenderer.invoke('git:remotes', repoPath),
  getConfig: (repoPath: string) => ipcRenderer.invoke('git:config-get', repoPath),
  setConfig: (repoPath: string, cfg: Partial<GitConfigResult>) => ipcRenderer.invoke('git:config-set', repoPath, cfg),
  createTag: (repoPath: string, tagName: string, commitHash: string) => ipcRenderer.invoke('git:tag-create', repoPath, tagName, commitHash),
  stashApply: (repoPath: string, index: number) => ipcRenderer.invoke('git:stash-apply', repoPath, index),
  stashDrop: (repoPath: string, index: number) => ipcRenderer.invoke('git:stash-drop', repoPath, index),
  stashList: (repoPath: string) => ipcRenderer.invoke('git:stash-list', repoPath),
  stashPush: (repoPath: string, message?: string) => ipcRenderer.invoke('git:stash-push', repoPath, message),
  stashPop: (repoPath: string, index: number) => ipcRenderer.invoke('git:stash-pop', repoPath, index),
  branchCreate: (repoPath: string, name: string, base: string, checkout: boolean) => ipcRenderer.invoke('git:branch-create', repoPath, name, base, checkout),
  branchRename: (repoPath: string, from: string, to: string) => ipcRenderer.invoke('git:branch-rename', repoPath, from, to),
  branchDelete: (repoPath: string, name: string, force: boolean) => ipcRenderer.invoke('git:branch-delete', repoPath, name, force),
  cherryPick: (repoPath: string, hash: string, noCommit: boolean) => ipcRenderer.invoke('git:cherry-pick', repoPath, hash, noCommit),
  merge: (repoPath: string, branch: string, strategy: 'merge' | 'rebase' | 'squash') => ipcRenderer.invoke('git:merge', repoPath, branch, strategy),
  commitAmend: (repoPath: string, message?: string) => ipcRenderer.invoke('git:commit-amend', repoPath, message),
  revert: (repoPath: string, hash: string) => ipcRenderer.invoke('git:revert', repoPath, hash),
  reset: (repoPath: string, mode: 'soft' | 'mixed' | 'hard', hash: string) => ipcRenderer.invoke('git:reset', repoPath, mode, hash),
  rebaseInteractive: (repoPath: string, items: Array<{ hash: string; action: string; msg: string }>) => ipcRenderer.invoke('git:rebase-interactive', repoPath, items),
})
