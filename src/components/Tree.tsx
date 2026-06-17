// 그로브 카드 트리타일 SVG. 성장단계별 픽셀 나무를 렌더한다.
// 데이터/헬퍼는 src/utils/treeSprite.ts (디자인 정본 포팅).
import { TREE_COLS, TREE_ROWS, treeCells } from '../utils/treeSprite'
import type { GrowthStage } from '../utils/repoActivity'

interface Props {
  stage: GrowthStage
  /** 픽셀 확대 계수. 카드 트리타일은 2.6 (정본 tree(st,2.6)). */
  scale?: number
  title?: string
}

const STAGE_LABEL: Record<GrowthStage, string> = {
  0: '새싹 단계',
  1: '어린 나무',
  2: '자란 나무',
  3: '무성한 나무',
}

export function Tree({ stage, scale = 2.6, title }: Props) {
  const cells = treeCells(stage)
  const label = title ?? STAGE_LABEL[stage]
  return (
    <svg
      className="sprite tree-sprite"
      width={TREE_COLS * scale}
      height={TREE_ROWS * scale}
      viewBox={`0 0 ${TREE_COLS} ${TREE_ROWS}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {cells.map(c => (
        <rect key={c.key} x={c.x} y={c.y} width={1.04} height={1.04} fill={c.fill} />
      ))}
    </svg>
  )
}
