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
 */

const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={e => {
        e.preventDefault()
        if (href) window.appAPI?.openReleaseUrl(href)
      }}
    >
      {children}
    </a>
  ),
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
