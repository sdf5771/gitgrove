import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { StageArea } from './StageArea'
import { fileExtension } from '../utils/fileExtension'
import { installGitApiMock } from '../test/gitApiMock'
import type { FileEntry } from '../data/mockData'

const REPO = '/repo/x'

// clipboard mock (jsdom엔 navigator.clipboard 미존재)
function installClipboard() {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
  return writeText
}

function renderStage(unstaged: FileEntry[], staged: FileEntry[] = [], onCommitDone = vi.fn(), onTreeChanged = vi.fn()) {
  return {
    onCommitDone,
    onTreeChanged,
    ...render(
      <StageArea
        onSelDiffFile={() => {}}
        unstaged={unstaged}
        staged={staged}
        repoPath={REPO}
        onCommitDone={onCommitDone}
        onTreeChanged={onTreeChanged}
      />,
    ),
  }
}

// 파일 행을 우클릭해 메뉴를 띄운다. label 텍스트(예: 'file.tsx')로 행을 찾는다.
function openMenuFor(label: string) {
  const row = screen.getByText(label).closest('.sfi') as HTMLElement
  expect(row).toBeTruthy()
  fireEvent.contextMenu(row)
}

describe('fileExtension', () => {
  it('마지막 확장자를 반환한다', () => {
    expect(fileExtension('src/App.tsx')).toBe('tsx')
    expect(fileExtension('a/b/c.test.tsx')).toBe('tsx')
    expect(fileExtension('README.md')).toBe('md')
  })
  it('확장자가 없으면 null', () => {
    expect(fileExtension('Makefile')).toBeNull()
    expect(fileExtension('src/Dockerfile')).toBeNull()
  })
  it('dotfile(선행 dot)은 null', () => {
    expect(fileExtension('.gitignore')).toBeNull()
    expect(fileExtension('a/b/.env')).toBeNull()
  })
})

describe('StageArea 우클릭 컨텍스트 메뉴', () => {
  let gitAPI: ReturnType<typeof installGitApiMock>['gitAPI']
  let writeText: ReturnType<typeof installClipboard>

  beforeEach(() => {
    gitAPI = installGitApiMock().gitAPI
    writeText = installClipboard()
  })
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('파일 행 우클릭 시 메뉴 7개 항목이 노출된다', () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    expect(screen.getByText('변경 되돌리기…')).toBeTruthy()
    expect(screen.getByText('파일 무시 (.gitignore에 추가)')).toBeTruthy()
    expect(screen.getByText('이 확장자 무시 · .tsx (.gitignore에 추가)')).toBeTruthy()
    expect(screen.getByText('파일 경로 복사')).toBeTruthy()
    expect(screen.getByText('상대 경로 복사')).toBeTruthy()
    expect(screen.getByText('Finder에서 보기')).toBeTruthy()
    expect(screen.getByText('기본 앱으로 열기')).toBeTruthy()
  })

  it('확장자 없는 파일은 "이 확장자 무시" 항목을 숨긴다', () => {
    renderStage([{ p: 'Makefile', s: 'M', a: 1, d: 0 }])
    openMenuFor('Makefile')
    expect(screen.getByText('파일 무시 (.gitignore에 추가)')).toBeTruthy()
    expect(screen.queryByText(/확장자 무시/)).toBeNull()
  })

  it('staged 파일 행에서도 메뉴가 뜬다', () => {
    renderStage([], [{ p: 'staged.ts', s: 'M', a: 2, d: 1 }])
    openMenuFor('staged.ts')
    expect(screen.getByText('변경 되돌리기…')).toBeTruthy()
  })

  it('Discard → ConfirmModal → confirm 시 discardChanges 호출 + onTreeChanged(Discarded), Committed 토스트 없음', async () => {
    const { onCommitDone, onTreeChanged } = renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('변경 되돌리기…'))

    // ConfirmModal 제목 + 메시지에 파일명 포함
    expect(screen.getByText('변경 되돌리기')).toBeTruthy()
    expect(screen.getByText(/src\/App\.tsx/)).toBeTruthy()

    fireEvent.click(screen.getByText('되돌리기'))
    await Promise.resolve(); await Promise.resolve()

    expect(gitAPI.discardChanges).toHaveBeenCalledWith(REPO, ['src/App.tsx'])
    // 파괴적 액션은 'Committed' 토스트용 onCommitDone이 아닌 onTreeChanged를 호출해야 한다.
    expect(onCommitDone).not.toHaveBeenCalled()
    expect(onTreeChanged).toHaveBeenCalledWith({ cls: 'success', title: '되돌림', msg: '변경사항을 되돌렸어요' })
  })

  it('Discard 취소 시 discardChanges 미호출', async () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('변경 되돌리기…'))
    fireEvent.click(screen.getByText('취소'))
    await Promise.resolve()
    expect(gitAPI.discardChanges).not.toHaveBeenCalled()
  })

  it('Ignore File → addToGitignore([f.p]) + onTreeChanged(Ignored), Committed 토스트 없음', async () => {
    const { onCommitDone, onTreeChanged } = renderStage([{ p: 'secret.env.ts', s: 'A', a: 3, d: 0 }])
    openMenuFor('secret.env.ts')
    fireEvent.mouseDown(screen.getByText('파일 무시 (.gitignore에 추가)'))
    await Promise.resolve(); await Promise.resolve()
    expect(gitAPI.addToGitignore).toHaveBeenCalledWith(REPO, ['secret.env.ts'])
    // 이미 추적 중인 파일도 status에서 빠지도록 추적 해제까지 호출한다.
    expect(gitAPI.untrack).toHaveBeenCalledWith(REPO, ['secret.env.ts'])
    expect(onCommitDone).not.toHaveBeenCalled()
    expect(onTreeChanged).toHaveBeenCalledWith({ cls: 'success', title: '무시 추가', msg: '.gitignore에 추가했어요' })
  })

  it('Ignore All .ext → addToGitignore(["*.ext"]) + onTreeChanged(Ignored), Committed 토스트 없음', async () => {
    const { onCommitDone, onTreeChanged } = renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('이 확장자 무시 · .tsx (.gitignore에 추가)'))
    await Promise.resolve(); await Promise.resolve()
    expect(gitAPI.addToGitignore).toHaveBeenCalledWith(REPO, ['*.tsx'])
    // 우클릭한 파일이 추적 중이면 함께 추적 해제.
    expect(gitAPI.untrack).toHaveBeenCalledWith(REPO, ['src/App.tsx'])
    expect(onCommitDone).not.toHaveBeenCalled()
    expect(onTreeChanged).toHaveBeenCalledWith({ cls: 'success', title: '무시 추가', msg: '.gitignore에 추가했어요' })
  })

  it('Copy File Path → 절대경로를 clipboard에 write', async () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('파일 경로 복사'))
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith(`${REPO}/src/App.tsx`)
  })

  it('Copy Relative File Path → 상대경로를 clipboard에 write', async () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('상대 경로 복사'))
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith('src/App.tsx')
  })

  it('Reveal in Finder → revealInFinder(절대경로)', async () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('Finder에서 보기'))
    await Promise.resolve()
    expect(gitAPI.revealInFinder).toHaveBeenCalledWith(`${REPO}/src/App.tsx`)
  })

  it('Open with Default Program → openPath(절대경로)', async () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('기본 앱으로 열기'))
    await Promise.resolve()
    expect(gitAPI.openPath).toHaveBeenCalledWith(`${REPO}/src/App.tsx`)
  })

  it('액션 실행 후 메뉴가 닫힌다', async () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    expect(screen.getByText('Finder에서 보기')).toBeTruthy()
    fireEvent.mouseDown(screen.getByText('Finder에서 보기'))
    await Promise.resolve()
    expect(screen.queryByText('Finder에서 보기')).toBeNull()
  })

  it('ESC로 메뉴가 닫힌다', () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    expect(screen.getByText('Finder에서 보기')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Finder에서 보기')).toBeNull()
  })
})
