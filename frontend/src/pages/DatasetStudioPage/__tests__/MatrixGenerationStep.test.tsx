import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MatrixGenerationStep, injectPromptAndSeed } from '../components/MatrixGenerationStep'
import { useStudioStore } from '../useStudioStore'
import { datasetApi, workflowsApi } from '../../../api/client'
import type { DatasetItem, DatasetProject, Workflow } from '../../../api/types'

vi.mock('../../../api/client', () => ({
  datasetApi: {
    createProject: vi.fn(),
    updateProject: vi.fn(),
    calculateMatrix: vi.fn(),
  },
  workflowsApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
}))

describe('MatrixGenerationStep', () => {
  const mockWorkflows: Workflow[] = [
    {
      id: 1,
      name: 'Anima SDXL Default',
      description: '',
      is_default: true,
      json_body: {
        '6': { inputs: { text: '' }, class_type: 'CLIPTextEncode' },
        '3': { inputs: { seed: 0 }, class_type: 'KSampler' },
      },
      mappings: [],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
  ]

  const mockProject: DatasetProject = {
    id: 10,
    name: 'Test Chara',
    character_trigger: 'alice',
    outfit_trigger: 'alice_outfit',
    workflow_id: 1,
    prompt_meta: '1girl, anime',
    prompt_physical: 'silver hair, red eyes',
    prompt_exclusive_outfit: 'knight armor',
    selected_alt_outfits: '[]',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }

  const mockItems: DatasetItem[] = Array.from({ length: 20 }, (_, i) => ({
    id: 100 + i,
    project_id: 10,
    slot_index: i,
    factors_json: JSON.stringify({ shot: 'Bust', outfit_type: i < 15 ? 'default' : 'alt' }),
    raw_prompt: `1girl, solo, alice, pose_${i}`,
    caption_text: `alice, alice_outfit, pose_${i}`,
    image_path: null,
    seed: 1000 + i,
    status: 'APPROVED',
  }))

  beforeEach(() => {
    vi.clearAllMocks()
    useStudioStore.getState().resetStudio()
    vi.mocked(workflowsApi.list).mockResolvedValue(mockWorkflows)
    vi.mocked(workflowsApi.get).mockResolvedValue(mockWorkflows[0])
    vi.mocked(datasetApi.createProject).mockResolvedValue(mockProject)
    vi.mocked(datasetApi.updateProject).mockResolvedValue(mockProject)
    vi.mocked(datasetApi.calculateMatrix).mockResolvedValue(mockItems)
  })

  it('renders configuration inputs with defaults and triggers sync', async () => {
    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('project-name-input')).toBeInTheDocument()
    })
    const charInput = screen.getByTestId('character-trigger-input')
    const outfitInput = screen.getByTestId('outfit-trigger-input')

    expect(charInput).toHaveValue('mychara')
    expect(outfitInput).toHaveValue('mychara_outfit')

    // Changing char trigger updates outfit trigger
    fireEvent.change(charInput, { target: { value: 'alice' } })
    expect(outfitInput).toHaveValue('alice_outfit')
  })

  it('renders all three TagChipEditors', async () => {
    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('meta-tag-editor')).toBeInTheDocument()
    })
    expect(screen.getByTestId('physical-tag-editor')).toBeInTheDocument()
    expect(screen.getByTestId('exclusive-outfit-editor')).toBeInTheDocument()
  })

  it('calculates orthogonal matrix on button click and saves to store', async () => {
    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('calculate-matrix-button')).toBeInTheDocument()
    })
    const calcButton = screen.getByTestId('calculate-matrix-button')
    fireEvent.click(calcButton)

    await waitFor(() => {
      expect(datasetApi.createProject).toHaveBeenCalled()
      expect(datasetApi.calculateMatrix).toHaveBeenCalledWith(10)
    })

    await waitFor(() => {
      expect(useStudioStore.getState().items).toHaveLength(20)
      expect(screen.getByTestId('status-message')).toHaveTextContent(/20件.*完了/)
      expect(screen.getByTestId('proceed-to-curation-button')).toBeInTheDocument()
    })
  })

  it('navigates to step 2 when clicking proceed to curation', async () => {
    useStudioStore.getState().setItems(mockItems)
    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('proceed-to-curation-button')).toBeInTheDocument()
    })
    const proceedBtn = screen.getByTestId('proceed-to-curation-button')
    fireEvent.click(proceedBtn)

    expect(useStudioStore.getState().currentStep).toBe(2)
  })

  it('submits batch directly to ComfyUI port 8188 with progress tracking', async () => {
    const mockDirectSubmit = vi.fn().mockImplementation(async () => {
      // Mock successful direct submission
    })

    useStudioStore.getState().setItems(mockItems)
    render(<MatrixGenerationStep onDirectBatchSubmit={mockDirectSubmit} />)

    await waitFor(() => {
      expect(screen.getByTestId('submit-batch-button')).toBeInTheDocument()
    })
    const submitBtn = screen.getByTestId('submit-batch-button')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockDirectSubmit).toHaveBeenCalledWith(mockItems)
    })

    await waitFor(() => {
      expect(screen.getByTestId('status-message')).toHaveTextContent(/ComfyUIへの20件の直接バッチ投入が完了しました/)
    })
  })
})

describe('injectPromptAndSeed', () => {
  it('correctly injects raw_prompt into CLIPTextEncode and seed into KSampler', () => {
    const workflowJson = {
      '6': { inputs: { text: 'old prompt' }, class_type: 'CLIPTextEncode' },
      '3': { inputs: { seed: 123 }, class_type: 'KSampler' },
    }

    const injected = injectPromptAndSeed(workflowJson, 'new prompt', 9999)

    expect(injected['6'].inputs.text).toBe('new prompt')
    expect(injected['3'].inputs.seed).toBe(9999)
  })

  it('falls back to default nodes if nodes are missing', () => {
    const emptyWf = {}
    const injected = injectPromptAndSeed(emptyWf, 'fallback prompt', 42)

    expect(injected['6'].inputs.text).toBe('fallback prompt')
    expect(injected['3'].inputs.seed).toBe(42)
  })
})
