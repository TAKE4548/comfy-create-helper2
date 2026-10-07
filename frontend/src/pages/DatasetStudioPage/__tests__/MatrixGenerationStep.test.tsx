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
    update: vi.fn(),
  },
  workflowPresetsApi: {
    list: vi.fn(),
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
        '6': { inputs: { text: '1girl, masterpiece' }, class_type: 'CLIPTextEncode', _meta: { title: 'Main Positive' } },
        '7': { inputs: { text: 'worst quality, bad anatomy' }, class_type: 'CLIPTextEncode', _meta: { title: 'Negative Text' } },
        '3': { inputs: { seed: 0 }, class_type: 'KSampler' },
      },
      mappings: [
        { id: 101, master_id: 1, node_id: '6', role: 'Main_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Positive Prompt' },
        { id: 102, master_id: 2, node_id: '7', role: 'Negative_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Negative Prompt' },
      ],
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

  // ─── AC Verification Tests ──────────────────────────────────────────

  it('AC-1: displays positive and negative node badges with node IDs and titles when workflow is loaded', async () => {
    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('positive-node-badge')).toBeInTheDocument()
      expect(screen.getByTestId('negative-node-badge')).toBeInTheDocument()
    })

    expect(screen.getByTestId('positive-node-badge')).toHaveTextContent('Positive:#6 Main Positive')
    expect(screen.getByTestId('negative-node-badge')).toHaveTextContent('Negative:#7 Negative Text')
  })

  it('AC-2: opens NodeRemapModal, allows selecting candidates and saves updated mappings via workflowsApi.update', async () => {
    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('open-remap-modal-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('open-remap-modal-button'))

    await waitFor(() => {
      expect(screen.getByTestId('node-remap-modal')).toBeInTheDocument()
    })

    const posSelect = screen.getByTestId('remap-positive-select')
    const negSelect = screen.getByTestId('remap-negative-select')

    fireEvent.change(posSelect, { target: { value: '7' } })
    fireEvent.change(negSelect, { target: { value: '6' } })

    const saveBtn = screen.getByTestId('save-remap-button')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(workflowsApi.update).toHaveBeenCalledWith(1, {
        mappings: [
          { master_id: 1, node_id: '7' },
          { master_id: 2, node_id: '6' },
        ],
      })
      expect(screen.queryByTestId('node-remap-modal')).not.toBeInTheDocument()
    })
  })

  it('AC-3: renders Negative Prompt TagChipEditor and auto-loads default value from workflow node', async () => {
    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('negative-tag-editor')).toBeInTheDocument()
    })

    // Auto-loaded from node 7: 'worst quality, bad anatomy'
    await waitFor(() => {
      expect(screen.getByTestId('negative-tag-editor')).toHaveTextContent('worst quality')
    })
  })

  it('AC-4: passes positiveNodeId, negativeNodeId, and negativePrompt when batch submitting to ComfyUI', async () => {
    useStudioStore.getState().setItems(mockItems)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ prompt_id: 'pid-123' }),
    })
    globalThis.fetch = fetchMock

    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('submit-batch-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('submit-batch-button'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const firstCallBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(firstCallBody.prompt['6'].inputs.text).toBe(mockItems[0].raw_prompt)
    expect(firstCallBody.prompt['7'].inputs.text).toBe('worst quality, bad anatomy')
  })

  it('AC-5: persists prompt_negative when saving/updating dataset project', async () => {
    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('calculate-matrix-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('calculate-matrix-button'))

    await waitFor(() => {
      expect(datasetApi.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt_negative: expect.any(String),
        })
      )
    })
  })

  it('R-1: shows fallback node badge when mapped node ID does not exist in workflow json', async () => {
    const brokenWorkflow: Workflow = {
      id: 2,
      name: 'Workflow with Missing Nodes',
      description: '',
      is_default: false,
      json_body: {
        '99': { inputs: { text: 'fallback positive' }, class_type: 'CLIPTextEncode', _meta: { title: 'Positive' } },
      },
      mappings: [
        { id: 201, master_id: 2, node_id: '999', role: 'Main_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Positive Prompt' },
        { id: 202, master_id: 2, node_id: '888', role: 'Negative_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Negative Prompt' },
      ],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    }

    vi.mocked(workflowsApi.list).mockResolvedValue([brokenWorkflow])
    vi.mocked(workflowsApi.get).mockResolvedValue(brokenWorkflow)

    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('positive-node-badge')).toBeInTheDocument()
      expect(screen.getByTestId('negative-node-badge')).toBeInTheDocument()
    })

    // In brokenWorkflow, node_id 999 is mapped but does not exist in json_body, so it displays #999 #999 (fallback title)
    expect(screen.getByTestId('positive-node-badge')).toHaveTextContent('#999 #999')
    expect(screen.getByTestId('negative-node-badge')).toHaveTextContent('#888 #888')
  })

  it('restores prompt_negative when project is loaded into store', async () => {
    useStudioStore.getState().setActiveProject({
      ...mockProject,
      prompt_negative: 'restored, negative, tags',
    })

    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('negative-tag-editor')).toBeInTheDocument()
    })

    expect(screen.getByTestId('negative-tag-editor')).toHaveTextContent('restored')
    expect(screen.getByTestId('negative-tag-editor')).toHaveTextContent('negative')
    expect(screen.getByTestId('negative-tag-editor')).toHaveTextContent('tags')
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

  it('injects into targeted positive and negative nodes when options provided', () => {
    const workflowJson = {
      '10': { inputs: { text: '' }, class_type: 'CLIPTextEncode', _meta: { title: 'Positive Prompt' } },
      '11': { inputs: { text: '' }, class_type: 'CLIPTextEncode', _meta: { title: 'Negative Prompt' } },
      '20': { inputs: { seed: 0 }, class_type: 'KSampler' },
    }

    const injected = injectPromptAndSeed(workflowJson, 'masterpiece, 1girl', 777, {
      positiveNodeId: '10',
      negativeNodeId: '11',
      negativePrompt: 'worst quality, bad anatomy',
      seedNodeId: '20',
    })

    expect(injected['10'].inputs.text).toBe('masterpiece, 1girl')
    expect(injected['11'].inputs.text).toBe('worst quality, bad anatomy')
    expect(injected['20'].inputs.seed).toBe(777)
  })

  it('safely handles empty string negativePrompt', () => {
    const workflowJson = {
      '10': { inputs: { text: 'initial' }, class_type: 'CLIPTextEncode' },
      '11': { inputs: { text: 'initial' }, class_type: 'CLIPTextEncode' },
    }

    const injected = injectPromptAndSeed(workflowJson, 'positive text', 123, {
      positiveNodeId: '10',
      negativeNodeId: '11',
      negativePrompt: '',
    })

    expect(injected['10'].inputs.text).toBe('positive text')
    expect(injected['11'].inputs.text).toBe('')
  })

  it('falls back to title / second text node if targeted negative node does not exist', () => {
    const workflowJson = {
      '10': { inputs: { text: '' }, class_type: 'CLIPTextEncode' },
      '25': { inputs: { text: '' }, class_type: 'CLIPTextEncode', _meta: { title: 'Negative Prompt' } },
    }

    const injected = injectPromptAndSeed(workflowJson, 'positive', 1, {
      negativePrompt: 'blurry, low quality',
    })

    expect(injected['10'].inputs.text).toBe('positive')
    expect(injected['25'].inputs.text).toBe('blurry, low quality')
  })

  it('R-2: creates default nodes when workflow has no text or sampler nodes', () => {
    const emptyJson = {}
    const injected = injectPromptAndSeed(emptyJson, 'positive content', 42, {
      negativePrompt: 'negative content',
    })

    expect(injected['6']).toBeDefined()
    expect(injected['6'].inputs.text).toBe('positive content')
    expect(injected['7']).toBeDefined()
    expect(injected['7'].inputs.text).toBe('negative content')
    expect(injected['3']).toBeDefined()
    expect(injected['3'].inputs.seed).toBe(42)
  })
})

