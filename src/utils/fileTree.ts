// 정렬된 상대경로 배열을 디렉토리/파일 중첩 트리로 빌드하는 순수 함수.
// Blame 파일 선택기(VSCode식 계층 트리)에서 사용. 단위테스트 용이하게 export.

export interface FileTreeFileNode {
  type: 'file'
  name: string // 파일명(base)
  path: string // 저장소 기준 상대 전체 경로
}

export interface FileTreeDirNode {
  type: 'dir'
  name: string // 디렉토리 세그먼트명
  path: string // 저장소 기준 디렉토리 경로(뒤 슬래시 없음)
  children: FileTreeNode[]
}

export type FileTreeNode = FileTreeDirNode | FileTreeFileNode

// 디렉토리 먼저(알파벳) → 파일(알파벳) 순으로 재귀 정렬.
function sortTree(children: FileTreeNode[]): void {
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const c of children) if (c.type === 'dir') sortTree(c.children)
}

// paths → 중첩 트리(최상위 노드 배열). 빈/중복 경로는 무시.
export function buildFileTree(paths: string[]): FileTreeNode[] {
  const rootChildren: FileTreeNode[] = []
  const dirIndex = new Map<string, FileTreeDirNode>() // dirPath → 노드(재사용)

  for (const p of paths) {
    if (!p) continue
    const parts = p.split('/')
    let siblings = rootChildren
    let prefix = ''
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      const isFile = i === parts.length - 1
      if (isFile) {
        if (!siblings.some(c => c.type === 'file' && c.path === p)) {
          siblings.push({ type: 'file', name: seg, path: p })
        }
      } else {
        const dirPath = prefix ? `${prefix}/${seg}` : seg
        let node = dirIndex.get(dirPath)
        if (!node) {
          node = { type: 'dir', name: seg, path: dirPath, children: [] }
          dirIndex.set(dirPath, node)
          siblings.push(node)
        }
        siblings = node.children
        prefix = dirPath
      }
    }
  }

  sortTree(rootChildren)
  return rootChildren
}

// 파일 경로의 조상 디렉토리 경로들(누적). 예: 'a/b/c.ts' → ['a', 'a/b'].
export function ancestorDirs(filePath: string): string[] {
  const parts = filePath.split('/')
  parts.pop() // 파일명 제거
  const dirs: string[] = []
  let acc = ''
  for (const seg of parts) {
    acc = acc ? `${acc}/${seg}` : seg
    dirs.push(acc)
  }
  return dirs
}
