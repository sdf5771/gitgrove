// 파일명 마지막 확장자 추출. 확장자 없으면(dotfile 포함) null.
// 예: 'a/b/App.tsx' → 'tsx', '.gitignore' → null, 'Makefile' → null, 'a.test.tsx' → 'tsx'.
export function fileExtension(path: string): string | null {
  const base = path.split('/').pop() ?? path
  const dot = base.lastIndexOf('.')
  // 선행 dot(=dotfile, dot이 맨 앞) 또는 dot 없음 → 확장자 없음
  if (dot <= 0) return null
  const ext = base.slice(dot + 1)
  return ext.length > 0 ? ext : null
}
