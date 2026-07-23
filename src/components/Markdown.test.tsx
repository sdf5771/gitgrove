import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { Markdown } from './Markdown'

// ──────────────────────────────────────────────────────────────
// D — 마크다운 링크 스킴 분류 (Markdown.tsx / classifyHref)
//
// 대상 동작(behavior, 구현 아님):
//  - 위험 스킴(javascript:/data:/vbscript:/file:, 대소문자·공백 변형 포함)은
//    외부 브라우저 sink(window.appAPI.openReleaseUrl)로 절대 흘러가지 않는다.
//  - http/https/mailto 절대 URL → 외부 링크(클릭 시 openReleaseUrl 호출).
//  - 상대(`../issues/1`, `/o/r/x`)·앵커(`#install`)는 살아있되 `.md-link-rel` 로
//    강등(비이동, preventDefault, sink 미호출).
//
// classifyHref 는 export 되지 않으므로 렌더 DOM 계약으로 검증한다.
// 참고: Markdown 은 `urlTransform={u => u}`(identity)로 react-markdown 의 기본
//   defaultUrlTransform 를 끄고, 스킴 안전성 판정을 classifyHref 단일 소스로 위임한다.
//   → 위험 스킴은 classifyHref 가 blocked 로 처리해 <span>(앵커 없음)으로 렌더된다.
//   baseUrl(상대→절대 resolve) 분기는 배선 계획이 없어 제거됨(상대/앵커는 inert 유지).
// ──────────────────────────────────────────────────────────────

const openSpy = vi.fn()

beforeEach(() => {
  (window as unknown as { appAPI: unknown }).appAPI = { openReleaseUrl: openSpy }
  openSpy.mockClear()
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

/** source 를 렌더하고 첫 anchor(있으면)를 돌려준다. */
function renderLink(source: string) {
  const { container } = render(<Markdown source={source} />)
  const anchor = container.querySelector('a')
  return { container, anchor }
}

describe('D — 위험 스킴 (sink 로 전달 금지)', () => {
  const DANGEROUS: Array<[string, string]> = [
    ['javascript', '[클릭](javascript:alert(1))'],
    ['data', '[클릭](data:text/html,<script>x</script>)'],
    ['vbscript', '[클릭](vbscript:msgbox(1))'],
    ['file', '[클릭](file:///etc/passwd)'],
  ]

  it.each(DANGEROUS)('%s: 텍스트는 남기되 클릭해도 openReleaseUrl 로 전달되지 않는다', (_scheme, src) => {
    const { container, anchor } = renderLink(src)
    // 링크 텍스트 자체는 보존(내용 소실 없음)
    expect(screen.getByText('클릭')).toBeTruthy()
    // 위험 스킴 href 가 그대로 DOM 에 남아있지 않음(있더라도 sink 로 안 감)
    if (anchor) {
      const href = anchor.getAttribute('href') ?? ''
      expect(href).not.toMatch(/javascript:|data:|vbscript:|file:/i)
      fireEvent.click(anchor)
    } else {
      fireEvent.click(screen.getByText('클릭'))
    }
    // 핵심 보안 계약: 위험 스킴은 절대 외부 sink 로 열리지 않는다
    expect(openSpy).not.toHaveBeenCalled()
    expect(container).toBeTruthy()
  })

  it('대소문자·앞공백 변형(` JavaScript:`)도 sink 로 전달되지 않는다', () => {
    const { anchor } = renderLink('[x]( JavaScript:alert(1))')
    if (anchor) {
      expect(anchor.getAttribute('href') ?? '').not.toMatch(/javascript:/i)
      fireEvent.click(anchor)
    } else {
      fireEvent.click(screen.getByText('x'))
    }
    expect(openSpy).not.toHaveBeenCalled()
  })
})

describe('D — http/https/mailto (외부 링크)', () => {
  it('https 절대 URL 클릭 → openReleaseUrl(url) 호출', () => {
    const { anchor } = renderLink('[깃그로브](https://github.com/sdf5771/gitgrove)')
    expect(anchor).not.toBeNull()
    expect(anchor!.className).not.toContain('md-link-rel')
    fireEvent.click(anchor!)
    expect(openSpy).toHaveBeenCalledWith('https://github.com/sdf5771/gitgrove')
  })

  it('http 절대 URL 클릭 → openReleaseUrl 호출(http 도 허용)', () => {
    const { anchor } = renderLink('[link](http://example.com/path)')
    fireEvent.click(anchor!)
    expect(openSpy).toHaveBeenCalledWith('http://example.com/path')
  })

  it('mailto 클릭 → openReleaseUrl(mailto:...) 호출', () => {
    const { anchor } = renderLink('[메일](mailto:hi@gitgrove.dev)')
    fireEvent.click(anchor!)
    expect(openSpy).toHaveBeenCalledWith('mailto:hi@gitgrove.dev')
  })
})

describe('D — 상대·앵커 (base 없음 → md-link-rel 강등, 비이동)', () => {
  it.each([
    ['상대 상위경로', '[이슈](../issues/1)', '../issues/1'],
    ['루트 절대경로', '[파일](/o/r/x)', '/o/r/x'],
    ['앵커', '[설치](#install)', '#install'],
  ])('%s: .md-link-rel 로 남되 클릭 시 sink 미호출', (_n, src, kept) => {
    const { anchor } = renderLink(src)
    expect(anchor).not.toBeNull()
    expect(anchor!.className).toContain('md-link-rel')
    // 링크 자체는 살아있음(href 보존) — PR 본문에서 링크가 소실되지 않도록
    expect(anchor!.getAttribute('href')).toBe(kept)
    fireEvent.click(anchor!)
    expect(openSpy).not.toHaveBeenCalled()
  })
})
