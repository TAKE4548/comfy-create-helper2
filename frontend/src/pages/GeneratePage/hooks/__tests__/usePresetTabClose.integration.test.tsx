import React from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { usePresetState } from '../usePresetState'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import type { WorkflowPreset } from '../../../../api/types'

const basePresets = (): WorkflowPreset[] => [101, 102, 103, 104, 105].map((id, index) => ({
  id, workflow_id: 1, name: String.fromCharCode(64 + index + 1), param_values: { prompt: `server-${id}` },
  applied_assets: {}, batch_size: 1, seed_mode: 'random', seed: 42, sort_order: index,
  created_at: '2026-10-26T00:00:00Z', updated_at: `2026-10-27T00:00:0${index + 1}Z`,
}))

let presets: WorkflowPreset[]
let requests: Array<{ id: number; body: Record<string, unknown> }> = []
let createRequests: Array<Record<string, unknown>> = []
let putHandler: (id: number, body: Record<string, unknown>) => Promise<Response> | Response
let postHandler: (body: Record<string, unknown>) => Promise<Response> | Response

const server = setupServer(
  http.get('*/api/workflow-presets', ({ request }) => {
    expect(new URL(request.url).searchParams.get('workflow_id')).toBe('1')
    return HttpResponse.json(presets)
  }),
  http.post('*/api/workflow-presets', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    createRequests.push(body)
    return postHandler(body)
  }),
  http.put('*/api/workflow-presets/:id', async ({ request, params }) => {
    const id = Number(params.id)
    const body = await request.json() as Record<string, unknown>
    requests.push({ id, body })
    return putHandler(id, body)
  }),
)

describe('usePresetTabClose transport integration', () => {
  let client: QueryClient
  let wrapper: React.FC<React.PropsWithChildren>
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterAll(() => server.close())
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    sessionStorage.clear()
    presets = basePresets()
    requests = []
    createRequests = []
    postHandler = () => HttpResponse.json({ detail: 'Unexpected preset creation' }, { status: 500 })
    putHandler = (id, body) => {
      const index = presets.findIndex((item) => item.id === id)
      presets[index] = { ...presets[index], ...body, id, workflow_id: 1, sort_order: index,
        updated_at: `2026-10-27T00:01:0${index + 1}Z` } as WorkflowPreset
      return HttpResponse.json(presets[index])
    }
    localStorage.setItem('prompt-surgeon-open-presets-1', JSON.stringify([101, 102, 103, 104, 105]))
    localStorage.setItem('prompt-surgeon-active-set-wf-1', '103')
    useGenerationStore.setState({ selectedWorkflowId: 1, activeSetId: 103, openPresetIds: [101, 102, 103, 104, 105],
      sets: presets.map((preset) => ({ id: preset.id, name: preset.name, checked: true, paramValues: preset.param_values,
        appliedAssets: preset.applied_assets, promptChips: {}, batchSize: preset.batch_size, seedMode: 'random', seed: 42 })),
      paramValues: { prompt: 'server-103' }, appliedAssets: {}, promptChips: {}, batchSize: 1, seedMode: 'random', seed: 42 })
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  })
  afterEach(() => { server.resetHandlers(); client.clear() })

  it('[REQ-402/AC-7] waits-for-ack', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-7'], layer: 'integration', caseId: 'waits-for-ack' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const successfulPut = putHandler
    putHandler = async (id, body) => { await gate; return successfulPut(id, body) }
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    useGenerationStore.setState((state) => ({ sets: state.sets.map((item) => item.id === 101 || item.id === 102
      ? { ...item, paramValues: { prompt: item.id === 101 ? 'local-draft' : 'local-b-draft' } } : item) }))
    let closePromise!: Promise<boolean>
    act(() => { closePromise = result.current.handleClosePresetTabs(103, 'left') })
    await waitFor(() => expect(requests.some((item) => item.id === 101)).toBe(true))
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 103, 104, 105])
    expect(useGenerationStore.getState().sets.find((item) => item.id === 101)?.paramValues).toEqual({ prompt: 'local-draft' })
    expect(requests.map((item) => item.id)).toEqual([101])
    await expect(result.current.handleClosePresetTabs(103, 'left')).resolves.toBe(false)
    expect(requests.map((item) => item.id)).toEqual([101])
    release()
    await expect(closePromise).resolves.toBe(true)
    expect(useGenerationStore.getState().openPresetIds).toEqual([103, 104, 105])
    expect(localStorage.getItem('prompt-surgeon-open-presets-1')).toBe('[103,104,105]')
    expect(requests.map((item) => item.id)).toEqual([101, 102])
    expect(requests[0].body).toMatchObject({ param_values: { prompt: 'local-draft' }, base_updated_at: '2026-10-27T00:00:01Z' })
    act(() => { result.current.handleSelectPresetTab(101) })
    await waitFor(() => expect(useGenerationStore.getState().activeSetId).toBe(101))
    expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'local-draft' })
    useGenerationStore.setState({ paramValues: { prompt: 'second-edit' } })
    act(() => { result.current.flushAutoSave() })
    await waitFor(() => expect(requests).toHaveLength(3))
    expect(requests[2].body.base_updated_at).toBe('2026-10-27T00:01:01Z')
  })

  it('[REQ-402/AC-7] active-target-flushes-editor', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-7'], layer: 'integration', caseId: 'active-target-flushes-editor' })
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    act(() => { useGenerationStore.getState().setActiveSetId(102) })
    useGenerationStore.setState({ paramValues: { prompt: 'active-editor-draft' }, seed: 77 })
    await expect(result.current.handleClosePresetTabs(103, 'left')).resolves.toBe(true)
    expect(requests.map((item) => item.id)).toEqual([102])
    expect(requests[0].body).toMatchObject({ param_values: { prompt: 'active-editor-draft' }, seed: 77 })
    expect(useGenerationStore.getState().openPresetIds).toEqual([103, 104, 105])
    expect(useGenerationStore.getState().activeSetId).toBe(103)
    expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'server-103' })
  })

  it('[REQ-402/AC-7] initial-load-does-not-autosave', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-7'], layer: 'integration', caseId: 'initial-load-does-not-autosave' })
    const before = structuredClone(presets)
    renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(requests).toEqual([])
    expect(presets).toEqual(before)
    expect(useGenerationStore.getState().sets.map((item) => item.paramValues)).toEqual(before.map((item) => item.param_values))
  })

  it('[REQ-402/AC-7] autosave-flush-preserves-history-and-active-snapshot-on-failure', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-7', 'REQ-402/AC-8'], layer: 'integration', caseId: 'flush-history-snapshot-on-failure' })
    let failAck!: () => void
    const gate = new Promise<void>((resolve) => { failAck = resolve })
    putHandler = async () => { await gate; return HttpResponse.json({ detail: 'Injected save failure' }, { status: 503 }) }
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    const chips = { positive: [{ id: 'blank-chip', text: '', enabled: true }] }
    act(() => useGenerationStore.setState({ paramValues: { prompt: 'flush-draft' }, seed: 77, promptChips: chips }))
    act(() => result.current.flushAutoSave())
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(useGenerationStore.getState().sets.find((item) => item.id === 103)).toMatchObject({
      paramValues: { prompt: 'flush-draft' }, seed: 77, promptChips: chips,
    })
    expect(JSON.parse(sessionStorage.getItem('prompt-surgeon-history-103')!).past).toEqual([{
      paramValues: { prompt: 'server-103' }, appliedAssets: {}, batchSize: 1, seedMode: 'random', seed: 42,
    }])
    expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'flush-draft' })
    expect(result.current.canUndo).toBe(true)
    act(() => result.current.undo(103))
    await waitFor(() => expect(useGenerationStore.getState()).toMatchObject({
      paramValues: { prompt: 'server-103' }, appliedAssets: {}, batchSize: 1, seedMode: 'random', seed: 42,
    }))
    expect(result.current.canRedo).toBe(true)
    expect(JSON.parse(sessionStorage.getItem('prompt-surgeon-history-103')!).future.at(-1)).toMatchObject({
      paramValues: { prompt: 'flush-draft' }, appliedAssets: {}, batchSize: 1, seedMode: 'random', seed: 77,
    })
    act(() => result.current.redo(103))
    await waitFor(() => expect(useGenerationStore.getState()).toMatchObject({
      paramValues: { prompt: 'flush-draft' }, appliedAssets: {}, batchSize: 1, seedMode: 'random', seed: 77,
    }))
    expect(result.current.canRedo).toBe(false)
    failAck()
    await waitFor(() => expect(useGenerationStore.getState().errorToast?.message).toContain('Injected save failure'))
    expect(useGenerationStore.getState().sets.find((item) => item.id === 103)).toMatchObject({
      paramValues: { prompt: 'flush-draft' }, seed: 77, promptChips: chips,
    })
    expect(result.current.canUndo).toBe(true)
    expect(JSON.parse(sessionStorage.getItem('prompt-surgeon-history-103')!).past).toEqual([{
      paramValues: { prompt: 'server-103' }, appliedAssets: {}, batchSize: 1, seedMode: 'random', seed: 42,
    }])
    putHandler = () => HttpResponse.json(presets[2])
    act(() => result.current.flushAutoSave())
    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1].body).toMatchObject({ param_values: { prompt: 'flush-draft' }, base_updated_at: '2026-10-27T00:00:03Z' })
  })

  it('[REQ-402/AC-7] new-preset-ack-is-not-overwritten-by-old-editor', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-7'], layer: 'integration', caseId: 'new-preset-ack-not-overwritten' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    postHandler = async (body) => {
      await gate
      const created: WorkflowPreset = {
        id: 106, workflow_id: 1, name: String(body.name), param_values: body.param_values as Record<string, string>,
        applied_assets: body.applied_assets as WorkflowPreset['applied_assets'], batch_size: Number(body.batch_size),
        seed_mode: String(body.seed_mode), seed: Number(body.seed), sort_order: 5,
        created_at: '2026-10-27T00:03:00Z', updated_at: '2026-10-27T00:03:00Z',
      }
      presets = [...presets, created]
      return HttpResponse.json(created, { status: 201 })
    }
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    act(() => { result.current.handleCreatePreset('New preset', 'default') })
    await waitFor(() => expect(createRequests).toHaveLength(1))
    expect(createRequests[0]).toEqual({ workflow_id: 1, name: 'New preset', param_values: {}, applied_assets: {}, batch_size: 1, seed_mode: 'random', seed: 42 })
    expect(useGenerationStore.getState().activeSetId).toBe(103)
    expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'server-103' })
    expect(requests).toEqual([])
    release()
    await waitFor(() => expect(result.current.presets).toHaveLength(6))
    await waitFor(() => expect(useGenerationStore.getState().activeSetId).toBe(106))
    expect(useGenerationStore.getState().openPresetIds.map(String)).toContain('106')
    expect(useGenerationStore.getState()).toMatchObject({ paramValues: {}, appliedAssets: {}, batchSize: 1, seedMode: 'random', seed: 42 })
    expect(result.current.newPresetName).toBe('')
    expect(result.current.isPresetOpen).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(requests.filter((item) => item.id === 106)).toEqual([])
    expect(presets.find((item) => item.id === 106)?.param_values).toEqual({})
  })

  it('[REQ-402/AC-8] close-abort-retains-current-params-and-invalid-chip', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-8'], layer: 'integration', caseId: 'close-abort-retains-invalid-chip' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const successfulPut = putHandler
    putHandler = async (id, body) => { await gate; return successfulPut(id, body) }
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    useGenerationStore.setState((state) => ({ sets: state.sets.map((item) => item.id === 101
      ? { ...item, paramValues: { prompt: 'close-draft' } } : item) }))
    let closing!: Promise<boolean>
    act(() => { closing = result.current.handleClosePresetTabs(103, 'left') })
    await waitFor(() => expect(requests).toHaveLength(1))
    const chips = { positive: [{ id: 'blank-chip', text: '', enabled: true }] }
    act(() => useGenerationStore.setState({ paramValues: { prompt: 'current-editor-draft' }, promptChips: chips, seed: 1234 }))
    release()
    await expect(closing).resolves.toBe(false)
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 103, 104, 105])
    expect(useGenerationStore.getState()).toMatchObject({ paramValues: { prompt: 'current-editor-draft' }, promptChips: chips, seed: 1234 })
    expect(useGenerationStore.getState().sets.find((item) => item.id === 103)).toMatchObject({ paramValues: { prompt: 'current-editor-draft' }, promptChips: chips, seed: 1234 })
    expect(useGenerationStore.getState().errorToast?.message).toContain('編集')
  })

  it('[REQ-402/AC-8] partial-save-abort', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-8'], layer: 'integration', caseId: 'partial-save-abort' })
    const successHandler = putHandler
    putHandler = (id, body) => {
      if (id === 102) return HttpResponse.json({ detail: 'Injected save failure' }, { status: 503 })
      const index = presets.findIndex((item) => item.id === id)
      presets[index] = { ...presets[index], ...body, updated_at: '2026-10-27T00:02:00Z' } as WorkflowPreset
      return HttpResponse.json(presets[index])
    }
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    useGenerationStore.setState((state) => ({ sets: state.sets.map((item) => item.id === 101 || item.id === 102
      ? { ...item, paramValues: { prompt: `local-${item.id}` } } : item) }))
    await expect(result.current.handleClosePresetTabs(103, 'left')).resolves.toBe(false)
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 103, 104, 105])
    expect(useGenerationStore.getState().sets.find((item) => item.id === 102)?.paramValues).toEqual({ prompt: 'local-102' })
    expect(presets.find((item) => item.id === 101)?.param_values).toEqual({ prompt: 'local-101' })
    expect(requests.map((item) => item.id)).toEqual([101, 102])
    expect(useGenerationStore.getState().errorToast?.message).toContain('503')
    expect(useGenerationStore.getState().errorToast?.message).toContain('もう一度')
    putHandler = successHandler
    await expect(result.current.handleClosePresetTabs(103, 'left')).resolves.toBe(true)
    expect(useGenerationStore.getState().openPresetIds).toEqual([103, 104, 105])
    expect(requests.map((item) => item.id)).toEqual([101, 102, 102])
  })

  it('[REQ-402/AC-8] failed-active-target-close-keeps-retry-notice-after-debounce', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-8'], layer: 'integration', caseId: 'active-target-failure-notice-stable' })
    const successfulPut = putHandler
    putHandler = () => HttpResponse.json({ detail: 'Injected save failure' }, { status: 503 })
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    act(() => { useGenerationStore.getState().setActiveSetId(102) })
    act(() => useGenerationStore.setState({ paramValues: { prompt: 'active-b-draft' } }))
    await expect(result.current.handleClosePresetTabs(103, 'left')).resolves.toBe(false)
    expect(requests.map((item) => item.id)).toEqual([102])
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 103, 104, 105])
    expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'active-b-draft' })
    const failureNotice = useGenerationStore.getState().errorToast?.message
    expect(failureNotice).toContain('503')
    expect(failureNotice).toContain('もう一度')
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(requests.map((item) => item.id)).toEqual([102])
    expect(useGenerationStore.getState().errorToast?.message).toBe(failureNotice)
    expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'active-b-draft' })
    putHandler = successfulPut
    await expect(result.current.handleClosePresetTabs(103, 'left')).resolves.toBe(true)
    expect(requests.map((item) => item.id)).toEqual([102, 102])
    expect(useGenerationStore.getState().openPresetIds).toEqual([103, 104, 105])
  })

  it('[REQ-402/AC-8] inactive-target-failure-does-not-pause-active-editor-autosave', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-8'], layer: 'integration', caseId: 'inactive-target-failure-preserves-active-autosave' })
    const successfulPut = putHandler
    putHandler = (id) => id === 101 ? HttpResponse.json({ detail: 'Injected save failure' }, { status: 503 }) : successfulPut(id, {})
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    useGenerationStore.setState((state) => ({
      sets: state.sets.map((item) => item.id === 101 ? { ...item, paramValues: { prompt: 'inactive-target-draft' } } : item),
      paramValues: { prompt: 'active-trigger-draft' },
    }))
    await expect(result.current.handleClosePresetTabs(103, 'left')).resolves.toBe(false)
    expect(requests.map((item) => item.id)).toEqual([101])
    expect(useGenerationStore.getState().activeSetId).toBe(103)
    expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'active-trigger-draft' })
    await waitFor(() => expect(requests.map((item) => item.id)).toEqual([101, 103]), { timeout: 2500 })
    expect(requests[1].body).toMatchObject({ param_values: { prompt: 'active-trigger-draft' } })
    expect(useGenerationStore.getState().sets.find((item) => item.id === 101)?.paramValues).toEqual({ prompt: 'inactive-target-draft' })
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 103, 104, 105])
  })

  it('[REQ-402/AC-8] conflict-keeps-draft-without-retry', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-8'], layer: 'integration', caseId: 'conflict-no-force-retry' })
    putHandler = () => HttpResponse.json({ detail: 'Preset was updated by another session. Please reload to get the latest changes.' }, { status: 409 })
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    useGenerationStore.setState((state) => ({ sets: state.sets.map((item) => item.id === 101
      ? { ...item, paramValues: { prompt: 'conflicted-draft' } } : item) }))
    await expect(result.current.handleClosePresetTabs(103, 'left')).resolves.toBe(false)
    await waitFor(() => expect(result.current.conflictData?.localDraft.paramValues).toEqual({ prompt: 'conflicted-draft' }))
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 103, 104, 105])
    expect(requests.filter((item) => item.id === 101)).toHaveLength(1)
  })

  it('[REQ-402/AC-8] disconnect-keeps-draft', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-8'], layer: 'integration', caseId: 'disconnect-keeps-draft' })
    putHandler = () => HttpResponse.error()
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    useGenerationStore.setState((state) => ({ sets: state.sets.map((item) => item.id === 101
      ? { ...item, paramValues: { prompt: 'disconnected-draft' } } : item) }))
    await expect(result.current.handleClosePresetTabs(103, 'left')).resolves.toBe(false)
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 103, 104, 105])
    expect(useGenerationStore.getState().sets.find((item) => item.id === 101)?.paramValues).toEqual({ prompt: 'disconnected-draft' })
    expect(requests.map((item) => item.id)).toEqual([101])
    expect(useGenerationStore.getState().errorToast?.message).toContain('もう一度')
    expect(useGenerationStore.getState().errorToast?.message).not.toBe('タブを閉じる前の保存に失敗しました。')
  })

  it('[REQ-402/AC-7] edit-during-save-aborts', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-7'], layer: 'integration', caseId: 'edit-during-save' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const successfulPut = putHandler
    putHandler = async (id, body) => { await gate; return successfulPut(id, body) }
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    useGenerationStore.setState((state) => ({ sets: state.sets.map((item) => item.id === 101
      ? { ...item, paramValues: { prompt: 'target-snapshot' } } : item) }))
    let closing!: Promise<boolean>
    act(() => { closing = result.current.handleClosePresetTabs(103, 'left') })
    await waitFor(() => expect(requests).toHaveLength(1))
    useGenerationStore.setState({ paramValues: { prompt: 'edited-during-save' } })
    release()
    await expect(closing).resolves.toBe(false)
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 103, 104, 105])
    expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'edited-during-save' })
  })

  it('[REQ-402/AC-7] workflow-switch-invalidates-late-ack', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-7'], layer: 'integration', caseId: 'workflow-switch-invalidates-close' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const successfulPut = putHandler
    putHandler = async (id, body) => { await gate; return successfulPut(id, body) }
    const { result, rerender } = renderHook(({ workflowId }) => usePresetState({ selectedWorkflowId: workflowId, workflow: undefined }),
      { initialProps: { workflowId: 1 as number | null }, wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    useGenerationStore.setState((state) => ({ sets: state.sets.map((item) => item.id === 101 || item.id === 102
      ? { ...item, paramValues: { prompt: `workflow-${item.id}-draft` } } : item) }))
    let closing!: Promise<boolean>
    act(() => { closing = result.current.handleClosePresetTabs(103, 'left') })
    await waitFor(() => expect(requests).toHaveLength(1))
    rerender({ workflowId: null })
    release()
    await expect(closing).resolves.toBe(false)
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 103, 104, 105])
    expect(requests.map((item) => item.id)).toEqual([101])
  })

  it('[REQ-402/AC-7] unmount-invalidates-late-ack', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-7'], layer: 'integration', caseId: 'unmount-invalidates-close' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const successfulPut = putHandler
    putHandler = async (id, body) => { await gate; return successfulPut(id, body) }
    const { result, unmount } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    useGenerationStore.setState((state) => ({ sets: state.sets.map((item) => item.id === 101
      ? { ...item, paramValues: { prompt: 'unmount-draft' } } : item) }))
    let closing!: Promise<boolean>
    act(() => { closing = result.current.handleClosePresetTabs(103, 'left') })
    await waitFor(() => expect(requests).toHaveLength(1))
    unmount()
    release()
    await expect(closing).resolves.toBe(false)
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 103, 104, 105])
  })

  it('[REQ-402/AC-12] open-order-change-aborts', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-12'], layer: 'integration', caseId: 'open-order-change-aborts' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const successfulPut = putHandler
    putHandler = async (id, body) => { await gate; return successfulPut(id, body) }
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    useGenerationStore.setState((state) => ({ sets: state.sets.map((item) => item.id === 101
      ? { ...item, paramValues: { prompt: 'order-draft' } } : item) }))
    let closing!: Promise<boolean>
    act(() => { closing = result.current.handleClosePresetTabs(103, 'left') })
    await waitFor(() => expect(requests).toHaveLength(1))
    useGenerationStore.setState((state) => ({ sets: [state.sets[0], state.sets[2], state.sets[1], state.sets[3], state.sets[4]] }))
    release()
    await expect(closing).resolves.toBe(false)
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 103, 104, 105])
    expect(useGenerationStore.getState().sets.map((item) => item.id)).toEqual([101, 103, 102, 104, 105])
  })
})
