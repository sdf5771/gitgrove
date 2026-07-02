// 토스트 카탈로그 단위 테스트.
// 각 팩토리가 올바른 {type,title,msg,geuru,dur}를 만드는지,
// spread()가 DEFAULTS로 빈 칸(dur·geuru)을 채워 notify(...) 인자 튜플을
// 정확히 만드는지(특히 fallback, onClick 위치)를 검증한다.

import { describe, it, expect } from 'vitest'
import { TOASTS, spread, type Toast } from './toasts'

describe('TOASTS 팩토리', () => {
  it('branchSwitched — 가운뎃점 제목·happy·3000', () => {
    expect(TOASTS.branchSwitched('main')).toEqual({
      type: 'success', title: '브랜치 전환 · main', geuru: 'happy', dur: 3000,
    })
  })

  it('branchSwitchFailed — 에러·메시지 본문, geuru/dur는 기본값에 위임(미지정)', () => {
    const t = TOASTS.branchSwitchFailed('detached HEAD')
    expect(t).toEqual({ type: 'error', title: '브랜치 전환 실패', msg: 'detached HEAD' })
    expect(t.geuru).toBeUndefined()
    expect(t.dur).toBeUndefined()
  })

  it('hunkStaged / hunkUnstaged — 경로 본문·3000', () => {
    expect(TOASTS.hunkStaged('src/a.ts')).toEqual({ type: 'success', title: '헝크 올림', msg: 'src/a.ts', dur: 3000 })
    expect(TOASTS.hunkUnstaged('src/b.ts')).toEqual({ type: 'success', title: '헝크 내림', msg: 'src/b.ts', dur: 3000 })
  })

  it('committed — 본문 "변경을 심었어요"', () => {
    expect(TOASTS.committed()).toEqual({ type: 'success', title: '커밋 완료', msg: '변경을 심었어요' })
  })

  it('merged — merge 표정으로 격상, 본문 없음', () => {
    const t = TOASTS.merged()
    expect(t).toEqual({ type: 'success', title: '머지 완료', geuru: 'merge' })
    expect(t.msg).toBeUndefined()
  })

  it('cherryPicked / rebased', () => {
    expect(TOASTS.cherryPicked('a1b2c3d')).toEqual({ type: 'success', title: '체리픽 완료', msg: 'a1b2c3d' })
    expect(TOASTS.rebased()).toEqual({ type: 'info', title: '리베이스 완료' })
  })

  it('reverted — happy·되돌리기 커밋 안내 본문', () => {
    expect(TOASTS.reverted('a1b2c3d')).toEqual({
      type: 'success', title: '되돌리기 · a1b2c3d', msg: '되돌리기 커밋을 만들었어요', geuru: 'happy',
    })
  })

  it('revertFailed / resetFailed / commitLoadFailed — 파괴적 에러는 conflict로 격상', () => {
    expect(TOASTS.revertFailed('e').geuru).toBe('conflict')
    expect(TOASTS.resetFailed('e').geuru).toBe('conflict')
    expect(TOASTS.commitLoadFailed('e').geuru).toBe('conflict')
  })

  it('resetDone — warning·mode/hash 본문', () => {
    expect(TOASTS.resetDone('hard', 'a1b2c3d')).toEqual({
      type: 'warning', title: '리셋 · hard', msg: 'HEAD를 a1b2c3d로 옮겼어요',
    })
  })

  it('tagCreated — 따옴표 제목·화살표 본문', () => {
    expect(TOASTS.tagCreated('v1.0', 'a1b2c3d')).toEqual({
      type: 'success', title: "태그 생성 · 'v1.0'", msg: 'v1.0 → a1b2c3d',
    })
  })

  it('copied — "{what} 복사됨"·3000', () => {
    expect(TOASTS.copied('해시', 'a1b2c3d')).toEqual({ type: 'success', title: '해시 복사됨', msg: 'a1b2c3d', dur: 3000 })
    expect(TOASTS.copied('메시지', 'fix bug')).toEqual({ type: 'success', title: '메시지 복사됨', msg: 'fix bug', dur: 3000 })
  })

  it('원격 명령은 영문 제목 유지(툴바 버튼 일치), 완료는 merge 격상', () => {
    expect(TOASTS.branchPushed('main')).toEqual({ type: 'success', title: 'Push 완료', msg: 'main', geuru: 'merge' })
    expect(TOASTS.branchPulled('main')).toEqual({ type: 'success', title: 'Pull 완료', msg: 'main', geuru: 'merge' })
    expect(TOASTS.branchPushFailed('net').title).toBe('Push 실패')
    expect(TOASTS.branchPullFailed('net').title).toBe('Pull 실패')
    expect(TOASTS.fetchFailed('net').title).toBe('Fetch 실패')
  })

  it('notARepo — conflict·고정 본문(경로 미포함)', () => {
    expect(TOASTS.notARepo()).toEqual({
      type: 'error', title: 'Git 저장소가 아니에요', msg: '.git 폴더가 없거나 삭제됐어요', geuru: 'conflict',
    })
  })

  it('repoAdded / conflictResolved / workspace 계열', () => {
    expect(TOASTS.repoAdded('gitgrove')).toEqual({ type: 'success', title: '저장소 추가됨', msg: 'gitgrove' })
    expect(TOASTS.conflictResolved()).toEqual({ type: 'success', title: '충돌 해결됨', msg: '이제 머지할 수 있어요' })
    expect(TOASTS.workspaceCreated('팀')).toEqual({ type: 'success', title: '워크스페이스 생성', msg: '팀' })
    expect(TOASTS.workspaceDeleted('팀')).toEqual({ type: 'info', title: '워크스페이스 삭제', msg: "'팀' 삭제됨 · 저장소는 보존됐어요" })
    expect(TOASTS.comingSoon('PR')).toEqual({ type: 'info', title: 'PR 준비 중', msg: '다음 버전에서 제공돼요' })
  })

  it('updateAvailable — info·8000·onClick 보존', () => {
    const onClick = () => {}
    const t = TOASTS.updateAvailable('2.0.0', onClick)
    expect(t).toEqual({ type: 'info', title: 'GitGrove 2.0.0 출시', msg: '클릭해서 받기', onClick, dur: 8000 })
  })

  it('downloadDone — merge·6000, updateFailed — 8000', () => {
    expect(TOASTS.downloadDone()).toEqual({
      type: 'success', title: '다운로드 완료', msg: '설치 창이 열렸어요 · 안내대로 교체해 주세요', geuru: 'merge', dur: 6000,
    })
    expect(TOASTS.updateFailed()).toEqual({
      type: 'error', title: '업데이트 다운로드 실패', msg: '다시 클릭하면 재시도해요', dur: 8000,
    })
  })

  it('느낌표·줄바꿈·빈 문자열 본문 금지(라이팅 가이드)', () => {
    const factories: Array<() => Toast> = [
      () => TOASTS.committed(),
      () => TOASTS.merged(),
      () => TOASTS.notARepo(),
      () => TOASTS.downloadDone(),
      () => TOASTS.reverted('h'),
      () => TOASTS.resetDone('soft', 'h'),
    ]
    for (const f of factories) {
      const t = f()
      expect(t.title).not.toContain('!')
      if (t.msg !== undefined) {
        expect(t.msg).not.toBe('')
        expect(t.msg).not.toContain('\n')
        expect(t.msg).not.toContain('!')
      }
    }
  })
})

describe('spread() — notify 인자 튜플', () => {
  it('dur·geuru 미지정 시 DEFAULTS(success)로 채움', () => {
    // committed: { type:'success', title:'커밋 완료', msg:'변경을 심었어요' }
    const tuple = spread(TOASTS.committed())
    expect(tuple).toEqual(['success', '커밋 완료', '변경을 심었어요', undefined, 4000, 'happy'])
  })

  it('error 기본값 — geuru=conflict·dur=8000', () => {
    const tuple = spread(TOASTS.branchSwitchFailed('boom'))
    expect(tuple).toEqual(['error', '브랜치 전환 실패', 'boom', undefined, 8000, 'conflict'])
  })

  it('warning 기본값 — geuru=think·dur=4000', () => {
    const tuple = spread(TOASTS.resetDone('hard', 'a1b2c3d'))
    expect(tuple).toEqual(['warning', '리셋 · hard', 'HEAD를 a1b2c3d로 옮겼어요', undefined, 4000, 'think'])
  })

  it('info 기본값 — geuru=idle·dur=4000', () => {
    const tuple = spread(TOASTS.rebased())
    expect(tuple).toEqual(['info', '리베이스 완료', undefined, undefined, 4000, 'idle'])
  })

  it('항목별 override(geuru·dur)가 기본값을 이긴다', () => {
    // branchSwitched override: geuru=happy, dur=3000
    expect(spread(TOASTS.branchSwitched('main'))).toEqual(['success', '브랜치 전환 · main', undefined, undefined, 3000, 'happy'])
    // merged override: geuru=merge (dur는 기본 4000)
    expect(spread(TOASTS.merged())).toEqual(['success', '머지 완료', undefined, undefined, 4000, 'merge'])
    // downloadDone override: geuru=merge, dur=6000
    expect(spread(TOASTS.downloadDone())).toEqual([
      'success', '다운로드 완료', '설치 창이 열렸어요 · 안내대로 교체해 주세요', undefined, 6000, 'merge',
    ])
  })

  it('onClick은 4번째 위치, dur은 5번째 위치 — notify 오버로드와 충돌 안 함', () => {
    const onClick = () => {}
    const tuple = spread(TOASTS.updateAvailable('2.0.0', onClick))
    expect(tuple[0]).toBe('info')
    expect(tuple[1]).toBe('GitGrove 2.0.0 출시')
    expect(tuple[2]).toBe('클릭해서 받기')
    expect(tuple[3]).toBe(onClick) // 4번째 = onClick(함수)
    expect(typeof tuple[3]).toBe('function')
    expect(tuple[4]).toBe(8000) // 5번째 = dur(숫자)
    expect(tuple[5]).toBe('idle') // info 기본 표정
  })

  it('onClick 없는 토스트는 4번째가 undefined(숫자 아님) — notify가 dur로 오인하지 않음', () => {
    const tuple = spread(TOASTS.committed())
    expect(tuple[3]).toBeUndefined()
    expect(typeof tuple[3]).not.toBe('number')
  })
})
