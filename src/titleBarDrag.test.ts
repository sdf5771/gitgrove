import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

// Electron 타이틀바는 `-webkit-app-region: drag`(창 이동 영역)이다.
// 그 안의 인터랙티브 요소는 명시적으로 `no-drag` 예외에 포함돼야 클릭이
// OS 창 드래그에 먹히지 않는다. 레포 탭(.repo-tabs/.repo-tab)이 예외에서
// 빠지면 탭 클릭이 동작하지 않는 회귀가 발생한다(실제 Electron에서만 재현,
// jsdom 렌더 테스트로는 못 잡음). 이 테스트는 그 CSS 계약을 고정한다.
describe('타이틀바 클릭 영역 (-webkit-app-region)', () => {
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'index.css'),
    'utf-8',
  )

  it('레포 탭 스트립(.repo-tabs)이 no-drag 예외에 포함돼야 한다', () => {
    // `{ -webkit-app-region: no-drag }` 규칙 앞의 셀렉터 목록을 추출
    const match = css.match(/([^{}]*)\{\s*-webkit-app-region:\s*no-drag;?\s*\}/)
    expect(match, 'no-drag 규칙이 존재해야 함').not.toBeNull()
    expect(match![1]).toContain('.repo-tabs')
  })

  it('Repository Manager 진입 탭(.tb-repos-tab)이 no-drag 예외에 포함돼야 한다', () => {
    // 타이틀바에 새로 추가한 인터랙티브 요소도 클릭이 창 드래그에 먹히지 않게 no-drag여야 함.
    const match = css.match(/([^{}]*)\{\s*-webkit-app-region:\s*no-drag;?\s*\}/)
    expect(match, 'no-drag 규칙이 존재해야 함').not.toBeNull()
    expect(match![1]).toContain('.tb-repos-tab')
  })
})

// 열린-리포지토리 탭 스트립(.repo-tabs)이 500px 캡에 묶이면, 타이틀 바에 빈 공간이
// 남는데도 탭이 욱여넣어져 불필요한 가로 스크롤이 생긴다. 캡을 제거하고 flex로
// 가용폭을 채우되, 넘칠 때만 내부 스크롤이 동작하도록 한 계약을 고정한다.
describe('타이틀바 열린-리포지토리 영역 레이아웃', () => {
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'index.css'),
    'utf-8',
  )
  // `.repo-tabs{...}` 선언 블록만 추출(다른 .repo-tabs::-webkit-scrollbar 등은 제외).
  const repoTabs = css.match(/\.repo-tabs\s*\{([^}]*)\}/)?.[1] ?? ''
  const sep = css.match(/\.sep\s*\{([^}]*)\}/)?.[1] ?? ''

  it('.repo-tabs에 max-width:500px 캡이 남아 있으면 안 된다', () => {
    expect(repoTabs).not.toMatch(/max-width:\s*500px/)
  })

  it('.repo-tabs는 가용폭을 채우도록 flex grow + overflow-x:auto + min-width:0', () => {
    expect(repoTabs).toMatch(/flex:\s*1/)
    expect(repoTabs).toContain('overflow-x:auto')
    expect(repoTabs).toContain('min-width:0')
  })

  it('.sep는 더 이상 남는 공간을 독식(flex:1)하지 않는다', () => {
    expect(sep).not.toMatch(/flex:\s*1\s*;/)
  })
})
