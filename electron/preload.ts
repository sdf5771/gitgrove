import { ipcRenderer, contextBridge } from 'electron'

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
  getLog: (repoPath: string) => ipcRenderer.invoke('git:log', repoPath),
  getBranches: (repoPath: string) => ipcRenderer.invoke('git:branches', repoPath),
  getStatus: (repoPath: string) => ipcRenderer.invoke('git:status', repoPath),
  getDiff: (repoPath: string, filePath: string) => ipcRenderer.invoke('git:diff', repoPath, filePath),
  getFiles: (repoPath: string, commitHash: string) => ipcRenderer.invoke('git:files', repoPath, commitHash),
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
})
