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
  timestamp: number   // author-time (epoch seconds) — 줄 나이 히트맵용
  summary: string     // 커밋 제목 첫 줄 — blame 블록 gutter 표시용
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
  files: number       // 변경 파일 수
  additions: number   // 추가된 라인 합계
  deletions: number   // 삭제된 라인 합계
}

interface SshKeyEntry {
  name: string                 // .pub 제외 파일명(예: id_ed25519)
  pubPath: string
  privExists: boolean          // 개인키 짝 존재 여부
  type: string                 // ED25519 / RSA 4096 / ECDSA …
  fingerprint: string          // SHA256:…
  comment: string
  publicKey: string            // .pub 전체(복사용)
  hasPassphrase: boolean | null // 패스프레이즈 여부(확인 불가면 null)
}

interface GitTagEntry {
  name: string
  annotated: boolean          // 주석 태그 vs 경량 태그
  commit: string              // 가리키는 커밋 short sha
  date: string                // YYYY-MM-DD
  tagger?: string             // 주석 태그 작성자
  message?: string            // 주석 태그 메시지(subject)
  subject?: string            // 가리키는 커밋 메시지(subject)
  pushed: boolean | null      // origin 존재 여부. null=확인 불가
}

interface GitStashFile {
  path: string
  status: 'M' | 'A' | 'D' | 'R'
  additions: number
  deletions: number
}

// 보관 전 현재 워킹트리 변경 프리뷰. tracked=항상 보관, untracked=−u 일 때만.
interface StashPreviewFile {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | 'C'
  staged: boolean
}
interface StashPreviewResult {
  tracked: StashPreviewFile[]
  untracked: StashPreviewFile[]
}

// Repository Management(RM1) — per-repo 최근 N일 활동 (스파크라인·성장단계·그로브현황).
// 형태는 src/utils/repoActivity.ts 의 RepoActivity 와 동일하게 유지한다.
interface RepoActivity {
  daily: number[]           // 길이 days. index 0 = (days-1)일 전, 마지막 = 오늘 (과거→현재)
  total: number             // daily 합 = 최근 days일 커밋 수
  lastCommit: string | null // 가장 최근 커밋 상대시간(예: "2d ago") 또는 null
}

// ──────────────────────────────────────────────
// 메뉴바 Tray(상태표시줄 위젯) IPC 공유 타입
// ──────────────────────────────────────────────

// 렌더러 → 메인('tray:set-state'). 활성 레포 요약 + 최근 레포/알림 수.
// 메인이 저장 후 컨텍스트 메뉴 + setTitle(↑↓) + setToolTip 재빌드.
interface TrayState {
  hasRepo: boolean
  repoName?: string
  branch?: string
  ahead?: number
  behind?: number
  dirtyCount?: number
  recentRepos?: { name: string; path: string }[]
  notifCount?: number
}

// 메인 → 렌더러('tray:action'). 실행 주체가 렌더러인 액션을 위임.
// switch-repo는 전환 대상 path를 함께 전달.
interface TrayAction {
  type: 'fetch' | 'pull' | 'push' | 'open-notifications' | 'switch-repo'
  path?: string
}

// ──────────────────────────────────────────────
// 머지 충돌 해결 IPC 공유 타입 (ConflictEditorModal 이 소비)
// ──────────────────────────────────────────────

// 한 충돌 블록(hunk). ours/theirs 는 줄 배열(EOL 제외). diff3 base 섹션은 무시됨.
interface ConflictHunk {
  id: string        // `${path}#${i}` 형식 (파일 내 블록 순번)
  ours: string[]    // <<<<<<< ~ (||||||| 또는 =======) 사이의 줄
  theirs: string[]  // ======= ~ >>>>>>> 사이의 줄
  startLine: number // 원본 파일에서 ours 첫 줄의 1-based 줄 번호(거터·loc 표시)
}

// 충돌 파일 1개. 바이너리/읽기 실패 파일은 conflicts:[] (graceful 스킵).
interface ConflictFile {
  path: string            // repo 루트 상대경로(git 이 준 경로)
  conflicts: ConflictHunk[]
}

// 진행중 머지/리베이스 류 작업 상태.
interface MergeState {
  op: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null
  conflictedCount: number // 현재 unmerged 파일 수
}

// git:continue 결과. ok=true 면 완료. conflict=true 면 아직 충돌 남음. error 면 git 실패/진행작업 없음.
interface ContinueResult {
  ok: boolean
  conflict?: boolean
  error?: string
}

// ──────────────────────────────────────────────
// Window 타입 보강
// ──────────────────────────────────────────────

interface Window {
  appAPI: {
    // 현재 OS 플랫폼(동기 값). 'darwin' | 'win32' | 'linux' 등. 첫 페인트 전 사용 가능.
    // frontend: 'darwin'이면 네이티브 신호등 사용 → 커스텀 신호등 미렌더 + 타이틀바 좌측 패딩 확보.
    platform: NodeJS.Platform
    // 'app:update-available' 구독. 반환 함수 호출로 구독 해제(effect cleanup). dmgUrl 없으면 frontend는 openReleaseUrl 브라우저 폴백.
    onUpdateAvailable: (cb: (info: { version: string; url: string; dmgUrl?: string; notes?: string }) => void) => () => void
    openReleaseUrl: (url: string) => void
    // 메인 프로세스 콘솔 메시지 구독(디버그). 반환 함수 호출로 구독 해제. (generic ipcRenderer 브리지 대체)
    onMainMessage: (cb: (message: string) => void) => () => void
    // 비-macOS 커스텀 신호등 창 제어(win-* IPC 래핑). macOS 는 네이티브 신호등을 쓰므로 미사용.
    windowControls: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }
    // 현재 앱 버전 조회(About 탭 표시용). 메인 app.getVersion() 반환.
    getVersion: () => Promise<string>
    // 수동 업데이트 확인(About 탭). 새 버전이 있으면 updateAvailable:true + version/dmgUrl, 없거나 네트워크 실패 시 updateAvailable:false. current는 항상 현재 버전.
    checkUpdates: () => Promise<{ updateAvailable: boolean; version?: string; dmgUrl?: string; current: string }>
    // 옵션 1: 무서명 인앱 DMG 다운로드 → quarantine 제거 → DMG 열기. 성공 시 저장 경로 반환, 실패 시 reject(throw).
    downloadUpdate: (dmgUrl: string) => Promise<{ path: string }>
    // 다운로드 진행률 구독. 반환 함수 호출로 구독 해제(effect cleanup). total 모르면 pct 생략(indeterminate).
    onUpdateDownloadProgress: (cb: (p: { received: number; total?: number; pct?: number }) => void) => () => void
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
    // SSH 키 관리 (인증 관리자) — 모든 파일 접근은 ~/.ssh 하위로 제한, 셸 미경유.
    sshKeys: () => Promise<SshKeyEntry[]>
    sshTest: (host: string) => Promise<{ ok: boolean; message: string }>
    sshGenerate: (name: string, passphrase?: string, comment?: string) => Promise<{ name: string; publicKey: string }>
    sshDelete: (name: string) => Promise<void>
    // OS 네이티브 알림 / Dock (기능 B). 렌더러가 신규 알림 감지 시 호출.
    // showNotification: title/body 표시, silent로 무음, sound는 macOS 시스템 사운드 이름('Glass' 등).
    //   알림 클릭 시 메인 윈도우를 앞으로 가져옴. 미지원 환경은 graceful no-op.
    showNotification: (opts: { title: string; body: string; silent?: boolean; sound?: string }) => Promise<void>
    // Dock 배지 카운트(macOS). 0이면 배지 제거. 비-macOS는 무시.
    setBadgeCount: (count: number) => Promise<void>
    // macOS Dock 아이콘 1회 바운스(informational). 비-macOS no-op.
    bounceDock: () => Promise<void>
    // 알림 사운드 미리듣기(Settings). 화이트리스트(14종)에 있는 macOS 시스템 사운드 이름을
    // 그 소리만 즉시 재생(배너 없이). 성공 { ok:true } / 미허용·파일없음·비-macOS { ok:false, error }.
    previewSound: (name: string) => Promise<{ ok: boolean; error?: string }>
    // 메뉴바 Tray 상태 push('tray:set-state'). 메인이 컨텍스트 메뉴·타이틀(↑↓)·툴팁 재빌드.
    setTrayState: (s: TrayState) => void
    // 'tray:action'(Fetch/Pull/Push·최근 저장소 전환·알림 열기 위임) 구독. 반환 함수 호출로 구독 해제(cleanup).
    // ⚠️ 마운트 시 이 리스너를 setTrayState보다 먼저 등록할 것(메인의 큐 flush가 리스너 존재를 전제).
    onTrayAction: (cb: (a: TrayAction) => void) => () => void
  }
  // 스플래시 윈도우 전용 수신 API(스코프 한정). generic ipcRenderer 브리지 제거에 따른 대체.
  // splash.html(plain HTML)이 소비 — 렌더러 React 앱에서는 사용하지 않는다.
  splashAPI: {
    onVersion: (cb: (version: string) => void) => () => void
    onBootProgress: (cb: (payload: { pct?: number; done?: boolean }) => void) => () => void
    onDone: (cb: () => void) => () => void
  }
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
    listFiles: (repoPath: string) => Promise<string[]>
    getCommitFileDiff: (repoPath: string, commitHash: string, filePath: string) => Promise<string>
    stage: (repoPath: string, files: string[]) => Promise<void>
    unstage: (repoPath: string, files: string[]) => Promise<void>
    commit: (repoPath: string, message: string) => Promise<void>
    // strategy: 'merge'(기본, --no-rebase) · 'rebase' · 'ff-only'. 미전달=merge(기존 동작).
    pull: (repoPath: string, strategy?: 'merge' | 'rebase' | 'ff-only') => Promise<GitRemoteResult>
    // opts.force: 'lease'(--force-with-lease, 안전) · 'force'(--force). 미전달=일반 푸시(기존 동작).
    push: (repoPath: string, opts?: { force?: 'lease' | 'force' }) => Promise<GitRemoteResult>
    fetch: (repoPath: string) => Promise<GitRemoteResult>
    // pull/push/fetch 진행률 구독. 반환된 함수를 호출해 구독 해제(effect cleanup).
    onRemoteProgress: (cb: (p: RemoteProgress) => void) => () => void
    checkout: (repoPath: string, branch: string) => Promise<string>
    blame: (repoPath: string, filePath: string) => Promise<GitBlameLine[]>
    getRemotes: (repoPath: string) => Promise<GitRemoteInfo[]>
    // 원격 관리(add/remove/rename/set-url). name/url 검증 실패·git 에러는 reject(사유 먼저 문구).
    remoteAdd: (repoPath: string, name: string, url: string) => Promise<void>
    remoteRemove: (repoPath: string, name: string) => Promise<void>
    remoteRename: (repoPath: string, oldName: string, newName: string) => Promise<void>
    remoteSetUrl: (repoPath: string, name: string, url: string) => Promise<void>
    getConfig: (repoPath: string) => Promise<GitConfigResult>
    setConfig: (repoPath: string, cfg: Partial<GitConfigResult>) => Promise<void>
    createTag: (repoPath: string, tagName: string, commitHash: string, opts?: { annotated?: boolean; message?: string; push?: boolean }) => Promise<void>
    listTags: (repoPath: string) => Promise<GitTagEntry[]>
    deleteTag: (repoPath: string, tagName: string, alsoRemote?: boolean) => Promise<void>
    pushTag: (repoPath: string, tagName: string) => Promise<void>
    stashApply: (repoPath: string, index: number) => Promise<void>
    stashDrop: (repoPath: string, index: number) => Promise<void>
    stashList: (repoPath: string) => Promise<GitStashEntry[]>
    stashFiles: (repoPath: string, index: number) => Promise<GitStashFile[]>
    stashPreview: (repoPath: string) => Promise<StashPreviewResult>
    stashPush: (repoPath: string, message?: string, keepIndex?: boolean, includeUntracked?: boolean) => Promise<boolean>
    stashBranch: (repoPath: string, index: number, branchName: string) => Promise<void>
    stashFileDiff: (repoPath: string, index: number, filePath: string) => Promise<string>
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
    // Stage 탭 파일 컨텍스트 메뉴
    // OS 파일 탐색기(Finder)에서 파일 위치 표시.
    revealInFinder: (absPath: string) => Promise<void>
    // OS 기본 앱으로 파일/폴더 열기. 성공 시 { ok:true }, 실패 시 { ok:false, error }.
    openPath: (absPath: string) => Promise<{ ok: boolean; error?: string }>
    // 변경사항 되돌리기(파괴적). files=repo 루트 상대경로. 추적=checkout 원복, 미추적=삭제.
    // repoPath 밖(.. 트래버설) 경로는 skip. 전부 실패 시 throw.
    discardChanges: (repoPath: string, files: string[]) => Promise<void>
    // <repoPath>/.gitignore 에 patterns의 각 줄을 중복(trim 비교) 제외하고 append(없으면 생성).
    addToGitignore: (repoPath: string, patterns: string[]) => Promise<void>
    // 인덱스에서 파일 추적 해제(`git rm --cached`). 워킹트리 파일은 유지. 미추적 파일은 no-op.
    // .gitignore 추가 후 이미 추적 중인 파일을 status에서 실제로 제거하기 위해 함께 호출.
    untrack: (repoPath: string, files: string[]) => Promise<void>
    // 머지 충돌 해결 (ConflictEditorModal)
    // 충돌(unmerged) 파일을 읽어 hunk 목록으로 파싱. 바이너리/읽기 실패는 conflicts:[]. 충돌 없으면 [].
    getConflicts: (repoPath: string) => Promise<ConflictFile[]>
    // 한 파일의 충돌 블록을 choices('ours'|'theirs'|'both')로 치환·재구성 후 원자적 쓰기 → git add.
    // choices 길이가 실제 충돌 수와 불일치하면 reject(부분 처리 금지). 비충돌 영역 정확 보존.
    resolveConflict: (repoPath: string, file: string, choices: Array<'ours' | 'theirs' | 'both'>) => Promise<void>
    // 진행중 작업(merge/rebase/cherry-pick/revert) 감지 + 현재 unmerged 파일 수.
    getMergeState: (repoPath: string) => Promise<MergeState>
    // 진행중 작업 완료(에디터 회피). 충돌 남으면 {ok:false,conflict:true}. git 실패는 {ok:false,error}.
    continueMerge: (repoPath: string) => Promise<ContinueResult>
  }
}
