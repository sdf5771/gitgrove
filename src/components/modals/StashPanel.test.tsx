import { describe, it, expect, afterEach, vi, type Mock } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { StashPanel } from './StashPanel'
import { installGitApiMock } from '../../test/gitApiMock'

// StashPanel: 2-pane(좌측 목록 · 우측 프리뷰) Stash 관리 모달.
// repoPath가 주어지면 window.gitAPI 의 stash* 들을 실제로 호출한다.
// (repoPath 없으면 MOCK_STASHES 폴백 — 여기서는 항상 repoPath를 줘서 실제 경로를 검증.)

const REPO = '/repo/a'

// stash@{0} 메시지는 한글·공백·특수문자를 포함해 branchSlug 안전성까지 검증한다.
const STASHES: GitStashEntry[] = [
  { index: 0, message: '결제 폼 검증 #1', branch: 'feature/checkout', time: '2시간 전', files: 2, additions: 30, deletions: 5 },
  { index: 1, message: '다크 모드 토큰 실험', branch: 'main', time: '어제', files: 3, additions: 120, deletions: 30 },
  { index: 2, message: '리팩터 중간 저장', branch: 'dev', time: '3일 전', files: 1, additions: 8, deletions: 60 },
]

const FILES_BY_INDEX: Record<number, GitStashFile[]> = {
  0: [{ path: 'src/checkout/Form.tsx', status: 'M', additions: 20, deletions: 3 }],
  1: [
    { path: 'src/theme/tokens.ts', status: 'A', additions: 50, deletions: 0 },
    { path: 'src/theme/dark.css', status: 'M', additions: 70, deletions: 30 },
  ],
  2: [{ path: 'src/old/legacy.ts', status: 'D', additions: 0, deletions: 60 }],
}

// 기본 프리뷰: tracked 변경 1개 + untracked 1개 → 보관 버튼 활성.
const PREVIEW_DEFAULT: StashPreviewResult = {
  tracked: [{ path: 'src/work/current.ts', status: 'M', staged: false }],
  untracked: [{ path: 'src/work/new.ts', status: 'A', staged: false }],
}

function setup(opts: { stashes?: GitStashEntry[]; preview?: StashPreviewResult; stashed?: boolean } = {}) {
  const { gitAPI } = installGitApiMock()
  // 공용 mock의 stash* 는 빈 결과로 타입 추론되므로, 픽스처 주입 시 시그니처를 명시한다.
  ;(gitAPI.stashList as unknown as Mock<(p: string) => Promise<GitStashEntry[]>>)
    .mockResolvedValue(opts.stashes ?? STASHES)
  ;(gitAPI.stashFiles as unknown as Mock<(p: string, i: number) => Promise<GitStashFile[]>>)
    .mockImplementation(async (_p: string, i: number) => FILES_BY_INDEX[i] ?? [])
  ;(gitAPI.stashPreview as unknown as Mock<(p: string) => Promise<StashPreviewResult>>)
    .mockResolvedValue(opts.preview ?? PREVIEW_DEFAULT)
  ;(gitAPI.stashPush as unknown as Mock<(p: string, m?: string, k?: boolean, u?: boolean) => Promise<boolean>>)
    .mockResolvedValue(opts.stashed ?? true)
  const onClose = vi.fn()
  const onChanged = vi.fn()
  const utils = render(<StashPanel onClose={onClose} repoPath={REPO} onChanged={onChanged} />)
  return { gitAPI, onClose, onChanged, ...utils }
}

afterEach(cleanup)

describe('StashPanel — 목록 렌더 (좌측 pane)', () => {
  it('stashList 결과를 stash@{n}·메시지·메타(파일수/+a/−d)로 보여준다', async () => {
    setup()
    // 첫 항목(index 0)은 자동 선택되어 프리뷰에도 뜨므로, 비선택 항목 배지로 로드를 기다린다.
    await screen.findByText('stash@{1}')
    expect(screen.getByText('stash@{2}')).toBeTruthy()
    expect(screen.getAllByText('stash@{0}').length).toBeGreaterThan(0)

    // 메시지
    expect(screen.getByText('다크 모드 토큰 실험')).toBeTruthy()
    expect(screen.getByText('리팩터 중간 저장')).toBeTruthy()

    // 메타: 파일수 + 추가량
    expect(screen.getByText('2f')).toBeTruthy()
    expect(screen.getByText('3f')).toBeTruthy()
    expect(screen.getByText('1f')).toBeTruthy()
    expect(screen.getByText('+30')).toBeTruthy()
    expect(screen.getByText('+120')).toBeTruthy()
  })
})

describe('StashPanel — 선택 → 프리뷰 lazy 로드 (우측 pane)', () => {
  it('마운트 시 첫 항목으로 stashFiles(repoPath, 0) 호출, 다른 항목 클릭 시 그 index로 호출', async () => {
    const { gitAPI } = setup()
    await screen.findByText('stash@{1}')

    // 자동 선택된 첫 항목으로 lazy 로드
    await waitFor(() => expect(gitAPI.stashFiles).toHaveBeenCalledWith(REPO, 0))
    expect(screen.getByText('src/checkout/Form.tsx')).toBeTruthy()

    // 두 번째 항목 클릭 → 그 index로 재호출 + 반환 파일이 프리뷰에 표시
    fireEvent.click(screen.getByText('다크 모드 토큰 실험'))
    await waitFor(() => expect(gitAPI.stashFiles).toHaveBeenCalledWith(REPO, 1))
    expect(await screen.findByText('src/theme/tokens.ts')).toBeTruthy()
    expect(screen.getByText('src/theme/dark.css')).toBeTruthy()
    // 파일별 status·증감 표시
    expect(screen.getByText('+50')).toBeTruthy()
  })
})

describe('StashPanel — 파일 클릭 → diff 보기', () => {
  it('파일 행 클릭 시 stashFileDiff(repoPath, index, path) 호출 + diff 표시, 뒤로가기로 목록 복귀', async () => {
    const { gitAPI } = setup()
    ;(gitAPI.stashFileDiff as unknown as Mock<(p: string, i: number, f: string) => Promise<string>>)
      .mockResolvedValue('diff --git a/x b/x\n@@ -1,2 +1,3 @@\n const a = 1\n-const b = 2\n+const b = 3')
    await screen.findByText('stash@{1}')

    // 첫 stash(index 0) 자동 선택 → 파일목록에 Form.tsx
    await screen.findByText('src/checkout/Form.tsx')
    fireEvent.click(screen.getByText('src/checkout/Form.tsx'))

    await waitFor(() => expect(gitAPI.stashFileDiff).toHaveBeenCalledWith(REPO, 0, 'src/checkout/Form.tsx'))
    // diff 헝크 라인이 보이고(헤더 diff/index 라인은 필터됨) 뒤로가기 버튼 존재
    expect(await screen.findByText('@@ -1,2 +1,3 @@')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '← 변경 파일' }))
    // 목록으로 복귀 — diff 사라지고 파일 행이 다시 보인다
    await waitFor(() => expect(screen.queryByText('@@ -1,2 +1,3 @@')).toBeNull())
    expect(screen.getByText('src/checkout/Form.tsx')).toBeTruthy()
  })
})

describe('StashPanel — push + keepIndex', () => {
  it('메시지 입력 후 보관 버튼 → stashPush(repoPath, msg, false, false) [기본]', async () => {
    const { gitAPI } = setup()
    await screen.findByText('stash@{1}')
    // 프리뷰 로드 완료(보관 대상 존재) 후 버튼 활성.
    await screen.findByText(/보관될 변경/)

    fireEvent.change(screen.getByPlaceholderText('메시지를 적어 두면 나중에 찾기 쉬워요'), {
      target: { value: '새 작업 보관' },
    })
    fireEvent.click(screen.getByRole('button', { name: '보관' }))

    await waitFor(() => expect(gitAPI.stashPush).toHaveBeenCalledWith(REPO, '새 작업 보관', false, false))
  })

  it('스테이지 유지 체크 + Enter → stashPush(repoPath, msg, true, false)', async () => {
    const { gitAPI } = setup()
    await screen.findByText('stash@{1}')
    await screen.findByText(/보관될 변경/)

    const input = screen.getByPlaceholderText('메시지를 적어 두면 나중에 찾기 쉬워요')
    fireEvent.change(input, { target: { value: '인덱스 유지 보관' } })
    fireEvent.click(screen.getByLabelText('스테이지 유지'))
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(gitAPI.stashPush).toHaveBeenCalledWith(REPO, '인덱스 유지 보관', true, false))
  })

  it("'새 파일 포함' 체크 → stashPush 4번째 인자 true (untracked 포함)", async () => {
    const { gitAPI } = setup()
    await screen.findByText('stash@{1}')
    await screen.findByText(/보관될 변경/)

    fireEvent.change(screen.getByPlaceholderText('메시지를 적어 두면 나중에 찾기 쉬워요'), {
      target: { value: '새 파일까지' },
    })
    fireEvent.click(screen.getByLabelText('새 파일 포함'))
    fireEvent.click(screen.getByRole('button', { name: '보관' }))

    await waitFor(() => expect(gitAPI.stashPush).toHaveBeenCalledWith(REPO, '새 파일까지', false, true))
  })

  it('보관할 변경이 없으면 보관 버튼 비활성 · stashPush 미호출', async () => {
    const { gitAPI } = setup({ preview: { tracked: [], untracked: [] } })
    await screen.findByText('stash@{1}')
    expect(await screen.findByText(/보관할 변경이 없어요/)).toBeTruthy()

    const btn = screen.getByRole('button', { name: '보관' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(gitAPI.stashPush).not.toHaveBeenCalled()
  })

  it('untracked만 있을 때 → 안내 문구 · 기본 비활성, 새 파일 포함 켜면 활성', async () => {
    setup({ preview: { tracked: [], untracked: [{ path: 'a.txt', status: 'A', staged: false }] } })
    await screen.findByText('stash@{1}')
    expect(await screen.findByText(/새 파일 1개만 있어요/)).toBeTruthy()

    const btn = screen.getByRole('button', { name: '보관' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('새 파일 포함'))
    expect(btn.disabled).toBe(false)
  })
})

describe('StashPanel — onChanged (부모 저장소 뷰 갱신)', () => {
  it('보관 성공 시 onChanged 호출(뒤 화면 갱신)', async () => {
    const { onChanged } = setup()
    await screen.findByText('stash@{1}')
    await screen.findByText(/보관될 변경/)
    fireEvent.click(screen.getByRole('button', { name: '보관' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('보관할 변경이 없으면 onChanged 미호출', async () => {
    const { onChanged } = setup({ preview: { tracked: [], untracked: [] } })
    await screen.findByText('stash@{1}')
    await screen.findByText(/보관할 변경이 없어요/)
    // 버튼 비활성 → 클릭해도 아무 일 없음
    fireEvent.click(screen.getByRole('button', { name: '보관' }))
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('pop 시 onChanged 호출', async () => {
    const { onChanged } = setup()
    await screen.findByText('stash@{1}')
    fireEvent.click(screen.getByRole('button', { name: 'Pop' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })
})

describe('StashPanel — pop', () => {
  it('Pop → stashPop(repoPath, index) + 이후 목록 reload(stashList 재호출)', async () => {
    const { gitAPI } = setup()
    await screen.findByText('stash@{1}')
    const before = gitAPI.stashList.mock.calls.length

    // 첫 항목(index 0) 자동 선택 상태에서 Pop
    fireEvent.click(await screen.findByRole('button', { name: 'Pop' }))

    await waitFor(() => expect(gitAPI.stashPop).toHaveBeenCalledWith(REPO, 0))
    await waitFor(() => expect(gitAPI.stashList.mock.calls.length).toBeGreaterThan(before))
  })
})

describe('StashPanel — apply', () => {
  it('Apply → stashApply(repoPath, index) 호출, 목록 유지(reload 없음)', async () => {
    const { gitAPI } = setup()
    await screen.findByText('stash@{1}')
    const before = gitAPI.stashList.mock.calls.length

    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(gitAPI.stashApply).toHaveBeenCalledWith(REPO, 0))
    // 목록은 그대로 — stashList 재호출 없음, 항목 유지
    expect(gitAPI.stashList.mock.calls.length).toBe(before)
    expect(screen.getByText('다크 모드 토큰 실험')).toBeTruthy()
  })
})

describe('StashPanel — 브랜치로', () => {
  it('브랜치로 → stashBranch(repoPath, index, slug) 호출(한글·공백·특수문자 안전) + reload', async () => {
    const { gitAPI } = setup()
    await screen.findByText('stash@{1}')
    const before = gitAPI.stashList.mock.calls.length

    // 선택된 stash@{0} 메시지 '결제 폼 검증 #1' → 'stash/결제-폼-검증-1'
    fireEvent.click(await screen.findByRole('button', { name: '브랜치로' }))

    await waitFor(() =>
      expect(gitAPI.stashBranch).toHaveBeenCalledWith(REPO, 0, 'stash/결제-폼-검증-1'),
    )
    await waitFor(() => expect(gitAPI.stashList.mock.calls.length).toBeGreaterThan(before))
  })
})

describe('StashPanel — drop 확인 플로우', () => {
  it('Drop → 인라인 확인 노출 → 취소는 stashDrop 미호출', async () => {
    const { gitAPI } = setup()
    await screen.findByText('stash@{1}')

    fireEvent.click(await screen.findByRole('button', { name: 'Drop' }))
    expect(screen.getByText('이 스태시를 버릴까요?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByText('이 스태시를 버릴까요?')).toBeNull())
    expect(gitAPI.stashDrop).not.toHaveBeenCalled()
  })

  it('Drop → 버리기는 stashDrop(repoPath, index) 호출 + reload', async () => {
    const { gitAPI } = setup()
    await screen.findByText('stash@{1}')
    const before = gitAPI.stashList.mock.calls.length

    fireEvent.click(await screen.findByRole('button', { name: 'Drop' }))
    fireEvent.click(screen.getByRole('button', { name: '버리기' }))

    await waitFor(() => expect(gitAPI.stashDrop).toHaveBeenCalledWith(REPO, 0))
    await waitFor(() => expect(gitAPI.stashList.mock.calls.length).toBeGreaterThan(before))
  })
})

describe('StashPanel — empty 상태', () => {
  it('stashList가 빈 배열 → empty 문구 표시, 2-pane 미표시', async () => {
    const { container } = setup({ stashes: [] })

    expect(await screen.findByText('아직 보관한 게 없어요')).toBeTruthy()
    expect(screen.getByText('작업을 잠시 치워 두고 싶을 때 위에서 보관해 보세요')).toBeTruthy()

    // 2-pane(body)·액션이 렌더되지 않는다.
    expect(container.querySelector('.stash-body')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pop' })).toBeNull()
  })
})

describe('StashPanel — 닫기', () => {
  it('× 버튼 클릭 시 onClose 호출', async () => {
    const { onClose } = setup()
    await screen.findByText('stash@{1}')

    fireEvent.click(screen.getByLabelText('닫기'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('scrim 클릭 시 onClose 호출(다이얼로그 내부 클릭은 전파 차단)', async () => {
    const { onClose, container } = setup()
    await screen.findByText('stash@{1}')

    // 다이얼로그 내부 클릭은 onClose를 부르지 않는다.
    fireEvent.click(container.querySelector('.stash-dlg') as Element)
    expect(onClose).not.toHaveBeenCalled()

    // scrim(바깥) 클릭은 onClose 호출.
    fireEvent.click(container.querySelector('.stash-scrim') as Element)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
