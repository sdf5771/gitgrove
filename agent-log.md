# GitGrove — Agent Log

> PM이 관리하는 프로젝트 컨텍스트 캐시. 에이전트 간 공유 소스.

---

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 앱 이름 | GitGrove |
| 플랫폼 | Mac 데스크톱 (Electron) |
| 레퍼런스 | GitKraken, Sourcetree |
| 분위기 | 모던, 다크모드 우선 |
| 현재 상태 | 초기 보일러플레이트 (기능 구현 0%) |

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 데스크톱 런타임 | Electron 30 |
| 번들러 | Vite 5 + vite-plugin-electron |
| UI 프레임워크 | React 18 + TypeScript 5 |
| 빌드 도구 | electron-builder 24 |
| 패키지 관리 | npm |

### 주요 의존성 (현재 설치됨)
- `react` ^18.2.0
- `electron` ^30.0.1
- `vite` ^5.1.6
- `typescript` ^5.2.2

### 추가됨
- `simple-git` ^3.x — Electron main process에서 git 조작 (설치 완료)
- 브랜치 그래프 시각화 라이브러리 (미확정 — `d3`, `@gitgraph/js` 후보)
- 상태 관리: Zustand (Frontend 에이전트 선호, 충돌 시 재논의)
- 스타일링: CSS Modules (Frontend 에이전트 선호)

---

## 아키텍처 결정

### Electron IPC 구조
```
Renderer (React) ↔ preload.ts (contextBridge) ↔ Main (Node.js + simple-git)
```
- git 연산은 **Main process**에서만 수행 (Node.js API 접근 필요)
- Renderer는 IPC를 통해 git 명령 결과를 받아 UI에 표시
- `electron/preload.ts`에 `contextBridge.exposeInMainWorld`로 API 노출

### 핵심 기능 목록 (우선순위 순)
1. **브랜치 그래프 시각화** — 커밋 DAG를 그래픽으로 표시 (GitKraken 스타일)
2. **커밋 UI** — Staged/Unstaged 파일 목록 + 커밋 메시지 입력
3. **PR 작성** — GitHub API 연동, PR 본문 에디터
4. **브랜치 체크아웃/머지** — 브랜치 목록, 체크아웃, 머지 실행

---

## 배치된 에이전트

| 에이전트 | 파일 | 담당 |
|---------|------|------|
| frontend | `.claude/agents/frontend.md` | React UI, 컴포넌트, 스타일 |
| backend | `.claude/agents/backend.md` | Electron main process, git IPC |
| qa | `.claude/agents/qa.md` | 테스트, 버그 재현 |
| review | `.claude/agents/review.md` | 코드 리뷰, 머지 전 검증 |

---

## 구현된 컴포넌트 구조

```
src/
  data/mockData.ts          — 타입 정의 + 목업 데이터 (COMMITS, BRANCHES, DIFF 등)
  components/
    Chip.tsx                — 커밋 라벨 뱃지 (head/branch/hotfix/remote/tag)
    FilePath.tsx            — 디렉터리/파일명 분리 렌더링
    BranchSidebar.tsx       — 브랜치 사이드바 (Local/Remote/Tags 섹션, 접기/펼치기)
    CommitGraph.tsx         — SVG 베지어 브랜치 그래프 + 커밋 리스트
    CommitDetail.tsx        — 커밋 상세 (파일 목록 + 미니 diff 프리뷰)
    StageArea.tsx           — Unstaged/Staged 파일 이동 + 커밋 영역
    DiffPanel.tsx           — diff 뷰어 (Stage 뷰 우측 패널)
    StatusBar.tsx           — 하단 상태 바
  App.tsx                   — 레이아웃 조합 + view 상태 관리 (history/commit)
  index.css                 — 디자인 토큰 + 전체 CSS
```

## Frontend ↔ Backend (Main Process) 합의 인터페이스

> 2026-06-11: `feat/real-git-ipc` 브랜치에서 구현 완료. `window.gitAPI`로 접근.

### IPC 채널 스펙 (electron/main.ts → preload.ts → window.gitAPI)

| 채널 | window.gitAPI 메서드 | 파라미터 | 반환 타입 |
|------|---------------------|---------|----------|
| `git:open-dialog` | `openDialog()` | 없음 | `Promise<string \| null>` |
| `git:log` | `getLog(repoPath)` | `repoPath: string` | `Promise<GitCommit[]>` |
| `git:branches` | `getBranches(repoPath)` | `repoPath: string` | `Promise<GitBranchResult>` |
| `git:status` | `getStatus(repoPath)` | `repoPath: string` | `Promise<GitStatusResult>` |
| `git:diff` | `getDiff(repoPath, filePath)` | `repoPath: string, filePath: string` | `Promise<string>` |
| `git:files` | `getFiles(repoPath, commitHash)` | `repoPath: string, commitHash: string` | `Promise<GitFileEntry[]>` |
| `git:stage` | `stage(repoPath, files)` | `repoPath: string, files: string[]` | `Promise<void>` |
| `git:unstage` | `unstage(repoPath, files)` | `repoPath: string, files: string[]` | `Promise<void>` |
| `git:commit` | `commit(repoPath, message)` | `repoPath: string, message: string` | `Promise<void>` |

### 공유 타입 (electron/electron-env.d.ts에 전역 선언)

```typescript
interface GitCommit {
  id: string        // short hash (7자)
  fullId: string    // full hash
  msg: string       // commit subject
  author: string
  time: string      // "2m ago", "3h ago", "2d ago", "1wk ago" 형식
  parents: string[] // parent hashes (short, 7자)
  refs: string[]    // ["HEAD -> main", "origin/main", "v1.0.0"] 형식
  stats: { files: number; insertions: number; deletions: number }
}

interface GitBranchResult {
  current: string
  local: Array<{ name: string; ahead: number; behind: number }>
  remote: string[]   // "origin/main" 형식
  tags: string[]
}

interface GitStatusResult {
  staged: Array<{ path: string; status: 'M' | 'A' | 'D' }>
  unstaged: Array<{ path: string; status: 'M' | 'A' | 'D' }>
}

interface GitFileEntry {
  path: string
  status: 'M' | 'A' | 'D' | 'R'  // Modified / Added / Deleted / Renamed
  additions: number
  deletions: number
}
```

### Frontend 사용 예시

```typescript
// 레포 열기
const repoPath = await window.gitAPI.openDialog()  // null이면 취소

// 커밋 로그
const commits = await window.gitAPI.getLog(repoPath)

// 브랜치 목록
const branches = await window.gitAPI.getBranches(repoPath)

// 워킹트리 상태
const status = await window.gitAPI.getStatus(repoPath)

// 파일 diff (raw text 반환, staged 우선)
const diff = await window.gitAPI.getDiff(repoPath, 'src/auth/jwt.ts')
```

### 주의사항

- 에러 발생 시 IPC handler가 throw → Renderer에서 try/catch로 처리 필요
- `git:log` 는 최대 50개 커밋 반환
- `git:diff` 는 staged diff를 먼저 시도하고, 없으면 unstaged diff 반환 (raw unified diff 텍스트)

---

## Figma 파일

> 없음 (2026-06-11 기준). UI 작업 시 사용자에게 요청 또는 레퍼런스 기반 독자 설계.

---

## 작업 프로세스

### 기본 흐름

```
사용자 요청
  └─ PM (분석 + 분해)
       ├─ Backend  → Electron main.ts / IPC 핸들러 / simple-git 연동
       ├─ Frontend → React 컴포넌트 / UI / IPC 호출
       └─ (병렬 완료 후)
            ├─ QA      → 버그 탐지 / 테스트 시나리오
            └─ Review  → 코드 품질 / 인터페이스 일치 검증
                 └─ PM 최종 보고 → 사용자 머지
```

### 브랜치 전략

| 작업 유형 | 브랜치명 | 예시 |
|----------|---------|------|
| 기능 개발 | `feat/<작업명>` | `feat/real-git-integration` |
| 버그 수정 | `fix/<이슈>` | `fix/commit-graph-overflow` |
| UI 개선 | `ui/<컴포넌트>` | `ui/branch-sidebar-filter` |
| 테스트 | `test/<범위>` | `test/commit-graph-unit` |

- **main** 브랜치는 항상 동작 가능 상태 유지
- 에이전트는 작업 브랜치에서 PR 생성 → 사용자가 머지

### 위임 규칙

| 요청 | 담당 에이전트 | 선행 조건 |
|------|------------|---------|
| IPC 채널 추가 / git 명령 연동 | **Backend** | - |
| UI 컴포넌트 / 인터랙션 변경 | **Frontend** | Backend IPC 스펙 먼저 |
| 양쪽 영향 (new feature) | **Backend → Frontend 순차** | Backend IPC 먼저 정의 |
| 기존 기능 버그 | **Frontend 또는 Backend** | 재현 조건 파악 후 |
| 품질 검증 | **QA** | 구현 완료 후 |
| 머지 전 검토 | **Review** | PR 생성 후 |

### IPC 인터페이스 합의 원칙

Backend가 IPC 채널을 먼저 정의하고 `agent-log.md`에 기록하면 Frontend가 참조.

```typescript
// 합의 형식 예시 (Backend가 작성 → Frontend가 참조)
// channel: 'git:log'
// invoke() 반환: Commit[]
// channel: 'git:stage'  
// send(files: string[]): void
```

### 다음 주요 작업 (우선순위 순)

1. **real git 연동** — `simple-git` 설치, IPC 채널 설계, 실제 커밋 목록 로드
2. **레포 열기** — 로컬 경로 선택 → git 초기화 → 커밋 그래프 표시
3. **Stage + Commit 실제 동작** — git add / commit IPC 연결
4. **테스트 프레임워크 세팅** — Vitest + Testing Library (QA 에이전트 착수 전)

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-11 | PM 초기 프로젝트 파악 및 agent-log 생성 |
| 2026-06-11 | Claude Design 산출물 기반 전체 UI 구현 완료 (History + Stage 뷰) |
| 2026-06-11 | Electron 윈도우 수정: frame:false, 1440×900, IPC 윈도우 컨트롤, 타이틀바 드래그 영역 |
| 2026-06-11 | 2차 디자인 반영: Diff Explorer, PR 뷰, Conflict Editor, 멀티레포 탭, 알림, ⌘K 팔레트, Stash, 브랜치/Rebase 모달, Git Blame, 우클릭 컨텍스트 메뉴, 커밋 검색 |
| 2026-06-11 | Backend: `simple-git` IPC 레이어 구현 완료 (feat/real-git-ipc) — 5개 채널 (open-dialog, log, branches, status, diff) |
| 2026-06-11 | Backend: 쓰기 연산 IPC 채널 4개 추가 (feat/git-write-ops) — git:files, git:stage, git:unstage, git:commit |
| 2026-06-11 | Frontend: 목업 데이터 → real IPC 연동 완료 (feat/real-git-frontend) — App.tsx loadRepo(), BranchSidebar props, StageArea props, AddRepoModal onOpenPath/Browse 연동 |
| 2026-06-11 | Frontend: IPC 와이어링 3곳 완료 (feat/ipc-wiring) — CommitDetail 파일 목록(git:files), StageArea stage/unstage/commit IPC 연결, DiffPanel raw diff 파싱 및 표시 |
