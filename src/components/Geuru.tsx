// 그루 (Geuru) — GitGrove 마스코트 픽셀 스프라이트 컴포넌트.
// 스프라이트 데이터/헬퍼는 src/utils/geuruSprite.ts (디자인 정본 포팅)에서 가져옵니다.
import { COLS, ROWS, EXP, spriteCells, type GeuruExpr } from '../utils/geuruSprite'

export type { GeuruExpr }

interface Props {
  expr?: GeuruExpr
  /** 픽셀 확대 계수. 디자인 배율을 그대로 사용. */
  scale?: number
  title?: string
  className?: string
}

/**
 * 그루 스프라이트 SVG.
 * `renderSprite(BASE, scale, EXP[expr])`의 React 포팅 — rect width/height=1.02로 픽셀 사이 틈을 막습니다.
 */
export function Geuru({ expr = 'idle', scale = 2, title, className }: Props) {
  const cells = spriteCells(EXP[expr])
  return (
    <svg
      className={className ? `sprite ${className}` : 'sprite'}
      width={COLS * scale}
      height={ROWS * scale}
      viewBox={`0 0 ${COLS} ${ROWS}`}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {cells.map(c => (
        <rect key={c.key} x={c.x} y={c.y} width={1.02} height={1.02} fill={c.fill} />
      ))}
    </svg>
  )
}
