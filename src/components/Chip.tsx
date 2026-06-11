import { CommitLabel } from '../data/mockData'

const CHIP_STYLES: Record<string, React.CSSProperties> = {
  head:   { background:'#e6a536', color:'#1a1206', borderColor:'#c98a22' },
  branch: { background:'rgba(95,184,230,.18)', color:'#5fb8e6', borderColor:'rgba(95,184,230,.4)' },
  hotfix: { background:'rgba(255,107,107,.15)', color:'#ff6b6b', borderColor:'rgba(255,107,107,.4)' },
  remote: { background:'rgba(109,119,152,.15)', color:'#8090b4', borderColor:'#2d3551' },
  tag:    { background:'rgba(111,207,124,.15)', color:'#6fcf7c', borderColor:'rgba(111,207,124,.4)' },
}

export function Chip({ text, type }: CommitLabel) {
  const style = CHIP_STYLES[type] ?? CHIP_STYLES.remote
  return <span className="chip" style={style}>{text}</span>
}
