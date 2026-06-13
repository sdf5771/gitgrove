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
})
