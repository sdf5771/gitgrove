// ──────────────────────────────────────────────
// 머지 충돌 파싱·재구성 (순수 함수 — Electron/fs 비의존, 테스트 용이)
// ──────────────────────────────────────────────
//
// git 충돌 마커 형식:
//   <<<<<<< ours
//   ...ours 줄...
//   ======= (또는 diff3: |||||||  base ... ======= 사이가 base)
//   ...theirs 줄...
//   >>>>>>> theirs
//
// diff3 스타일(merge.conflictStyle=diff3)일 때 ours~theirs 사이에 base 섹션이 낀다:
//   <<<<<<< ours
//   ...ours...
//   ||||||| base
//   ...base...   ← 무시
//   =======
//   ...theirs...
//   >>>>>>>
// 따라서 ours 는 '<<<<<<<' ~ ('|||||||' 또는 '=======') 까지, base 는 무시한다.

// 충돌 마커 라인 판별 (git 은 마커 뒤 라벨이 붙으므로 startsWith 로 본다).
const isStart = (l: string): boolean => l.startsWith('<<<<<<<')
const isBase = (l: string): boolean => l.startsWith('|||||||')
const isSep = (l: string): boolean => l.startsWith('=======')
const isEnd = (l: string): boolean => l.startsWith('>>>>>>>')

export interface ParsedHunk {
  id: string
  ours: string[]
  theirs: string[]
  startLine: number // 원본 파일에서 ours 첫 줄의 1-based 줄 번호(에디터 거터·loc 표시용)
}

export interface ParsedConflictFile {
  path: string
  conflicts: ParsedHunk[]
}

// 줄바꿈 보존을 위해 EOL 종류를 유지하며 줄로 분해한다.
// 각 원소는 EOL 을 제외한 줄 내용; eols[i] 는 line[i] 뒤에 붙는 EOL('\r\n'|'\n'|'').
interface SplitResult {
  lines: string[]
  eols: string[] // lines 와 동일 길이; 마지막 줄에 EOL 없으면 ''
}

export function splitLines(content: string): SplitResult {
  const lines: string[] = []
  const eols: string[] = []
  let i = 0
  let start = 0
  while (i < content.length) {
    const ch = content[i]
    if (ch === '\n') {
      lines.push(content.slice(start, i))
      eols.push('\n')
      i++
      start = i
    } else if (ch === '\r') {
      // \r\n 또는 단독 \r
      if (content[i + 1] === '\n') {
        lines.push(content.slice(start, i))
        eols.push('\r\n')
        i += 2
      } else {
        lines.push(content.slice(start, i))
        eols.push('\r')
        i++
      }
      start = i
    } else {
      i++
    }
  }
  // 마지막 EOL 뒤(또는 EOL 없는 끝)에 남은 내용. 비어 있으면(파일이 EOL 로 끝남) 추가하지 않음.
  if (start < content.length) {
    lines.push(content.slice(start))
    eols.push('')
  }
  return { lines, eols }
}

/**
 * 충돌 파일 내용을 파싱해 hunk 목록을 만든다.
 * 마커가 깨졌거나(시작 후 종료 없음 등) 충돌이 없으면 빈 배열.
 * idPrefix 는 hunk id 생성용(`${idPrefix}#${i}`).
 */
export function parseConflicts(content: string, idPrefix: string): ParsedHunk[] {
  const { lines } = splitLines(content)
  const hunks: ParsedHunk[] = []
  let i = 0
  let idx = 0
  while (i < lines.length) {
    if (!isStart(lines[i])) {
      i++
      continue
    }
    // 시작 마커 발견 — ours 수집(다음 '|||||||' 또는 '=======' 전까지).
    // 마커 줄은 lines[i](0-based) → 1-based 마커 줄=i+1, ours 첫 줄=i+2.
    const startLine = i + 2
    i++
    const ours: string[] = []
    while (i < lines.length) {
      if (isBase(lines[i])) {
        // base 섹션 — '=======' 까지 스킵.
        i++
        while (i < lines.length && !isSep(lines[i])) i++
        break
      }
      if (isSep(lines[i])) break
      ours.push(lines[i])
      i++
    }
    if (i >= lines.length || !isSep(lines[i])) {
      // '=======' 못 찾음 → 깨진 마커. 안전하게 중단.
      break
    }
    i++ // '=======' 소비
    // theirs 수집('>>>>>>>' 전까지).
    const theirs: string[] = []
    while (i < lines.length && !isEnd(lines[i])) {
      theirs.push(lines[i])
      i++
    }
    if (i >= lines.length || !isEnd(lines[i])) {
      // 종료 마커 못 찾음 → 깨진 마커. 이미 수집한 건 버리고 중단.
      break
    }
    i++ // '>>>>>>>' 소비
    hunks.push({ id: `${idPrefix}#${idx}`, ours, theirs, startLine })
    idx++
  }
  return hunks
}

export type Choice = 'ours' | 'theirs' | 'both'

/**
 * 충돌 파일을 choices 로 해소해 재구성된 전체 내용을 반환한다.
 * - 비충돌 영역은 정확히 보존(줄바꿈/CRLF 포함).
 * - 마커 라인(<<<<<<< / ||||||| / ======= / >>>>>>>)은 결과에서 제거.
 * - 충돌 블록 수와 choices 길이가 다르면 throw(부분 처리 금지).
 * - ours/theirs 줄 사이의 EOL 은 충돌 블록 내부의 원래 EOL 을 그대로 사용.
 */
export function reconstruct(content: string, choices: Choice[]): string {
  const { lines, eols } = splitLines(content)
  const out: string[] = [] // 줄 내용
  const outEols: string[] = [] // 각 줄 뒤 EOL
  let i = 0
  let blockIdx = 0

  const pushLine = (line: string, eol: string) => {
    out.push(line)
    outEols.push(eol)
  }

  while (i < lines.length) {
    if (!isStart(lines[i])) {
      pushLine(lines[i], eols[i])
      i++
      continue
    }
    // 충돌 블록 진입. 블록 내부 줄들을 모으면서 그 줄의 EOL 도 보존.
    const ours: Array<{ line: string; eol: string }> = []
    const theirs: Array<{ line: string; eol: string }> = []
    const startEol = eols[i] // 블록의 대표 EOL(시작 마커 줄의 EOL) — 누락 EOL 보강용 폴백.
    i++ // 시작 마커 소비
    let inTheirs = false
    let closed = false
    while (i < lines.length) {
      if (isBase(lines[i])) {
        // base 섹션 스킵 — '=======' 까지.
        i++
        while (i < lines.length && !isSep(lines[i])) i++
        continue
      }
      if (isSep(lines[i])) {
        inTheirs = true
        i++
        continue
      }
      if (isEnd(lines[i])) {
        i++
        closed = true
        break
      }
      if (inTheirs) theirs.push({ line: lines[i], eol: eols[i] })
      else ours.push({ line: lines[i], eol: eols[i] })
      i++
    }
    if (!closed) {
      // 깨진 마커 — 안전 throw(부분 상태 방지).
      throw new Error('충돌 마커가 손상되어 해석할 수 없어요')
    }
    const choice = choices[blockIdx]
    if (choice === undefined) {
      throw new Error('choices 길이가 충돌 블록 수와 일치하지 않아요')
    }
    let picked: Array<{ line: string; eol: string }> = []
    if (choice === 'ours') picked = ours
    else if (choice === 'theirs') picked = theirs
    else picked = [...ours, ...theirs] // 'both' — ours 먼저
    for (const p of picked) {
      // 충돌 블록 마지막 줄의 EOL 이 '' 인 경우(파일 끝 직전 등)는 startEol 로 보강.
      pushLine(p.line, p.eol || startEol)
    }
    blockIdx++
  }

  if (blockIdx !== choices.length) {
    throw new Error('choices 길이가 충돌 블록 수와 일치하지 않아요')
  }

  // 재조립: 각 줄 + 그 줄의 EOL.
  let result = ''
  for (let k = 0; k < out.length; k++) {
    result += out[k] + outEols[k]
  }
  return result
}

// 바이너리 추정(NUL 바이트 포함). 충돌 파싱 대상에서 제외.
export function looksBinary(content: string): boolean {
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 0) return true
  }
  return false
}
