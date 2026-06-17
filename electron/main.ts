import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import https from 'node:https'
import simpleGit, { CheckRepoActions } from 'simple-git'
import { categorizeGitStatus } from '../src/utils/gitStatus'
import { normalizeGitlabHost } from '../src/utils/gitlab'

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
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: '#0d1220',
    icon: path.join(process.env.VITE_PUBLIC, 'gitgrove-icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // 윈도우 컨트롤 IPC
  ipcMain.on('win-minimize', () => win?.minimize())
  // 최대화 토글. 패키징된 prod 앱(고유 번들ID)에선 macOS 윈도우 상태복원/zoom과
  // 맞물려 한 번의 클릭이 maximize↔unmaximize를 여러 번 토글해 창이 "커졌다 줄었다"
  // 반복하는 문제가 보고됨(dev는 Electron 기본 번들ID라 미발생). 짧은 잠금으로
  // 연속 토글을 한 번으로 묶고, 풀스크린이면 먼저 해제한다.
  let maxToggleLock = false
  ipcMain.on('win-maximize', () => {
    if (!win || maxToggleLock) return
    maxToggleLock = true
    setTimeout(() => { maxToggleLock = false }, 300)
    if (win.isFullScreen()) { win.setFullScreen(false); return }
    if (win.isMaximized()) win.unmaximize()
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
    // 업데이트 체크 — 로드 후 3초 뒤 (UX 방해 최소화)
    setTimeout(() => checkForUpdates(), 3000)
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
ipcMain.handle('git:clone', async (_event, url: string, parentDir: string, opts?: { shallow?: boolean }): Promise<{ path: string; name: string }> => {
  const name = deriveRepoName(url)
  if (!name) throw new Error('저장소 URL에서 이름을 추출할 수 없습니다.')
  const target = path.join(parentDir, name)
  if (fs.existsSync(target)) throw new Error(`이미 '${name}' 폴더가 존재합니다.`)
  try {
    const cloneArgs = opts?.shallow ? ['--depth', '1'] : []
    await simpleGit().clone(url, target, cloneArgs)
    return { path: target, name }
  } catch (err) {
    // 실패 시 부분 클론 잔여 폴더 정리
    try { if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true }) } catch { /* ignore */ }
    throw new Error(err instanceof Error ? err.message : String(err))
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

interface GitRemoteResult {
  success: boolean
  summary: string
}

// git:pull — 원격에서 pull
ipcMain.handle('git:pull', async (_event, repoPath: string): Promise<GitRemoteResult> => {
  const git = simpleGit(repoPath)
  try {
    const result = await git.pull()
    const count = result.summary.changes + result.summary.insertions + result.summary.deletions
    return {
      success: true,
      summary: count > 0
        ? `Fast-forward: ${result.summary.changes} file(s) changed`
        : 'Already up to date',
    }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err))
  }
})

// git:push — 원격으로 push
ipcMain.handle('git:push', async (_event, repoPath: string): Promise<GitRemoteResult> => {
  const git = simpleGit(repoPath)
  try {
    await git.push()
    return { success: true, summary: 'Pushed to remote' }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err))
  }
})

// git:fetch — 원격에서 fetch
ipcMain.handle('git:fetch', async (_event, repoPath: string): Promise<GitRemoteResult> => {
  const git = simpleGit(repoPath)
  try {
    await git.fetch()
    return { success: true, summary: 'Fetched from remote' }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err))
  }
})

// git:checkout — 브랜치 체크아웃
ipcMain.handle('git:checkout', async (_event, repoPath: string, branch: string): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.checkout(branch)
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
    // 코드 라인: 탭으로 시작
    if (line.startsWith('\t')) {
      lines.push({
        lineNum: finalLine,
        hash: currentHash,
        author: currentAuthor,
        authorColor: getAuthorColor(currentAuthor),
        timeAgo: relativeTime(new Date(currentTime * 1000)),
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
// git:tag-create — 태그 생성 (ContextMenu "Create tag here")
// ──────────────────────────────────────────────

ipcMain.handle('git:tag-create', async (_event, repoPath: string, tagName: string, commitHash: string): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.tag([tagName, commitHash])
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

// List: 스태시 목록 조회
ipcMain.handle('git:stash-list', async (_event, repoPath: string): Promise<GitStashEntry[]> => {
  const git = simpleGit(repoPath)
  const raw = await git.raw(['stash', 'list', '--format=%gd|%s|%D|%ar']).catch(() => '')
  return raw.trim().split('\n').filter(Boolean).map((line, i) => {
    const parts = line.split('|')
    const msg = parts[1]?.replace(/^WIP on [^:]+: /, '') ?? ''
    const refs = parts[2] ?? ''
    const time = parts[3]?.trim() ?? ''
    const branchMatch = refs.match(/refs\/heads\/([^\s,]+)/) || msg.match(/^WIP on ([^:]+):/)
    return {
      index: i,
      message: msg || `stash@{${i}}`,
      branch: branchMatch?.[1] ?? 'unknown',
      time,
    }
  })
})

// Push: 새 스태시 생성
ipcMain.handle('git:stash-push', async (_event, repoPath: string, message?: string): Promise<void> => {
  const git = simpleGit(repoPath)
  if (message) {
    await git.raw(['stash', 'push', '-m', message])
  } else {
    await git.raw(['stash', 'push'])
  }
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
// git:revert — 커밋 되돌리기 (no-commit 스테이지)
// ──────────────────────────────────────────────

ipcMain.handle('git:revert', async (_event, repoPath: string, hash: string): Promise<void> => {
  const git = simpleGit(repoPath)
  await git.raw(['revert', '--no-commit', hash])
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
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
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

function checkForUpdates() {
  const currentVersion = app.getVersion()
  const url = `https://api.github.com/repos/${REPO}/releases/latest`

  const req = https.get(url, { headers: { 'User-Agent': 'GitGrove-App' } }, (res) => {
    let data = ''
    res.on('data', chunk => { data += chunk })
    res.on('end', () => {
      try {
        const release = JSON.parse(data)
        const latest = (release.tag_name as string)?.replace(/^v/, '') ?? ''
        if (latest && isNewer(latest, currentVersion)) {
          win?.webContents.send('app:update-available', {
            version: latest,
            url: release.html_url as string,
          })
        }
      } catch {
        // ignore parse errors
      }
    })
  })
  req.on('error', () => {})
  req.end()
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

app.whenReady().then(() => {
  // 스플래시를 먼저 띄워 메인 윈도우 빌드 동안 빈 화면 깜빡임 제거
  createSplashWindow()
  createWindow()
})
