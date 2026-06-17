// 그로브 카드 트리타일 — 성장단계(0~3)별 픽셀 나무 스프라이트.
// 디자인 정본(Repository Management.html)의 TPAL/treeGrid를 그대로 포팅했다.
// 픽셀 데이터는 변경 금지. stage = stageOf(total)(0 seedling → 3 flourishing).
import type { GrowthStage } from './repoActivity'

// ── Palette (tree) ──
const TPAL: Record<string, string | null> = {
  '.': null,
  t: '#8a5a1e', // trunk
  T: '#a06a26', // trunk highlight (미사용이지만 정본 유지)
  L: '#6fcf7c', // leaf
  l: '#3f9550', // dark leaf / stem
  H: '#8fe09a', // leaf highlight
  G: '#e6a536', // gold fruit
}

// 16×16, 바닥에 땅. stage 별 캐노피 풍성함이 최근 커밋량을 반영.
const GRIDS: Record<GrowthStage, string[]> = {
  0: [ // seedling
    '................', '................', '................', '................',
    '................', '................', '................', '.......LL.......',
    '......LllL......', '.......Hl.......', '........l.......', '........l.......',
    '......tttt......', '.....tttttt.....', '................', '................',
  ],
  1: [ // young
    '................', '................', '................', '.......LL.......',
    '......LLLL......', '.....LLllLL.....', '......LLLL......', '.....LHLLLL.....',
    '......LllL......', '........l.......', '........l.......', '.......ttt......',
    '......ttttt.....', '.....tttttt.....', '................', '................',
  ],
  2: [ // grown
    '................', '......LLLL......', '.....LLLLLL.....', '....LLLllLLL....',
    '...LLLLLLLLLL...', '...LLLHLLLLLL...', '....LLLLLLLL....', '.....LLllLL.....',
    '......LllL......', '.......ll.......', '......ttttt.....', '......ttttt.....',
    '.....ttttttt....', '....ttttttttt...', '................', '................',
  ],
  3: [ // flourishing (+ gold fruit)
    '.....LLLLLL.....', '...LLLLLLLLLL...', '..LLLLLLHLLLLL..', '..LLLHLLLLLLLL..',
    '.LLLLLLLLLGLLLL.', '.LLLLLLLLLLLLLL.', '..LLLLLllLLLLL..', '...LLLLllLLLL...',
    '....LLLllLL.....', '......tll.......', '......ttttt.....', '......ttttt.....',
    '.....ttttttt....', '....ttttttttt...', '...ttttttttttt..', '................',
  ],
}

export interface TreeCell { key: string; x: number; y: number; fill: string }

// 색이 있는 셀만 반환 (정본 tree()의 rect 생성부와 동일 순회).
export function treeCells(stage: GrowthStage): TreeCell[] {
  const grid = GRIDS[stage] ?? GRIDS[0]
  const cells: TreeCell[] = []
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]
    for (let x = 0; x < 16; x++) {
      const fill = TPAL[row[x]]
      if (!fill) continue
      cells.push({ key: `${y}-${x}`, x, y, fill })
    }
  }
  return cells
}

export const TREE_COLS = 16
export const TREE_ROWS = 16
