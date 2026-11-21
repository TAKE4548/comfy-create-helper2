import React from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { usePresetState } from '../usePresetState'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { createPresetTabClosePlan } from '../../../../store/presetTabClose'
import { PresetTabItem } from '../../components/PresetTabItem'
import { PresetTabCloseMenu } from '../../components/PresetTabCloseMenu'
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
  afterEach(() => { cleanup(); vi.useRealTimers(); server.resetHandlers(); client.clear() })

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

  it('[REQ-402/AC-2] close-others', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-2'], layer: 'integration', caseId: 'close-others' })
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    await expect(result.current.handleClosePresetTabs(103, 'others')).resolves.toBe(true)
    expect(useGenerationStore.getState().openPresetIds).toEqual([103])
    expect(useGenerationStore.getState().activeSetId).toBe(103)
    expect(localStorage.getItem('prompt-surgeon-open-presets-1')).toBe('[103]')
    expect(requests).toEqual([])
    expect(createRequests).toEqual([])
  })

  it('[REQ-402/AC-9] reopen-preserves-preset', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-9'], layer: 'integration', caseId: 'reopen-preserves-preset' })
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    await expect(result.current.handleClosePresetTabs(103, 'others')).resolves.toBe(true)
    expect(useGenerationStore.getState().openPresetIds).toEqual([103])
    act(() => { result.current.handleLoadPreset(presets[0]) })
    await waitFor(() => expect(useGenerationStore.getState().openPresetIds).toEqual([103, 101]))
    expect(useGenerationStore.getState().activeSetId).toBe(101)
    expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'server-101' })
    expect(presets).toHaveLength(5)
    expect(requests).toEqual([])
    expect(createRequests).toEqual([])
  })

  it('[REQ-402/AC-10] reload-persists-tabs', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-10'], layer: 'integration', caseId: 'reload-persists-tabs' })
    const first = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(first.result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    await expect(first.result.current.handleClosePresetTabs(103, 'others')).resolves.toBe(true)
    expect(localStorage.getItem('prompt-surgeon-open-presets-1')).toBe('[103]')
    expect(localStorage.getItem('prompt-surgeon-active-set-wf-1')).toBe('103')
    first.unmount()

    useGenerationStore.getState().setSelectedWorkflowId(1)
    const freshClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const freshWrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
      <QueryClientProvider client={freshClient}>{children}</QueryClientProvider>
    )
    const second = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper: freshWrapper })
    await waitFor(() => expect(second.result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    expect(useGenerationStore.getState().openPresetIds).toEqual([103])
    expect(useGenerationStore.getState().activeSetId).toBe(103)
    expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'server-103' })
    expect(requests).toEqual([])
    second.unmount()
    freshClient.clear()
  })

  it('[REQ-402/AC-7] [REQ-402/AC-8] save-abort-retains-draft-and-tabs', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-7', 'REQ-402/AC-8'], layer: 'integration', caseId: 'save-abort-retains-draft-and-tabs' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    putHandler = async (id) => {
      if (id === 102) {
        await gate
        return HttpResponse.json({ detail: 'Injected save failure' }, { status: 503 })
      }
      return HttpResponse.json(presets.find((item) => item.id === id)!)
    }
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    act(() => { result.current.handleSelectPresetTab(102) })
    await waitFor(() => expect(useGenerationStore.getState().activeSetId).toBe(102))
    act(() => useGenerationStore.setState({ paramValues: { prompt: 'draft-before-close' } }))
    let closing!: Promise<boolean>
    act(() => { closing = result.current.handleClosePresetTabs(103, 'left') })
    await waitFor(() => expect(requests.some((item) => item.id === 102)).toBe(true))
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 103, 104, 105])
    expect(useGenerationStore.getState().activeSetId).toBe(102)
    expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'draft-before-close' })
    release()
    await expect(closing).resolves.toBe(false)
    const toastMessage = useGenerationStore.getState().errorToast?.message ?? ''
    expect(toastMessage).toContain('下書きは保持されています。もう一度タブを閉じて保存を再試行してください。')
    expect(toastMessage).toContain('503')
    expect(toastMessage).toContain('Injected save failure')
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 103, 104, 105])
    expect(useGenerationStore.getState().activeSetId).toBe(102)
    expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'draft-before-close' })
    const failedCount = requests.filter((item) => item.id === 102).length
    await new Promise((resolve) => setTimeout(resolve, 1300))
    expect(useGenerationStore.getState().errorToast?.message).toContain('下書きは保持されています。もう一度タブを閉じて保存を再試行してください。')
    expect(requests.filter((item) => item.id === 102)).toHaveLength(failedCount)
    expect(createRequests).toEqual([])
  })

  it('[REQ-402/AC-6] active-fallback', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-402/AC-6'], layer: 'integration', caseId: 'active-fallback' })
    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))
    act(() => { result.current.handleSelectPresetTab(101) })
    await waitFor(() => expect(useGenerationStore.getState().activeSetId).toBe(101))
    await expect(result.current.handleClosePresetTabs(103, 'others')).resolves.toBe(true)
    expect(useGenerationStore.getState().openPresetIds).toEqual([103])
    expect(useGenerationStore.getState().activeSetId).toBe(103)
    expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'server-103' })
    expect(requests).toEqual([])
  })

  it('[REQ-435/AC-4] single-unified-menu-button-and-hit-slop-compact-layout', ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-435/AC-4', 'REQ-435/AC-1', 'REQ-435/AC-2', 'REQ-435/AC-3'], layer: 'integration', caseId: 'single-unified-menu-button' })
    const onSelect = vi.fn()
    const onToggleCheck = vi.fn()
    const onOpenMenu = vi.fn()
    const { container } = render(
      <PresetTabItem
        id={103}
        name="Preset C"
        checked={false}
        isActive={true}
        onSelect={onSelect}
        onToggleCheck={onToggleCheck}
        onOpenMenu={onOpenMenu}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Preset Cのタブを閉じる' })).toBeNull()
    expect(container.querySelectorAll('button')).toHaveLength(2)

    const root = container.querySelector('[data-preset-id="103"]')!
    expect(root).toHaveClass('h-8', 'md:h-7', 'gap-4', 'md:gap-1', 'px-1.5', 'md:px-2', 'py-0.5', 'md:py-0', 'min-w-0', 'shrink-0')
    expect((root as HTMLElement).style.touchAction).toBe('pan-x pan-y')

    const selectBtn = container.querySelector('[data-preset-select]')!
    expect(selectBtn).toHaveAttribute('data-tap-target-exempt')
    expect(selectBtn).toHaveClass('relative', 'h-7', 'min-w-[32px]', 'md:h-6', 'md:min-w-0', 'max-w-[140px]', 'truncate', 'before:-inset-x-1.5', 'before:-inset-y-2', 'md:before:hidden')
    expect(selectBtn.className).not.toContain('min-h-11')
    expect(selectBtn.className).not.toContain('min-w-11')

    const checkboxLabel = container.querySelector('label')!
    expect(checkboxLabel).toHaveAttribute('data-tap-target-exempt')
    expect(checkboxLabel).toHaveClass('relative', 'h-7', 'w-7', 'md:h-6', 'md:w-6', 'before:-inset-2', 'md:before:hidden')
    expect(checkboxLabel.className).not.toContain('min-h-11')
    expect(checkboxLabel.className).not.toContain('min-w-11')

    const menuTrigger = container.querySelector('[data-preset-menu-trigger]')!
    expect(menuTrigger).toHaveAttribute('data-tap-target-exempt')
    expect(menuTrigger).toHaveClass('relative', 'h-7', 'w-7', 'md:h-6', 'md:w-6', 'before:-inset-2', 'md:before:hidden')
    expect(menuTrigger.className).not.toContain('min-h-11')
    expect(menuTrigger.className).not.toContain('min-w-11')
  })

  it('[REQ-435/AC-5] menu-triggers-preserve-active-selection-across-tap-context-longpress', ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-435/AC-5'], layer: 'integration', caseId: 'menu-triggers-preserve-selection' })
    const onSelect = vi.fn()
    const onToggleCheck = vi.fn()
    const onOpenMenu = vi.fn()
    const { container } = render(
      <PresetTabItem
        id={103}
        name="Preset C"
        checked={false}
        isActive={false}
        onSelect={onSelect}
        onToggleCheck={onToggleCheck}
        onOpenMenu={onOpenMenu}
      />,
    )

    const trigger = container.querySelector<HTMLButtonElement>('[data-preset-menu-trigger]')!
    const selectBtn = container.querySelector<HTMLButtonElement>('[data-preset-select]')!

    // 1) Unified menu button tap
    fireEvent.click(trigger)
    expect(onOpenMenu).toHaveBeenCalledTimes(1)
    expect(onOpenMenu).toHaveBeenLastCalledWith(trigger)
    expect(onSelect).not.toHaveBeenCalled()

    // 2) Right click contextmenu
    fireEvent.contextMenu(selectBtn)
    expect(onOpenMenu).toHaveBeenCalledTimes(2)
    expect(onOpenMenu).toHaveBeenLastCalledWith(trigger)
    expect(onSelect).not.toHaveBeenCalled()

    // 3) 500ms touch long press (>8px move cancels; stationary 500ms opens menu and suppresses release click)
    const dispatchPointer = (type: string, pointerId: number, clientX = 10, clientY = 10) => {
      const event = Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }), {
        pointerType: 'touch',
        pointerId,
      })
      fireEvent(selectBtn, event)
    }
    vi.useFakeTimers()
    dispatchPointer('pointerdown', 1, 10, 10)
    dispatchPointer('pointermove', 1, 25, 10)
    vi.advanceTimersByTime(500)
    expect(onOpenMenu).toHaveBeenCalledTimes(2)
    dispatchPointer('pointerup', 1, 25, 10)

    dispatchPointer('pointerdown', 2, 10, 10)
    vi.advanceTimersByTime(500)
    expect(onOpenMenu).toHaveBeenCalledTimes(3)
    expect(onOpenMenu).toHaveBeenLastCalledWith(trigger, true)
    dispatchPointer('pointerup', 2, 10, 10)
    fireEvent.click(selectBtn)
    expect(onSelect).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('[REQ-435/AC-6] unified-menu-single-close-keyboard-nav-and-batch-error-regression', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['REQ-435/AC-6'], layer: 'integration', caseId: 'unified-menu-single-and-batch-close' })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })

    const { result } = renderHook(() => usePresetState({ selectedWorkflowId: 1, workflow: undefined }), { wrapper })
    await waitFor(() => expect(result.current.presets).toHaveLength(5))
    await waitFor(() => expect(useGenerationStore.getState().sets).toHaveLength(5))

    const onClose = vi.fn()
    const onCloseSingle = vi.fn(() => {
      useGenerationStore.getState().removeSet(103)
      onClose()
    })
    const onAction = vi.fn((mode: 'left' | 'right' | 'others') => result.current.handleClosePresetTabs(104, mode))
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)

    const counts = {
      left: createPresetTabClosePlan(useGenerationStore.getState(), 104, 'left')?.targetIds.length ?? 0,
      right: createPresetTabClosePlan(useGenerationStore.getState(), 104, 'right')?.targetIds.length ?? 0,
      others: createPresetTabClosePlan(useGenerationStore.getState(), 104, 'others')?.targetIds.length ?? 0,
    }

    const { rerender } = render(
      <PresetTabCloseMenu
        triggerId={104}
        triggerName="D"
        anchor={anchor}
        counts={counts}
        pending={false}
        isOpen={true}
        onClose={onClose}
        onCloseSingle={onCloseSingle}
        onAction={onAction}
        restoreFocus={anchor}
      />,
    )

    const menuItems = screen.getAllByRole('menuitem')
    expect(menuItems.map((el) => el.textContent)).toEqual([
      'このタブを閉じる',
      '左のタブをすべて閉じる',
      '右のタブをすべて閉じる',
      '他のタブを閉じる',
      '閉じる',
    ])

    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'このタブを閉じる' })).toHaveFocus())
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: '左のタブをすべて閉じる' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: '他のタブを閉じる' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(screen.getByRole('menuitem', { name: 'このタブを閉じる' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: '他のタブを閉じる' })).toHaveFocus()

    // Single tab close via menu
    fireEvent.click(screen.getByRole('menuitem', { name: 'このタブを閉じる' }))
    expect(onCloseSingle).toHaveBeenCalledTimes(1)
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 104, 105])
    expect(presets).toHaveLength(5)

    // Pending disables single and batch menu items
    rerender(
      <PresetTabCloseMenu
        triggerId={104}
        triggerName="D"
        anchor={anchor}
        counts={counts}
        pending={true}
        isOpen={true}
        onClose={onClose}
        onCloseSingle={onCloseSingle}
        onAction={onAction}
        restoreFocus={anchor}
      />,
    )
    expect(screen.getByRole('menuitem', { name: 'このタブを閉じる' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: '左のタブをすべて閉じる' })).toBeDisabled()

    // Re-enable and verify 503 / 409 failure preservation + successful batch close
    rerender(
      <PresetTabCloseMenu
        triggerId={104}
        triggerName="D"
        anchor={anchor}
        counts={{ left: 2, right: 1, others: 3 }}
        pending={false}
        isOpen={true}
        onClose={onClose}
        onCloseSingle={onCloseSingle}
        onAction={onAction}
        restoreFocus={anchor}
      />,
    )

    useGenerationStore.setState((state) => ({
      sets: state.sets.map((item) => item.id === 102 ? { ...item, paramValues: { prompt: 'unsaved-102' } } : item),
    }))
    const okPut = putHandler
    putHandler = (id) => id === 102
      ? HttpResponse.json({ detail: 'Service Unavailable' }, { status: 503 })
      : okPut(id, {})

    fireEvent.click(screen.getByRole('menuitem', { name: '左のタブをすべて閉じる' }))
    await waitFor(() => expect(useGenerationStore.getState().errorToast?.message).toContain('503'))
    expect(useGenerationStore.getState().errorToast?.message).toContain('下書きは保持されています。もう一度タブを閉じて保存を再試行してください。')
    expect(useGenerationStore.getState().openPresetIds).toEqual([101, 102, 104, 105])
    expect(useGenerationStore.getState().sets.find((item) => item.id === 102)?.paramValues).toEqual({ prompt: 'unsaved-102' })

    putHandler = okPut
    fireEvent.click(screen.getByRole('menuitem', { name: '左のタブをすべて閉じる' }))
    await waitFor(() => expect(useGenerationStore.getState().openPresetIds).toEqual([104, 105]))

    useGenerationStore.setState((state) => ({
      sets: state.sets.map((item) => item.id === 105 ? { ...item, paramValues: { prompt: 'unsaved-105' } } : item),
    }))
    putHandler = (id) => id === 105
      ? HttpResponse.json({ detail: 'Conflict' }, { status: 409 })
      : okPut(id, {})
    fireEvent.click(screen.getByRole('menuitem', { name: '右のタブをすべて閉じる' }))
    await waitFor(() => expect(useGenerationStore.getState().errorToast?.message).toContain('409'))
    expect(useGenerationStore.getState().errorToast?.message).toContain('競合を解決してから再操作してください。')
    expect(useGenerationStore.getState().openPresetIds).toEqual([104, 105])
    expect(useGenerationStore.getState().sets.find((item) => item.id === 105)?.paramValues).toEqual({ prompt: 'unsaved-105' })
    anchor.remove()
  })
})
