import type { DiffLine } from '../data/mockData'

export interface SbsRow {
  t: 'hunk' | 'pair' | 'ctx'
  s?: string
  L: { n: number; s: string } | null
  R: { n: number; s: string } | null
}

export function sideBySide(lines: DiffLine[]): SbsRow[] {
  const rows: SbsRow[] = []
  let ln = 1, rn = 1, i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (l.t === 'hunk') {
      const m = l.s.match(/@@ -(\d+)[,\d]* \+(\d+)/)
      if (m) { ln = parseInt(m[1]); rn = parseInt(m[2]) }
      rows.push({ t: 'hunk', s: l.s, L: null, R: null }); i++
    } else if (l.t === 'del') {
      const D: string[] = [], A: string[] = []
      while (i < lines.length && lines[i].t === 'del') D.push(lines[i++].s.slice(1))
      while (i < lines.length && lines[i].t === 'add') A.push(lines[i++].s.slice(1))
      const n = Math.max(D.length, A.length)
      for (let j = 0; j < n; j++) {
        rows.push({
          t: 'pair',
          L: D[j] !== undefined ? { n: ln++, s: D[j] } : null,
          R: A[j] !== undefined ? { n: rn++, s: A[j] } : null,
        })
      }
    } else if (l.t === 'add') {
      rows.push({ t: 'pair', L: null, R: { n: rn++, s: l.s.slice(1) } }); i++
    } else {
      const s = l.s.startsWith(' ') ? l.s.slice(1) : l.s
      rows.push({ t: 'ctx', L: { n: ln++, s }, R: { n: rn++, s } }); i++
    }
  }
  return rows
}
