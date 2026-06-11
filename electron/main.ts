import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import simpleGit from 'simple-git'

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

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0d1220',
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // 윈도우 컨트롤 IPC
  ipcMain.on('win-minimize', () => win?.minimize())
  ipcMain.on('win-maximize', () => {
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })
  ipcMain.on('win-close', () => win?.close())

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
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

// git:log — 커밋 로그 조회 (최대 50개)
ipcMain.handle('git:log', async (_event, repoPath: string): Promise<GitCommit[]> => {
  const git = simpleGit(repoPath)

  // 커밋 로그 (stat 포함)
  const log = await git.log([
    '--max-count=50',
    '--stat',
    '--decorate=full',
  ])

  // parents 별도 조회: short hash 배열 맵 (hash → parents[])
  const parentLines = await git.raw([
    'log',
    '--max-count=50',
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

  type FileStatus = { path: string; status: string; additions: number; deletions: number }

  const staged: FileStatus[] = []
  const unstaged: FileStatus[] = []

  // staged: created, renamed, modified (index 기준)
  for (const f of status.created) {
    staged.push({ path: f, status: 'A', ...(stagedStats.get(f) ?? { additions: 0, deletions: 0 }) })
  }
  for (const f of status.renamed) {
    const p = typeof f === 'string' ? f : f.to
    staged.push({ path: p, status: 'M', ...(stagedStats.get(p) ?? { additions: 0, deletions: 0 }) })
  }
  for (const f of status.staged) {
    if (!status.created.includes(f) && !status.renamed.find(r => (typeof r === 'string' ? r : r.to) === f)) {
      staged.push({ path: f, status: 'M', ...(stagedStats.get(f) ?? { additions: 0, deletions: 0 }) })
    }
  }
  // 중복 제거
  const stagedDeduped = staged.filter((f, i, arr) => arr.findIndex(x => x.path === f.path) === i)

  // unstaged: not_added (untracked), modified, deleted, conflicted
  for (const f of status.not_added) {
    unstaged.push({ path: f, status: 'A', ...(unstagedStats.get(f) ?? { additions: 0, deletions: 0 }) })
  }
  for (const f of status.modified) {
    unstaged.push({ path: f, status: 'M', ...(unstagedStats.get(f) ?? { additions: 0, deletions: 0 }) })
  }
  for (const f of status.deleted) {
    unstaged.push({ path: f, status: 'D', ...(unstagedStats.get(f) ?? { additions: 0, deletions: 0 }) })
  }
  for (const f of status.conflicted) {
    if (!unstaged.find(u => u.path === f)) {
      unstaged.push({ path: f, status: 'M', ...(unstagedStats.get(f) ?? { additions: 0, deletions: 0 }) })
    }
  }
  // 중복 제거
  const unstagedDeduped = unstaged.filter((f, i, arr) => arr.findIndex(x => x.path === f.path) === i)

  return { staged: stagedDeduped, unstaged: unstagedDeduped }
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
    raw = await git.raw(['blame', '--porcelain', filePath])
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

app.whenReady().then(createWindow)
