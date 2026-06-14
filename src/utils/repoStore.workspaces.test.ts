import { beforeEach, describe, expect, it } from 'vitest'
import { loadWorkspaces, saveWorkspaces, createWorkspaceId, type Workspace } from './repoStore'

const KEY = 'gitgrove:workspaces'

describe('repoStore — 워크스페이스 영속', () => {
  beforeEach(() => localStorage.clear())

  it('save → load 라운드트립', () => {
    const ws: Workspace[] = [
      { id: 'ws_a', name: '회사', paths: ['/r/api', '/r/web'] },
      { id: 'ws_b', name: '개인', paths: [] },
    ]
    saveWorkspaces(ws)
    expect(loadWorkspaces()).toEqual(ws)
  })

  it('저장값이 없으면 빈 배열', () => {
    expect(loadWorkspaces()).toEqual([])
  })

  it('손상된 JSON은 빈 배열로 폴백', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadWorkspaces()).toEqual([])
  })

  it('잘못된 형태의 항목은 걸러내고, paths의 비문자열도 제거', () => {
    localStorage.setItem(KEY, JSON.stringify([
      { id: 'ws_ok', name: '정상', paths: ['/r/a', 42, null, '/r/b'] },
      { id: 123, name: '아이디비정상' },          // id가 string 아님 → 제거
      { name: 'id없음', paths: [] },              // id 없음 → 제거
      'garbage',                                   // 객체 아님 → 제거
    ]))
    expect(loadWorkspaces()).toEqual([
      { id: 'ws_ok', name: '정상', paths: ['/r/a', '/r/b'] },
    ])
  })

  it('paths 누락 시 빈 배열로 보정', () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'ws_x', name: 'x' }]))
    expect(loadWorkspaces()).toEqual([{ id: 'ws_x', name: 'x', paths: [] }])
  })

  it('createWorkspaceId는 매번 다른 값을 만든다', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createWorkspaceId()))
    expect(ids.size).toBe(50)
    expect(createWorkspaceId()).toMatch(/^ws_/)
  })
})
