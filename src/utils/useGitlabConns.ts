import { useEffect, useState } from 'react'
import { getCurrentUser, GitlabApiError } from './gitlabClient'

/** 연결된 GitLab 인스턴스 1개(host + 토큰 + 현재 사용자). 인박스/알림 공용. */
export interface GitlabConn {
  host: string
  token: string
  /** getCurrentUser로 확인한 username — MR reviewer_username/이슈 scope에 필요 */
  username: string
}

/**
 * 연결된 모든 GitLab host의 토큰을 safeStorage에서 읽고, 각 host의 현재 사용자를
 * 확인해 유효한 인스턴스 목록을 만든다(토큰 무효면 제외). gitlab.com 우선 정렬.
 *
 * `gitlabConnected`(연결 host 수>0) 변화에 반응해 재로드한다 — Settings에서
 * 연결/해제하면 App이 `settings-changed`로 갱신하는 값.
 */
export function useGitlabConns(gitlabConnected: boolean): {
  instances: GitlabConn[]
  loading: boolean
} {
  const [instances, setInstances] = useState<GitlabConn[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!gitlabConnected) {
      setInstances([])
      return
    }
    void (async () => {
      setLoading(true)
      try {
        const hosts = (await window.appAPI?.gitlabListHosts()) ?? []
        // gitlab.com 먼저(SaaS 우선 노출).
        hosts.sort((a, b) => {
          const sa = a.includes('gitlab.com') ? 0 : 1
          const sb = b.includes('gitlab.com') ? 0 : 1
          return sa - sb
        })
        const next: GitlabConn[] = []
        for (const host of hosts) {
          const token = (await window.appAPI?.gitlabGetToken(host)) ?? null
          if (!token) continue
          try {
            const user = await getCurrentUser(host, token)
            next.push({ host, token, username: user.username })
          } catch (err) {
            // 토큰 무효(401)·권한 부족(403) host는 조용히 제외.
            if (err instanceof GitlabApiError) continue
            continue
          }
        }
        if (!cancelled) setInstances(next)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [gitlabConnected])

  return { instances, loading }
}
