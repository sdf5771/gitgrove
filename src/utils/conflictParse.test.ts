import { describe, it, expect } from 'vitest'
import {
  parseConflicts,
  reconstruct,
  splitLines,
  looksBinary,
  type Choice,
} from './conflictParse'

// 충돌 마커 빌더 — 테스트 가독성 + 마커 오타 방지.
const START = '<<<<<<< HEAD'
const SEP = '======='
const END = '>>>>>>> branch'
const BASE = '||||||| base'

describe('splitLines (EOL 보존)', () => {
  it('LF 줄을 보존한다', () => {
    const r = splitLines('a\nb\nc')
    expect(r.lines).toEqual(['a', 'b', 'c'])
    expect(r.eols).toEqual(['\n', '\n', ''])
  })

  it('CRLF 줄을 보존한다', () => {
    const r = splitLines('a\r\nb\r\n')
    expect(r.lines).toEqual(['a', 'b'])
    expect(r.eols).toEqual(['\r\n', '\r\n'])
  })

  it('트레일링 개행 유무를 구분한다', () => {
    expect(splitLines('a\n').lines).toEqual(['a'])
    expect(splitLines('a\n').eols).toEqual(['\n'])
    expect(splitLines('a').eols).toEqual([''])
  })
})

describe('parseConflicts', () => {
  it('단일 충돌 블록을 ours/theirs 로 파싱', () => {
    const content = [
      'top',
      START,
      'mine1',
      'mine2',
      SEP,
      'yours1',
      END,
      'bottom',
    ].join('\n')
    const hunks = parseConflicts(content, 'a.txt')
    expect(hunks).toHaveLength(1)
    expect(hunks[0].id).toBe('a.txt#0')
    expect(hunks[0].ours).toEqual(['mine1', 'mine2'])
    expect(hunks[0].theirs).toEqual(['yours1'])
    // 'top'(1) · '<<<<<<<'(2) · 'mine1'(3) → ours 첫 줄은 3번째 줄.
    expect(hunks[0].startLine).toBe(3)
  })

  it('한 파일에 여러 충돌 블록 → id 가 #0, #1 …', () => {
    const content = [
      START, 'm1', SEP, 't1', END,
      'middle',
      START, 'm2', SEP, 't2', END,
    ].join('\n')
    const hunks = parseConflicts(content, 'x')
    expect(hunks.map(h => h.id)).toEqual(['x#0', 'x#1'])
    expect(hunks[1].ours).toEqual(['m2'])
    expect(hunks[1].theirs).toEqual(['t2'])
  })

  it('diff3 base 섹션(|||||||)은 무시 — ours 는 <<<<<<< ~ ||||||| 까지', () => {
    const content = [
      START, 'mine', BASE, 'common', SEP, 'theirs', END,
    ].join('\n')
    const hunks = parseConflicts(content, 'f')
    expect(hunks).toHaveLength(1)
    expect(hunks[0].ours).toEqual(['mine'])
    expect(hunks[0].theirs).toEqual(['theirs'])
  })

  it('빈 ours/theirs(한쪽이 빈 충돌)도 파싱', () => {
    const content = [START, SEP, 'only-theirs', END].join('\n')
    const hunks = parseConflicts(content, 'f')
    expect(hunks[0].ours).toEqual([])
    expect(hunks[0].theirs).toEqual(['only-theirs'])
  })

  it('충돌 없는 파일은 빈 배열', () => {
    expect(parseConflicts('just\nnormal\nlines\n', 'f')).toEqual([])
  })

  it('종료 마커 없는 깨진 블록은 안전하게 중단(빈 배열)', () => {
    const content = [START, 'm', SEP, 't'].join('\n') // END 없음
    expect(parseConflicts(content, 'f')).toEqual([])
  })
})

describe('reconstruct (비충돌 보존 + 마커 제거)', () => {
  const content = [
    'top',
    START,
    'mine',
    SEP,
    'yours',
    END,
    'bottom',
  ].join('\n')

  it("ours 선택 → ours 줄만, 마커 제거, 비충돌 보존", () => {
    expect(reconstruct(content, ['ours'])).toBe('top\nmine\nbottom')
  })

  it('theirs 선택 → theirs 줄만', () => {
    expect(reconstruct(content, ['theirs'])).toBe('top\nyours\nbottom')
  })

  it('both 선택 → ours 먼저, theirs 다음', () => {
    expect(reconstruct(content, ['both'])).toBe('top\nmine\nyours\nbottom')
  })

  it('여러 블록을 순서대로 다른 choice 로 치환', () => {
    const multi = [
      'a',
      START, 'm1', SEP, 't1', END,
      'b',
      START, 'm2', SEP, 't2', END,
      'c',
    ].join('\n')
    expect(reconstruct(multi, ['ours', 'theirs'])).toBe('a\nm1\nb\nt2\nc')
  })

  it('diff3 base 는 결과에서 제거', () => {
    // 'theirs' 줄은 END 마커 앞이라 원래 \n EOL 을 보존한다(git 동작과 일치).
    const d3 = [START, 'mine', BASE, 'common', SEP, 'theirs', END].join('\n')
    expect(reconstruct(d3, ['both'])).toBe('mine\ntheirs\n')
  })

  it('CRLF 줄바꿈을 보존', () => {
    const crlf = ['top', START, 'mine', SEP, 'yours', END, 'bottom'].join('\r\n')
    expect(reconstruct(crlf, ['ours'])).toBe('top\r\nmine\r\nbottom')
  })

  it('충돌 없는 파일은 원본 그대로(트레일링 개행 포함)', () => {
    const plain = 'one\ntwo\n'
    expect(reconstruct(plain, [])).toBe(plain)
  })

  it('choices 길이 < 충돌 수 → throw(부분 처리 금지)', () => {
    const two = [START, 'm1', SEP, 't1', END, START, 'm2', SEP, 't2', END].join('\n')
    expect(() => reconstruct(two, ['ours'] as Choice[])).toThrow()
  })

  it('choices 길이 > 충돌 수 → throw', () => {
    expect(() => reconstruct(content, ['ours', 'theirs'] as Choice[])).toThrow()
  })

  it('깨진 마커(종료 없음) → throw(부분 상태 방지)', () => {
    const broken = ['top', START, 'mine', SEP, 'yours'].join('\n')
    expect(() => reconstruct(broken, ['ours'])).toThrow()
  })

  it('비충돌 영역의 마커처럼 보이지 않는 텍스트는 보존', () => {
    // 't' 는 END 마커 앞이라 원래 \n EOL 보존.
    const c = ['<<< not a marker', 'normal', START, 'm', SEP, 't', END].join('\n')
    expect(reconstruct(c, ['theirs'])).toBe('<<< not a marker\nnormal\nt\n')
  })
})

describe('looksBinary', () => {
  it('NUL 바이트가 있으면 true', () => {
    expect(looksBinary('abc\u0000def')).toBe(true)
  })
  it('일반 텍스트는 false', () => {
    expect(looksBinary('hello\nworld\n')).toBe(false)
  })
})
