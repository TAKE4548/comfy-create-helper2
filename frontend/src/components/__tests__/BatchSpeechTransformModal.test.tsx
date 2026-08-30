import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BatchSpeechTransformModal } from '../BatchSpeechTransformModal'
import {
  speechBatchApi,
  snapshotsApi,
  speechTonePresetsApi,
  workflowsApi,
  albumsApi,
  fontsApi
} from '../../api/client'

vi.mock('../../api/client', () => ({
  speechBatchApi: {
    createJob: vi.fn(),
    getJob: vi.fn(),
    getActiveJob: vi.fn(),
    cancelJob: vi.fn(),
    cancelItem: vi.fn(),
    retryItem: vi.fn(),
  },
  snapshotsApi: {
    list: vi.fn(),
    upload: vi.fn(),
    patch: vi.fn(),
    create: vi.fn(),
  },
  speechTonePresetsApi: {
    list: vi.fn(),
  },
  workflowsApi: {
    list: vi.fn(),
  },
  albumsApi: {
    list: vi.fn(),
    create: vi.fn(),
  },
  fontsApi: {
    list: vi.fn(),
  },
}))

describe('BatchSpeechTransformModal', () => {
  let queryClient: QueryClient

  const mockSnapshots = [
    {
      id: 1,
      workflow_id: 10,
      image_path: '/images/snap1.png',
      thumbnail_path: '/thumbs/snap1.png',
      created_at: '2026-08-30T01:00:00Z',
      params: {
        speech_bubbles: [
          { id: 'b1', text: 'おはようございます', x: 10, y: 10, w: 100, h: 50 },
          { id: 'b2', text: '今日もいい天気ですね', x: 10, y: 70, w: 100, h: 50 },
        ],
      },
    },
    {
      id: 2,
      workflow_id: 20,
      image_path: '/images/snap2.png',
      thumbnail_path: '/thumbs/snap2.png',
      created_at: '2026-08-30T02:00:00Z',
      params: {}, // セリフなし
    },
    {
      id: 3,
      workflow_id: 10,
      image_path: '/images/snap3.png',
      thumbnail_path: '/thumbs/snap3.png',
      created_at: '2026-08-30T03:00:00Z',
      params: {
        speech_bubbles: [
          { id: 'b3', text: 'さようなら', x: 10, y: 10, w: 100, h: 50 },
        ],
      },
    },
  ]

  const mockTonePresets = [
    { id: 1, name: 'お嬢様風', prompt: '「〜ですわ」口調', description: '丁寧なお嬢様' },
    { id: 2, name: 'ツンデレ', prompt: '「〜じゃない！」口調', description: 'ツンデレ' },
  ]

  const mockWorkflows = [
    { id: 10, name: 'Workflow A' },
    { id: 20, name: 'Workflow B' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.mocked(snapshotsApi.list).mockResolvedValue(mockSnapshots as any)
    vi.mocked(speechTonePresetsApi.list).mockResolvedValue(mockTonePresets as any)
    vi.mocked(workflowsApi.list).mockResolvedValue(mockWorkflows as any)
    vi.mocked(albumsApi.list).mockResolvedValue([])
    vi.mocked(fontsApi.list).mockResolvedValue([])
  })

  it('renders speech snapshots only and displays speech items correctly (AC-1)', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BatchSpeechTransformModal isOpen={true} onClose={vi.fn()} />
      </QueryClientProvider>
    )

    // Snapshot #1 and Snapshot #3 should appear, but Snapshot #2 without speech bubbles should not
    expect(await screen.findByText('Snapshot #1')).toBeInTheDocument()
    expect(screen.getByText('Snapshot #3')).toBeInTheDocument()
    expect(screen.queryByText('Snapshot #2')).not.toBeInTheDocument()

    expect(screen.getByText('おはようございます')).toBeInTheDocument()
    expect(screen.getByText('今日もいい天気ですね')).toBeInTheDocument()
    expect(screen.getByText('さようなら')).toBeInTheDocument()
  })

  it('filters snapshots by workflow and text search (AC-2)', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BatchSpeechTransformModal isOpen={true} onClose={vi.fn()} />
      </QueryClientProvider>
    )

    await screen.findByText('Snapshot #1')

    // Search query
    const searchInput = screen.getByPlaceholderText('セリフテキスト検索...')
    fireEvent.change(searchInput, { target: { value: 'さようなら' } })

    expect(screen.queryByText('Snapshot #1')).not.toBeInTheDocument()
    expect(screen.getByText('Snapshot #3')).toBeInTheDocument()
  })

  it('creates batch job on start click with selected items, scene hint, and prompt (AC-3, AC-4)', async () => {
    const mockCreatedJob = {
      job_id: 'job-123',
      status: 'pending',
      preset_id: 1,
      tone_prompt: '「〜ですわ」口調',
      total_count: 3,
      completed_count: 0,
      failed_count: 0,
      created_at: '2026-08-30T00:00:00Z',
      updated_at: '2026-08-30T00:00:00Z',
      items: [
        {
          id: '1_b1',
          snapshot_id: 1,
          bubble_id: 'b1',
          bubble_index: 0,
          original_text: 'おはようございます',
          rewritten_text: null,
          status: 'pending',
          error_message: null,
        },
        {
          id: '1_b2',
          snapshot_id: 1,
          bubble_id: 'b2',
          bubble_index: 1,
          original_text: '今日もいい天気ですね',
          rewritten_text: null,
          status: 'pending',
          error_message: null,
        },
        {
          id: '3_b3',
          snapshot_id: 3,
          bubble_id: 'b3',
          bubble_index: 0,
          original_text: 'さようなら',
          rewritten_text: null,
          status: 'pending',
          error_message: null,
        },
      ],
    }
    vi.mocked(speechBatchApi.createJob).mockResolvedValue(mockCreatedJob as any)
    vi.mocked(speechBatchApi.getJob).mockResolvedValue(mockCreatedJob as any)

    render(
      <QueryClientProvider client={queryClient}>
        <BatchSpeechTransformModal isOpen={true} onClose={vi.fn()} />
      </QueryClientProvider>
    )

    await screen.findByText('Snapshot #1')

    // Select tone preset
    const presetSelect = document.getElementById('batch-speech-tone-preset-select')!
    fireEvent.change(presetSelect, { target: { value: '1' } })

    // Step 1: Click "次へ：変換リストへ進む"
    const nextBtn = document.getElementById('start-batch-speech-btn')!
    fireEvent.click(nextBtn)

    // Verify review screen is shown
    expect(await screen.findByTestId('review-scene-hint-1')).toBeInTheDocument()

    // Enter scene hint for Snapshot #1
    fireEvent.change(screen.getByTestId('review-scene-hint-1'), {
      target: { value: '朝の挨拶、少し照れくさそうに' },
    })

    // Step 2: Click "一括変換を開始"
    const executeBtn = document.getElementById('start-batch-speech-execute-btn')!
    fireEvent.click(executeBtn)

    await waitFor(() => {
      expect(speechBatchApi.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          preset_id: 1,
          tone_prompt: '「〜ですわ」口調',
          items: expect.arrayContaining([
            expect.objectContaining({
              id: '1_b1',
              text: 'おはようございます',
              scene_hint: '朝の挨拶、少し照れくさそうに',
              include_image: true,
            }),
          ]),
        })
      )
    })
  })

  it('allows editing rewritten text and retrying an item (AC-5, AC-6, AC-7)', async () => {
    const completedJob = {
      job_id: 'job-123',
      status: 'completed',
      preset_id: 1,
      tone_prompt: '「〜ですわ」口調',
      total_count: 1,
      completed_count: 1,
      failed_count: 0,
      created_at: '2026-08-30T00:00:00Z',
      updated_at: '2026-08-30T00:00:00Z',
      items: [
        {
          id: '1_b1',
          snapshot_id: 1,
          bubble_id: 'b1',
          bubble_index: 0,
          original_text: 'おはようございます',
          rewritten_text: 'ごきげんよう、皆様ですわ',
          status: 'completed',
          error_message: null,
        },
      ],
    }
    localStorage.setItem('prompt-surgeon-active-speech-batch-job-id', 'job-123')
    vi.mocked(speechBatchApi.getJob).mockResolvedValue(completedJob as any)
    vi.mocked(speechBatchApi.retryItem).mockResolvedValue(completedJob as any)

    render(
      <QueryClientProvider client={queryClient}>
        <BatchSpeechTransformModal isOpen={true} onClose={vi.fn()} />
      </QueryClientProvider>
    )

    await screen.findByText('ごきげんよう、皆様ですわ')

    // Retry item
    const retryBtn = document.getElementById('retry-speech-item-1_b1')!
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(speechBatchApi.retryItem).toHaveBeenCalledWith('job-123', '1_b1', { revision_instruction: undefined })
    })

    // Inline edit
    const textarea = document.getElementById('speech-batch-text-1_b1') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'ごきげんよう！' } })
    expect(textarea.value).toBe('ごきげんよう！')
  })

  it('displays thinking process accordion and toggles open/close for batch items', async () => {
    const jobWithThinking = {
      job_id: 'job-123',
      status: 'completed',
      preset_id: 1,
      tone_prompt: '「〜ですわ」口調',
      total_count: 1,
      completed_count: 1,
      failed_count: 0,
      created_at: '2026-08-30T00:00:00Z',
      updated_at: '2026-08-30T00:00:00Z',
      items: [
        {
          id: '1_b1',
          snapshot_id: 1,
          bubble_id: 'b1',
          bubble_index: 0,
          original_text: 'おはようございます',
          rewritten_text: 'ごきげんよう、皆様ですわ',
          scene_interpretation: '朝の爽やかな日差しの中での挨拶',
          reasoning: '高貴なお嬢様らしさを出すため「ごきげんよう」に変更',
          status: 'completed',
          error_message: null,
        },
      ],
    }
    localStorage.setItem('prompt-surgeon-active-speech-batch-job-id', 'job-123')
    vi.mocked(speechBatchApi.getJob).mockResolvedValue(jobWithThinking as any)

    render(
      <QueryClientProvider client={queryClient}>
        <BatchSpeechTransformModal isOpen={true} onClose={vi.fn()} />
      </QueryClientProvider>
    )

    await screen.findByText('ごきげんよう、皆様ですわ')

    const thinkingSection = screen.getByTestId('batch-item-thinking-1_b1')
    expect(thinkingSection).toBeInTheDocument()

    // Initially collapsed
    expect(screen.queryByText('朝の爽やかな日差しの中での挨拶')).not.toBeInTheDocument()

    // Toggle open
    fireEvent.click(screen.getByText(/AI解釈・思考過程/))
    expect(screen.getByText('朝の爽やかな日差しの中での挨拶')).toBeInTheDocument()
    expect(screen.getByText('高貴なお嬢様らしさを出すため「ごきげんよう」に変更')).toBeInTheDocument()

    // Toggle close
    fireEvent.click(screen.getByText(/AI解釈・思考過程/))
    expect(screen.queryByText('朝の爽やかな日差しの中での挨拶')).not.toBeInTheDocument()
  })

  it('sends revision instruction when retrying batch item with feedback', async () => {
    const completedJob = {
      job_id: 'job-123',
      status: 'completed',
      preset_id: 1,
      tone_prompt: '「〜ですわ」口調',
      total_count: 1,
      completed_count: 1,
      failed_count: 0,
      created_at: '2026-08-30T00:00:00Z',
      updated_at: '2026-08-30T00:00:00Z',
      items: [
        {
          id: '1_b1',
          snapshot_id: 1,
          bubble_id: 'b1',
          bubble_index: 0,
          original_text: 'おはようございます',
          rewritten_text: 'ごきげんよう、皆様ですわ',
          status: 'completed',
          error_message: null,
        },
      ],
    }
    localStorage.setItem('prompt-surgeon-active-speech-batch-job-id', 'job-123')
    vi.mocked(speechBatchApi.getJob).mockResolvedValue(completedJob as any)
    vi.mocked(speechBatchApi.retryItem).mockResolvedValue(completedJob as any)

    render(
      <QueryClientProvider client={queryClient}>
        <BatchSpeechTransformModal isOpen={true} onClose={vi.fn()} />
      </QueryClientProvider>
    )

    await screen.findByText('ごきげんよう、皆様ですわ')

    // Enter revision instruction
    const revisionInput = screen.getByTestId('retry-instruction-1_b1')
    fireEvent.change(revisionInput, { target: { value: 'もっとテンション高く挨拶して' } })

    // Click retry item button
    const retryBtn = screen.getByTestId('retry-speech-item-1_b1')
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(speechBatchApi.retryItem).toHaveBeenCalledWith('job-123', '1_b1', {
        revision_instruction: 'もっとテンション高く挨拶して',
      })
    })
  })
})

