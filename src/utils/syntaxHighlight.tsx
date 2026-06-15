const KW = new Set(['const','let','var','function','class','import','export','from','return','if','else','throw','async','await','new','type','interface','extends','private','public','readonly','this','constructor','super','static','for','while','do','try','catch','finally','switch','case','default','break','continue','typeof','instanceof'])
const BUILTIN = new Set(['string','number','boolean','void','any','Promise','Observable','Injectable','Logger','JwtPayload','JwtConfig','OAuthToken','TokenExpiredError','HttpService','ConfigService','firstValueFrom','Array','Object','Map','Set','Error','Date','Math','console','undefined','null','true','false'])

export function HL({ s }: { s: string }) {
  if (!s || !s.trim()) return <span>{s || ''}</span>
  const tokens: React.ReactNode[] = []
  let i = 0
  const re = /(@\w+|'[^']*'|"[^"]*"|`[^`]*`|\/\/[^\n]*|\b\d+\b|\w+|[^\w\s'"`@/]+|\s+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    const tk = m[0]
    let col: string | null = null
    if (tk.startsWith('//'))                          col = '#4a5670'
    else if (tk.startsWith('@'))                      col = '#f5b94a'
    else if (KW.has(tk))                              col = '#c39ad9'
    else if (BUILTIN.has(tk))                         col = '#5fb8e6'
    else if (tk[0] === "'" || tk[0] === '"' || tk[0] === '`') col = '#93c5a8'
    else if (/^\d+$/.test(tk))                        col = '#e6a536'
    else if (/^[{}[\]();,=<>!&|+\-*/^~:?]+$/.test(tk)) col = '#6d8099'
    tokens.push(col ? <span key={i++} style={{ color: col }}>{tk}</span> : <span key={i++}>{tk}</span>)
  }
  return <>{tokens}</>
}
