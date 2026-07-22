import { ipcRenderer, contextBridge } from 'electron'

// --------- App update bridge ---------
contextBridge.exposeInMainWorld('appAPI', {
  // 동기 값. 첫 페인트 전에 사용 가능(깜빡임 없음). frontend가 신호등 조건부 렌더에 사용.
  // 'darwin' | 'win32' | 'linux' 등. mac이면 네이티브 신호등을 쓰므로 커스텀 신호등을 렌더하지 않음.
  platform: process.platform,
  // 'app:update-available' 구독. 반환된 함수를 호출해 구독 해제(effect cleanup, 리스너 누수 방지).
  onUpdateAvailable: (cb: (info: { version: string; url: string; dmgUrl?: string; notes?: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { version: string; url: string; dmgUrl?: string; notes?: string }) => cb(info)
    ipcRenderer.on('app:update-available', handler)
    return () => ipcRenderer.removeListener('app:update-available', handler)
  },
  openReleaseUrl: (url: string) => ipcRenderer.send('app:open-release-url', url),
  // 메인 프로세스 콘솔 메시지('main-process-message') 구독(디버그용). 반환 함수로 구독 해제.
  // (기존 generic ipcRenderer 브리지 제거에 따른 스코프 API 대체)
  onMainMessage: (cb: (message: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, message: string) => cb(message)
    ipcRenderer.on('main-process-message', listener)
    return () => ipcRenderer.removeListener('main-process-message', listener)
  },
  // 비-macOS 커스텀 신호등 창 제어(win-* IPC 래핑). macOS 는 네이티브 신호등을 쓰므로 미사용.
  // (기존 generic ipcRenderer.send('win-*') 대체 — 임의 채널 노출 제거)
  windowControls: {
    minimize: () => ipcRenderer.send('win-minimize'),
    maximize: () => ipcRenderer.send('win-maximize'),
    close: () => ipcRenderer.send('win-close'),
  },
  // 현재 앱 버전 조회(About 탭 표시용).
  getVersion: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
  // 수동 업데이트 확인(About 탭). 새 버전 유무 결과를 동기적으로 반환. 네트워크 실패 시 graceful.
  checkUpdates: () =>
    ipcRenderer.invoke('app:check-updates') as Promise<{
      updateAvailable: boolean
      version?: string
      dmgUrl?: string
      current: string
    }>,
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

  // SSH 키 관리 (인증 관리자)
  sshKeys: () => ipcRenderer.invoke('auth:ssh-keys') as Promise<SshKeyEntry[]>,
  sshTest: (host: string) => ipcRenderer.invoke('auth:ssh-test', host) as Promise<{ ok: boolean; message: string }>,
  sshGenerate: (name: string, passphrase?: string, comment?: string) => ipcRenderer.invoke('auth:ssh-generate', name, passphrase, comment) as Promise<{ name: string; publicKey: string }>,
  sshDelete: (name: string) => ipcRenderer.invoke('auth:ssh-delete', name) as Promise<void>,

  // OS 네이티브 알림 / Dock (기능 B). 렌더러가 신규 알림 감지 시 호출.
  // 미지원/비-macOS 환경은 메인에서 graceful no-op.
  showNotification: (opts: { title: string; body: string; silent?: boolean; sound?: string }) =>
    ipcRenderer.invoke('app:show-notification', opts) as Promise<void>,
  setBadgeCount: (count: number) => ipcRenderer.invoke('app:set-badge-count', count) as Promise<void>,
  bounceDock: () => ipcRenderer.invoke('app:bounce-dock') as Promise<void>,
  // 알림 사운드 미리듣기(Settings). 화이트리스트 사운드 이름만 그 소리로 즉시 재생(배너 없이).
  // 미허용/파일없음/비-macOS는 { ok:false, error } 반환(throw 안 함).
  previewSound: (name: string) =>
    ipcRenderer.invoke('app:preview-sound', name) as Promise<{ ok: boolean; error?: string }>,

  // 메뉴바 Tray(상태표시줄 위젯). 렌더러가 활성 레포 상태를 push하면 메인이 메뉴/타이틀/툴팁 재빌드.
  // ⚠️ 마운트 시 onTrayAction을 먼저 등록한 뒤 setTrayState를 호출할 것(메인이 첫 set-state로
  //    렌더러 준비를 확정해 큐잉된 위임 액션을 flush — 리스너가 먼저 있어야 유실이 없음).
  setTrayState: (s: TrayState) => ipcRenderer.send('tray:set-state', s),
  // 'tray:action' 구독(Fetch/Pull/Push·최근 저장소 전환·알림 열기 위임). 반환 함수로 구독 해제(cleanup).
  onTrayAction: (cb: (a: TrayAction) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, a: TrayAction) => cb(a)
    ipcRenderer.on('tray:action', listener)
    return () => ipcRenderer.removeListener('tray:action', listener)
  },
})

// --------- Splash bridge (스플래시 윈도우 전용, 스코프 한정) ---------
// [보안 하드닝] 기존 generic ipcRenderer 브리지(임의 채널 on/off/send/invoke 가능한 안티패턴)를
// 제거하고, 스플래시가 실제로 쓰는 수신 채널만 스코프 API 로 노출한다. 메인 창은 이 API 를 쓰지
// 않으며(존재해도 수신 전용이라 무해), 스플래시 HTML(public/splash.html)이 소비한다.
contextBridge.exposeInMainWorld('splashAPI', {
  // 'splash-version' — app.getVersion() 주입. 반환 함수로 구독 해제.
  onVersion: (cb: (version: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, version: string) => cb(version)
    ipcRenderer.on('splash-version', listener)
    return () => ipcRenderer.removeListener('splash-version', listener)
  },
  // 'boot-progress' — { pct, done }. 완료(done 또는 pct>=100) 시 스플래시가 finish 연출.
  onBootProgress: (cb: (payload: { pct?: number; done?: boolean }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { pct?: number; done?: boolean }) => cb(payload)
    ipcRenderer.on('boot-progress', listener)
    return () => ipcRenderer.removeListener('boot-progress', listener)
  },
  // 'splash-done' — 즉시 완료 신호.
  onDone: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('splash-done', listener)
    return () => ipcRenderer.removeListener('splash-done', listener)
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
  listFiles: (repoPath: string) => ipcRenderer.invoke('git:list-files', repoPath),
  getCommitFileDiff: (repoPath: string, commitHash: string, filePath: string) => ipcRenderer.invoke('git:commit-file-diff', repoPath, commitHash, filePath),
  stage: (repoPath: string, files: string[]) => ipcRenderer.invoke('git:stage', repoPath, files),
  unstage: (repoPath: string, files: string[]) => ipcRenderer.invoke('git:unstage', repoPath, files),
  commit: (repoPath: string, message: string) => ipcRenderer.invoke('git:commit', repoPath, message),
  // strategy: 'merge'(기본) · 'rebase' · 'ff-only'. 미전달=merge(기존 동작).
  pull: (repoPath: string, strategy?: 'merge' | 'rebase' | 'ff-only') => ipcRenderer.invoke('git:pull', repoPath, strategy),
  // opts.force: 'lease'(--force-with-lease) · 'force'(--force). 미전달=일반 푸시(기존 동작).
  push: (repoPath: string, opts?: { force?: 'lease' | 'force' }) => ipcRenderer.invoke('git:push', repoPath, opts),
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
  // 원격 관리(add/remove/rename/set-url). 검증 실패·git 에러는 reject(사유 먼저 문구).
  remoteAdd: (repoPath: string, name: string, url: string) => ipcRenderer.invoke('git:remote-add', repoPath, name, url) as Promise<void>,
  remoteRemove: (repoPath: string, name: string) => ipcRenderer.invoke('git:remote-remove', repoPath, name) as Promise<void>,
  remoteRename: (repoPath: string, oldName: string, newName: string) => ipcRenderer.invoke('git:remote-rename', repoPath, oldName, newName) as Promise<void>,
  remoteSetUrl: (repoPath: string, name: string, url: string) => ipcRenderer.invoke('git:remote-set-url', repoPath, name, url) as Promise<void>,
  getConfig: (repoPath: string) => ipcRenderer.invoke('git:config-get', repoPath),
  setConfig: (repoPath: string, cfg: Partial<GitConfigResult>) => ipcRenderer.invoke('git:config-set', repoPath, cfg),
  createTag: (repoPath: string, tagName: string, commitHash: string, opts?: { annotated?: boolean; message?: string; push?: boolean }) => ipcRenderer.invoke('git:tag-create', repoPath, tagName, commitHash, opts),
  listTags: (repoPath: string) => ipcRenderer.invoke('git:tags', repoPath),
  deleteTag: (repoPath: string, tagName: string, alsoRemote?: boolean) => ipcRenderer.invoke('git:tag-delete', repoPath, tagName, alsoRemote),
  pushTag: (repoPath: string, tagName: string) => ipcRenderer.invoke('git:tag-push', repoPath, tagName),
  stashApply: (repoPath: string, index: number) => ipcRenderer.invoke('git:stash-apply', repoPath, index),
  stashDrop: (repoPath: string, index: number) => ipcRenderer.invoke('git:stash-drop', repoPath, index),
  stashList: (repoPath: string) => ipcRenderer.invoke('git:stash-list', repoPath),
  stashFiles: (repoPath: string, index: number) => ipcRenderer.invoke('git:stash-files', repoPath, index),
  stashPreview: (repoPath: string) => ipcRenderer.invoke('git:stash-preview', repoPath),
  stashPush: (repoPath: string, message?: string, keepIndex?: boolean, includeUntracked?: boolean) => ipcRenderer.invoke('git:stash-push', repoPath, message, keepIndex, includeUntracked),
  stashBranch: (repoPath: string, index: number, branchName: string) => ipcRenderer.invoke('git:stash-branch', repoPath, index, branchName),
  stashFileDiff: (repoPath: string, index: number, filePath: string) => ipcRenderer.invoke('git:stash-file-diff', repoPath, index, filePath),
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
  untrack: (repoPath: string, files: string[]) => ipcRenderer.invoke('git:untrack', repoPath, files) as Promise<void>,
  // 머지 충돌 해결 (ConflictEditorModal)
  getConflicts: (repoPath: string) => ipcRenderer.invoke('git:conflicts', repoPath) as Promise<ConflictFile[]>,
  resolveConflict: (repoPath: string, file: string, choices: Array<'ours' | 'theirs' | 'both'>) => ipcRenderer.invoke('git:resolve-conflict', repoPath, file, choices) as Promise<void>,
  getMergeState: (repoPath: string) => ipcRenderer.invoke('git:merge-state', repoPath) as Promise<MergeState>,
  continueMerge: (repoPath: string) => ipcRenderer.invoke('git:continue', repoPath) as Promise<ContinueResult>,
})
