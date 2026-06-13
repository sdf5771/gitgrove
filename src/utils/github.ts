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

// 현재 사용자의 레포 권한 → 단일 역할 라벨로 환산 (높은 권한 우선).
// pull-only("Read")는 공개 repo에서 비협력자에게도 항상 true이므로 협력자 표식이
// 아니다 → null을 반환해 권한 배지를 숨긴다. 실제 협력자(쓰기 이상 권한:
// Admin/Maintain/Write/Triage)일 때만 라벨을 노출한다.
export function permissionToRole(p?: RepoPermissions | null): string | null {
  if (!p) return null
  if (p.admin) return 'Admin'
  if (p.maintain) return 'Maintain'
  if (p.push) return 'Write'
  if (p.triage) return 'Triage'
  return null
}
