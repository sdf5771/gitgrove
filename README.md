# 🌿 GitGrove

모던 다크모드 Git GUI — Mac 데스크톱 앱

GitKraken, Sourcetree에서 영감을 받아 설계된 Electron 기반 Git 클라이언트입니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **브랜치 그래프** | SVG 베지어 DAG 시각화, 브랜치별 레인 컬러 |
| **커밋 상세** | 파일 목록, diff 미리보기, Cherry-pick |
| **Stage / Commit** | Unstaged ↔ Staged 파일 관리, 커밋 메시지 |
| **Diff Explorer** | 사이드바이사이드 diff + 신택스 하이라이팅 |
| **Git Blame** | 라인별 커밋 추적 |
| **Pull Request** | PR 목록 / 상세 / Approve / Request Changes |
| **Merge / Rebase** | Merge commit · Rebase · Squash 전략 선택 |
| **Interactive Rebase** | 커밋 순서 변경, Squash, Drop |
| **Cherry-pick** | 커밋 선택 적용 |
| **Stash** | Push / Pop / Apply / Drop |
| **Conflict Editor** | Ours / Theirs / Both 충돌 해결 |
| **Branch 관리** | 생성 · 이름변경 · 삭제 |
| **멀티 레포 탭** | 여러 레포지토리 동시 관리 |
| **⌘K 커맨드 팔레트** | 퀵 액션 검색 |
| **실시간 커밋 검색** | 메시지 · 작성자 · 해시 · 파일 검색 |
| **알림 토스트** | Pull / Push / Fetch / Merge 완료 알림 |
| **포커스 자동 새로고침** | 앱 복귀 시 상태 자동 갱신 |

---

## 스크린샷

| History 뷰 | Stage 뷰 |
|-----------|---------|
| 브랜치 그래프 + 커밋 상세 | Unstaged / Staged + Diff 패널 |

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 데스크톱 런타임 | Electron 30 |
| UI | React 18 + TypeScript 5 |
| 번들러 | Vite 5 + vite-plugin-electron |
| Git 연산 | simple-git |
| 빌드 | electron-builder |
| 폰트 | Pixelify Sans · Noto Sans KR · IBM Plex Mono |

---

## 설치 및 실행

### 요구사항
- Node.js 18+
- macOS (현재 Mac 전용)

### 개발 모드
```bash
# 의존성 설치
npm install

# 개발 서버 + Electron 실행
npm run dev
```

### 프로덕션 빌드
```bash
npm run build
```

빌드 결과물은 `dist/` 폴더에 생성됩니다.

---

## 사용법

1. 앱 실행 후 타이틀바 **+** 버튼 또는 **폴더 열기** 클릭
2. 로컬 git 레포지토리 폴더 선택
3. 커밋 그래프 확인 및 작업 시작

### 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `⌘K` | 커맨드 팔레트 |
| `⌘1` | History 뷰 |
| `⌘2` | Stage 뷰 |
| `⌘3` | Diff Explorer |
| `Esc` | 모달 닫기 / 검색 초기화 |

---

## 프로젝트 구조

```
electron/           Electron 메인 프로세스 (IPC, git 연산)
  main.ts           BrowserWindow + git IPC 핸들러
  preload.ts        contextBridge (window.gitAPI)
src/
  components/       React 컴포넌트
    modals/         모달 다이얼로그 8종
  data/             타입 정의 + 목업 데이터
  hooks/            useNotifications
  utils/            computeLanes (DAG 알고리즘), syntaxHighlight, sideBySide
  App.tsx           메인 레이아웃 + 상태 관리
  index.css         디자인 토큰 + 전체 CSS
```

---

## 라이선스

MIT
