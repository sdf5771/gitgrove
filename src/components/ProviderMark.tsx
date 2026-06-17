// 프로바이더 식별 마크 (GitHub / GitLab) — 인박스·알림 벨의 배지·필터 칩 공용.
// 색 규칙: GitLab 주황은 브랜드 식별 전용(승격 금지). GitHub 마크는 중성 회색.

export type Provider = 'github' | 'gitlab'

/** GitLab 브랜드 마크 (비침해 추상, glMark SVG) */
export const GlMark = ({ size = 16 }: { size?: number }) => (
  <svg className="gl-mark" width={size} height={size} viewBox="0 0 24 24" aria-label="GitLab">
    <path d="M12 21.5l3.2-9.8H8.8L12 21.5z" fill="#fc6d26" />
    <path d="M12 21.5L8.8 11.7H4.2L12 21.5z" fill="#e24329" />
    <path d="M4.2 11.7L3 15.4a.8.8 0 0 0 .3.9L12 21.5 4.2 11.7z" fill="#fca326" />
    <path d="M4.2 11.7H8.8L6.9 5.6c-.1-.3-.5-.3-.6 0L4.2 11.7z" fill="#e24329" />
    <path d="M12 21.5l3.2-9.8h4.6L12 21.5z" fill="#e24329" />
    <path d="M19.8 11.7L21 15.4a.8.8 0 0 1-.3.9L12 21.5l7.8-9.8z" fill="#fca326" />
    <path d="M19.8 11.7H15.2l1.9-6.1c.1-.3.5-.3.6 0l2.1 6.1z" fill="#e24329" />
  </svg>
)

/** GitHub 브랜드 마크(중성 회색 — 식별용) */
export const GhMark = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="#c2cae0" aria-label="GitHub">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
)

/** 아이콘 우하단 프로바이더 배지(tb-prov) */
export const ProviderBadge = ({ provider }: { provider: Provider }) => (
  <span className="tb-prov" aria-hidden>
    {provider === 'gitlab' ? <GlMark size={11} /> : <GhMark size={11} />}
  </span>
)

export type ProviderFilter = 'all' | 'github' | 'gitlab'

export interface ProviderFilterChipsProps {
  value: ProviderFilter
  onChange: (v: ProviderFilter) => void
  /** 각 프로바이더 항목 수(필터 칩 옆 카운트) */
  counts: { all: number; github: number; gitlab: number }
  /** GitLab 미연결이면 GitLab 칩 숨김 */
  showGitlab?: boolean
  /** GitHub 미연결이면 GitHub 칩 숨김 */
  showGithub?: boolean
}

/** 전체 / GitHub / GitLab 프로바이더 필터 칩 (tb-pf) */
export function ProviderFilterChips({
  value, onChange, counts, showGitlab = true, showGithub = true,
}: ProviderFilterChipsProps) {
  return (
    <>
      <button
        className={`tb-pf${value === 'all' ? ' on' : ''}`}
        onClick={() => onChange('all')}
      >
        전체 <span style={{ opacity: 0.65 }}>{counts.all}</span>
      </button>
      {showGithub && (
        <button
          className={`tb-pf${value === 'github' ? ' on' : ''}`}
          onClick={() => onChange('github')}
        >
          <span className="pm"><GhMark size={11} /></span>GitHub <span style={{ opacity: 0.65 }}>{counts.github}</span>
        </button>
      )}
      {showGitlab && (
        <button
          className={`tb-pf${value === 'gitlab' ? ' on' : ''}`}
          onClick={() => onChange('gitlab')}
        >
          <span className="pm"><GlMark size={11} /></span>GitLab <span style={{ opacity: 0.65 }}>{counts.gitlab}</span>
        </button>
      )}
    </>
  )
}
