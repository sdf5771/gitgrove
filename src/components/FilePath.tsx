export function FilePath({ path }: { path: string }) {
  const parts = path.split('/')
  if (parts.length < 2) return <span className="fpath">{path}</span>
  const file = parts.pop()!
  return (
    <span className="fpath">
      <span className="fpdir">{parts.join('/')}/</span>
      {file}
    </span>
  )
}
