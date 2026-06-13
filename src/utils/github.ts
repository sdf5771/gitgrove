// GitHub 관련 공용 유틸

// "git@github.com:owner/repo.git" 또는 "https://github.com/owner/repo.git" → { owner, repo }
export function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  // SSH 형식
  const sshMatch = url.match(/git@github\.com:([^/]+)\/([^.]+)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] }
  // HTTPS 형식
  const httpsMatch = url.match(/https?:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] }
  return null
}

export interface RepoPermissions {
  admin?: boolean
  maintain?: boolean
  push?: boolean
  triage?: boolean
  pull?: boolean
}

// 현재 사용자의 레포 권한 → 단일 역할 라벨로 환산 (높은 권한 우선)
export function permissionToRole(p?: RepoPermissions | null): string | null {
  if (!p) return null
  if (p.admin) return 'Admin'
  if (p.maintain) return 'Maintain'
  if (p.push) return 'Write'
  if (p.triage) return 'Triage'
  if (p.pull) return 'Read'
  return null
}
