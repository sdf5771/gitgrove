// 알림 패널 하단 '전체 알림 보기' 링크(순수 로직).
//
// 배경: '전체 알림 보기'가 필터와 무관하게 무조건 GitHub notifications 로만 이동했다.
// GitHub·GitLab 은 알림 페이지가 다르므로(GitHub=notifications, GitLab=dashboard/todos),
// 연결된 provider·현재 필터에 맞춰 각자의 페이지로 나눠 이동하도록 링크 목록을 만든다.

export type NotifFilter = 'all' | 'github' | 'gitlab'

export interface NotifFooterLink {
  provider: 'github' | 'gitlab'
  label: string
  url: string
}

const GITHUB_NOTIF_URL = 'https://github.com/notifications'
// gitlabHost 는 정규화된 형태('https://gitlab.com' 등, 스킴 포함)를 기대한다.
const gitlabTodosUrl = (host: string): string => `${host.replace(/\/+$/, '')}/dashboard/todos`

// filter=all 이면 연결된 provider 전부(GitHub·GitLab)를, 특정 필터면 그 provider 만.
// 연결 안 된 provider 는 제외한다(빈 배열이면 하단 링크 미표시).
export function notifFooterLinks(opts: {
  filter: NotifFilter
  hasGithub: boolean
  gitlabHost: string | null
}): NotifFooterLink[] {
  const { filter, hasGithub, gitlabHost } = opts
  const links: NotifFooterLink[] = []
  const wantGithub = (filter === 'all' || filter === 'github') && hasGithub
  const wantGitlab = (filter === 'all' || filter === 'gitlab') && !!gitlabHost
  if (wantGithub) links.push({ provider: 'github', label: 'GitHub 알림', url: GITHUB_NOTIF_URL })
  if (wantGitlab && gitlabHost) links.push({ provider: 'gitlab', label: 'GitLab Todos', url: gitlabTodosUrl(gitlabHost) })
  return links
}
