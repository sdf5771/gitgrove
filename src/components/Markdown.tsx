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
 * Link scheme safety is owned entirely by `classifyHref` below (single source of
 * truth). react-markdown's built-in `defaultUrlTransform` would otherwise strip a
 * dangerous href to `''` BEFORE our `a` renderer runs — which would both make our
 * block-list dead code and blur a blocked link into a relative-looking one. So we
 * pass an identity `urlTransform` to keep the raw href and let `classifyHref` decide.
 *
 * Links never navigate in-app: clicks are intercepted (preventDefault). Only
 * absolute `http:`/`https:`/`mailto:` open externally via
 * `window.appAPI.openReleaseUrl`. Dangerous schemes (`javascript:`/`data:`/
 * `vbscript:`/`file:`) are dropped to plain text; relative paths / anchors /
 * protocol-relative / unknown schemes stay visible as a demoted, non-navigating
 * link (so PR bodies no longer silently lose their links).
 */

// 위험 스킴 차단. 스킴은 "word:"만 인정(경로 안의 콜론·앵커는 스킴이 아님).
const DANGEROUS_SCHEME = /^\s*(javascript|data|vbscript|file):/i

type LinkKind =
  | { kind: 'blocked' }               // 위험 스킴 → 링크 제거(plain text)
  | { kind: 'external'; url: string } // 외부 브라우저로 열기
  | { kind: 'inert' }                 // 링크는 유지하되 앱 내 이동 없음

// href를 분류한다. 위험 스킴만 죽이고, http(s)·mailto만 외부 오픈, 상대/앵커/기타는 살려둔다.
function classifyHref(href: string | undefined): LinkKind {
  const raw = (href ?? '').trim()
  if (!raw) return { kind: 'inert' }
  if (DANGEROUS_SCHEME.test(raw)) return { kind: 'blocked' }

  // 절대 URL(스킴 포함)로만 파싱 시도. base를 주지 않으므로 상대·앵커·protocol-relative(//host)는
  // throw → inert(강등 링크). base 흡수로 인한 스킴 승격 오해 소지가 없다.
  let abs: URL | null = null
  try { abs = new URL(raw) } catch { abs = null }
  if (!abs) return { kind: 'inert' }

  const scheme = abs.protocol.toLowerCase()
  if (scheme === 'javascript:' || scheme === 'data:' || scheme === 'vbscript:' || scheme === 'file:') {
    return { kind: 'blocked' }
  }
  if (scheme === 'http:' || scheme === 'https:' || scheme === 'mailto:') return { kind: 'external', url: abs.href }
  // 절대이나 미지원 스킴 → 안전하게 링크 유지·비이동.
  return { kind: 'inert' }
}

const components: Components = {
  a: ({ href, children }) => {
    const link = classifyHref(href)
    // 위험 스킴: 링크 없이 텍스트만(sink 로 전달 안 함).
    if (link.kind === 'blocked') return <span>{children}</span>
    if (link.kind === 'inert') {
      // 상대·앵커·미지원: 링크는 보이되 앱 내 이동은 막는다(강등 표시).
      return (
        <a
          href={href || undefined}
          className="md-link-rel"
          title="앱에서 열 수 없는 링크예요 (상대·앵커 링크)"
          onClick={e => e.preventDefault()}
        >
          {children}
        </a>
      )
    }
    return (
      <a
        href={link.url}
        onClick={e => {
          e.preventDefault()
          window.appAPI?.openReleaseUrl(link.url)
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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={u => u}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
