import { describe, it, expect } from 'vitest'
import { buildFileTree, ancestorDirs, type FileTreeDirNode, type FileTreeFileNode } from './fileTree'

// 타입 좁히기 헬퍼 — 단언을 읽기 쉽게.
function asDir(n: unknown): FileTreeDirNode {
  const node = n as FileTreeDirNode
  expect(node.type).toBe('dir')
  return node
}
function asFile(n: unknown): FileTreeFileNode {
  const node = n as FileTreeFileNode
  expect(node.type).toBe('file')
  return node
}

describe('buildFileTree', () => {
  it('빈 배열이면 빈 트리를 준다', () => {
    expect(buildFileTree([])).toEqual([])
  })

  it('루트 단일 파일은 최상위 file 노드 하나', () => {
    const tree = buildFileTree(['a.ts'])
    expect(tree).toEqual([{ type: 'file', name: 'a.ts', path: 'a.ts' }])
  })

  it('중첩 경로(a/b/c.ts)를 dir→dir→file 로 펼치고 각 노드 path가 풀경로다', () => {
    const tree = buildFileTree(['a/b/c.ts'])
    expect(tree.length).toBe(1)
    const a = asDir(tree[0])
    expect(a.name).toBe('a')
    expect(a.path).toBe('a') // 디렉토리 경로는 뒤 슬래시 없음
    expect(a.children.length).toBe(1)
    const b = asDir(a.children[0])
    expect(b.name).toBe('b')
    expect(b.path).toBe('a/b')
    expect(b.children.length).toBe(1)
    const c = asFile(b.children[0])
    expect(c.name).toBe('c.ts')
    expect(c.path).toBe('a/b/c.ts') // 파일 path는 저장소 기준 풀경로
  })

  it('형제 정렬: 디렉토리 먼저(알파벳) → 파일(알파벳)', () => {
    // 의도적으로 뒤섞인 입력
    const tree = buildFileTree(['z.ts', 'm/x.ts', 'a.ts', 'k/y.ts'])
    expect(tree.map(n => n.type)).toEqual(['dir', 'dir', 'file', 'file'])
    expect(tree.map(n => n.name)).toEqual(['k', 'm', 'a.ts', 'z.ts'])
  })

  it('중첩 레벨에서도 디렉토리 먼저 → 파일, 각 알파벳으로 재귀 정렬', () => {
    const tree = buildFileTree(['a/c.ts', 'a/b/f2.ts', 'a/b/f1.ts'])
    const a = asDir(tree[0])
    // a 아래: dir b 가 file c.ts 보다 먼저
    expect(a.children.map(n => n.type)).toEqual(['dir', 'file'])
    const b = asDir(a.children[0])
    expect(b.name).toBe('b')
    // b 아래 파일들 알파벳 순
    expect(b.children.map(n => (n as FileTreeFileNode).name)).toEqual(['f1.ts', 'f2.ts'])
    expect(asFile(a.children[1]).path).toBe('a/c.ts')
  })

  it('같은 디렉토리의 여러 파일을 하나의 dir 노드로 그룹핑(dir 노드 재사용)', () => {
    const tree = buildFileTree(['src/a.ts', 'src/b.ts', 'src/c.ts'])
    expect(tree.length).toBe(1)
    const src = asDir(tree[0])
    expect(src.path).toBe('src')
    expect(src.children.length).toBe(3)
    expect(src.children.every(n => n.type === 'file')).toBe(true)
    expect(src.children.map(n => n.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts'])
  })

  it('여러 최상위 디렉토리가 각자 서브트리를 갖는다', () => {
    const tree = buildFileTree(['src/a.ts', 'lib/c.ts'])
    expect(tree.map(n => n.name)).toEqual(['lib', 'src']) // 알파벳
    expect(asDir(tree[0]).children.map(n => n.path)).toEqual(['lib/c.ts'])
    expect(asDir(tree[1]).children.map(n => n.path)).toEqual(['src/a.ts'])
  })

  it('중복 파일 경로는 무시(한 번만 등장)', () => {
    const tree = buildFileTree(['a.ts', 'a.ts', 'src/x.ts', 'src/x.ts'])
    expect(tree.filter(n => n.type === 'file').length).toBe(1)
    const src = asDir(tree.find(n => n.type === 'dir')!)
    expect(src.children.length).toBe(1)
    expect(src.children[0].path).toBe('src/x.ts')
  })

  it('빈 문자열 경로는 무시', () => {
    const tree = buildFileTree(['', 'a.ts', ''])
    expect(tree).toEqual([{ type: 'file', name: 'a.ts', path: 'a.ts' }])
  })

  it('깊은 중첩도 세그먼트마다 누적 path를 갖는다', () => {
    const tree = buildFileTree(['x/y/z/deep.ts'])
    const x = asDir(tree[0]); expect(x.path).toBe('x')
    const y = asDir(x.children[0]); expect(y.path).toBe('x/y')
    const z = asDir(y.children[0]); expect(z.path).toBe('x/y/z')
    const f = asFile(z.children[0]); expect(f.path).toBe('x/y/z/deep.ts')
  })
})

describe('ancestorDirs', () => {
  it('루트 파일은 조상 디렉토리가 없다', () => {
    expect(ancestorDirs('a.ts')).toEqual([])
  })

  it('2뎁스: 상위 디렉토리 하나', () => {
    expect(ancestorDirs('a/b.ts')).toEqual(['a'])
  })

  it('예시 그대로: a/b/c.ts → [a, a/b]', () => {
    expect(ancestorDirs('a/b/c.ts')).toEqual(['a', 'a/b'])
  })

  it('깊은 중첩은 누적 경로 전부', () => {
    expect(ancestorDirs('a/b/c/d/e.ts')).toEqual(['a', 'a/b', 'a/b/c', 'a/b/c/d'])
  })

  it('빈 문자열은 조상 없음', () => {
    expect(ancestorDirs('')).toEqual([])
  })

  // ── 입력 계약: listFiles 는 선행/후행 슬래시 없는 저장소 기준 상대경로를 준다.
  // 아래는 그 계약을 벗어난 입력에 대한 현재 동작을 고정(characterization)하는 테스트.
  // 계약 위반 입력은 실제로 발생하지 않으므로 버그가 아니라 '문서화' 목적이다.
  it('후행 슬래시가 붙으면 마지막 세그먼트를 파일명으로 보고 그 앞까지 조상으로 본다', () => {
    // 'a/b/' → split ['a','b',''] → 파일명('') 제거 → 조상 [a, a/b]
    expect(ancestorDirs('a/b/')).toEqual(['a', 'a/b'])
  })
})
