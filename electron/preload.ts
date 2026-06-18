import { ipcRenderer, contextBridge } from 'electron'

// --------- App update bridge ---------
contextBridge.exposeInMainWorld('appAPI', {
  // 'app:update-available' 구독. 반환된 함수를 호출해 구독 해제(effect cleanup, 리스너 누수 방지).
  onUpdateAvailable: (cb: (info: { version: string; url: string; dmgUrl?: string; notes?: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { version: string; url: string; dmgUrl?: string; notes?: string }) => cb(info)
    ipcRenderer.on('app:update-available', handler)
    return () => ipcRenderer.removeListener('app:update-available', handler)
  },
  openReleaseUrl: (url: string) => ipcRenderer.send('app:open-release-url', url),
  // 옵션 1: 무서명 인앱 DMG 다운로드 → quarantine 제거 → DMG 열기. 저장 경로 반환.
  downloadUpdate: (dmgUrl: string) =>
    ipcRenderer.invoke('app:download-update', dmgUrl) as Promise<{ path: string }>,
  // 다운로드 진행률 구독. 반환된 함수를 호출해 구독 해제(effect cleanup, 리스너 누수 방지).
  onUpdateDownloadProgress: (cb: (p: { received: number; total?: number; pct?: number }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: { received: number; total?: number; pct?: number }) => cb(p)
    ipcRenderer.on('app:update-download-progress', listener)
    return () => ipcRenderer.removeListener('app:update-download-progress', listener)
  },
  // GitHub PAT 안전 저장 (safeStorage)
  githubIsEncryptionAvailable: () => ipcRenderer.invoke('github:isEncryptionAvailable') as Promise<boolean>,
  githubSetToken: (token: string) => ipcRenderer.invoke('github:setToken', token) as Promise<boolean>,
  githubGetToken: () => ipcRenderer.invoke('github:getToken') as Promise<string | null>,
  // GitLab PAT 멀티 인스턴스 안전 저장 (host→토큰 맵, safeStorage)
  gitlabIsEncryptionAvailable: () => ipcRenderer.invoke('gitlab:isEncryptionAvailable') as Promise<boolean>,
  gitlabSetToken: (host: string, token: string) => ipcRenderer.invoke('gitlab:setToken', host, token) as Promise<boolean>,
  gitlabGetToken: (host: string) => ipcRenderer.invoke('gitlab:getToken', host) as Promise<string | null>,
  gitlabListHosts: () => ipcRenderer.invoke('gitlab:listHosts') as Promise<string[]>,
  gitlabRemoveToken: (host: string) => ipcRenderer.invoke('gitlab:removeToken', host) as Promise<boolean>,

  // OS 네이티브 알림 / Dock (기능 B). 렌더러가 신규 알림 감지 시 호출.
  // 미지원/비-macOS 환경은 메인에서 graceful no-op.
  showNotification: (opts: { title: string; body: string; silent?: boolean; sound?: string }) =>
    ipcRenderer.invoke('app:show-notification', opts) as Promise<void>,
  setBadgeCount: (count: number) => ipcRenderer.invoke('app:set-badge-count', count) as Promise<void>,
  bounceDock: () => ipcRenderer.invoke('app:bounce-dock') as Promise<void>,
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
  pickDirectory: (title?: string) => ipcRenderer.invoke('git:pick-directory', title),
  isRepo: (repoPath: string) => ipcRenderer.invoke('git:is-repo', repoPath),
  clone: (url: string, parentDir: string, opts?: { shallow?: boolean; recurseSubmodules?: boolean }) => ipcRenderer.invoke('git:clone', url, parentDir, opts),
  getLog: (repoPath: string, opts?: { limit?: number; all?: boolean }) => ipcRenderer.invoke('git:log', repoPath, opts),
  getActivity: (repoPath: string, opts?: { days?: number }) => ipcRenderer.invoke('git:activity', repoPath, opts),
  getActivityBatch: (paths: string[], opts?: { days?: number }) => ipcRenderer.invoke('git:activity-batch', paths, opts),
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
  // pull/push/fetch 실시간 진행률 구독. 구독 해제 함수를 반환 → effect cleanup에서 호출(리스너 누수 방지).
  onRemoteProgress: (cb: (p: RemoteProgress) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: RemoteProgress) => cb(p)
    ipcRenderer.on('git:remote-progress', listener)
    return () => ipcRenderer.removeListener('git:remote-progress', listener)
  },
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
  // Stage 탭 파일 컨텍스트 메뉴
  revealInFinder: (absPath: string) => ipcRenderer.invoke('git:reveal-in-finder', absPath) as Promise<void>,
  openPath: (absPath: string) => ipcRenderer.invoke('git:open-path', absPath) as Promise<{ ok: boolean; error?: string }>,
  discardChanges: (repoPath: string, files: string[]) => ipcRenderer.invoke('git:discard', repoPath, files) as Promise<void>,
  addToGitignore: (repoPath: string, patterns: string[]) => ipcRenderer.invoke('git:add-to-gitignore', repoPath, patterns) as Promise<void>,
})
