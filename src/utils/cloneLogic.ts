// CL2 — 클론 모달의 순수 표현/판정 로직.
//
// 폼(프로바이더·owner/repo 인식, URL 유효성)과 결과(success/auth/notfound/error →
// 나무 sprout / 토큰칸 / 에러 표현) 매핑을 순수 함수로 분리해 vitest로 검증한다.
// electron/main.ts 의 deriveRepoName 과 동일한 규칙으로 이름을 추출한다(프리뷰용).
// 색 규칙: 골드=CTA, 녹색=완료/나무, 빨강=실패. GitLab 주황은 프로바이더 마크에만.

import { parseGitHubRepo } from './github'
import { parseGitLabRepo } from './gitlab'

export type CloneProvider = 'gh' | 'gl' | null

// 폼 상단에 표시할 프로바이더 + owner/repo 인식 결과.
export interface CloneTarget {
  provider: CloneProvider
  // 표시용 "owner/repo" (GitLab은 namespace 포함 fullPath).
  owner: string
  repo: string
  // 호스트(self-hosted GitLab 식별 표시용; gitlab.com/github.com 이면 빈 문자열).
  host: string
}

// URL → 프로바이더/owner/repo 인식. 인식 실패해도 repo 이름은 deriveRepoName 폴백.
export function detectCloneTarget(url: string): CloneTarget {
  const raw = (url ?? '').trim()
  if (!raw) return { provider: null, owner: '', repo: '', host: '' }

  const gh = parseGitHubRepo(raw)
  if (gh) return { provider: 'gh', owner: gh.owner, repo: gh.repo, host: '' }

  const gl = parseGitLabRepo(raw)
  if (gl) {
    const isDotCom = gl.host === 'https://gitlab.com'
    return {
      provider: 'gl',
      owner: gl.namespace,
      repo: gl.project,
      host: isDotCom ? '' : gl.host.replace(/^https?:\/\//, ''),
    }
  }

  // 미인식 프로바이더 — 이름만 폴백 추출(프로바이더 마크 없음).
  return { provider: null, owner: '', repo: deriveRepoName(raw), host: '' }
}

// 원격 URL(https / ssh)에서 저장소 이름(.git 제외) 추출.
// electron/main.ts 의 동명 함수와 규칙 일치(프론트 프리뷰가 실제 폴더명과 같도록).
export function deriveRepoName(url: string): string {
  const trimmed = (url ?? '').trim().replace(/\/+$/, '').replace(/\.git$/i, '')
  const seg = trimmed.split(/[/:]/).pop() ?? ''
  return seg.trim()
}

// Clone 버튼 활성 조건 — URL이 클론 가능한 형태로 보이는지(이름 추출 가능 + 호스트성 토큰 존재).
// 과하게 엄격하지 않게: 이름이 뽑히고 ':' 또는 '/' 로 호스트 구분이 있으면 허용.
export function isCloneUrlValid(url: string): boolean {
  const raw = (url ?? '').trim()
  if (!raw) return false
  if (!deriveRepoName(raw)) return false
  // git@host:owner/repo(.git) | scheme://host/owner/repo(.git)
  const sshLike = /^[^@\s]+@[^:\s]+:.+\/.+/.test(raw)
  const schemeLike = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/\s]+\/.+/.test(raw)
  return sshLike || schemeLike
}

// 표시용 "owner/repo" 라벨(인식 실패 시 repo 단독).
export function targetLabel(t: CloneTarget): string {
  if (t.owner && t.repo) return `${t.owner}/${t.repo}`
  return t.repo
}

// ── 결과 매핑 ──
//
// 백엔드(CL1)가 반환하는 GitCloneResult(electron-env.d.ts 의 ambient 글로벌 타입)를
// 그대로 소비한다 — 여기서 재정의하지 않는다(스키마 단일 출처: backend 계약).

export type CloneResultKind = 'success' | 'auth' | 'notfound' | 'error'

export interface CloneStatsRow {
  label: string
  value: string
}

export interface CloneResultView {
  kind: CloneResultKind
  // 결과 그루 표정.
  geuru: 'happy' | 'merge' | 'conflict'
  title: string
  detail: string
  // 성공 시 repo명/경로(동선 재사용).
  name?: string
  path?: string
  // 가용 통계 행(없으면 빈 배열 → stats 행 생략).
  stats: CloneStatsRow[]
  // auth/notfound(비공개 가능성) 실패면 인라인 PAT 토큰칸 노출.
  needsToken: boolean
}

function humanBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  const kib = n / 1024
  if (kib < 1024) return `${kib.toFixed(kib < 10 ? 1 : 0)} KiB`
  const mib = kib / 1024
  return `${mib.toFixed(mib < 10 ? 1 : 0)} MiB`
}

// 가용한 통계만 행으로 변환(없으면 생략).
export function cloneStatsRows(r: GitCloneResult): CloneStatsRow[] {
  const rows: CloneStatsRow[] = []
  if (typeof r.receivedObjects === 'number') rows.push({ label: '객체', value: `${r.receivedObjects}` })
  if (typeof r.receivedBytes === 'number') {
    const b = humanBytes(r.receivedBytes)
    if (b) rows.push({ label: '받은 용량', value: b })
  }
  if (typeof r.fileCount === 'number') rows.push({ label: '파일', value: `${r.fileCount}` })
  return rows
}

// GitCloneResult → 결과 표현. 디자인 정본의 문구/분기를 따른다.
export function mapCloneResult(r: GitCloneResult, displayName?: string): CloneResultView {
  const name = r.name || displayName || ''

  if (r.success) {
    return {
      kind: 'success',
      geuru: 'happy',
      title: '그로브에 심었어요',
      detail: name,
      name,
      path: r.path,
      stats: cloneStatsRows(r),
      needsToken: false,
    }
  }

  if (r.errorKind === 'auth') {
    return {
      kind: 'auth',
      geuru: 'conflict',
      title: '인증이 필요해요',
      detail: '비공개 저장소예요 · 토큰(PAT)으로 다시 시도하세요',
      stats: [],
      needsToken: true,
    }
  }

  if (r.errorKind === 'notfound') {
    return {
      kind: 'notfound',
      geuru: 'conflict',
      title: '저장소를 찾을 수 없어요',
      detail: '비공개 저장소일 수 있어요 · URL을 확인하거나 토큰(PAT)으로 다시 시도하세요',
      stats: [],
      needsToken: true,
    }
  }

  // 일반 에러.
  return {
    kind: 'error',
    geuru: 'conflict',
    title: '클론하지 못했어요',
    detail: r.message || '알 수 없는 오류가 발생했어요',
    stats: [],
    needsToken: false,
  }
}

// throw된 입력검증 에러(클론 전 — 이름 추출 불가 / 대상 폴더 존재)를 결과 뷰로 변환.
// backend는 이 2종을 throw하므로 프론트 try/catch에서 error 뷰로 보여준다.
export function cloneThrowToView(err: unknown): CloneResultView {
  const message = err instanceof Error ? err.message : String(err)
  return mapCloneResult({ success: false, errorKind: 'error', message })
}

// ── 인증 실패 안내(프로바이더별) ──
//
// 자동 토큰 재시도가 없거나 실패한 뒤, 인라인 PAT 패널 위에 띄울 안내.
// 세 갈래(설정 연결 / PAT 입력 / 터미널 로그인 확인)를 사유 먼저·해요체로 전한다.
// 라이팅 가이드(docs/WRITING_GUIDE.md): 느낌표·과장 금지, 명령 강요 대신 "확인해 보세요" 톤.
export interface CloneAuthGuidance {
  title: string
  // 한 문단 안내(설정 연결 → PAT → 터미널 로그인 순).
  detail: string
}

export function cloneAuthGuidance(provider: CloneProvider): CloneAuthGuidance {
  if (provider === 'gl') {
    return {
      title: 'GitLab 인증이 필요해요',
      detail:
        '비공개 저장소예요 · 설정에서 GitLab을 연결하면 그 토큰으로 자동 시도해요 · 아래에 PAT를 입력하거나, 터미널에서 GitLab 로그인(git credential)이 돼 있는지 확인해 보세요.',
    }
  }
  if (provider === 'gh') {
    return {
      title: 'GitHub 인증이 필요해요',
      detail:
        '비공개 저장소예요 · 설정에서 GitHub을 연결하면 그 토큰으로 자동 시도해요 · 아래에 PAT를 입력하거나, 터미널에서 GitHub 로그인(git credential)이 돼 있는지 확인해 보세요.',
    }
  }
  // 프로바이더 미인식 — 일반 안내.
  return {
    title: '인증이 필요해요',
    detail:
      '비공개 저장소예요 · 설정에서 서비스를 연결하면 그 토큰으로 자동 시도해요 · 아래에 PAT를 입력하거나, 터미널에서 git 로그인(git credential)이 돼 있는지 확인해 보세요.',
  }
}

// 클론 URL에 토큰을 끼운 형태(https://<token>@host/...)로 변환.
// ssh/미인식 URL이면 null(토큰 주입 불가 — 호출부가 폴백).
// 토큰은 encodeURIComponent로 안전하게 끼운다(기존 retryWithToken 규칙과 동일).
export function urlWithToken(url: string, token: string): string | null {
  const t = (token ?? '').trim()
  if (!t) return null
  const m = (url ?? '').trim().match(/^(https?:\/\/)(?:[^@/]+@)?(.+)$/)
  if (!m) return null
  return `${m[1]}${encodeURIComponent(t)}@${m[2]}`
}
