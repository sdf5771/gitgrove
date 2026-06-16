// 그루(Geuru) 픽셀 스프라이트 데이터 + 렌더 헬퍼.
// 디자인 정본(GitGrove Character.html / GitGrove Geuru UI.html)의 PAL/BASE/EXP/renderSprite를
// 그대로 포팅했습니다. 픽셀 데이터는 변경 금지.

export type GeuruExpr = 'idle' | 'happy' | 'think' | 'merge' | 'conflict' | 'sleepy' | 'blink'

// ── Palette ──
export const PAL: Record<string, string | null> = {
  '.': null,
  G: '#e6a536', // gold body
  D: '#c98a22', // shadow gold
  H: '#ffd770', // highlight gold
  L: '#6fcf7c', // leaf
  l: '#3f9550', // dark leaf / stem
  E: '#10182b', // eye navy
  W: '#f4ecd2', // eye shine
  k: '#ff9b6b', // cheek blush
  b: '#8a5a1e', // root feet
  m: '#7a4412', // mouth
  s: '#5fb8e6', // sweat / sparkle blue
  z: '#9fb0d8', // zzz / soft
}

// ── Base sprite (16 wide × 18 tall) ──
export const BASE: string[] = [
  '................',
  '....LL....LL....',
  '...LlLL..LLlL...',
  '....LLLllLLL....',
  '.......ll.......',
  '....GGGGGGGG....',
  '...HHGGGGGGGG...',
  '..HHGGGGGGGGGG..',
  '..GGGWEGGWEGGG..',
  '..GkGEEGGEEGkG..',
  '..GGGGGmmGGGGD..',
  '..GGGGGGGGGGDD..',
  '...GGGGGGGGDD...',
  '...GGGGGGGDDD...',
  '....DGGGGGGD....',
  '....bb....bb....',
  '................',
  '................',
]

// ── Expressions (eye + mouth patches over BASE) ──
export const EXP: Record<GeuruExpr, Record<string, string>> = {
  idle: {},
  happy: { '8,5': 'G', '8,6': 'G', '8,9': 'G', '8,10': 'G', '9,5': 'E', '9,6': 'E', '9,9': 'E', '9,10': 'E', '9,3': 'k', '9,12': 'k', '10,5': 'G', '10,6': 'm', '10,7': 'm', '10,8': 'm', '10,9': 'm', '10,12': 'G', '11,6': 'G', '11,7': 'm', '11,8': 'm', '11,9': 'G' },
  think: { '8,5': 'E', '8,6': 'E', '8,9': 'E', '8,10': 'E', '9,5': 'G', '9,6': 'G', '9,9': 'G', '9,10': 'G', '10,5': 'G', '10,6': 'G', '10,7': 'm', '10,8': 'G', '8,13': 'z', '7,13': 'z' },
  merge: { '8,5': 'H', '8,6': 'E', '8,9': 'H', '8,10': 'E', '9,5': 'E', '9,6': 'H', '9,9': 'E', '9,10': 'H', '9,3': 'k', '9,12': 'k', '10,5': 'm', '10,6': 'G', '10,7': 'm', '10,8': 'm', '10,9': 'G', '10,10': 'm', '11,6': 'm', '11,7': 'm', '11,8': 'm', '11,9': 'm', '7,1': 'H', '7,14': 'H', '12,2': 'H' },
  conflict: { '8,5': 'E', '8,6': 'E', '8,9': 'E', '8,10': 'E', '9,5': 'E', '9,6': 'E', '9,9': 'E', '9,10': 'E', '10,6': 'G', '10,7': 'm', '10,8': 'm', '10,9': 'G', '11,7': 'm', '11,8': 'm', '8,13': 's', '9,13': 's' },
  sleepy: { '8,5': 'G', '8,6': 'G', '8,9': 'G', '8,10': 'G', '9,5': 'E', '9,6': 'E', '9,9': 'E', '9,10': 'E', '10,7': 'G', '10,8': 'm', '5,13': 'z', '4,14': 'z', '6,12': 'z' },
  blink: { '8,5': 'G', '8,6': 'G', '8,9': 'G', '8,10': 'G', '9,5': 'E', '9,6': 'E', '9,9': 'E', '9,10': 'E' },
}

export const COLS = 16
export const ROWS = 18

export interface SpriteCell {
  key: string
  x: number
  y: number
  fill: string
}

// 패치를 BASE에 적용한 뒤 색이 있는 셀만 반환. (renderSprite의 rect 생성부와 동일한 순회)
export function spriteCells(patch: Record<string, string>): SpriteCell[] {
  const cells: SpriteCell[] = []
  for (let y = 0; y < BASE.length; y++) {
    const row = BASE[y]
    for (let x = 0; x < row.length; x++) {
      const patched = patch[`${y},${x}`]
      const ch = patched !== undefined ? patched : row[x]
      const fill = PAL[ch]
      if (!fill) continue
      cells.push({ key: `${y}-${x}`, x, y, fill })
    }
  }
  return cells
}
