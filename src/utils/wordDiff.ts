// 한 쌍의 수정된 줄(삭제 ↔ 추가) 사이의 문자 단위 차이를 계산한다.
// 공통 접두/접미를 벗겨 낸 가운데만 changed=true 로 표시(간단·안정적인 intra-line diff).
// 순수 함수 — 테스트 용이. 구문 하이라이트와 섞지 않는다(add/del 줄 전용).

export interface WordSeg { text: string; changed: boolean }

export function wordDiff(a: string, b: string): { a: WordSeg[]; b: WordSeg[] } {
  const la = a.length
  const lb = b.length
  // 공통 접두 길이
  let p = 0
  while (p < la && p < lb && a[p] === b[p]) p++
  // 공통 접미 길이(접두와 겹치지 않게)
  let s = 0
  while (s < la - p && s < lb - p && a[la - 1 - s] === b[lb - 1 - s]) s++

  const build = (str: string, len: number): WordSeg[] => {
    const segs: WordSeg[] = []
    const pre = str.slice(0, p)
    const mid = str.slice(p, len - s)
    const post = str.slice(len - s)
    if (pre) segs.push({ text: pre, changed: false })
    if (mid) segs.push({ text: mid, changed: true })
    if (post) segs.push({ text: post, changed: false })
    // 완전히 동일하면(변경 없음) 빈 세그 대신 원문 그대로 하나.
    if (segs.length === 0) segs.push({ text: str, changed: false })
    return segs
  }

  return { a: build(a, la), b: build(b, lb) }
}
