import { describe, it, expect } from 'vitest'
import { wordDiff } from './wordDiff'

describe('wordDiff — 문자 단위 intra-line diff', () => {
  it('공통 접두/접미를 벗기고 가운데만 changed로 표시한다', () => {
    const { a, b } = wordDiff("const x = 'syncing'", "const x = 'idle'")
    // 공통 접두 "const x = '" · 접미 "'"
    expect(a.map(s => s.text).join('')).toBe("const x = 'syncing'")
    expect(b.map(s => s.text).join('')).toBe("const x = 'idle'")
    expect(a.find(s => s.changed)?.text).toBe('syncing')
    expect(b.find(s => s.changed)?.text).toBe('idle')
    // 변경 밖은 changed=false
    expect(a.filter(s => !s.changed).map(s => s.text).join('')).toBe("const x = ''")
  })

  it('완전히 다른 줄은 전체가 changed', () => {
    const { a, b } = wordDiff('aaa', 'bbb')
    expect(a).toEqual([{ text: 'aaa', changed: true }])
    expect(b).toEqual([{ text: 'bbb', changed: true }])
  })

  it('동일한 줄은 changed 세그가 없다', () => {
    const { a, b } = wordDiff('same', 'same')
    expect(a.some(s => s.changed)).toBe(false)
    expect(b.some(s => s.changed)).toBe(false)
  })

  it('접두만 다른 경우', () => {
    const { a } = wordDiff('xfoo', 'foo')
    expect(a.find(s => s.changed)?.text).toBe('x')
  })
})
