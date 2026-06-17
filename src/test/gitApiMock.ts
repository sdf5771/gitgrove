import { vi } from 'vitest'

// Per-repo fixture data. Keyed by absolute repo path.
export interface RepoFixture {
  branch: string
  commitMsg: string
  commitId: string
  author: string
}

export const FIXTURES: Record<string, RepoFixture> = {
  '/repo/a': {
    branch: 'main',
    commitId: 'aaa1111',
    commitMsg: 'REPO_A_ONLY_COMMIT',
    author: 'Alice Author',
  },
  '/repo/b': {
    branch: 'develop',
    commitId: 'bbb2222',
    commitMsg: 'REPO_B_ONLY_COMMIT',
    author: 'Bob Builder',
  },
}

function logFor(path: string): GitCommit[] {
  const f = FIXTURES[path]
  if (!f) return []
  return [
    {
      id: f.commitId,
      fullId: f.commitId + '0000000000000000000000000000000',
      msg: f.commitMsg,
      author: f.author,
      time: '1h ago',
      parents: [],
      refs: [`HEAD -> ${f.branch}`],
      stats: { files: 1, insertions: 10, deletions: 2 },
    },
  ]
}

function branchesFor(path: string): GitBranchResult {
  const f = FIXTURES[path]
  if (!f) return { current: '', local: [], remote: [], tags: [] }
  return {
    current: f.branch,
    local: [{ name: f.branch, ahead: 0, behind: 0 }],
    remote: [`origin/${f.branch}`],
    tags: [],
  }
}

const emptyStatus: GitStatusResult = { staged: [], unstaged: [] }

/**
 * Installs a mock window.gitAPI / window.appAPI that returns *different*
 * data per repo path. Returns the spies so tests can assert calls.
 */
export function installGitApiMock() {
  const getLog = vi.fn(async (path: string) => logFor(path))
  const getBranches = vi.fn(async (path: string) => branchesFor(path))
  const getStatus = vi.fn(async () => emptyStatus)
  const getRemotes = vi.fn(async (path: string) => {
    const f = FIXTURES[path]
    return f ? [{ name: 'origin', url: `git@github.com:test/${path.split('/').pop()}.git` }] : []
  })

  const gitAPI = {
    openDialog: vi.fn(async () => null),
    pickDirectory: vi.fn(async () => null),
    isRepo: vi.fn(async () => true),
    clone: vi.fn(async (_url: string, parentDir: string) => ({ path: `${parentDir}/cloned`, name: 'cloned' })),
    getLog,
    getBranches,
    getStatus,
    getDiff: vi.fn(async () => ''),
    getFileDiff: vi.fn(async () => ''),
    applyHunk: vi.fn(async () => {}),
    getFiles: vi.fn(async () => []),
    getCommitFileDiff: vi.fn(async () => ''),
    stage: vi.fn(async () => {}),
    unstage: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    pull: vi.fn(async () => ({ success: true, summary: '' })),
    push: vi.fn(async () => ({ success: true, summary: '' })),
    fetch: vi.fn(async () => ({ success: true, summary: '' })),
    checkout: vi.fn(async () => {}),
    blame: vi.fn(async () => []),
    getRemotes,
    getConfig: vi.fn(async () => ({ name: '', email: '', defaultBranch: 'main' })),
    setConfig: vi.fn(async () => {}),
    createTag: vi.fn(async () => {}),
    stashApply: vi.fn(async () => {}),
    stashDrop: vi.fn(async () => {}),
    stashList: vi.fn(async () => []),
    stashPush: vi.fn(async () => {}),
    stashPop: vi.fn(async () => {}),
    branchCreate: vi.fn(async () => {}),
    branchRename: vi.fn(async () => {}),
    branchDelete: vi.fn(async () => {}),
    cherryPick: vi.fn(async () => {}),
    merge: vi.fn(async () => {}),
    commitAmend: vi.fn(async () => {}),
    revert: vi.fn(async () => {}),
    reset: vi.fn(async () => {}),
    rebaseInteractive: vi.fn(async () => {}),
  }

  const appAPI = {
    onUpdateAvailable: vi.fn(),
    openReleaseUrl: vi.fn(),
    githubIsEncryptionAvailable: vi.fn(async () => false),
    githubSetToken: vi.fn(async () => true),
    githubGetToken: vi.fn(async () => null),
    gitlabIsEncryptionAvailable: vi.fn(async () => false),
    gitlabSetToken: vi.fn(async () => true),
    gitlabGetToken: vi.fn(async () => null),
    gitlabListHosts: vi.fn(async () => [] as string[]),
    gitlabRemoveToken: vi.fn(async () => true),
  }

  window.gitAPI = gitAPI
  window.appAPI = appAPI
  window.ipcRenderer = { send: vi.fn(), on: vi.fn(), off: vi.fn(), invoke: vi.fn() } as unknown as Window['ipcRenderer']

  return { gitAPI, appAPI }
}

/**
 * 지연(latency)을 path별로 다르게 줄 수 있는 mock 변형.
 * 레이스(요청 순서 ≠ 응답 순서)를 재현하기 위함.
 */
export function installGitApiMockWithLatency(latency: Record<string, number>) {
  const base = installGitApiMock()
  const delay = (p: string) => new Promise<void>(r => setTimeout(r, latency[p] ?? 0))
  base.gitAPI.getLog.mockImplementation(async (path: string) => {
    await delay(path)
    const f = FIXTURES[path]
    return f ? [{
      id: f.commitId, fullId: f.commitId + '0'.repeat(33), msg: f.commitMsg,
      author: f.author, time: '1h ago', parents: [], refs: [`HEAD -> ${f.branch}`],
      stats: { files: 1, insertions: 10, deletions: 2 },
    }] : []
  })
  base.gitAPI.getBranches.mockImplementation(async (path: string) => {
    await delay(path)
    const f = FIXTURES[path]
    return f
      ? { current: f.branch, local: [{ name: f.branch, ahead: 0, behind: 0 }], remote: [`origin/${f.branch}`], tags: [] }
      : { current: '', local: [], remote: [], tags: [] }
  })
  return base
}
