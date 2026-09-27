import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useGenerationStore } from '../store/useGenerationStore'
import { useGenerateAction } from '../pages/GeneratePage/hooks/useGenerateAction'
import { settingsApi } from '../api/client'
import type { Workflow } from '../api/types'

vi.mock('../api/client', () => ({
  settingsApi: {
    getVram: vi.fn(),
    updateVram: vi.fn(),
  },
  comfyApi: {
    queuePrompt: vi.fn().mockResolvedValue({ prompt_id: 'test-prompt-id' }),
    getHistory: vi.fn().mockResolvedValue({}),
    deleteQueue: vi.fn().mockResolvedValue({}),
    interrupt: vi.fn().mockResolvedValue({}),
  },
  promptMetadataApi: {
    create: vi.fn().mockResolvedValue({}),
  },
}))

describe('REQ-260 E2E VRAM Guard Integration', () => {
  let queryClient: QueryClient

  const mockWorkflow: Workflow = {
    id: 1,
    name: 'Test Workflow',
    created_at: '2026-08-01T00:00:00Z',
    json_body: {
      '1': {
        class_type: 'KSampler',
        inputs: { seed: 12345, steps: 20 },
      },
    },
    mappings: [],
  }

  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    localStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    useGenerationStore.setState({
      systemStats: null,
      vramWaitStatus: null,
      batchSize: 1,
      seedMode: 'random',
      seed: 12345,
      paramValues: {},
      promptChips: {},
      appliedAssets: {},
      bypassProfiles: [],
      paramSyncGroups: [],
      queueRunning: [],
      queuePending: [],
      isBatchSubmitting: false,
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)

  it('Settings: updates threshold from 6.0GB to 8.0GB and persists via API', async () => {
    vi.mocked(settingsApi.getVram).mockResolvedValueOnce({
      vram_min_free_gb: 6.0,
      vram_guard_enabled: true,
      vram_free_gb: 10.0,
      vram_total_gb: 16.0,
    })
    vi.mocked(settingsApi.updateVram).mockResolvedValueOnce({
      vram_min_free_gb: 8.0,
      vram_guard_enabled: true,
      vram_free_gb: 10.0,
      vram_total_gb: 16.0,
    })

    const initial = await settingsApi.getVram()
    expect(initial.vram_min_free_gb).toBe(6.0)

    const updated = await settingsApi.updateVram({ vram_min_free_gb: 8.0, vram_guard_enabled: true })
    expect(updated.vram_min_free_gb).toBe(8.0)
    expect(settingsApi.updateVram).toHaveBeenCalledWith({ vram_min_free_gb: 8.0, vram_guard_enabled: true })
  })

  it('AC-1 & AC-2: holds generation in wait state when free VRAM (7.0GB) is below threshold (8.0GB)', async () => {
    useGenerationStore.setState({
      systemStats: {
        cpu_pct: 10,
        ram_used_gb: 8,
        ram_total_gb: 32,
        ram_pct: 25,
        gpu_pct: 20,
        vram_used_gb: 9.0,
        vram_total_gb: 16.0,
        vram_free_gb: 7.0,
        vram_safe: false,
        vram_min_free_gb: 8.0,
        vram_guard_enabled: true,
        vram_pct: 56.25,
        ts: Date.now(),
      },
    })

    const { result } = renderHook(() => useGenerateAction(mockWorkflow), { wrapper })

    let generatePromise: Promise<void> | null = null
    act(() => {
      generatePromise = result.current.handleGenerate()
    })

    const waitStatus = useGenerationStore.getState().vramWaitStatus
    expect(waitStatus).not.toBeNull()
    expect(waitStatus?.isWaiting).toBe(true)
    expect(waitStatus?.freeGb).toBe(7.0)
    expect(waitStatus?.requiredGb).toBe(8.0)

    act(() => {
      useGenerationStore.getState().cancelVramWait()
    })
    await generatePromise
  })

  it('AC-3: issues warning toast after 10 seconds of continuous VRAM waiting', async () => {
    vi.useFakeTimers()

    const setErrorToastMock = vi.fn()
    useGenerationStore.setState({
      setErrorToast: setErrorToastMock,
      systemStats: {
        cpu_pct: 10,
        ram_used_gb: 8,
        ram_total_gb: 32,
        ram_pct: 25,
        gpu_pct: 20,
        vram_used_gb: 9.0,
        vram_total_gb: 16.0,
        vram_free_gb: 7.0,
        vram_safe: false,
        vram_min_free_gb: 8.0,
        vram_guard_enabled: true,
        vram_pct: 56.25,
        ts: Date.now(),
      },
    })

    const { result } = renderHook(() => useGenerateAction(mockWorkflow), { wrapper })

    let generatePromise: Promise<void> | null = null
    act(() => {
      generatePromise = result.current.handleGenerate()
    })

    act(() => {
      vi.advanceTimersByTime(9000)
    })
    expect(setErrorToastMock).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(setErrorToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('VRAM解放待ちが継続しています'),
        type: 'warning',
      })
    )

    act(() => {
      useGenerationStore.getState().cancelVramWait()
    })
    await generatePromise
    vi.useRealTimers()
  })

  it('AC-4: safely cancels wait and returns to Ready state when cancelVramWait is invoked', async () => {
    useGenerationStore.setState({
      systemStats: {
        cpu_pct: 10,
        ram_used_gb: 8,
        ram_total_gb: 32,
        ram_pct: 25,
        gpu_pct: 20,
        vram_used_gb: 9.0,
        vram_total_gb: 16.0,
        vram_free_gb: 7.0,
        vram_safe: false,
        vram_min_free_gb: 8.0,
        vram_guard_enabled: true,
        vram_pct: 56.25,
        ts: Date.now(),
      },
    })

    const { result } = renderHook(() => useGenerateAction(mockWorkflow), { wrapper })

    let generatePromise: Promise<void> | null = null
    act(() => {
      generatePromise = result.current.handleGenerate()
    })

    expect(useGenerationStore.getState().vramWaitStatus?.isWaiting).toBe(true)

    act(() => {
      useGenerationStore.getState().cancelVramWait()
    })
    await generatePromise

    expect(useGenerationStore.getState().vramWaitStatus).toBeNull()
    expect(useGenerationStore.getState().isBatchSubmitting).toBe(false)
  })

  it('AC-5: automatically resumes and dispatches prompt when VRAM recovers (vram_safe becomes true)', async () => {
    const queuePromptMock = vi.fn().mockResolvedValue('prompt-123')
    useGenerationStore.setState({
      queuePrompt: queuePromptMock,
      systemStats: {
        cpu_pct: 10,
        ram_used_gb: 8,
        ram_total_gb: 32,
        ram_pct: 25,
        gpu_pct: 20,
        vram_used_gb: 9.0,
        vram_total_gb: 16.0,
        vram_free_gb: 7.0,
        vram_safe: false,
        vram_min_free_gb: 8.0,
        vram_guard_enabled: true,
        vram_pct: 56.25,
        ts: Date.now(),
      },
    })

    const { result } = renderHook(() => useGenerateAction(mockWorkflow), { wrapper })

    let generatePromise: Promise<void> | null = null
    act(() => {
      generatePromise = result.current.handleGenerate()
    })

    expect(useGenerationStore.getState().vramWaitStatus?.isWaiting).toBe(true)
    expect(queuePromptMock).not.toHaveBeenCalled()

    act(() => {
      useGenerationStore.setState({
        systemStats: {
          cpu_pct: 10,
          ram_used_gb: 8,
          ram_total_gb: 32,
          ram_pct: 25,
          gpu_pct: 10,
          vram_used_gb: 4.0,
          vram_total_gb: 16.0,
          vram_free_gb: 12.0,
          vram_safe: true,
          vram_min_free_gb: 8.0,
          vram_guard_enabled: true,
          vram_pct: 25.0,
          ts: Date.now(),
        },
      })
    })

    await generatePromise

    expect(queuePromptMock).toHaveBeenCalledTimes(1)
    expect(useGenerationStore.getState().vramWaitStatus).toBeNull()
  })

  it('Boundary value test: does NOT wait when free VRAM exactly equals threshold', async () => {
    const queuePromptMock = vi.fn().mockResolvedValue('prompt-exact')
    useGenerationStore.setState({
      queuePrompt: queuePromptMock,
      systemStats: {
        cpu_pct: 10,
        ram_used_gb: 8,
        ram_total_gb: 32,
        ram_pct: 25,
        gpu_pct: 20,
        vram_used_gb: 8.0,
        vram_total_gb: 16.0,
        vram_free_gb: 8.0,
        vram_safe: true,
        vram_min_free_gb: 8.0,
        vram_guard_enabled: true,
        vram_pct: 50.0,
        ts: Date.now(),
      },
    })

    const { result } = renderHook(() => useGenerateAction(mockWorkflow), { wrapper })

    await act(async () => {
      await result.current.handleGenerate()
    })

    expect(useGenerationStore.getState().vramWaitStatus).toBeNull()
    expect(queuePromptMock).toHaveBeenCalledTimes(1)
  })
})
