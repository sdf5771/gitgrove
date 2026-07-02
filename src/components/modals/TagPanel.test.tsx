import { describe, it, expect, afterEach, beforeEach, vi, type Mock } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { TagPanel } from './TagPanel'
import { installGitApiMock } from '../../test/gitApiMock'
import type { Commit } from '../../data/mockData'

const REPO = '/repo/a'

const TAGS: GitTagEntry[] = [
  { name: 'v1.8.0', annotated: true, commit: 'a1f3c9d', date: '2026-06-28', tagger: 'seobisback', message: '릴리스 요약 메시지', subject: 'StatusBar 그루 매핑', pushed: true },
  { name: 'v1.7.0', annotated: false, commit: 'b91f06c', date: '2026-06-20', subject: '토스트 카탈로그', pushed: false },
  { name: 'nightly-0612', annotated: false, commit: '09ab7f2', date: '2026-06-12', subject: '임시 빌드', pushed: null },
]

const COMMITS: Commit[] = [
  { id: 'a1f3c9dfull', lane: 0, msg: 'StatusBar 그루 매핑', author: '서', time: '방금', parents: [], labels: [], stats: { f: 1, a: 1, d: 0 }, files: [] },
]

function installClipboard() {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true })
  return writeText
}

function setup(opts: { tags?: GitTagEntry[] } = {}) {
  const { gitAPI } = installGitApiMock()
  ;(gitAPI.listTags as unknown as Mock<(p: string) => Promise<GitTagEntry[]>>)
    .mockResolvedValue(opts.tags ?? TAGS)
  const onClose = vi.fn()
  const onChanged = vi.fn()
  const utils = render(<TagPanel onClose={onClose} repoPath={REPO} commits={COMMITS} onChanged={onChanged} />)
  return { gitAPI, onClose, onChanged, ...utils }
}

// 좌측 목록 pane에 한정한 조회(우측 상세는 auto-select로 tags[0]를 이미 보여줌).
const listPane = () => document.querySelector('.tg-list') as HTMLElement
const detailPane = () => document.querySelector('.tg-pane') as HTMLElement
const inList = (name: string) => within(listPane()).getByText(name)
// 목록이 로드될 때까지 대기(v1.7.0은 auto-select 대상이 아니라 목록에만 뜬다).
const waitList = () => screen.findByText('v1.7.0')

afterEach(cleanup)

describe('TagPanel — 목록', () => {
  beforeEach(() => { installClipboard() })

  it('listTags 결과를 릴리스/기타 섹션 + 이름·종류·푸시상태로 보여준다', async () => {
    const { container } = setup()
    await waitList()
    expect(within(listPane()).getByText('릴리스')).toBeTruthy()
    expect(within(listPane()).getByText('기타')).toBeTruthy()
    expect(within(listPane()).getByText('주석')).toBeTruthy()
    expect(within(listPane()).getAllByText('경량').length).toBeGreaterThan(0)
    const dots = container.querySelectorAll('.tg-item .tg-push')
    expect(dots[0].textContent).toBe('●')  // v1.8.0 pushed
    expect(dots[1].textContent).toBe('○')  // v1.7.0 local-only
    expect(dots[2].textContent).toBe('·')  // nightly unknown
  })

  it('검색으로 이름을 필터링한다', async () => {
    setup()
    await waitList()
    fireEvent.change(screen.getByPlaceholderText('태그 검색…'), { target: { value: 'nightly' } })
    expect(within(listPane()).queryByText('v1.8.0')).toBeNull()
    expect(within(listPane()).getByText('nightly-0612')).toBeTruthy()
  })

  it('태그 없으면 빈 상태 문구', async () => {
    setup({ tags: [] })
    expect(await screen.findByText('아직 태그가 없어요')).toBeTruthy()
  })
})

describe('TagPanel — 상세', () => {
  beforeEach(() => { installClipboard() })

  it('주석 태그(auto-select) 상세: Tagger·태그 메시지·커밋 카드', async () => {
    setup()
    await waitList()
    const pane = detailPane()
    expect(within(pane).getByText('Tagger')).toBeTruthy()
    expect(within(pane).getByText('seobisback')).toBeTruthy()
    expect(within(pane).getByText('릴리스 요약 메시지')).toBeTruthy()
    expect(within(pane).getByText('StatusBar 그루 매핑')).toBeTruthy()
  })

  it('푸시된 태그는 "origin에 푸시" 버튼이 없고, 미푸시 태그는 있다', async () => {
    setup()
    await waitList()
    expect(within(detailPane()).queryByText('origin에 푸시')).toBeNull()  // v1.8.0 pushed
    fireEvent.click(inList('v1.7.0'))
    expect(within(detailPane()).getByText('origin에 푸시')).toBeTruthy()
  })

  it('해시 복사 → clipboard write', async () => {
    const writeText = installClipboard()
    setup()
    await waitList()
    fireEvent.click(within(detailPane()).getByText('해시 복사'))
    expect(writeText).toHaveBeenCalledWith('a1f3c9d')
  })

  it('미푸시 태그 "origin에 푸시" → pushTag 호출 + 목록 reload', async () => {
    const { gitAPI } = setup()
    await waitList()
    fireEvent.click(inList('v1.7.0'))
    const before = (gitAPI.listTags as Mock).mock.calls.length
    fireEvent.click(within(detailPane()).getByText('origin에 푸시'))
    await waitFor(() => expect(gitAPI.pushTag).toHaveBeenCalledWith(REPO, 'v1.7.0'))
    await waitFor(() => expect((gitAPI.listTags as Mock).mock.calls.length).toBeGreaterThan(before))
  })

  it('삭제 → 인라인 확인 → 푸시된 태그는 alsoRemote=true로 deleteTag', async () => {
    const { gitAPI } = setup()
    await waitList()
    fireEvent.click(within(detailPane()).getByText('삭제'))
    const confirm = screen.getByText('로컬·origin에서 삭제할까요?').closest('.tg-delconfirm') as HTMLElement
    fireEvent.click(within(confirm).getByText('삭제'))
    await waitFor(() => expect(gitAPI.deleteTag).toHaveBeenCalledWith(REPO, 'v1.8.0', true))
  })

  it('삭제 인라인 확인 취소 시 deleteTag 미호출', async () => {
    const { gitAPI } = setup()
    await waitList()
    fireEvent.click(inList('v1.7.0'))
    fireEvent.click(within(detailPane()).getByText('삭제'))
    fireEvent.click(within(detailPane()).getByText('취소'))
    expect(gitAPI.deleteTag).not.toHaveBeenCalled()
  })
})

describe('TagPanel — 새 태그 만들기', () => {
  it('주석 태그 + 메시지 + 푸시 ON → createTag(opts) 호출', async () => {
    const { gitAPI } = setup()
    await waitList()
    fireEvent.click(screen.getByText('＋ 새 태그'))
    fireEvent.change(screen.getByPlaceholderText('v1.9.0'), { target: { value: 'v1.9.0' } })
    fireEvent.change(screen.getByPlaceholderText('이 릴리스의 요약을 적어요…'), { target: { value: '릴리스 노트' } })
    fireEvent.click(screen.getByText('태그 만들기'))
    await waitFor(() => expect(gitAPI.createTag).toHaveBeenCalledWith(REPO, 'v1.9.0', 'a1f3c9dfull', { annotated: true, message: '릴리스 노트', push: true }))
  })

  it('경량 태그 선택 시 메시지 비활성 + createTag는 annotated:false·message undefined·push off', async () => {
    const { gitAPI } = setup()
    await waitList()
    fireEvent.click(screen.getByText('＋ 새 태그'))
    fireEvent.change(screen.getByPlaceholderText('v1.9.0'), { target: { value: 'tmp-1' } })
    fireEvent.click(screen.getByText('경량 태그'))
    expect((screen.getByPlaceholderText('경량 태그는 메시지가 없어요') as HTMLTextAreaElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('푸시 토글'))
    fireEvent.click(screen.getByText('태그 만들기'))
    await waitFor(() => expect(gitAPI.createTag).toHaveBeenCalledWith(REPO, 'tmp-1', 'a1f3c9dfull', { annotated: false, message: undefined, push: false }))
  })
})
