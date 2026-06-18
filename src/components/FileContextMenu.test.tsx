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

function renderStage(unstaged: FileEntry[], staged: FileEntry[] = [], onCommitDone = vi.fn()) {
  return {
    onCommitDone,
    ...render(
      <StageArea
        onSelDiffFile={() => {}}
        unstaged={unstaged}
        staged={staged}
        repoPath={REPO}
        onCommitDone={onCommitDone}
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
    expect(screen.getByText('Discard Changes…')).toBeTruthy()
    expect(screen.getByText('Ignore File (Add to .gitignore)')).toBeTruthy()
    expect(screen.getByText('Ignore All .tsx Files (Add to .gitignore)')).toBeTruthy()
    expect(screen.getByText('Copy File Path')).toBeTruthy()
    expect(screen.getByText('Copy Relative File Path')).toBeTruthy()
    expect(screen.getByText('Reveal in Finder')).toBeTruthy()
    expect(screen.getByText('Open with Default Program')).toBeTruthy()
  })

  it('확장자 없는 파일은 "Ignore All .ext Files" 항목을 숨긴다', () => {
    renderStage([{ p: 'Makefile', s: 'M', a: 1, d: 0 }])
    openMenuFor('Makefile')
    expect(screen.getByText('Ignore File (Add to .gitignore)')).toBeTruthy()
    expect(screen.queryByText(/Ignore All/)).toBeNull()
  })

  it('staged 파일 행에서도 메뉴가 뜬다', () => {
    renderStage([], [{ p: 'staged.ts', s: 'M', a: 2, d: 1 }])
    openMenuFor('staged.ts')
    expect(screen.getByText('Discard Changes…')).toBeTruthy()
  })

  it('Discard → ConfirmModal → confirm 시 discardChanges 호출 + onCommitDone', async () => {
    const { onCommitDone } = renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('Discard Changes…'))

    // ConfirmModal 제목 + 메시지에 파일명 포함
    expect(screen.getByText('Discard Changes')).toBeTruthy()
    expect(screen.getByText(/src\/App\.tsx/)).toBeTruthy()

    fireEvent.click(screen.getByText('Discard'))
    await Promise.resolve(); await Promise.resolve()

    expect(gitAPI.discardChanges).toHaveBeenCalledWith(REPO, ['src/App.tsx'])
    expect(onCommitDone).toHaveBeenCalled()
  })

  it('Discard 취소 시 discardChanges 미호출', async () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('Discard Changes…'))
    fireEvent.click(screen.getByText('Cancel'))
    await Promise.resolve()
    expect(gitAPI.discardChanges).not.toHaveBeenCalled()
  })

  it('Ignore File → addToGitignore([f.p]) + onCommitDone', async () => {
    const { onCommitDone } = renderStage([{ p: 'secret.env.ts', s: 'A', a: 3, d: 0 }])
    openMenuFor('secret.env.ts')
    fireEvent.mouseDown(screen.getByText('Ignore File (Add to .gitignore)'))
    await Promise.resolve(); await Promise.resolve()
    expect(gitAPI.addToGitignore).toHaveBeenCalledWith(REPO, ['secret.env.ts'])
    expect(onCommitDone).toHaveBeenCalled()
  })

  it('Ignore All .ext → addToGitignore(["*.ext"])', async () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('Ignore All .tsx Files (Add to .gitignore)'))
    await Promise.resolve(); await Promise.resolve()
    expect(gitAPI.addToGitignore).toHaveBeenCalledWith(REPO, ['*.tsx'])
  })

  it('Copy File Path → 절대경로를 clipboard에 write', async () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('Copy File Path'))
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith(`${REPO}/src/App.tsx`)
  })

  it('Copy Relative File Path → 상대경로를 clipboard에 write', async () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('Copy Relative File Path'))
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith('src/App.tsx')
  })

  it('Reveal in Finder → revealInFinder(절대경로)', async () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('Reveal in Finder'))
    await Promise.resolve()
    expect(gitAPI.revealInFinder).toHaveBeenCalledWith(`${REPO}/src/App.tsx`)
  })

  it('Open with Default Program → openPath(절대경로)', async () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    fireEvent.mouseDown(screen.getByText('Open with Default Program'))
    await Promise.resolve()
    expect(gitAPI.openPath).toHaveBeenCalledWith(`${REPO}/src/App.tsx`)
  })

  it('액션 실행 후 메뉴가 닫힌다', async () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    expect(screen.getByText('Reveal in Finder')).toBeTruthy()
    fireEvent.mouseDown(screen.getByText('Reveal in Finder'))
    await Promise.resolve()
    expect(screen.queryByText('Reveal in Finder')).toBeNull()
  })

  it('ESC로 메뉴가 닫힌다', () => {
    renderStage([{ p: 'src/App.tsx', s: 'M', a: 1, d: 0 }])
    openMenuFor('App.tsx')
    expect(screen.getByText('Reveal in Finder')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Reveal in Finder')).toBeNull()
  })
})
