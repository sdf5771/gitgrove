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

### 추가 예정 (미설치)
- `simple-git` — Electron main process에서 git 조작
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

> 현재 목업 데이터 기반. real git 연동 시 IPC 채널명 및 타입을 여기에 기록.

---

## Figma 파일

> 없음 (2026-06-11 기준). UI 작업 시 사용자에게 요청 또는 레퍼런스 기반 독자 설계.

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-11 | PM 초기 프로젝트 파악 및 agent-log 생성 |
| 2026-06-11 | Claude Design 산출물 기반 전체 UI 구현 완료 (History + Stage 뷰) |
| 2026-06-11 | Electron 윈도우 수정: frame:false, 1440×900, IPC 윈도우 컨트롤, 타이틀바 드래그 영역 |
| 2026-06-11 | 2차 디자인 반영: Diff Explorer, PR 뷰, Conflict Editor, 멀티레포 탭, 알림, ⌘K 팔레트, Stash, 브랜치/Rebase 모달, Git Blame, 우클릭 컨텍스트 메뉴, 커밋 검색 |
