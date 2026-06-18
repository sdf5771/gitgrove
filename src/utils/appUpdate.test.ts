import { describe, it, expect } from 'vitest'
import {
  isAllowedUpdateHost,
  pickDmgAsset,
  buildReleaseNotes,
  computeDownloadProgress,
  safeDownloadFilename,
  type ReleaseAsset,
} from './appUpdate'

describe('isAllowedUpdateHost', () => {
  it('github.com 및 서브도메인 허용', () => {
    expect(isAllowedUpdateHost('https://github.com/sdf5771/gitgrove/releases/download/v1.0.0/GitGrove.dmg')).toBe(true)
    expect(isAllowedUpdateHost('https://api.github.com/repos/sdf5771/gitgrove/releases/latest')).toBe(true)
  })

  it('githubusercontent.com 서브도메인(자산 리다이렉트 대상) 허용', () => {
    expect(isAllowedUpdateHost('https://objects.githubusercontent.com/github-production-release-asset/x/y.dmg')).toBe(true)
    expect(isAllowedUpdateHost('https://raw.githubusercontent.com/sdf5771/gitgrove/main/package.json')).toBe(true)
  })

  it('S3 자산 리다이렉트 호스트(토큰 포함) 허용', () => {
    expect(isAllowedUpdateHost('https://github-production-release-asset-2e65be.s3.amazonaws.com/123/file.dmg')).toBe(true)
  })

  it('http(비-TLS) 거부', () => {
    expect(isAllowedUpdateHost('http://github.com/x/y.dmg')).toBe(false)
  })

  it('임의/악성 호스트 거부', () => {
    expect(isAllowedUpdateHost('https://evil.com/payload.dmg')).toBe(false)
    expect(isAllowedUpdateHost('https://github.com.evil.com/x.dmg')).toBe(false)
    expect(isAllowedUpdateHost('https://notgithub.com/x.dmg')).toBe(false)
  })

  it('S3 자산 호스트는 *.amazonaws.com + 호스트명에 github- 포함일 때만 허용', () => {
    // 정상 GitHub 릴리즈 자산 S3 리다이렉트 대상.
    expect(isAllowedUpdateHost('https://github-production-release-asset-2e65be.s3.amazonaws.com/123/file.dmg')).toBe(true)
    expect(isAllowedUpdateHost('https://github-releases.s3.amazonaws.com/123/file.dmg')).toBe(true)
    // amazonaws.com 이지만 github- 토큰이 없으면 거부.
    expect(isAllowedUpdateHost('https://my-bucket.s3.amazonaws.com/x.dmg')).toBe(false)
    // github- 토큰이 있어도 amazonaws.com 호스트가 아니면 거부.
    expect(isAllowedUpdateHost('https://github-releases.example.com/x.dmg')).toBe(false)
  })

  it('[보안 회귀] 호스트 부분일치 우회 차단 — github- 토큰을 호스트에 끼워넣어도 amazonaws 외엔 거부', () => {
    // 부분일치(host.includes(token)) 복원 시 아래가 통과 → red. 정확/접미사 앵커로 차단되어야 한다.
    expect(isAllowedUpdateHost('https://github-releases.evil.com/x.dmg')).toBe(false)
    expect(isAllowedUpdateHost('https://github-production-release-asset.evil.io/x.dmg')).toBe(false)
    expect(isAllowedUpdateHost('https://evilgithub.com/x.dmg')).toBe(false)
    // 경로에 토큰을 넣어도 hostname에는 없으므로 거부.
    expect(isAllowedUpdateHost('https://evil.com/github-releases/x.dmg')).toBe(false)
    expect(isAllowedUpdateHost('https://evil.com/github-production-release-asset/x.dmg')).toBe(false)
  })

  it('포트가 붙어도 호스트 판정은 hostname 기준(포트 무관)', () => {
    expect(isAllowedUpdateHost('https://github.com:443/a/b.dmg')).toBe(true)
    expect(isAllowedUpdateHost('https://evil.com:443/a/b.dmg')).toBe(false)
  })

  it('잘못된 URL/빈 문자열 거부', () => {
    expect(isAllowedUpdateHost('')).toBe(false)
    expect(isAllowedUpdateHost('not a url')).toBe(false)
    expect(isAllowedUpdateHost('ftp://github.com/x')).toBe(false)
  })
})

describe('pickDmgAsset', () => {
  const dmg: ReleaseAsset = {
    name: 'GitGrove-Mac-1.17.0-Installer.dmg',
    browser_download_url: 'https://github.com/sdf5771/gitgrove/releases/download/v1.17.0/GitGrove-Mac-1.17.0-Installer.dmg',
  }
  const exe: ReleaseAsset = {
    name: 'GitGrove-Windows-1.17.0-Setup.exe',
    browser_download_url: 'https://github.com/sdf5771/gitgrove/releases/download/v1.17.0/GitGrove-Windows-1.17.0-Setup.exe',
  }

  it('.dmg 자산을 고른다', () => {
    expect(pickDmgAsset([exe, dmg])).toEqual(dmg)
  })

  it('대소문자 무시(.DMG)', () => {
    const upper: ReleaseAsset = { name: 'X.DMG', browser_download_url: 'https://github.com/a/b/X.DMG' }
    expect(pickDmgAsset([upper])).toEqual(upper)
  })

  it('.dmg 자산 없으면 null', () => {
    expect(pickDmgAsset([exe])).toBeNull()
    expect(pickDmgAsset([])).toBeNull()
  })

  it('신뢰 호스트 .dmg를 비신뢰보다 우선', () => {
    const evil: ReleaseAsset = { name: 'a.dmg', browser_download_url: 'https://evil.com/a.dmg' }
    expect(pickDmgAsset([evil, dmg])).toEqual(dmg)
  })

  it('url 없는/빈 자산 무시', () => {
    const bad = { name: 'b.dmg', browser_download_url: '' } as ReleaseAsset
    expect(pickDmgAsset([bad])).toBeNull()
  })

  it('null/undefined 입력은 null', () => {
    expect(pickDmgAsset(null)).toBeNull()
    expect(pickDmgAsset(undefined)).toBeNull()
  })

  // SSRF 방어-심층: 신뢰 호스트 .dmg가 하나도 없으면 비신뢰 첫 .dmg로 폴백한다.
  // (다운로드 시점에 main의 isAllowedUpdateHost가 재검증하므로 여기서 거르지 않아도 안전.)
  it('신뢰 호스트 .dmg가 전무하면 비신뢰 첫 .dmg로 폴백(다운로드 단계가 재검증)', () => {
    const evilA: ReleaseAsset = { name: 'a.dmg', browser_download_url: 'https://evil.com/a.dmg' }
    const evilB: ReleaseAsset = { name: 'b.dmg', browser_download_url: 'http://github.com/b.dmg' }
    expect(pickDmgAsset([evilA, evilB])).toEqual(evilA)
    // 폴백 자산은 화이트리스트를 통과하지 못함 → 다운로드 단계에서 차단됨을 보증.
    expect(isAllowedUpdateHost(evilA.browser_download_url)).toBe(false)
  })

  it('이름이 .dmg가 아닌 자산은 후보에서 제외(확장자 위장 차단)', () => {
    const fake: ReleaseAsset = { name: 'GitGrove.dmg.txt', browser_download_url: 'https://github.com/a/GitGrove.dmg.txt' }
    expect(pickDmgAsset([fake])).toBeNull()
  })
})

describe('buildReleaseNotes', () => {
  it('짧은 본문은 그대로(trim)', () => {
    expect(buildReleaseNotes('  hello  ')).toBe('hello')
  })
  it('빈/공백/비문자열은 undefined', () => {
    expect(buildReleaseNotes('')).toBeUndefined()
    expect(buildReleaseNotes('   ')).toBeUndefined()
    expect(buildReleaseNotes(null)).toBeUndefined()
    expect(buildReleaseNotes(undefined)).toBeUndefined()
  })
  it('maxLen 초과 시 자르고 말줄임표', () => {
    const out = buildReleaseNotes('a'.repeat(500), 10)
    expect(out).toBe('aaaaaaaaaa…')
    expect(out!.length).toBe(11)
  })
})

describe('computeDownloadProgress', () => {
  it('total 있으면 pct 포함', () => {
    expect(computeDownloadProgress(50, 200)).toEqual({ received: 50, total: 200, pct: 25 })
  })
  it('total 없으면 pct 생략(indeterminate)', () => {
    expect(computeDownloadProgress(123)).toEqual({ received: 123 })
  })
  it('total=0/음수면 pct 생략', () => {
    expect(computeDownloadProgress(10, 0)).toEqual({ received: 10 })
    expect(computeDownloadProgress(10, -5)).toEqual({ received: 10 })
  })
  it('received 음수/NaN은 0 보정', () => {
    expect(computeDownloadProgress(-5, 100)).toEqual({ received: 0, total: 100, pct: 0 })
    expect(computeDownloadProgress(NaN)).toEqual({ received: 0 })
  })
  it('pct는 0~100으로 클램프', () => {
    expect(computeDownloadProgress(300, 100).pct).toBe(100)
  })
})

describe('safeDownloadFilename', () => {
  it('URL 경로의 .dmg 파일명 사용', () => {
    expect(safeDownloadFilename('https://github.com/a/b/GitGrove-Mac-1.17.0-Installer.dmg'))
      .toBe('GitGrove-Mac-1.17.0-Installer.dmg')
  })
  it('퍼센트 인코딩 디코드', () => {
    expect(safeDownloadFilename('https://github.com/a/Git%20Grove.dmg')).toBe('Git Grove.dmg')
  })
  it('경로 탈출/구분자 제거', () => {
    // 디코드 후 ../ 시도 → 구분자·.. 정리되어도 .dmg 보장되면 안전한 이름
    const out = safeDownloadFilename('https://github.com/a/%2e%2e%2fevil.dmg')
    expect(out.includes('/')).toBe(false)
    expect(out.includes('\\')).toBe(false)
    expect(out.endsWith('.dmg')).toBe(true)
  })
  it('.dmg가 아니면 fallback', () => {
    expect(safeDownloadFilename('https://github.com/a/b.exe')).toBe('GitGrove-Update.dmg')
    expect(safeDownloadFilename('not a url')).toBe('GitGrove-Update.dmg')
  })
})
