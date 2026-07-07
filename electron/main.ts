import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, Notification } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import https from 'node:https'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import simpleGit, { CheckRepoActions } from 'simple-git'
import { categorizeGitStatus } from '../src/utils/gitStatus'
import {
  mapProgress,
  isConflictError,
  extractConflictedFiles,
  extractDiffStat,
  parseRevCount,
  computeFetchDelta,
  buildPullSummary,
  buildCloneArgs,
  classifyCloneError,
  type RemoteOp,
  type GitRemoteResult,
  type CloneOptions,
  type CloneResult,
} from '../src/utils/syncResult'
import { normalizeGitlabHost } from '../src/utils/gitlab'
import { parseRemoteUrl, isGithubHost } from '../src/utils/remoteAuth'
import { planCheckout } from '../src/utils/checkoutTarget'
import { buildStashPreview, type StashPreview } from '../src/utils/stashPreview'
import {
  parseConflicts,
  reconstruct,
  looksBinary,
  type Choice,
} from '../src/utils/conflictParse'
import { normalizeDailyCounts, type RepoActivity } from '../src/utils/repoActivity'
import {
  isAllowedUpdateHost,
  pickDmgAsset,
  buildReleaseNotes,
  computeDownloadProgress,
  safeDownloadFilename,
} from '../src/utils/appUpdate'
import { decideMaximizeAction } from './winMaximize'

// macOS GPU 프로세스 크래시 억제
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('no-sandbox')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// ──────────────────────────────────────────────
// IPC 반환 타입 정의
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

interface GitConfigResult {
  name: string
  email: string
  defaultBranch: string
}

interface GitStashEntry {
  index: number
  message: string
  branch: string
  files: number
  additions: number
  deletions: number
}

interface GitStashFile {
  path: string
  status: 'M' | 'A' | 'D' | 'R'
  additions: number
  deletions: number
}

// ──────────────────────────────────────────────
// 유틸리티: 상대 시간 변환
// ──────────────────────────────────────────────

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  const diffWk = Math.floor(diffDay / 7)
  return `${diffWk}wk ago`
}

// ──────────────────────────────────────────────
// 윈도우
// ──────────────────────────────────────────────

let win: BrowserWindow | null
let splash: BrowserWindow | null = null
let splashCreatedAt = 0

// ──────────────────────────────────────────────
// 업데이트 체크 주기/포커스/디듀프 상태 (기능 A)
// ──────────────────────────────────────────────
// 주기 체크 핸들(앱 종료/모든 창 닫힘 시 정리). focus 체크는 throttle용 마지막 시각.
// lastNotifiedVersion: 같은 버전으로 이미 'app:update-available'를 보냈으면 재전송 skip
// (주기/포커스 체크가 동일 버전을 반복 send해 시작 토스트가 매번 뜨는 것 방지).
let updateCheckInterval: ReturnType<typeof setInterval> | null = null
let lastUpdateCheckAt = 0
let lastNotifiedVersion: string | null = null

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6시간
const UPDATE_FOCUS_THROTTLE_MS = 30 * 60 * 1000      // 포커스 체크 최소 간격 30분

// 스플래시 최소 표시시간 / 페이드아웃 시간 (깜빡임 방지 + 모션 가이드 일치)
const SPLASH_MIN_MS = 1200
const SPLASH_FADE_MS = 180

// 별도 frameless·투명 스플래시 윈도우 (방식 A)
function createSplashWindow() {
  splash = new BrowserWindow({
    width: 560,
    height: 360,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    show: false,
    // backgroundColor 지정 금지(투명)
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })
  splashCreatedAt = Date.now()

  const showSplash = () => {
    if (splash && !splash.isDestroyed() && !splash.isVisible()) {
      splash.show()
      // 동적 버전 주입 (시안의 정적 v1.7.0 대체)
      splash.webContents.send('splash-version', app.getVersion())
    }
  }
  // ready-to-show가 정상이면 그때, 투명 윈도우에서 늦거나 안 떠도
  // did-finish-load로 백업 표시 (둘 중 먼저 — show()는 idempotent)
  splash.once('ready-to-show', showSplash)
  splash.webContents.once('did-finish-load', showSplash)

  if (VITE_DEV_SERVER_URL) {
    splash.loadURL(`${VITE_DEV_SERVER_URL}/splash.html`)
  } else {
    splash.loadFile(path.join(RENDERER_DIST, 'splash.html'))
  }
}

// 메인 준비 완료 → 스플래시 완료 연출 후 메인 표시로 전환
function finishSplashAndShow() {
  if (!win) return

  const reveal = () => {
    if (splash && !splash.isDestroyed()) {
      // 완료 신호 → 100% + 페이드아웃(스플래시 내부 CSS transition)
      splash.webContents.send('boot-progress', { pct: 100, done: true })
      setTimeout(() => {
        if (splash && !splash.isDestroyed()) splash.destroy()
        splash = null
        win?.show()
      }, SPLASH_FADE_MS)
    } else {
      win?.show()
    }
  }

  // 최소 표시시간 보장 — 생성 시점 기준으로 측정한다.
  // (prod에선 메인이 로컬 asar라 빨리 떠서, splash가 아직 안 보였는데도
  //  곧바로 destroy되던 버그를 막는다 — splash가 ~SPLASH_MIN_MS 동안 보이게)
  const elapsed = splashCreatedAt ? Date.now() - splashCreatedAt : SPLASH_MIN_MS
  const wait = Math.max(0, SPLASH_MIN_MS - elapsed)
  if (wait > 0) setTimeout(reveal, wait)
  else reveal()
}

function createWindow() {
  // macOS는 네이티브 신호등(traffic lights)을 사용하고(titleBarStyle: 'hiddenInset'),
  // 그 외 플랫폼(win/linux)은 네이티브 신호등이 없으므로 기존 frameless + 커스텀
  // 신호등(win-* IPC)을 유지한다. 두 모드는 상호 배타적이다(hiddenInset과 frame:false
  // 동시 사용 시 신호등이 표시되지 않음).
  const isMac = process.platform === 'darwin'
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0d1220',
    icon: path.join(process.env.VITE_PUBLIC, 'gitgrove-icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
    // 타이틀바 높이 40px 기준 신호등 클러스터 수직 중앙 근사값(시각 미세조정은 QA 단계).
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 13 } }
      : { frame: false }),
  })

  // 윈도우 컨트롤 IPC
  ipcMain.on('win-minimize', () => win?.minimize())
  // 최대화 토글. 패키징된 prod 앱(고유 번들ID)에선 macOS 윈도우 상태복원/zoom과
  // 맞물려 한 번의 클릭이 maximize↔unmaximize를 여러 번 토글해 창이 "커졌다 줄었다"
  // 반복하는 문제가 보고됨(dev는 Electron 기본 번들ID라 미발생). 짧은 잠금으로
  // 연속 토글을 한 번으로 묶고, 풀스크린이면 먼저 해제한다.
  let maxToggleLock = false
  ipcMain.on('win-maximize', () => {
    if (!win) return
    const action = decideMaximizeAction({
      locked: maxToggleLock,
      isFullScreen: win.isFullScreen(),
      isMaximized: win.isMaximized(),
    })
    if (action === 'none') return
    // 단일 액션을 확정했으므로 잠금을 켜 연속 토글을 한 번으로 묶는다(코얼레싱).
    maxToggleLock = true
    setTimeout(() => { maxToggleLock = false }, 300)
    if (action === 'exit-fullscreen') win.setFullScreen(false)
    else if (action === 'unmaximize') win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('win-close', () => win?.close())

  // 메인 렌더러가 준비되면 스플래시를 닫고 메인 윈도우 표시
  win.once('ready-to-show', () => {
    finishSplashAndShow()
  })

  // 안전장치(폴백): ready-to-show가 어떤 이유로든 안 떠도 메인 윈도우가
  // 영원히 숨지 않게 한다. (show:false라 이 보장이 없으면 앱이 빈 채로 멈춤)
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) finishSplashAndShow()
  }, 8000)

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
    // 업데이트 체크 — 로드 후 3초 뒤 (UX 방해 최소화). 이후 주기 체크 스케줄.
    setTimeout(() => {
      checkForUpdates()
      scheduleUpdateChecks()
    }, 3000)
  })

  // 창 포커스 시 업데이트 체크 — 단, 마지막 체크로부터 30분 경과 시에만(throttle).
  // 재시작 없이 새 버전을 빠르게 감지하되, 잦은 포커스로 API를 두드리지 않게 한다.
  win.on('focus', () => {
    if (Date.now() - lastUpdateCheckAt >= UPDATE_FOCUS_THROTTLE_MS) {
      checkForUpdates()
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// ──────────────────────────────────────────────
// git IPC 핸들러
// ──────────────────────────────────────────────

// git:open-dialog — 폴더 선택 다이얼로그
ipcMain.handle('git:open-dialog', async () => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Open Git Repository',
  })
  return result.canceled ? null : result.filePaths[0]
})

// git:pick-directory — 범용 폴더 선택 다이얼로그 (Clone 대상 부모 폴더 등)
ipcMain.handle('git:pick-directory', async (_event, title?: string) => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: title || 'Select Folder',
  })
  return result.canceled ? null : result.filePaths[0]
})

// git:is-repo — 경로가 실제 Git 저장소 루트인지 검사(.git 존재 여부).
// 빈 디렉토리·.git 삭제된 폴더·존재하지 않는 경로를 모두 false로 거른다.
// IS_REPO_ROOT를 써서 상위 폴더의 .git을 잘못 잡는(false positive) 것도 방지.
ipcMain.handle('git:is-repo', async (_event, repoPath: string): Promise<boolean> => {
  try {
    if (!repoPath || !fs.existsSync(repoPath)) return false
    return await simpleGit(repoPath).checkIsRepo(CheckRepoActions.IS_REPO_ROOT)
  } catch {
    return false
  }
})

// 원격 URL(https / ssh)에서 저장소 이름(.git 제외)을 추출
function deriveRepoName(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '').replace(/\.git$/i, '')
  const seg = trimmed.split(/[/:]/).pop() ?? ''
  return seg.trim()
}

// git:clone — 원격 저장소를 parentDir 아래의 동명 폴더로 클론
//   진행률을 'git:remote-progress'(op:'clone') 채널로 스트리밍(pull/push/fetch와 공유).
//   성공/실패를 구조화 CloneResult로 반환(실패도 throw 대신 errorKind 부착) →
//   frontend가 auth(토큰칸)/notfound(URL수정)/error로 모달 분기 가능.
//   단, 입력 검증 실패(URL 파싱 불가/폴더 충돌)는 즉시 throw(클론 시도 전 사용자 입력 문제).
ipcMain.handle('git:clone', async (event, url: string, parentDir: string, opts?: CloneOptions): Promise<CloneResult> => {
  const name = deriveRepoName(url)
  if (!name) throw new Error('저장소 URL에서 이름을 추출할 수 없습니다.')
  const target = path.join(parentDir, name)
  if (fs.existsSync(target)) throw new Error(`이미 '${name}' 폴더가 존재합니다.`)
  try {
    // pull/push/fetch와 동일한 progress 핸들러 패턴(remoteGit). clone은 git이
    // counting/compressing/receiving/resolving/checkout 단계를 보고하므로 stage가 그대로 흐름.
    const git = simpleGit({
      baseDir: parentDir,
      progress(ev) {
        if (event.sender.isDestroyed()) return
        event.sender.send('git:remote-progress', mapProgress('clone', ev))
      },
    })
    await git.clone(url, target, buildCloneArgs(opts))
    return { success: true, path: target, name }
  } catch (err) {
    // 실패 시 부분 클론 잔여 폴더 정리
    try { if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true }) } catch { /* ignore */ }
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, errorKind: classifyCloneError(message), message }
  }
})

// git:log — 커밋 로그 조회 (최대 50개)
ipcMain.handle('git:log', async (_event, repoPath: string, opts?: { limit?: number; all?: boolean }): Promise<GitCommit[]> => {
  const git = simpleGit(repoPath)

  const limit = Math.max(1, opts?.limit ?? 50)
  const all = opts?.all ?? false

  // 모든 핸들러가 공유하는 로그 범위 인자 (limit / 전체 브랜치 여부)
  const rangeArgs = [`--max-count=${limit}`]
  if (all) rangeArgs.push('--all')

  // 커밋 로그 (stat 포함)
  const log = await git.log([
    ...rangeArgs,
    '--stat',
    '--decorate=full',
  ])

  // parents 별도 조회: short hash 배열 맵 (hash → parents[])
  const parentLines = await git.raw([
    'log',
    ...rangeArgs,
    '--pretty=format:%h %P',
  ])
  const parentMap = new Map<string, string[]>()
  for (const line of parentLines.trim().split('\n')) {
    if (!line.trim()) continue
    const parts = line.trim().split(/\s+/)
    const shortHash = parts[0]
    const parents = parts.slice(1).map(p => p.slice(0, 7))
    parentMap.set(shortHash, parents)
  }

  return log.all.map((entry): GitCommit => {
    const shortHash = entry.hash.slice(0, 7)

    // refs 파싱 (decorate=full 결과 예: "refs/heads/main, refs/remotes/origin/main")
    const refs: string[] = []
    if (entry.refs) {
      for (const raw of entry.refs.split(',')) {
        const r = raw.trim()
        if (!r) continue
        if (r.startsWith('HEAD -> refs/heads/')) {
          refs.push(`HEAD -> ${r.replace('HEAD -> refs/heads/', '')}`)
        } else if (r === 'HEAD') {
          refs.push('HEAD')
        } else if (r.startsWith('refs/heads/')) {
          refs.push(r.replace('refs/heads/', ''))
        } else if (r.startsWith('refs/remotes/')) {
          refs.push(r.replace('refs/remotes/', ''))
        } else if (r.startsWith('tag: refs/tags/')) {
          refs.push(r.replace('tag: refs/tags/', ''))
        } else {
          refs.push(r)
        }
      }
    }

    // stats 파싱 (simple-git의 diff 필드)
    const diff = (entry as unknown as { diff?: { changed: number; insertions: number; deletions: number } }).diff
    const stats = {
      files: diff?.changed ?? 0,
      insertions: diff?.insertions ?? 0,
      deletions: diff?.deletions ?? 0,
    }

    return {
      id: shortHash,
      fullId: entry.hash,
      msg: entry.message,
      author: entry.author_name,
      time: relativeTime(new Date(entry.date)),
      parents: parentMap.get(shortHash) ?? [],
      refs,
      stats,
    }
  })
})

// git:activity — per-repo 최근 days일 일별 커밋 활동 (Repository Management 카드용)
//
// 현재 HEAD 기준(전체 브랜치 X) 최근 days일 커밋을 일별로 집계해 길이 days 배열(과거→현재)로
// 반환한다. 빈/신규/커밋없음/비-git/에러 경로는 throw하지 않고 안전 폴백(전부 0)을 돌려준다.
// 정규화·성장단계·버킷 경계 로직은 src/utils/repoActivity.ts 순수 함수로 분리(단위테스트).
const EMPTY_ACTIVITY = (days: number): RepoActivity => ({
  daily: Array(days).fill(0),
  total: 0,
  lastCommit: null,
})

async function computeActivity(repoPath: string, days: number): Promise<RepoActivity> {
  const git = simpleGit(repoPath)

  // committer date(%cd) 기준 short date(YYYY-MM-DD). --since로 범위 제한해 가볍게.
  // --no-color/--no-pager 불필요 (raw는 plumbing). HEAD 기준이라 --all/--branches 안 줌.
  const out = await git.raw([
    'log',
    `--since=${days} days ago`,
    '--pretty=format:%cd',
    '--date=short',
  ])

  const dates = out.split('\n').map(s => s.trim()).filter(Boolean)
  const daily = normalizeDailyCounts(dates, days)
  const total = daily.reduce((a, b) => a + b, 0)

  // 가장 최근 커밋 시각 → 상대시간. (없으면 null)
  let lastCommit: string | null = null
  try {
    const iso = (await git.raw([
      'log', '-1', '--pretty=format:%cI',
    ])).trim()
    if (iso) lastCommit = relativeTime(new Date(iso))
  } catch {
    // ignore — lastCommit는 부가정보
  }

  return { daily, total, lastCommit }
}

ipcMain.handle('git:activity', async (_event, repoPath: string, opts?: { days?: number }): Promise<RepoActivity> => {
  const days = Math.max(1, Math.floor(opts?.days ?? 14))
  try {
    return await computeActivity(repoPath, days)
  } catch {
    // 빈/신규/커밋없음/비-git/에러 → 카드가 "조용" 상태로 안전하게 폴백
    return EMPTY_ACTIVITY(days)
  }
})

// git:activity-batch — 여러 repo를 한 번에 조회(호출부 N+1 완화).
// 각 repo 실패가 전체를 막지 않게 allSettled. 입력 paths 순서대로 결과 반환.
ipcMain.handle('git:activity-batch', async (_event, paths: string[], opts?: { days?: number }): Promise<Record<string, RepoActivity>> => {
  const days = Math.max(1, Math.floor(opts?.days ?? 14))
  const list = Array.isArray(paths) ? paths : []
  const results = await Promise.allSettled(list.map(p => computeActivity(p, days)))
  const map: Record<string, RepoActivity> = {}
  list.forEach((p, i) => {
    const r = results[i]
    map[p] = r.status === 'fulfilled' ? r.value : EMPTY_ACTIVITY(days)
  })
  return map
})

// git:branches — 브랜치 목록 조회
ipcMain.handle('git:branches', async (_event, repoPath: string): Promise<GitBranchResult> => {
  const git = simpleGit(repoPath)

  const branchSummary = await git.branch(['--all', '--verbose'])

  // 태그 조회
  let tags: string[] = []
  try {
    const tagResult = await git.tags()
    tags = tagResult.all
  } catch {
    tags = []
  }

  const local: Array<{ name: string; ahead: number; behind: number }> = []
  const remote: string[] = []

  for (const [name, details] of Object.entries(branchSummary.branches)) {
    if (details.name.startsWith('remotes/')) {
      // HEAD 포인터 제외
      if (!details.name.includes('HEAD')) {
        remote.push(details.name.replace(/^remotes\//, ''))
      }
    } else {
      let ahead = 0
      let behind = 0
      try {
        const aheadStr = await git.raw(['rev-list', '--count', `origin/${name}..${name}`])
        ahead = parseInt(aheadStr.trim(), 10) || 0
      } catch { ahead = 0 }
      try {
        const behindStr = await git.raw(['rev-list', '--count', `${name}..origin/${name}`])
        behind = parseInt(behindStr.trim(), 10) || 0
      } catch { behind = 0 }
      local.push({ name, ahead, behind })
    }
  }

  return {
    current: branchSummary.current,
    local,
    remote,
    tags,
  }
})

// git:status — 워킹트리 상태 조회 (파일별 additions/deletions 포함)
ipcMain.handle('git:status', async (_event, repoPath: string): Promise<GitStatusResult> => {
  const git = simpleGit(repoPath)

  // status + numstat 병렬 조회
  const [status, unstagedNumstatRaw, stagedNumstatRaw] = await Promise.all([
    git.status(),
    git.raw(['diff', '--numstat']).catch(() => ''),
    git.raw(['diff', '--cached', '--numstat']).catch(() => ''),
  ])

  // numstat 파싱: "additions\tdeletions\tpath"
  // binary 파일은 "-\t-\tpath" → parseInt 결과 NaN → || 0 으로 처리
  const parseNumstat = (raw: string): Map<string, { additions: number; deletions: number }> => {
    const m = new Map<string, { additions: number; deletions: number }>()
    for (const line of raw.trim().split('\n')) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      if (parts.length < 3) continue
      const addStr = parts[0]
      const delStr = parts[1]
      const filePath = parts.slice(2).join('\t')
      if (!filePath) continue
      m.set(filePath, {
        additions: parseInt(addStr) || 0,
        deletions: parseInt(delStr) || 0,
      })
    }
    return m
  }

  const unstagedStats = parseNumstat(unstagedNumstatRaw)
  const stagedStats = parseNumstat(stagedNumstatRaw)

  // porcelain의 XY 두 칼럼(index/working-tree)으로 staged/unstaged를 분리한다.
  // (simple-git 집계 배열은 두 칼럼을 구분하지 못해 fully-staged 파일이 중복됐음 — gitStatus.ts 참고)
  return categorizeGitStatus(status.files, status.conflicted, stagedStats, unstagedStats)
})

// git:diff — 파일 diff 조회
ipcMain.handle('git:diff', async (_event, repoPath: string, filePath: string): Promise<string> => {
  const git = simpleGit(repoPath)

  // staged diff 먼저 시도
  const stagedDiff = await git.diff(['--cached', '--', filePath])
  if (stagedDiff.trim()) return stagedDiff

  // unstaged diff 시도
  const unstagedDiff = await git.diff(['--', filePath])
  return unstagedDiff
})

// git:commit-file-diff — 특정 커밋의 특정 파일 diff 조회
ipcMain.handle('git:commit-file-diff', async (_event, repoPath: string, commitHash: string, filePath: string): Promise<string> => {
  const git = simpleGit(repoPath)
  const result = await git.raw(['diff-tree', '--no-commit-id', '-r', '-p', commitHash, '--', filePath])
  return result
})

// git:files — 특정 커밋의 변경 파일 목록 조회
ipcMain.handle('git:files', async (_event, repoPath: string, commitHash: string): Promise<GitFileEntry[]> => {
  const git = simpleGit(repoPath)

  const [numstatRaw, namestatRaw] = await Promise.all([
    git.raw(['diff-tree', '--no-commit-id', '-r', '--numstat', commitHash]),
    git.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', commitHash]),
  ])

  // path → status 맵 구성
  const statusMap = new Map<string, 'M' | 'A' | 'D' | 'R'>()
  namestatRaw.trim().split('\n').filter(l => l.trim()).forEach(line => {
    const parts = line.split('\t')
    const statusChar = parts[0]?.[0] ?? 'M'
    const filePath = parts[1] || ''
    const s: 'M' | 'A' | 'D' | 'R' =
      statusChar === 'A' ? 'A' :
      statusChar === 'D' ? 'D' :
      statusChar === 'R' ? 'R' : 'M'
    statusMap.set(filePath, s)
  })

  return numstatRaw.trim().split('\n').filter(l => l.trim()).map(line => {
    const [addStr, delStr, filePath] = line.split('\t')
    return {
      path: filePath || '',
      status: statusMap.get(filePath || '') ?? 'M',
      additions: parseInt(addStr) || 0,
      deletions: parseInt(delStr) || 0,
    }
  })
})

// git:stage — 파일 staged 처리 (git add)
ipcMain.handle('git:stage', async (_event, repoPath: string, files: string[]): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.add(files)
})

// git:unstage — 파일 unstaged 처리 (git restore --staged)
ipcMain.handle('git:unstage', async (_event, repoPath: string, files: string[]): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.raw(['restore', '--staged', ...files])
})

// git:commit — 커밋 생성 (git commit -m)
ipcMain.handle('git:commit', async (_event, repoPath: string, message: string): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.commit(message)
})

// git:file-diff — 특정 파일의 diff 조회 (staged 여부 명시)
//   staged=false → 워킹트리(index 대비) diff,  staged=true → index(HEAD 대비) diff
ipcMain.handle('git:file-diff', async (_event, repoPath: string, filePath: string, staged: boolean): Promise<string> => {
  const git = simpleGit(repoPath)
  const args = staged ? ['--cached', '--', filePath] : ['--', filePath]
  const diff = await git.diff(args)
  if (diff) return diff

  // diff가 비었고 unstaged 조회인 경우, 신규(untracked) 파일일 수 있음 →
  // index에 없어 일반 diff가 빈 문자열을 반환하므로 전체 내용을 added(+) diff로 생성.
  if (!staged) {
    const status = await git.status()
    if (status.not_added.includes(filePath)) {
      // --no-index는 차이가 있으면 exit code 1을 내며 simple-git이 reject하지만,
      // 그 에러 객체에 diff 본문이 담겨 오므로 회수한다. /dev/null과 비교해 전체를 added로 표현.
      try {
        return await git.raw(['diff', '--no-index', '--', '/dev/null', filePath])
      } catch (err: unknown) {
        const e = err as { stdout?: string; message?: string }
        if (typeof e.stdout === 'string' && e.stdout) return e.stdout
        if (typeof e.message === 'string' && e.message) return e.message
        throw err
      }
    }
  }
  return diff
})

// unified diff 원본에서 헤더 + 지정 인덱스의 단일 hunk만 추출해 패치 생성
function buildHunkPatch(raw: string, hunkIndex: number): string | null {
  const lines = raw.split('\n')
  const header: string[] = []
  let i = 0
  // 첫 '@@' 이전까지가 파일 헤더 (diff --git / index / --- / +++ 등)
  for (; i < lines.length; i++) {
    if (lines[i].startsWith('@@')) break
    header.push(lines[i])
  }
  if (header.length === 0) return null

  // 나머지를 hunk 단위로 분리
  const hunks: string[][] = []
  let cur: string[] | null = null
  for (; i < lines.length; i++) {
    const l = lines[i]
    if (l.startsWith('@@')) {
      if (cur) hunks.push(cur)
      cur = [l]
    } else if (cur) {
      cur.push(l)
    }
  }
  if (cur) hunks.push(cur)

  if (hunkIndex < 0 || hunkIndex >= hunks.length) return null

  // 선택한 hunk의 후행 빈 줄 제거 (다음 hunk 분리 과정에서 생기는 잔여 줄)
  const body = [...hunks[hunkIndex]]
  while (body.length > 0 && body[body.length - 1] === '') body.pop()

  let patch = [...header, ...body].join('\n')
  if (!patch.endsWith('\n')) patch += '\n'
  return patch
}

// git:apply-hunk — 단일 hunk를 stage(reverse=false) / unstage(reverse=true)
//   git add -p / git reset -p 의 hunk 단위 동작에 해당
ipcMain.handle('git:apply-hunk', async (_event, repoPath: string, filePath: string, hunkIndex: number, reverse: boolean): Promise<void> => {
  const git = simpleGit(repoPath)
  // staging은 워킹트리 diff, unstaging은 index diff를 패치 소스로 사용
  const diffArgs = reverse ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath]
  const raw = await git.raw(diffArgs)
  const patch = buildHunkPatch(raw, hunkIndex)
  if (!patch) throw new Error('적용할 hunk를 찾을 수 없습니다')

  const tmp = path.join(os.tmpdir(), `gitgrove-hunk-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`)
  fs.writeFileSync(tmp, patch, 'utf8')
  try {
    const applyArgs = ['apply', '--cached']
    if (reverse) applyArgs.push('--reverse')
    applyArgs.push(tmp)
    await git.raw(applyArgs)
  } finally {
    try { fs.unlinkSync(tmp) } catch { /* ignore */ }
  }
})

// ──────────────────────────────────────────────
// 원격 연산 / 브랜치 체크아웃 IPC 핸들러
// ──────────────────────────────────────────────

// GitRemoteResult/RemoteProgress 타입과 가공 로직은 ../src/utils/syncResult 로 분리
// (vitest 단위테스트 대상). 핸들러는 simpleGit progress 핸들러를 통해 진행률을
// 'git:remote-progress' 채널로 스트리밍하고, 결과를 best-effort로 보강한다.

// ── GIT_ASKPASS 기반 HTTPS 인증 주입 ───────────────────────────────────────
// push/pull/fetch 는 provider(GitHub/GitLab) 구분 없이 그 저장소의 origin 으로 그대로
// 실행되고, 인증은 git 에 위임된다. HTTPS 원격에서 OS 키체인에 자격증명이 없으면
// (대표적으로 GitLab) 인증이 막혀 "GitLab 만 푸시가 안 되는" 증상이 났다 → 앱이 저장한
// host 별 토큰을 GIT_ASKPASS 헬퍼로 git 에 건네준다. 토큰은 원격 URL·.git/config 에
// 남기지 않고(평문 유출 방지) 자식 프로세스 env 로만 전달한다.
// (simple-git 은 env 의 GIT_ASKPASS 를 기본 차단하므로 unsafe.allowUnsafeAskPass 로 허용.)

let askpassScriptPath: string | null = null

// askpass 헬퍼 스크립트를 tmp(공백 없는 경로)에 1회 생성. git 이 프롬프트 문자열을 argv[1]
// 로 넘기면 Username* 이면 사용자명, 그 외(Password*)면 토큰을 stdout 으로 출력한다. 값은
// env(GG_ASKPASS_USER/PASS)로 전달 — git 이 askpass 자식 프로세스에 env 를 상속시킨다.
function ensureAskpassScript(): string | null {
  try {
    if (askpassScriptPath && fs.existsSync(askpassScriptPath)) return askpassScriptPath
    const p = path.join(os.tmpdir(), 'gitgrove-askpass.sh')
    const script = [
      '#!/bin/sh',
      'case "$1" in',
      "  *[Uu]sername*) printf '%s' \"$GG_ASKPASS_USER\" ;;",
      "  *) printf '%s' \"$GG_ASKPASS_PASS\" ;;",
      'esac',
      '',
    ].join('\n')
    fs.writeFileSync(p, script, { mode: 0o700 })
    fs.chmodSync(p, 0o700)
    askpassScriptPath = p
    return p
  } catch {
    return null
  }
}

// 원격 host 에 대응하는 저장 토큰 조회. github.com → github 토큰 파일, 그 외 → gitlab host 맵.
function tokenForRemoteHost(host: string): string | null {
  try {
    if (isGithubHost(host)) {
      if (!safeStorage.isEncryptionAvailable()) return null
      const file = githubTokenFilePath()
      if (!fs.existsSync(file)) return null
      return safeStorage.decryptString(fs.readFileSync(file)) || null
    }
    const key = normalizeGitlabHost(host)
    if (!key) return null
    return readGitlabTokenMap()[key] ?? null
  } catch {
    return null
  }
}

// push 대상 원격 URL 판정: 현재 브랜치의 tracking remote(없으면 origin, 없으면 첫 원격).
async function resolvePushRemoteUrl(repoPath: string): Promise<string | null> {
  try {
    const g = simpleGit(repoPath)
    const remotes = await g.getRemotes(true)
    if (remotes.length === 0) return null
    let remoteName = 'origin'
    try {
      const branch = (await g.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      if (branch && branch !== 'HEAD') {
        const r = (await g.raw(['config', '--get', `branch.${branch}.remote`])).trim()
        if (r) remoteName = r
      }
    } catch { /* tracking 설정 없음 → origin */ }
    const chosen = remotes.find(r => r.name === remoteName)
      ?? remotes.find(r => r.name === 'origin')
      ?? remotes[0]
    return chosen?.refs?.push || chosen?.refs?.fetch || null
  } catch {
    return null
  }
}

// 진행률 + (가능하면) HTTPS 토큰 인증까지 배선한 simpleGit 인스턴스.
// HTTPS 원격 + 저장 토큰이 있으면 GIT_ASKPASS 로 자격증명을 주입한다. SSH·토큰 없음이면
// 진행률만. 인증 실패 시 무한 대기(HUD 무한 스핀) 방지를 위해 GIT_TERMINAL_PROMPT=0 을 항상 건다.
async function remoteGit(repoPath: string, op: RemoteOp, event: Electron.IpcMainInvokeEvent) {
  // 상속된 위험 키 제거 + 프롬프트 비활성(tty 없는 프로세스에서 대기 hang 방지).
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of UNSAFE_INHERITED_ENV_KEYS) delete env[key]
  env.GIT_TERMINAL_PROMPT = '0'

  // HTTPS 원격이면 host 토큰을 askpass 로 주입 시도(best-effort — 실패해도 키체인/SSH 로 진행).
  try {
    const url = await resolvePushRemoteUrl(repoPath)
    if (url) {
      const info = parseRemoteUrl(url)
      if (info.scheme === 'https' || info.scheme === 'http') {
        const token = tokenForRemoteHost(info.host)
        const script = token ? ensureAskpassScript() : null
        if (token && script) {
          env.GIT_ASKPASS = script
          // GitHub·GitLab 모두 PAT 를 password 로 받으면 사용자명은 임의값이어도 통과한다.
          env.GG_ASKPASS_USER = 'oauth2'
          env.GG_ASKPASS_PASS = token
        }
      }
    }
  } catch { /* 인증 주입 실패해도 기존 동작(키체인/SSH)으로 진행 */ }

  return simpleGit({
    baseDir: repoPath,
    unsafe: { allowUnsafeAskPass: true },
    progress(ev) {
      // 렌더러가 파괴된 경우 send 예외 방지
      if (event.sender.isDestroyed()) return
      event.sender.send('git:remote-progress', mapProgress(op, ev))
    },
  }).env(env)
}

// upstream(@{u}) 기준 ahead/behind 카운트(best-effort). 실패 시 undefined.
//   range 'HEAD..@{u}' → behind(받을 커밋 수), '@{u}..HEAD' → ahead(올릴 커밋 수)
async function revCount(git: ReturnType<typeof simpleGit>, range: string): Promise<number | undefined> {
  try {
    const out = await git.raw(['rev-list', '--count', range])
    return parseRevCount(out)
  } catch {
    return undefined  // upstream 없음/에러 → 필드 생략
  }
}

// git:pull — 원격에서 pull (진행률 스트리밍 + 결과 보강)
ipcMain.handle('git:pull', async (event, repoPath: string): Promise<GitRemoteResult> => {
  const git = await remoteGit(repoPath, 'pull', event)
  const behindBefore = await revCount(git, 'HEAD..@{u}')  // pull 전 받을 커밋 수
  try {
    const result = await git.pull()
    const stat = extractDiffStat(result)
    // newCommits: pull 전 behind(받을 커밋 수)를 best-effort로 사용
    const newCommits = behindBefore
    return {
      success: true,
      op: 'pull',
      summary: buildPullSummary(stat),
      upToDate: stat.upToDate,
      changedFiles: stat.changedFiles,
      insertions: stat.insertions,
      deletions: stat.deletions,
      ...(newCommits !== undefined ? { newCommits } : {}),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // 충돌은 throw하지 않고 conflict 결과로 변환
    if (isConflictError(message)) {
      let conflictedFiles: string[] = []
      try {
        const status = await git.status()
        conflictedFiles = extractConflictedFiles(status.conflicted)
      } catch { /* status 실패해도 conflict 결과는 반환 */ }
      return {
        success: false,
        op: 'pull',
        summary: 'Merge conflict — resolve and commit',
        conflict: true,
        conflictedFiles,
      }
    }
    throw new Error(message)  // 진짜 에러만 throw
  }
})

// git:push — 원격으로 push (진행률 스트리밍 + pushedCommits 보강)
ipcMain.handle('git:push', async (event, repoPath: string): Promise<GitRemoteResult> => {
  const git = await remoteGit(repoPath, 'push', event)
  const pushedCommits = await revCount(git, '@{u}..HEAD')  // push 전 올릴 커밋 수
  try {
    await git.push()
    return {
      success: true,
      op: 'push',
      summary: 'Pushed to remote',
      ...(pushedCommits !== undefined ? { pushedCommits } : {}),
    }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err))
  }
})

// git:fetch — 원격에서 fetch (진행률 스트리밍 + newCommits 보강)
ipcMain.handle('git:fetch', async (event, repoPath: string): Promise<GitRemoteResult> => {
  const git = await remoteGit(repoPath, 'fetch', event)
  const behindBefore = await revCount(git, 'HEAD..@{u}')  // fetch 전 behind
  try {
    await git.fetch()
    const behindAfter = await revCount(git, 'HEAD..@{u}')  // fetch 후 behind
    const newCommits = computeFetchDelta(behindBefore, behindAfter)
    return {
      success: true,
      op: 'fetch',
      summary: 'Fetched from remote',
      ...(newCommits !== undefined ? { newCommits, upToDate: newCommits === 0 } : {}),
    }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err))
  }
})

// git:checkout — 브랜치 체크아웃. 원격 추적 ref('origin/foo')를 그대로 체크아웃하면
// detached HEAD 가 되므로, planCheckout 으로 로컬 추적 브랜치를 만들어 전환한다.
// 전환된(또는 전환 시도한) 로컬 브랜치명을 반환한다.
ipcMain.handle('git:checkout', async (_event, repoPath: string, branch: string): Promise<string> => {
  const git = simpleGit(repoPath)
  // 로컬/원격 목록을 근거로 체크아웃 계획 산출(실패해도 원래 이름 그대로 폴백).
  let localBranches: string[] = []
  let remotes: string[] = []
  try { localBranches = (await git.branchLocal()).all } catch { localBranches = [] }
  try { remotes = (await git.getRemotes()).map(r => r.name) } catch { remotes = [] }
  const plan = planCheckout(branch, { localBranches, remotes })
  await git.checkout(plan.args)
  return plan.branch
})

// git:remotes — 원격 목록 조회
interface GitRemoteInfo {
  name: string
  url: string
}

ipcMain.handle('git:remotes', async (_event, repoPath: string): Promise<GitRemoteInfo[]> => {
  const git = simpleGit(repoPath)
  const remotes = await git.getRemotes(true)  // verbose=true → URLs 포함
  return remotes.map(r => ({
    name: r.name,
    url: r.refs.fetch || r.refs.push || '',
  }))
})

// ──────────────────────────────────────────────
// git:blame — 파일 라인별 blame 정보 조회
// ──────────────────────────────────────────────

// 작성자 이름 → 고정 색상 생성 (단순 hash 기반)
function getAuthorColor(name: string): string {
  const colors = ['#e6a536', '#5fb8e6', '#ff6b6b', '#c39ad9', '#6fcf7c', '#ffce5a', '#5fd4e6', '#e67c36']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return colors[Math.abs(h) % colors.length]
}

ipcMain.handle('git:blame', async (_event, repoPath: string, filePath: string): Promise<GitBlameLine[]> => {
  const git = simpleGit(repoPath)

  let raw: string
  try {
    // --line-porcelain: author/author-time 블록을 라인마다 반복 출력.
    // (일반 --porcelain은 커밋 첫 등장 시에만 메타데이터를 주므로, 같은
    //  커밋이 재등장하면 직전 라인의 author/time이 잘못 carry-over 된다.)
    raw = await git.raw(['blame', '--line-porcelain', filePath])
  } catch {
    // 바이너리 파일 등 blame 불가 케이스 → 빈 배열 반환
    return []
  }

  const lines: GitBlameLine[] = []

  let currentHash = ''
  let currentAuthor = ''
  let currentTime = 0
  let currentSummary = ''
  let finalLine = 0

  for (const line of raw.split('\n')) {
    // 커밋 헤더 라인: "<40-char-hash> <orig-line> <final-line> [num-lines]"
    const headerMatch = line.match(/^([0-9a-f]{40}) \d+ (\d+)/)
    if (headerMatch) {
      currentHash = headerMatch[1].slice(0, 7)
      finalLine = parseInt(headerMatch[2])
      continue
    }
    if (line.startsWith('author ') && !line.startsWith('author-')) {
      currentAuthor = line.slice(7)
      continue
    }
    if (line.startsWith('author-time ')) {
      currentTime = parseInt(line.slice(12))
      continue
    }
    // --line-porcelain 은 라인마다 summary(커밋 제목 첫 줄)도 반복 출력한다.
    if (line.startsWith('summary ')) {
      currentSummary = line.slice(8)
      continue
    }
    // 코드 라인: 탭으로 시작
    if (line.startsWith('\t')) {
      lines.push({
        lineNum: finalLine,
        hash: currentHash,
        author: currentAuthor,
        authorColor: getAuthorColor(currentAuthor),
        timeAgo: relativeTime(new Date(currentTime * 1000)),
        timestamp: currentTime,
        summary: currentSummary,
        content: line.slice(1),
      })
    }
  }

  return lines
})

// ──────────────────────────────────────────────
// git:config — git config 읽기/쓰기 (Settings 패널)
// ──────────────────────────────────────────────

ipcMain.handle('git:config-get', async (_event, repoPath: string): Promise<GitConfigResult> => {
  const git = simpleGit(repoPath)
  const [name, email, defaultBranch] = await Promise.all([
    git.raw(['config', 'user.name']).catch(() => ''),
    git.raw(['config', 'user.email']).catch(() => ''),
    git.raw(['config', 'init.defaultBranch']).catch(() => 'main'),
  ])
  return {
    name: name.trim(),
    email: email.trim(),
    defaultBranch: defaultBranch.trim() || 'main',
  }
})

ipcMain.handle('git:config-set', async (_event, repoPath: string, cfg: Partial<GitConfigResult>): Promise<void> => {
  const git = simpleGit(repoPath)
  const ops: Promise<unknown>[] = []
  if (cfg.name)          ops.push(git.raw(['config', 'user.name', cfg.name]))
  if (cfg.email)         ops.push(git.raw(['config', 'user.email', cfg.email]))
  if (cfg.defaultBranch) ops.push(git.raw(['config', 'init.defaultBranch', cfg.defaultBranch]))
  await Promise.all(ops)
})

// ──────────────────────────────────────────────
// git:tag-* — 태그 관리(목록·생성·삭제·푸시)
// ──────────────────────────────────────────────

interface GitTagEntry {
  name: string
  annotated: boolean          // 주석 태그(tag 객체) vs 경량 태그(commit 직접 가리킴)
  commit: string              // 가리키는 커밋(주석이면 역참조된 커밋), short sha
  date: string                // creatordate:short (YYYY-MM-DD)
  tagger?: string             // 주석 태그의 작성자
  message?: string            // 주석 태그 메시지(subject)
  subject?: string            // 가리키는 커밋의 메시지(subject)
  pushed: boolean | null      // origin에 있음/없음. null=원격 확인 불가(오프라인·원격 없음)
}

// 태그 이름 방어 — 앞의 '-'(플래그 오인)·공백·git이 금지하는 문자를 막는다.
function validateTagName(name: string): string {
  const n = (name ?? '').trim()
  if (!n || n.startsWith('-') || n.includes('..') || /[\s~^:?*[\\]/.test(n) || n.endsWith('/') || n.endsWith('.lock')) {
    throw new Error('유효하지 않은 태그 이름')
  }
  return n
}

const TAG_US = '\x1f'  // unit separator

// List: 모든 태그를 메타데이터와 함께. pushed는 ls-remote로 best-effort(타임아웃 시 null).
ipcMain.handle('git:tags', async (_event, repoPath: string): Promise<GitTagEntry[]> => {
  const git = simpleGit(repoPath)
  const fmt = ['%(refname:short)', '%(objecttype)', '%(objectname:short)', '%(*objectname:short)', '%(creatordate:short)', '%(taggername)', '%(contents:subject)'].join(TAG_US)
  const raw = await git.raw(['for-each-ref', 'refs/tags', '--sort=-creatordate', `--format=${fmt}`]).catch(() => '')
  const rows: GitTagEntry[] = raw.split('\n').filter(Boolean).map((line) => {
    const [name, objtype, objname, derefName, date, tagger, subject] = line.split(TAG_US)
    const annotated = objtype === 'tag'
    return {
      name: name ?? '',
      annotated,
      commit: (derefName || objname || '').trim(),
      date: date ?? '',
      tagger: annotated && tagger ? tagger : undefined,
      message: annotated && subject ? subject : undefined,
      subject: undefined,
      pushed: null,
    }
  })

  // 가리키는 커밋들의 메시지(subject)를 한 번에 조회 → commit-card 표시용.
  const shas = [...new Set(rows.map(r => r.commit).filter(Boolean))]
  if (shas.length > 0) {
    const subjRaw = await git.raw(['log', '--no-walk', `--format=%h${TAG_US}%s`, ...shas]).catch(() => '')
    const subjMap = new Map<string, string>()
    subjRaw.split('\n').filter(Boolean).forEach((l) => {
      const [h, s] = l.split(TAG_US)
      if (h) subjMap.set(h, s ?? '')
    })
    rows.forEach((r) => { r.subject = subjMap.get(r.commit) })
  }

  // pushed 판정 — origin ls-remote(4초 타임아웃, 실패/오프라인이면 null 유지).
  try {
    const remotes = await git.getRemotes()
    if (remotes.length > 0) {
      const remoteName = remotes.find(r => r.name === 'origin')?.name ?? remotes[0].name
      const lsGit = simpleGit(repoPath).env({ ...process.env, GIT_TERMINAL_PROMPT: '0' })
      const ls = lsGit.raw(['ls-remote', '--tags', '--refs', remoteName]).then(v => v).catch(() => null)
      const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 4000))
      const lsRaw = await Promise.race([ls, timeout])
      if (lsRaw !== null) {
        const remoteTags = new Set<string>()
        lsRaw.split('\n').filter(Boolean).forEach((l) => {
          const m = l.match(/refs\/tags\/(.+)$/)
          if (m) remoteTags.add(m[1])
        })
        rows.forEach((r) => { r.pushed = remoteTags.has(r.name) })
      }
    }
  } catch { /* pushed는 null 유지 */ }

  return rows
})

// Create: 경량/주석 태그 생성 + 선택적 origin 푸시. opts 없으면 기존 동작(경량, 무푸시).
ipcMain.handle('git:tag-create', async (_event, repoPath: string, tagName: string, commitHash: string, opts?: { annotated?: boolean; message?: string; push?: boolean }): Promise<void> => {
  const name = validateTagName(tagName)
  const git = simpleGit(repoPath)
  if (opts?.annotated) {
    await git.raw(['tag', '-a', '-m', opts.message?.trim() || name, name, commitHash])
  } else {
    await git.raw(['tag', name, commitHash])
  }
  if (opts?.push) {
    await git.raw(['push', 'origin', `refs/tags/${name}`])
  }
})

// Delete: 로컬 태그 삭제 + 선택적 원격 삭제(alsoRemote).
ipcMain.handle('git:tag-delete', async (_event, repoPath: string, tagName: string, alsoRemote?: boolean): Promise<void> => {
  const name = validateTagName(tagName)
  const git = simpleGit(repoPath)
  await git.raw(['tag', '-d', name])
  if (alsoRemote) {
    await git.raw(['push', 'origin', `:refs/tags/${name}`])
  }
})

// Push: 단일 태그를 origin에 푸시.
ipcMain.handle('git:tag-push', async (_event, repoPath: string, tagName: string): Promise<void> => {
  const name = validateTagName(tagName)
  const git = simpleGit(repoPath)
  await git.raw(['push', 'origin', `refs/tags/${name}`])
})

// ──────────────────────────────────────────────
// auth:ssh-* — SSH 키 관리(목록·연결 테스트·생성·삭제)
// 모든 파일 접근은 ~/.ssh 하위로 제한하고, 셸 미경유(execFile 인자 배열)로 실행한다.
// ──────────────────────────────────────────────

const execFileP = promisify(execFile)
const SSH_DIR = path.join(os.homedir(), '.ssh')

interface SshKeyEntry {
  name: string                 // 파일명(.pub 제외, 예: id_ed25519)
  pubPath: string
  privExists: boolean          // 짝이 되는 개인키 파일 존재 여부
  type: string                 // ED25519 / RSA 4096 / ECDSA …
  fingerprint: string          // SHA256:…
  comment: string
  publicKey: string            // .pub 전체 내용(복사용)
  hasPassphrase: boolean | null // 개인키 패스프레이즈 여부(확인 불가면 null)
}

// 경로가 ~/.ssh 하위인지 검증(트래버설 방어).
function assertUnderSshDir(p: string): string {
  const resolved = path.resolve(p)
  if (resolved !== SSH_DIR && !resolved.startsWith(SSH_DIR + path.sep)) {
    throw new Error('허용되지 않은 경로예요')
  }
  return resolved
}

// 키 이름 방어 — 영숫자·._- 만, 선행 dot·경로 구분자 금지.
function validateKeyName(name: string): string {
  const n = (name ?? '').trim()
  if (!n || n.startsWith('.') || !/^[A-Za-z0-9._-]+$/.test(n)) throw new Error('유효하지 않은 키 이름이에요')
  return n
}

// List: ~/.ssh/*.pub 를 열거해 지문·종류·패스프레이즈 여부까지.
ipcMain.handle('auth:ssh-keys', async (): Promise<SshKeyEntry[]> => {
  let files: string[]
  try { files = await fsp.readdir(SSH_DIR) } catch { return [] }
  const pubs = files.filter(f => f.endsWith('.pub'))
  const out: SshKeyEntry[] = []
  for (const pub of pubs) {
    const pubPath = path.join(SSH_DIR, pub)
    const name = pub.replace(/\.pub$/, '')
    let publicKey = ''
    try { publicKey = (await fsp.readFile(pubPath, 'utf8')).trim() } catch { continue }
    const parts = publicKey.split(/\s+/)
    const comment = parts.slice(2).join(' ')

    // 지문·종류 — ssh-keygen -lf "256 SHA256:… comment (ED25519)"
    let fingerprint = ''
    let type = ''
    try {
      const { stdout } = await execFileP('ssh-keygen', ['-lf', pubPath])
      const m = stdout.trim().match(/^(\d+)\s+(\S+)\s+.*\(([^)]+)\)\s*$/)
      if (m) { fingerprint = m[2]; type = m[3] === 'RSA' ? `RSA ${m[1]}` : m[3] }
    } catch { /* 아래 폴백 */ }
    if (!type) {
      const algo = parts[0] || ''
      type = algo.includes('ed25519') ? 'ED25519' : algo.includes('rsa') ? 'RSA' : algo.includes('ecdsa') ? 'ECDSA' : (algo || '알 수 없음')
    }

    // 개인키 존재 + 패스프레이즈 여부(빈 패스프레이즈로 공개키 유도 시도 → 실패면 패스프레이즈 있음)
    const privCand = path.join(SSH_DIR, name)
    let privExists = false
    let hasPassphrase: boolean | null = null
    try {
      await fsp.access(privCand)
      privExists = true
      try { await execFileP('ssh-keygen', ['-y', '-P', '', '-f', privCand]); hasPassphrase = false }
      catch { hasPassphrase = true }
    } catch { privExists = false }

    out.push({ name, pubPath, privExists, type, fingerprint, comment, publicKey, hasPassphrase })
  }
  return out
})

// Test: ssh -T git@<host> 로 인증 확인. GitHub는 성공해도 exit 1이라 stderr 인사말을 파싱.
ipcMain.handle('auth:ssh-test', async (_event, host: string): Promise<{ ok: boolean; message: string }> => {
  const h = (host || '').trim()
  if (!/^[A-Za-z0-9.-]+$/.test(h)) return { ok: false, message: '호스트 형식이 올바르지 않아요' }
  const args = ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=8', `git@${h}`]
  const parse = (s: string) => /success|welcome|authenticated/i.test(s)
  try {
    const { stdout, stderr } = await execFileP('ssh', args, { timeout: 12000 })
    const out = `${stdout}${stderr}`.trim()
    return { ok: parse(out), message: out || '응답이 없어요' }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim()
    return { ok: parse(out), message: out || err.message || '연결하지 못했어요' }
  }
})

// Generate: 새 ED25519 키 생성(파일 쓰기). 이름 검증·중복 방지·~/.ssh 하위 제한.
ipcMain.handle('auth:ssh-generate', async (_event, name: string, passphrase?: string, comment?: string): Promise<{ name: string; publicKey: string }> => {
  const n = validateKeyName(name)
  const target = assertUnderSshDir(path.join(SSH_DIR, n))
  await fsp.mkdir(SSH_DIR, { recursive: true, mode: 0o700 })
  let exists = false
  try { await fsp.access(target); exists = true } catch { exists = false }
  if (exists) throw new Error('같은 이름의 키가 이미 있어요')
  const cmt = (comment || '').replace(/[\r\n]/g, '').slice(0, 200) || `${os.userInfo().username}@gitgrove`
  await execFileP('ssh-keygen', ['-t', 'ed25519', '-f', target, '-N', passphrase ?? '', '-C', cmt])
  const publicKey = (await fsp.readFile(`${target}.pub`, 'utf8')).trim()
  return { name: n, publicKey }
})

// Delete: 개인키 + 공개키 파일을 삭제(~/.ssh 하위 제한). UI에서 확인 후 호출.
ipcMain.handle('auth:ssh-delete', async (_event, name: string): Promise<void> => {
  const n = validateKeyName(name)
  const base = assertUnderSshDir(path.join(SSH_DIR, n))
  await fsp.unlink(base).catch(() => {})
  await fsp.unlink(`${base}.pub`).catch(() => {})
})

// ──────────────────────────────────────────────
// git:stash-* — Stash 패널 연산
// ──────────────────────────────────────────────

// Apply: 스태시 적용 (keep stash)
ipcMain.handle('git:stash-apply', async (_event, repoPath: string, index: number): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.raw(['stash', 'apply', `stash@{${index}}`])
})

// Drop: 스태시 삭제
ipcMain.handle('git:stash-drop', async (_event, repoPath: string, index: number): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.raw(['stash', 'drop', `stash@{${index}}`])
})

// List: 스태시 목록 조회 (각 스태시별 파일 수·증감 합계 포함)
ipcMain.handle('git:stash-list', async (_event, repoPath: string): Promise<GitStashEntry[]> => {
  const git = simpleGit(repoPath)
  const raw = await git.raw(['stash', 'list', '--format=%gd|%s|%D|%ar']).catch(() => '')
  const lines = raw.trim().split('\n').filter(Boolean)
  return Promise.all(lines.map(async (line, i) => {
    const parts = line.split('|')
    const msg = parts[1]?.replace(/^WIP on [^:]+: /, '') ?? ''
    const refs = parts[2] ?? ''
    const time = parts[3]?.trim() ?? ''
    const branchMatch = refs.match(/refs\/heads\/([^\s,]+)/) || msg.match(/^WIP on ([^:]+):/)

    // 스태시별 numstat 합계 — 개별 호출 실패는 0으로 폴백.
    const numstat = await git.raw(['stash', 'show', '--numstat', `stash@{${i}}`]).catch(() => '')
    let files = 0
    let additions = 0
    let deletions = 0
    numstat.trim().split('\n').filter(Boolean).forEach((l) => {
      const [add, del] = l.split('\t')
      files += 1
      additions += add === '-' ? 0 : parseInt(add, 10) || 0
      deletions += del === '-' ? 0 : parseInt(del, 10) || 0
    })

    return {
      index: i,
      message: msg || `stash@{${i}}`,
      branch: branchMatch?.[1] ?? 'unknown',
      time,
      files,
      additions,
      deletions,
    }
  }))
})

// Files: 스태시별 변경 파일 목록 (numstat + name-status 를 path 기준 병합)
ipcMain.handle('git:stash-files', async (_event, repoPath: string, index: number): Promise<GitStashFile[]> => {
  const git = simpleGit(repoPath)
  const numstatRaw = await git.raw(['stash', 'show', '--numstat', `stash@{${index}}`]).catch(() => '')
  const nameStatusRaw = await git.raw(['stash', 'show', '--name-status', `stash@{${index}}`]).catch(() => '')

  // numstat: `add\tdel\tpath` (바이너리는 `-`). path → 증감 매핑.
  const numMap = new Map<string, { additions: number; deletions: number }>()
  numstatRaw.trim().split('\n').filter(Boolean).forEach((line) => {
    const cols = line.split('\t')
    const add = cols[0] ?? ''
    const del = cols[1] ?? ''
    const path = cols.slice(2).join('\t')
    if (!path) return
    numMap.set(path, {
      additions: add === '-' ? 0 : parseInt(add, 10) || 0,
      deletions: del === '-' ? 0 : parseInt(del, 10) || 0,
    })
  })

  // name-status: `M\tpath` / `A\tpath` / `D\tpath` / `R100\told\tnew`.
  // 이 목록을 기준으로 삼고(상태·경로가 정확), 증감은 numMap 에서 끌어온다.
  const files: GitStashFile[] = []
  const seen = new Set<string>()
  nameStatusRaw.trim().split('\n').filter(Boolean).forEach((line) => {
    const cols = line.split('\t')
    const code = cols[0] ?? ''
    const letter = code.charAt(0)
    const status: 'M' | 'A' | 'D' | 'R' =
      letter === 'A' ? 'A' :
      letter === 'D' ? 'D' :
      letter === 'R' ? 'R' : 'M'
    // R 은 [R100, old, new] → new 경로 사용. 그 외는 두 번째 컬럼.
    const path = status === 'R' ? (cols[2] ?? cols[1] ?? '') : (cols[1] ?? '')
    if (!path) return
    seen.add(path)
    const num = numMap.get(path)
    files.push({ path, status, additions: num?.additions ?? 0, deletions: num?.deletions ?? 0 })
  })

  // name-status 에 없고 numstat 에만 있는 경로 보강(rename 결합형 `old => new` 는 제외).
  numMap.forEach((num, path) => {
    if (seen.has(path) || path.includes(' => ')) return
    files.push({ path, status: 'M', additions: num.additions, deletions: num.deletions })
  })

  return files
})

// Push: 새 스태시 생성 (keepIndex 시 --keep-index)
// Preview: 보관 전 현재 워킹트리 변경(tracked/untracked)을 보여준다.
ipcMain.handle('git:stash-preview', async (_event, repoPath: string): Promise<StashPreview> => {
  const git = simpleGit(repoPath)
  const status = await git.status()
  return buildStashPreview(status.files)
})

// Push: 워킹트리 변경을 보관. includeUntracked면 새 파일(-u)도 담는다.
// 실제로 새 스태시가 생겼는지(보관할 변경이 있었는지)를 보관 전후 개수로 판정해 반환한다.
ipcMain.handle('git:stash-push', async (_event, repoPath: string, message?: string, keepIndex?: boolean, includeUntracked?: boolean): Promise<boolean> => {
  const git = simpleGit(repoPath)
  const countStashes = async (): Promise<number> =>
    (await git.raw(['stash', 'list']).catch(() => '')).split('\n').filter(l => l.trim()).length
  const before = await countStashes()
  const args = ['stash', 'push']
  if (keepIndex) args.push('--keep-index')
  if (includeUntracked) args.push('-u')
  if (message) args.push('-m', message)
  await git.raw(args)
  return (await countStashes()) > before
})

// Branch: 스태시를 새 브랜치로 적용 (성공 시 해당 스태시 자동 drop)
ipcMain.handle('git:stash-branch', async (_event, repoPath: string, index: number, branchName: string): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.raw(['stash', 'branch', branchName, `stash@{${index}}`])
})

// File diff: 특정 스태시 안의 한 파일에 대한 unified diff (프리뷰에서 파일 클릭 시 사용)
ipcMain.handle('git:stash-file-diff', async (_event, repoPath: string, index: number, filePath: string): Promise<string> => {
  const git = simpleGit(repoPath)
  return git.raw(['stash', 'show', '-p', `stash@{${index}}`, '--', filePath]).catch(() => '')
})

// ──────────────────────────────────────────────
// git:branch-* — 브랜치 생성/이름 변경/삭제
// ──────────────────────────────────────────────

ipcMain.handle('git:branch-create', async (_event, repoPath: string, name: string, base: string, checkout: boolean): Promise<void> => {
  const git = simpleGit(repoPath)
  if (checkout) {
    await git.checkoutBranch(name, base)
  } else {
    await git.raw(['branch', name, base])
  }
})

ipcMain.handle('git:branch-rename', async (_event, repoPath: string, from: string, to: string): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.raw(['branch', '-m', from, to])
})

ipcMain.handle('git:branch-delete', async (_event, repoPath: string, name: string, force: boolean): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.raw(['branch', force ? '-D' : '-d', name])
})

// ──────────────────────────────────────────────
// git:cherry-pick
// ──────────────────────────────────────────────

ipcMain.handle('git:cherry-pick', async (_event, repoPath: string, hash: string, noCommit: boolean): Promise<void> => {
  const git = simpleGit(repoPath)
  const args = ['cherry-pick']
  if (noCommit) args.push('--no-commit')
  args.push(hash)
  await git.raw(args)
})

// ──────────────────────────────────────────────
// git:merge — merge / rebase / squash 전략
// ──────────────────────────────────────────────

ipcMain.handle('git:merge', async (_event, repoPath: string, branch: string, strategy: 'merge' | 'rebase' | 'squash'): Promise<void> => {
  const git = simpleGit(repoPath)
  if (strategy === 'rebase') {
    await git.raw(['rebase', branch])
  } else if (strategy === 'squash') {
    await git.raw(['merge', '--squash', branch])
    await git.raw(['commit', '-m', `Squash merge ${branch}`])
  } else {
    await git.merge([branch])
  }
})

// ──────────────────────────────────────────────
// git:stash-pop — apply + drop (pop)
// ──────────────────────────────────────────────

ipcMain.handle('git:stash-pop', async (_event, repoPath: string, index: number): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.raw(['stash', 'pop', `stash@{${index}}`])
})

// ──────────────────────────────────────────────
// git:commit-amend — 마지막 커밋 수정
// ──────────────────────────────────────────────

ipcMain.handle('git:commit-amend', async (_event, repoPath: string, message?: string): Promise<void> => {
  const git = simpleGit(repoPath)
  if (message) {
    await git.raw(['commit', '--amend', '-m', message])
  } else {
    await git.raw(['commit', '--amend', '--no-edit'])
  }
})

// ──────────────────────────────────────────────
// git:revert — 커밋 되돌리기 (되돌리기 커밋 생성)
// ──────────────────────────────────────────────
//
// --no-edit: 되돌리기 커밋을 즉시 생성한다(에디터 안 띄움). 커밋 리스트 맨 위에
// "Revert ..." 커밋이 추가되고, 예전 --no-commit이 남기던 REVERT_HEAD(진행중 상태)도
// 남지 않는다.

ipcMain.handle('git:revert', async (_event, repoPath: string, hash: string): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.raw(['revert', '--no-edit', hash])
})

// ──────────────────────────────────────────────
// git:reset — soft / mixed / hard 리셋
// ──────────────────────────────────────────────

ipcMain.handle('git:reset', async (_event, repoPath: string, mode: 'soft' | 'mixed' | 'hard', hash: string): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.raw(['reset', `--${mode}`, hash])
})

// ──────────────────────────────────────────────
// git:rebase-interactive — 대화형 rebase
// ──────────────────────────────────────────────

ipcMain.handle('git:rebase-interactive', async (_event, repoPath: string, items: Array<{ hash: string; action: string; msg: string }>): Promise<void> => {
  const { exec } = await import('child_process')
  const { promisify } = await import('util')
  const fs = await import('fs/promises')
  const os = await import('os')
  const nodePath = await import('path')

  const count = items.length
  const todo = items.map(item => `${item.action} ${item.hash} ${item.msg}`).join('\n') + '\n'

  const tmpSeq = nodePath.join(os.tmpdir(), `gitgrove-seq-${Date.now()}.txt`)
  const tmpEditor = nodePath.join(os.tmpdir(), `gitgrove-ed-${Date.now()}.sh`)

  await fs.writeFile(tmpSeq, todo, 'utf8')
  await fs.writeFile(tmpEditor, `#!/bin/sh\ncp "${tmpSeq}" "$1"\n`, 'utf8')
  await fs.chmod(tmpEditor, 0o755)

  const execPromise = promisify(exec)
  try {
    await execPromise(`GIT_SEQUENCE_EDITOR="${tmpEditor}" git rebase -i HEAD~${count}`, { cwd: repoPath })
  } finally {
    await Promise.all([fs.unlink(tmpSeq).catch(() => {}), fs.unlink(tmpEditor).catch(() => {})])
  }
})

// ──────────────────────────────────────────────
// Stage 탭 파일 컨텍스트 메뉴용 IPC (reveal / open / discard / gitignore)
// ──────────────────────────────────────────────

// git:reveal-in-finder — OS 파일 탐색기(Finder)에서 해당 파일 위치를 표시.
ipcMain.handle('git:reveal-in-finder', (_event, absPath: string): void => {
  shell.showItemInFolder(absPath)
})

// git:open-path — OS 기본 앱으로 파일/폴더 열기.
//   shell.openPath는 성공 시 빈 문자열, 실패 시 에러 메시지를 반환한다.
ipcMain.handle('git:open-path', async (_event, absPath: string): Promise<{ ok: boolean; error?: string }> => {
  const error = await shell.openPath(absPath)
  if (error) return { ok: false, error }
  return { ok: true }
})

// git:discard — 변경사항 되돌리기 (파괴적).
//   files: repo 루트 기준 상대경로 배열.
//   추적 중(modified/deleted) → `git checkout -- <file>`로 원복.
//   미추적(untracked, '??') → 디스크에서 삭제.
//   - 경로 트래버설 방어: 각 파일의 resolve 경로가 repoPath 하위가 아니면 skip.
//   - 한 파일이 실패해도 나머지는 진행하되, (skip 제외) 전부 실패하면 throw.
ipcMain.handle('git:discard', async (_event, repoPath: string, files: string[]): Promise<void> => {
  const git = simpleGit(repoPath)
  const repoRoot = path.resolve(repoPath)

  // repoRoot 하위 경로인지 검증 (.. 트래버설 / 절대경로 탈출 차단).
  const isInsideRepo = (rel: string): boolean => {
    const abs = path.resolve(repoRoot, rel)
    const relFromRoot = path.relative(repoRoot, abs)
    return relFromRoot !== '' && !relFromRoot.startsWith('..') && !path.isAbsolute(relFromRoot)
  }

  // 처리 대상(트래버설 검증 통과)만 추림. 전부 skip이면 아무것도 안 하고 종료.
  const targets = files.filter(isInsideRepo)
  if (targets.length === 0) return

  let attempted = 0
  let failed = 0

  for (const file of targets) {
    attempted++
    try {
      // 파일 단위 status로 추적 여부 판별 (경로 인자는 배열로 전달 → 공백/특수문자 안전).
      const status = await git.status(['--', file])
      const isUntracked = status.not_added.includes(file)

      if (isUntracked) {
        // 미추적 → 디스크에서 삭제.
        await fsp.rm(path.resolve(repoRoot, file), { force: true })
      } else {
        // 추적 중(modified/deleted 등) → 워킹트리 변경 원복.
        await git.raw(['checkout', '--', file])
      }
    } catch {
      failed++
    }
  }

  // 시도한 파일이 전부 실패하면 호출부가 알 수 있도록 throw.
  if (attempted > 0 && failed === attempted) {
    throw new Error('discard 실패: 모든 대상 파일을 되돌리지 못했습니다.')
  }
})

// git:add-to-gitignore — <repoPath>/.gitignore 에 패턴 줄을 append (중복 줄 제외).
//   - 파일이 없으면 새로 만든다.
//   - 각 패턴은 trim 비교로 이미 같은 줄이 있으면 추가하지 않는다.
//   - 파일이 newline으로 끝나도록 보장하고, 마지막에 한 번만 write.
ipcMain.handle('git:add-to-gitignore', async (_event, repoPath: string, patterns: string[]): Promise<void> => {
  const gitignorePath = path.join(repoPath, '.gitignore')

  let content = ''
  try {
    content = await fsp.readFile(gitignorePath, 'utf8')
  } catch {
    content = '' // 파일 없음 → 새로 생성.
  }

  // 기존 줄(trim 기준) 집합 — 중복 추가 방지.
  const existing = new Set(content.split('\n').map(l => l.trim()))

  const toAppend: string[] = []
  for (const raw of patterns) {
    const line = raw.trim()
    if (!line || existing.has(line)) continue
    existing.add(line)
    toAppend.push(line)
  }

  if (toAppend.length === 0) return

  // 파일이 내용이 있고 newline으로 끝나지 않으면 개행 보강.
  let next = content
  if (next.length > 0 && !next.endsWith('\n')) next += '\n'
  next += toAppend.join('\n') + '\n'

  await fsp.writeFile(gitignorePath, next, 'utf8')
})

// git:untrack — 인덱스에서 파일 추적 해제 (`git rm --cached`).
//   이미 추적 중인 파일은 .gitignore에 추가만 해서는 status에서 사라지지 않는다.
//   워킹트리 파일은 그대로 두고 인덱스에서만 제거해 이후 .gitignore가 실제로 먹히게 한다.
//   - --ignore-unmatch: 미추적 파일이 섞여 있어도 에러 없이 no-op.
//   - -r: 디렉토리도 허용.
//   - 경로 트래버설 방어: repoRoot 하위 경로만 대상.
ipcMain.handle('git:untrack', async (_event, repoPath: string, files: string[]): Promise<void> => {
  const git = simpleGit(repoPath)
  const repoRoot = path.resolve(repoPath)

  const isInsideRepo = (rel: string): boolean => {
    const abs = path.resolve(repoRoot, rel)
    const relFromRoot = path.relative(repoRoot, abs)
    return relFromRoot !== '' && !relFromRoot.startsWith('..') && !path.isAbsolute(relFromRoot)
  }

  const targets = files.filter(isInsideRepo)
  if (targets.length === 0) return

  await git.raw(['rm', '-r', '--cached', '--ignore-unmatch', '--', ...targets])
})

// ──────────────────────────────────────────────
// 머지 충돌 해결 IPC (git:conflicts / git:resolve-conflict / git:merge-state / git:continue)
// ──────────────────────────────────────────────
//
// 실제 git 충돌을 읽어 ConflictEditorModal 이 소비. 파일 쓰기·커밋을 동반하는
// 파괴적 연산이므로 비충돌 영역 손상 0(정확한 재구성)·실패 시 부분 상태 금지를 원칙으로 한다.
// 충돌 파싱/재구성 로직은 src/utils/conflictParse.ts(순수 함수, 테스트 대상)에 둔다.

// repoPath 하위 경로 검증(.. 트래버설 / 절대경로 탈출 차단). git 이 준 상대경로 기준.
function resolveInsideRepo(repoPath: string, file: string): string | null {
  const repoRoot = path.resolve(repoPath)
  const abs = path.resolve(repoRoot, file)
  const relFromRoot = path.relative(repoRoot, abs)
  if (relFromRoot === '' || relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) return null
  return abs
}

// git:conflicts — 충돌(unmerged) 파일을 읽어 hunk 목록으로 파싱.
//   바이너리/읽기 실패 파일은 conflicts:[] 로 graceful 스킵. 충돌 없으면 빈 배열.
ipcMain.handle('git:conflicts', async (_event, repoPath: string): Promise<ConflictFile[]> => {
  const git = simpleGit(repoPath)
  const status = await git.status()
  const conflicted = extractConflictedFiles(status.conflicted)
  const result: ConflictFile[] = []
  for (const file of conflicted) {
    const abs = resolveInsideRepo(repoPath, file)
    if (!abs) continue // 트래버설 방어 — 비정상 경로 스킵.
    try {
      const content = await fsp.readFile(abs, 'utf8')
      if (looksBinary(content)) {
        result.push({ path: file, conflicts: [] })
        continue
      }
      result.push({ path: file, conflicts: parseConflicts(content, file) })
    } catch {
      // 읽기 실패(바이너리/권한/삭제 등) → graceful 스킵.
      result.push({ path: file, conflicts: [] })
    }
  }
  return result
})

// git:resolve-conflict — 한 파일의 충돌 블록들을 choices 로 치환·재구성 후 원자적 쓰기 → git add.
//   choices 길이가 실제 충돌 수와 불일치하면 throw(부분 처리 금지). 비충돌 영역 정확 보존.
ipcMain.handle('git:resolve-conflict', async (_event, repoPath: string, file: string, choices: Array<'ours' | 'theirs' | 'both'>): Promise<void> => {
  const abs = resolveInsideRepo(repoPath, file)
  if (!abs) throw new Error('저장소 밖의 경로는 해결할 수 없어요')

  const content = await fsp.readFile(abs, 'utf8')

  // 쓰기 전 검증: 충돌 블록 수와 choices 길이 일치 확인(불일치면 throw — 디스크 미변경).
  const hunks = parseConflicts(content, file)
  if (hunks.length !== choices.length) {
    throw new Error(`충돌 블록 수(${hunks.length})와 선택 수(${choices.length})가 일치하지 않아요`)
  }

  // 재구성(reconstruct 도 블록 수 불일치/깨진 마커면 throw → 쓰기 전 안전 차단).
  const next = reconstruct(content, choices as Choice[])

  // 원자적 쓰기: 같은 디렉터리에 temp 파일로 쓴 뒤 rename(부분 쓰기로 깨진 상태 방지).
  const dir = path.dirname(abs)
  const tmp = path.join(dir, `.gitgrove-resolve-${process.pid}-${Date.now()}.tmp`)
  try {
    await fsp.writeFile(tmp, next, 'utf8')
    await fsp.rename(tmp, abs)
  } catch (err) {
    try { await fsp.rm(tmp, { force: true }) } catch { /* temp 정리 실패 무시 */ }
    throw err
  }

  // 기존 stage 로직과 동일하게 git add(해결 완료 표시).
  await simpleGit(repoPath).add([file])
})

// git:merge-state — .git 내 진행중 작업(merge/rebase/cherry-pick/revert) 감지 + 현재 unmerged 수.
ipcMain.handle('git:merge-state', async (_event, repoPath: string): Promise<MergeState> => {
  const git = simpleGit(repoPath)

  // .git 디렉터리 경로(워크트리/서브모듈 대비 rev-parse 로 정확히 조회).
  let gitDir: string
  try {
    gitDir = (await git.raw(['rev-parse', '--git-dir'])).trim()
    if (!path.isAbsolute(gitDir)) gitDir = path.resolve(repoPath, gitDir)
  } catch {
    gitDir = path.join(repoPath, '.git')
  }

  const exists = (rel: string): boolean => {
    try { return fs.existsSync(path.join(gitDir, rel)) } catch { return false }
  }

  let op: MergeState['op'] = null
  if (exists('rebase-merge') || exists('rebase-apply')) op = 'rebase'
  else if (exists('MERGE_HEAD')) op = 'merge'
  else if (exists('CHERRY_PICK_HEAD')) op = 'cherry-pick'
  else if (exists('REVERT_HEAD')) op = 'revert'

  let conflictedCount = 0
  try {
    const status = await git.status()
    conflictedCount = extractConflictedFiles(status.conflicted).length
  } catch {
    conflictedCount = 0
  }

  return { op, conflictedCount }
})

// continue 명령용 환경변수 구성. 현재 환경을 물려받되 GIT_EDITOR/GIT_SEQUENCE_EDITOR
// 를 true 로 강제해 에디터/시퀀스 에디터가 뜨지 않게 한다.
// simple-git 의 unsafe 검사는 .env() 로 넘긴 env 전체를 훑어 GIT_PAGER·GIT_ASKPASS·
// GIT_SSH_COMMAND 등 '위험' 키가 (의도와 무관하게) 상속돼 있으면 차단하므로,
// 우리가 의도적으로 설정하는 에디터 키를 제외한 위험 상속 키들을 미리 제거한다.
const UNSAFE_INHERITED_ENV_KEYS = [
  'EDITOR', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR',
  'PAGER', 'GIT_PAGER',
  'GIT_ASKPASS', 'SSH_ASKPASS',
  'GIT_SSH', 'GIT_SSH_COMMAND',
  'GIT_CONFIG', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_COUNT',
  'GIT_EXEC_PATH', 'GIT_EXTERNAL_DIFF', 'GIT_PROXY_COMMAND', 'GIT_TEMPLATE_DIR', 'PREFIX',
]
function buildNoEditorEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of UNSAFE_INHERITED_ENV_KEYS) delete env[key]
  env.GIT_EDITOR = 'true'
  env.GIT_SEQUENCE_EDITOR = 'true'
  return env
}

// git:continue — 진행중 작업 완료. 에디터 회피(GIT_EDITOR=true / --no-edit). git 에러는 graceful 반환.
//   실행 전 unmerged 파일이 남아 있으면 {ok:false, conflict:true}. op 없으면 {ok:false, error}.
ipcMain.handle('git:continue', async (_event, repoPath: string): Promise<ContinueResult> => {
  const git = simpleGit(repoPath)

  // 진행중 작업 op 감지(merge-state 와 동일 로직).
  let gitDir: string
  try {
    gitDir = (await git.raw(['rev-parse', '--git-dir'])).trim()
    if (!path.isAbsolute(gitDir)) gitDir = path.resolve(repoPath, gitDir)
  } catch {
    gitDir = path.join(repoPath, '.git')
  }
  const exists = (rel: string): boolean => {
    try { return fs.existsSync(path.join(gitDir, rel)) } catch { return false }
  }
  let op: MergeState['op'] = null
  if (exists('rebase-merge') || exists('rebase-apply')) op = 'rebase'
  else if (exists('MERGE_HEAD')) op = 'merge'
  else if (exists('CHERRY_PICK_HEAD')) op = 'cherry-pick'
  else if (exists('REVERT_HEAD')) op = 'revert'

  if (op === null) {
    return { ok: false, error: '진행 중인 작업이 없어요' }
  }

  // 충돌이 남아 있으면 continue 금지(아직 해결 안 됨).
  try {
    const status = await git.status()
    if (extractConflictedFiles(status.conflicted).length > 0) {
      return { ok: false, conflict: true }
    }
  } catch {
    // status 실패 시에는 continue 시도로 넘어가 git 에러를 그대로 노출.
  }

  // op 별 continue 명령. 에디터 회피는 -c core.editor 대신 환경변수로 처리한다.
  // (simple-git 은 -c core.editor=... 인자를 allowUnsafeEditor 없이는 차단함.)
  // GIT_EDITOR=true 로 에디터 호출을 즉시 종료시키고, rebase 의 todo 에디터는
  // GIT_SEQUENCE_EDITOR=true 로 회피한다. merge 는 --no-edit 도 함께 유지.
  let args: string[]
  if (op === 'merge') args = ['commit', '--no-edit']
  else if (op === 'rebase') args = ['rebase', '--continue']
  else if (op === 'cherry-pick') args = ['cherry-pick', '--continue']
  else args = ['revert', '--continue']

  try {
    await simpleGit({
      baseDir: repoPath,
      // GIT_EDITOR / GIT_SEQUENCE_EDITOR 를 의도적으로 주입하므로 editor 검사 허용.
      unsafe: { allowUnsafeEditor: true },
    })
      .env(buildNoEditorEnv())
      .raw(args)
    return { ok: true }
  } catch (err: unknown) {
    // git 에러는 throw 말고 graceful 반환(stderr/message).
    const e = err as { message?: string; stderr?: string }
    const msg = (e.stderr && e.stderr.trim()) || (e.message && e.message.trim()) || '작업을 완료하지 못했어요'
    return { ok: false, error: msg }
  }
})

// ──────────────────────────────────────────────
// github:* — PAT 안전 저장 (safeStorage / OS 키체인)
// ──────────────────────────────────────────────
//
// safeStorage가 가용하면 토큰을 암호화해 userData 경로의 파일에 보관한다.
// 미가용 환경(일부 Linux 등)에서는 렌더러가 localStorage 평문 fallback을 쓰도록
// isEncryptionAvailable=false를 알리고, set/get은 no-op/null을 반환한다.

function githubTokenFilePath(): string {
  return path.join(app.getPath('userData'), 'gitgrove-github-token.enc')
}

// safeStorage 암호화 가용 여부
ipcMain.handle('github:isEncryptionAvailable', (): boolean => {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
})

// 토큰 암호화 저장. 빈 문자열이면 저장 파일 제거(연결 해제).
ipcMain.handle('github:setToken', (_event, token: string): boolean => {
  if (!safeStorage.isEncryptionAvailable()) return false
  const file = githubTokenFilePath()
  try {
    if (!token) {
      try { fs.unlinkSync(file) } catch { /* 파일 없으면 무시 */ }
      return true
    }
    const encrypted = safeStorage.encryptString(token)
    fs.writeFileSync(file, encrypted)
    return true
  } catch {
    return false
  }
})

// 토큰 복호화 조회. 없거나 실패 시 null.
ipcMain.handle('github:getToken', (): string | null => {
  if (!safeStorage.isEncryptionAvailable()) return null
  const file = githubTokenFilePath()
  try {
    if (!fs.existsSync(file)) return null
    const encrypted = fs.readFileSync(file)
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
})

// ──────────────────────────────────────────────
// gitlab:* — 멀티 인스턴스 PAT 안전 저장 (safeStorage / OS 키체인)
// ──────────────────────────────────────────────
//
// GitLab은 gitlab.com(SaaS) + self-hosted를 **동시에** 연동할 수 있어(D1),
// 단일 토큰이 아니라 **host→토큰 맵**을 저장한다. 맵 전체를 JSON으로 직렬화한 뒤
// safeStorage.encryptString으로 통째 암호화해 한 파일에 보관한다.
// host 키는 src/utils/gitlab.ts의 normalizeGitlabHost로 정규화(저장/조회 일관성).
// 미가용 환경(일부 Linux 등)은 isEncryptionAvailable=false를 알리고 set/get은 no-op/null.

function gitlabTokenFilePath(): string {
  return path.join(app.getPath('userData'), 'gitgrove-gitlab-tokens.enc')
}

// 복호화된 host→토큰 맵을 읽는다. 파일 없음/실패/손상이면 빈 맵.
function readGitlabTokenMap(): Record<string, string> {
  if (!safeStorage.isEncryptionAvailable()) return {}
  const file = gitlabTokenFilePath()
  try {
    if (!fs.existsSync(file)) return {}
    const encrypted = fs.readFileSync(file)
    const json = safeStorage.decryptString(encrypted)
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // 값이 string인 항목만 채택(손상 방어)
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v) out[k] = v
      }
      return out
    }
    return {}
  } catch {
    return {}
  }
}

// host→토큰 맵을 암호화 저장. 빈 맵이면 파일 제거.
function writeGitlabTokenMap(map: Record<string, string>): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  const file = gitlabTokenFilePath()
  try {
    if (Object.keys(map).length === 0) {
      try { fs.unlinkSync(file) } catch { /* 파일 없으면 무시 */ }
      return true
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(map))
    fs.writeFileSync(file, encrypted)
    return true
  } catch {
    return false
  }
}

// safeStorage 암호화 가용 여부
ipcMain.handle('gitlab:isEncryptionAvailable', (): boolean => {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
})

// host 토큰 upsert. token이 빈값이면 해당 host 제거. host는 정규화 후 키로.
ipcMain.handle('gitlab:setToken', (_event, host: string, token: string): boolean => {
  if (!safeStorage.isEncryptionAvailable()) return false
  const key = normalizeGitlabHost(host)
  if (!key) return false
  const map = readGitlabTokenMap()
  if (!token) {
    delete map[key]
  } else {
    map[key] = token
  }
  return writeGitlabTokenMap(map)
})

// host 토큰 복호화 조회. 없으면 null.
ipcMain.handle('gitlab:getToken', (_event, host: string): string | null => {
  if (!safeStorage.isEncryptionAvailable()) return null
  const key = normalizeGitlabHost(host)
  if (!key) return null
  const map = readGitlabTokenMap()
  return map[key] ?? null
})

// 연결된 host 목록(정규화된 키).
ipcMain.handle('gitlab:listHosts', (): string[] => {
  if (!safeStorage.isEncryptionAvailable()) return []
  return Object.keys(readGitlabTokenMap())
})

// host 연결 해제(토큰 제거).
ipcMain.handle('gitlab:removeToken', (_event, host: string): boolean => {
  if (!safeStorage.isEncryptionAvailable()) return false
  const key = normalizeGitlabHost(host)
  if (!key) return false
  const map = readGitlabTokenMap()
  if (!(key in map)) return true
  delete map[key]
  return writeGitlabTokenMap(map)
})

// ──────────────────────────────────────────────
// 앱 생명주기
// ──────────────────────────────────────────────

app.on('window-all-closed', () => {
  // 창이 모두 닫히면 주기 체크 정리(앞으로 창이 없으면 send 대상도 없음).
  // macOS는 앱이 계속 살아있다가 activate로 창을 다시 만들 수 있어 재스케줄됨.
  stopUpdateChecks()
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

// 앱 종료 직전 주기 체크 핸들 최종 정리(누수 방지).
app.on('before-quit', () => {
  stopUpdateChecks()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// ──────────────────────────────────────────────
// 업데이트 체크 (GitHub Releases API)
// ──────────────────────────────────────────────

const REPO = 'sdf5771/gitgrove'

// 6시간 주기 업데이트 체크 스케줄링(중복 등록 방지). 핸들은 종료 시 정리.
function scheduleUpdateChecks() {
  if (updateCheckInterval) return
  updateCheckInterval = setInterval(() => checkForUpdates(), UPDATE_CHECK_INTERVAL_MS)
}

// 주기 체크 정리(window-all-closed / 앱 종료). 중복 호출 안전.
function stopUpdateChecks() {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval)
    updateCheckInterval = null
  }
}

// GitHub Releases API에서 latest 릴리즈를 fetch해 파싱한 메타를 반환하는 순수 헬퍼.
// 자동 경로(checkForUpdates)와 수동 경로(app:check-updates 핸들러)가 공유해 중복 fetch 코드를 제거.
// 네트워크/파싱 실패는 throw하지 않고 null로 graceful 반환(호출자가 "최신 상태"로 처리).
type LatestRelease = {
  version: string          // tag_name에서 'v' 접두사 제거
  htmlUrl: string          // release.html_url
  dmgUrl?: string          // .dmg 자산 URL(있으면)
  notes?: string           // 정제된 릴리즈 노트(있으면)
}

function fetchLatestRelease(): Promise<LatestRelease | null> {
  const url = `https://api.github.com/repos/${REPO}/releases/latest`
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'GitGrove-App' } }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const release = JSON.parse(data)
          const version = (release.tag_name as string)?.replace(/^v/, '') ?? ''
          if (!version) { resolve(null); return }
          const dmgAsset = pickDmgAsset(release.assets)
          const notes = buildReleaseNotes(release.body)
          resolve({
            version,
            htmlUrl: release.html_url as string,
            ...(dmgAsset ? { dmgUrl: dmgAsset.browser_download_url } : {}),
            ...(notes ? { notes } : {}),
          })
        } catch {
          resolve(null) // 파싱 실패 → graceful
        }
      })
    })
    req.on('error', () => resolve(null)) // 네트워크 실패 → graceful
    req.end()
  })
}

function checkForUpdates() {
  // 모든 체크 진입점(초기/주기/포커스)에서 마지막 체크 시각 갱신 → focus throttle 기준.
  lastUpdateCheckAt = Date.now()
  const currentVersion = app.getVersion()

  void fetchLatestRelease().then((latest) => {
    if (!latest) return
    // 현재 버전보다 새롭고(isNewer), 직전에 같은 버전으로 알린 적이 없을 때만 send.
    // (주기/포커스 체크가 동일 버전을 반복 전송해 시작 토스트가 매번 뜨는 것 방지)
    if (isNewer(latest.version, currentVersion) && latest.version !== lastNotifiedVersion) {
      lastNotifiedVersion = latest.version
      win?.webContents.send('app:update-available', {
        version: latest.version,
        url: latest.htmlUrl,
        ...(latest.dmgUrl ? { dmgUrl: latest.dmgUrl } : {}),
        ...(latest.notes ? { notes: latest.notes } : {}),
      })
    }
  })
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(n => parseInt(n, 10))
  const [la, lb, lc] = parse(latest)
  const [ca, cb, cc] = parse(current)
  if (la !== ca) return la > ca
  if (lb !== cb) return lb > cb
  return lc > cc
}

ipcMain.on('app:open-release-url', (_e, url: string) => {
  shell.openExternal(url)
})

// app:get-version — 현재 앱 버전 반환(About 탭 표시용). 단순 동기 조회.
ipcMain.handle('app:get-version', (): string => app.getVersion())

// app:check-updates — 수동 업데이트 확인(About 탭 "업데이트 확인" 버튼).
//   fetchLatestRelease()를 자동 경로와 공유해 fetch+버전비교 로직을 재사용한다.
//   새 버전이 있으면 { updateAvailable:true, version, dmgUrl?, current }, 없으면 { updateAvailable:false, current }.
//   네트워크/파싱 실패는 throw하지 않고 { updateAvailable:false, current }로 graceful 반환(About 탭이 "최신 상태"로 표시).
//   주의: 토스트(send)·lastNotifiedVersion 디듀프·주기/포커스 throttle 등 자동 동작은 건드리지 않는다(회귀 방지).
ipcMain.handle(
  'app:check-updates',
  async (): Promise<{ updateAvailable: boolean; version?: string; dmgUrl?: string; current: string }> => {
    const current = app.getVersion()
    try {
      const latest = await fetchLatestRelease()
      if (latest && isNewer(latest.version, current)) {
        return {
          updateAvailable: true,
          version: latest.version,
          ...(latest.dmgUrl ? { dmgUrl: latest.dmgUrl } : {}),
          current,
        }
      }
      return { updateAvailable: false, current }
    } catch (err) {
      console.warn('[app:check-updates] 업데이트 확인 실패(graceful):', err)
      return { updateAvailable: false, current }
    }
  },
)

// ──────────────────────────────────────────────
// app:* — OS 네이티브 알림 / Dock (기능 B)
//
// 실제 알림 폴링/신규 감지는 렌더러(getNotifications)가 수행하고, 신규 발견 시
// 아래 IPC로 네이티브 알림/배지/바운스 원시 기능만 호출한다(메인은 표시만 담당).
// 모두 방어적: 미지원/비-macOS 환경에서 throw하지 않고 graceful no-op.
// ──────────────────────────────────────────────

// app:show-notification — OS 네이티브 알림 표시.
//   - silent:true면 무음. sound가 있으면 macOS 시스템 사운드 이름으로 재생.
//   - 클릭 시 메인 윈도우를 앞으로(show+focus, macOS는 app.focus steal).
//   - Notification 미지원 환경은 조용히 무시.
ipcMain.handle('app:show-notification', async (_event, opts: { title: string; body: string; silent?: boolean; sound?: string }): Promise<void> => {
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title: opts.title,
    body: opts.body,
    silent: opts.silent ?? false,
    ...(opts.sound ? { sound: opts.sound } : {}),
  })
  notification.on('click', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
    if (process.platform === 'darwin') {
      app.focus({ steal: true })
    }
  })
  notification.show()
})

// app:set-badge-count — Dock 배지 카운트(macOS). 0이면 배지 제거.
//   비-macOS는 setBadgeCount가 false/예외일 수 있어 try/catch로 무시.
ipcMain.handle('app:set-badge-count', async (_event, count: number): Promise<void> => {
  try {
    const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
    app.setBadgeCount(n)
  } catch {
    // 비-macOS / 미지원 → 무시
  }
})

// app:bounce-dock — macOS Dock 아이콘 1회 바운스(informational). 비-macOS no-op.
ipcMain.handle('app:bounce-dock', async (): Promise<void> => {
  if (process.platform === 'darwin') {
    app.dock?.bounce('informational')
  }
})

// app:preview-sound — Settings에서 고른 macOS 시스템 사운드를 그 소리만 즉시 재생(알림 배너 없이).
//   - 화이트리스트(PREVIEW_SOUNDS) 검증: 목록에 없으면 재생 안 하고 { ok:false, error:'unknown sound' }.
//     (이름이 알파벳뿐이라 경로 조작 불가지만, 화이트리스트가 1차 방어 — 임의 파일/인젝션 차단.)
//   - 파일 경로 /System/Library/Sounds/<name>.aiff. fs.existsSync로 존재 확인, 없으면 'not found'.
//   - 재생: child_process.spawn('afplay', [filePath]) — 셸 미경유(인자 배열)로 afplay 직접 호출.
//   - 연타 대응: 직전 미리듣기 프로세스(previewSoundProc)를 kill해 겹쳐 재생 방지.
//   - 비-macOS(darwin 아님)는 재생 안 하고 { ok:false, error:'unsupported platform' }.
//   - 렌더러 모듈 import 대신 자체 상수로 검증(메인/렌더러 결합 회피). 목록은
//     src/utils/notifSettings.ts의 NOTIFICATION_SOUNDS(14종)와 동일하게 유지할 것.
const PREVIEW_SOUNDS = [
  'Glass', 'Ping', 'Hero', 'Submarine', 'Basso', 'Blow', 'Bottle',
  'Frog', 'Funk', 'Morse', 'Pop', 'Purr', 'Sosumi', 'Tink',
] as const

// 직전 미리듣기 afplay 프로세스. 새 미리듣기 시작 전에 kill해 겹침 방지.
let previewSoundProc: import('node:child_process').ChildProcess | null = null

ipcMain.handle('app:preview-sound', async (_event, name: string): Promise<{ ok: boolean; error?: string }> => {
  // 비-macOS 방어 (앱은 macOS 타깃이지만 afplay/시스템 사운드는 macOS 전용).
  if (process.platform !== 'darwin') return { ok: false, error: 'unsupported platform' }

  // 화이트리스트 검증 (1차 방어). 목록 밖이면 재생 안 함.
  if (!(PREVIEW_SOUNDS as readonly string[]).includes(name)) {
    return { ok: false, error: 'unknown sound' }
  }

  const filePath = `/System/Library/Sounds/${name}.aiff`
  if (!fs.existsSync(filePath)) return { ok: false, error: 'not found' }

  // 연타 대응: 이전 미리듣기가 살아있으면 종료(겹쳐 재생 방지).
  if (previewSoundProc) {
    try { previewSoundProc.kill() } catch { /* 이미 종료됨 — 무시 */ }
    previewSoundProc = null
  }

  try {
    const { spawn } = await import('node:child_process')
    // 셸 미경유: 인자 배열로 afplay에 파일 경로만 전달.
    const proc = spawn('afplay', [filePath])
    previewSoundProc = proc
    // spawn 에러/종료는 graceful 처리(throw 안 함). 현재 보관 핸들이면 정리.
    proc.on('error', () => { if (previewSoundProc === proc) previewSoundProc = null })
    proc.on('exit', () => { if (previewSoundProc === proc) previewSoundProc = null })
  } catch {
    // spawn 자체 실패(예: 바이너리 없음) → graceful.
    return { ok: false, error: 'not found' }
  }

  return { ok: true }
})

// ──────────────────────────────────────────────
// app:download-update (옵션 1: 무서명 인앱 DMG 다운로드)
//
// 1) GitHub 릴리즈 자산(.dmg)을 ~/Downloads로 스트리밍 다운로드(302→S3 리다이렉트 처리)
// 2) 다운로드 중 'app:update-download-progress' 진행률 전송
// 3) 완료 후 com.apple.quarantine xattr 제거(붙어있지 않아도 무해 — 방어적)
// 4) DMG 열기(shell.openPath → 마운트/설치 창)
//
// quarantine 실측: Node https+fs 저장 파일에는 com.apple.quarantine 가 붙지 않음
// (com.apple.provenance 만 부착되며 이는 Gatekeeper 차단 트리거 아님). 그래도
// 사용자가 LSFileQuarantine 환경 등에서 받았을 경우를 대비해 제거를 시도한다.
// ──────────────────────────────────────────────

// 단일 https GET(리다이렉트 따라가기). 응답 스트림을 콜백에 넘긴다.
function httpsGetFollow(
  url: string,
  onResponse: (res: import('node:http').IncomingMessage) => void,
  onError: (err: Error) => void,
  redirectsLeft = 5,
): void {
  if (!isAllowedUpdateHost(url)) {
    onError(new Error('허용되지 않은 다운로드 호스트입니다.'))
    return
  }
  const req = https.get(url, { headers: { 'User-Agent': 'GitGrove-App' } }, (res) => {
    const status = res.statusCode ?? 0
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume() // 본문 폐기
      if (redirectsLeft <= 0) {
        onError(new Error('리다이렉트가 너무 많습니다.'))
        return
      }
      const next = new URL(res.headers.location, url).toString()
      httpsGetFollow(next, onResponse, onError, redirectsLeft - 1)
      return
    }
    if (status !== 200) {
      res.resume()
      onError(new Error(`다운로드 실패 (HTTP ${status})`))
      return
    }
    onResponse(res)
  })
  req.on('error', onError)
  req.end()
}

ipcMain.handle('app:download-update', async (event, dmgUrl: string): Promise<{ path: string }> => {
  if (typeof dmgUrl !== 'string' || !isAllowedUpdateHost(dmgUrl)) {
    throw new Error('허용되지 않은 업데이트 URL입니다.')
  }

  // 저장 경로: ~/Downloads (없으면 temp)
  let downloadsDir: string
  try {
    downloadsDir = app.getPath('downloads')
  } catch {
    downloadsDir = os.tmpdir()
  }
  const filename = safeDownloadFilename(dmgUrl)
  const destPath = path.join(downloadsDir, filename)
  const partPath = destPath + '.part'

  const sender = event.sender
  const sendProgress = (received: number, total?: number) => {
    if (sender.isDestroyed()) return
    sender.send('app:update-download-progress', computeDownloadProgress(received, total))
  }

  await new Promise<void>((resolve, reject) => {
    const fileStream = fs.createWriteStream(partPath)
    let received = 0
    let settled = false

    const cleanupAndReject = (err: Error) => {
      if (settled) return
      settled = true
      fileStream.destroy()
      fs.promises.unlink(partPath).catch(() => {})
      reject(err)
    }

    fileStream.on('error', cleanupAndReject)

    httpsGetFollow(
      dmgUrl,
      (res) => {
        const totalHeader = res.headers['content-length']
        const total = totalHeader ? parseInt(Array.isArray(totalHeader) ? totalHeader[0] : totalHeader, 10) : undefined
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          sendProgress(received, total && Number.isFinite(total) ? total : undefined)
        })
        res.on('error', cleanupAndReject)
        res.pipe(fileStream)
        fileStream.on('finish', () => {
          if (settled) return
          settled = true
          fileStream.close((closeErr) => {
            if (closeErr) {
              fs.promises.unlink(partPath).catch(() => {})
              reject(closeErr)
              return
            }
            resolve()
          })
        })
      },
      cleanupAndReject,
    )
  })

  // .part → 최종 파일명으로 원자적 이동(덮어쓰기)
  await fs.promises.rename(partPath, destPath).catch(async (err) => {
    await fs.promises.unlink(partPath).catch(() => {})
    throw err
  })

  // quarantine 자동 제거 (실패해도 graceful — 로그만)
  if (process.platform === 'darwin') {
    const { execFile } = await import('node:child_process')
    await new Promise<void>((resolve) => {
      execFile('xattr', ['-dr', 'com.apple.quarantine', destPath], (err) => {
        if (err) console.warn('[app:download-update] quarantine 제거 실패(무시):', err.message)
        resolve()
      })
    })
  }

  // DMG 열기(마운트/설치 창). 실패 시 Finder에서 보이기 폴백.
  const openErr = await shell.openPath(destPath)
  if (openErr) {
    console.warn('[app:download-update] openPath 실패, Finder reveal 폴백:', openErr)
    shell.showItemInFolder(destPath)
  }

  return { path: destPath }
})

app.whenReady().then(() => {
  // 스플래시를 먼저 띄워 메인 윈도우 빌드 동안 빈 화면 깜빡임 제거
  createSplashWindow()
  createWindow()
})
