import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

/**
 * Renders untrusted markdown (PR descriptions / comments) as styled, safe HTML.
 *
 * Security: react-markdown does NOT pass through raw HTML by default (no
 * rehype-raw plugin is used here), so any embedded `<script>` / `<img onerror>`
 * etc. is rendered as plain text rather than live DOM. GFM features (tables,
 * task lists, strikethrough, fenced code, autolinks) come from remark-gfm.
 *
 * Links never navigate in-app: clicks are intercepted and opened in the user's
 * external browser via `window.appAPI.openReleaseUrl`.
 *
 * Security (scheme allow-list): PR/MR bodies are untrusted. A link `href` may be
 * `javascript:`, `data:`, `file:` etc. We only open absolute `http:`/`https:`/`mailto:`
 * URLs externally. Anything else (dangerous schemes, relative paths, anchors,
 * protocol-relative `//host`, unparseable) renders as plain text with no link — it
 * never reaches `openReleaseUrl` (which forwards to `shell.openExternal`).
 */

// 안전한 절대 URL 스킴만 반환. 그 외(위험 스킴·상대경로·앵커·파싱불가)는 null.
function safeExternalHref(href: string | undefined): string | null {
  if (!href) return null
  const raw = href.trim()
  let url: URL
  try {
    // base 없이 파싱 → 상대경로·앵커·protocol-relative(//host)는 throw → null 처리.
    url = new URL(raw)
  } catch {
    return null
  }
  const scheme = url.protocol.toLowerCase()
  if (scheme === 'http:' || scheme === 'https:' || scheme === 'mailto:') return raw
  return null
}

const components: Components = {
  a: ({ href, children }) => {
    const safe = safeExternalHref(href)
    // 비허용 스킴/상대경로 등: 링크 없이 텍스트만 렌더(클릭 불가 — sink 로 전달 안 함).
    if (!safe) return <span>{children}</span>
    return (
      <a
        href={safe}
        onClick={e => {
          e.preventDefault()
          window.appAPI?.openReleaseUrl(safe)
        }}
      >
        {children}
      </a>
    )
  },
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const cls = className ? `md-body ${className}` : 'md-body'
  return (
    <div className={cls}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
