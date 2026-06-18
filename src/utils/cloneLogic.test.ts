// CL2 — 클론 폼/결과 순수 로직 단위테스트.
import { describe, it, expect } from 'vitest'
import {
  detectCloneTarget,
  isCloneUrlValid,
  targetLabel,
  deriveRepoName,
  mapCloneResult,
  cloneStatsRows,
  cloneThrowToView,
} from './cloneLogic'

describe('detectCloneTarget — 프로바이더/owner/repo 인식', () => {
  it('GitHub https URL → gh + owner/repo', () => {
    const t = detectCloneTarget('https://github.com/acme/widget.git')
    expect(t.provider).toBe('gh')
    expect(t.owner).toBe('acme')
    expect(t.repo).toBe('widget')
    expect(targetLabel(t)).toBe('acme/widget')
  })

  it('GitHub ssh URL → gh', () => {
    const t = detectCloneTarget('git@github.com:acme/widget.git')
    expect(t.provider).toBe('gh')
    expect(t.owner).toBe('acme')
    expect(t.repo).toBe('widget')
  })

  it('GitLab.com URL → gl, host 숨김(gitlab.com)', () => {
    const t = detectCloneTarget('https://gitlab.com/group/sub/proj.git')
    expect(t.provider).toBe('gl')
    expect(t.repo).toBe('proj')
    expect(t.owner).toBe('group/sub')
    expect(t.host).toBe('')
  })

  it('self-hosted GitLab → gl + host 노출', () => {
    const t = detectCloneTarget('https://gl.internal:8443/team/app.git')
    expect(t.provider).toBe('gl')
    expect(t.repo).toBe('app')
    expect(t.host).toBe('gl.internal:8443')
  })

  it('host/owner/repo 형태(self-hosted GitLab 가능)는 gl로 인식, repo 추출', () => {
    // parseGitLabRepo는 host 비종속(self-hosted 지원)이라 일반 host/owner/repo를 gl로 본다.
    const t = detectCloneTarget('https://bitbucket.org/me/thing.git')
    expect(t.provider).toBe('gl')
    expect(t.repo).toBe('thing')
  })

  it('host 토큰이 없는 평문은 미인식(null) + 이름 폴백', () => {
    const t = detectCloneTarget('just-a-name')
    expect(t.provider).toBeNull()
    expect(t.repo).toBe('just-a-name')
  })

  it('빈 입력 → 빈 타깃', () => {
    const t = detectCloneTarget('')
    expect(t.provider).toBeNull()
    expect(t.repo).toBe('')
  })
})

describe('deriveRepoName — 이름 추출(backend와 동일 규칙)', () => {
  it('https/.git/trailing slash 제거', () => {
    expect(deriveRepoName('https://github.com/a/repo.git')).toBe('repo')
    expect(deriveRepoName('https://github.com/a/repo/')).toBe('repo')
  })
  it('ssh scp 형식', () => {
    expect(deriveRepoName('git@github.com:a/repo.git')).toBe('repo')
  })
})

describe('isCloneUrlValid — Clone 버튼 활성 조건', () => {
  it('유효한 https/ssh는 true', () => {
    expect(isCloneUrlValid('https://github.com/a/repo.git')).toBe(true)
    expect(isCloneUrlValid('git@github.com:a/repo.git')).toBe(true)
    expect(isCloneUrlValid('ssh://git@gl.internal:2222/g/p.git')).toBe(true)
  })
  it('빈/불완전 입력은 false', () => {
    expect(isCloneUrlValid('')).toBe(false)
    expect(isCloneUrlValid('not a url')).toBe(false)
    expect(isCloneUrlValid('github.com')).toBe(false)
  })
})

describe('mapCloneResult — 결과 분기', () => {
  it('성공 → success/나무(happy) + name/path', () => {
    const v = mapCloneResult({ success: true, path: '/dev/repo', name: 'repo' })
    expect(v.kind).toBe('success')
    expect(v.geuru).toBe('happy')
    expect(v.name).toBe('repo')
    expect(v.path).toBe('/dev/repo')
    expect(v.needsToken).toBe(false)
  })

  it('auth 실패 → 토큰칸 노출(needsToken)', () => {
    const v = mapCloneResult({ success: false, errorKind: 'auth', message: '401' })
    expect(v.kind).toBe('auth')
    expect(v.needsToken).toBe(true)
  })

  it('notfound 실패 → 비공개 안내 + 토큰칸 노출(needsToken)', () => {
    const v = mapCloneResult({ success: false, errorKind: 'notfound', message: '404' })
    expect(v.kind).toBe('notfound')
    expect(v.needsToken).toBe(true)
    expect(v.detail).toContain('비공개')
  })

  it('일반 error → 메시지 표시', () => {
    const v = mapCloneResult({ success: false, errorKind: 'error', message: '디스크 가득참' })
    expect(v.kind).toBe('error')
    expect(v.detail).toContain('디스크')
  })

  it('displayName 폴백(name 미제공 시)', () => {
    const v = mapCloneResult({ success: true, path: '/dev/x' }, 'fallback-name')
    expect(v.detail).toBe('fallback-name')
  })
})

describe('cloneStatsRows — 가용 통계만 행으로', () => {
  it('통계 없으면 빈 배열(행 생략)', () => {
    expect(cloneStatsRows({ success: true })).toEqual([])
  })
  it('있으면 가용 값만 행 생성', () => {
    const rows = cloneStatsRows({ success: true, receivedObjects: 1280, fileCount: 42 })
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.label === '객체')?.value).toBe('1280')
    expect(rows.find(r => r.label === '파일')?.value).toBe('42')
  })
  it('바이트는 사람이 읽는 단위로', () => {
    const rows = cloneStatsRows({ success: true, receivedBytes: 2 * 1024 * 1024 })
    expect(rows[0].value).toMatch(/MiB$/)
  })
})

describe('cloneThrowToView — 입력검증 throw → error 뷰', () => {
  it('throw된 Error 메시지를 error 뷰로', () => {
    const v = cloneThrowToView(new Error("이미 'repo' 폴더가 존재합니다."))
    expect(v.kind).toBe('error')
    expect(v.detail).toContain('이미')
  })
})
