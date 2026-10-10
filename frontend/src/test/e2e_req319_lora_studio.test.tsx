import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { DatasetStudioPage } from '../pages/DatasetStudioPage'
import { useStudioStore } from '../pages/DatasetStudioPage/useStudioStore'
import { datasetApi, trainingApi, benchmarkApi, workflowsApi } from '../api/client'
import { decoupleCaption } from '../pages/DatasetStudioPage/utils/captionDecoupler'
import { computeTrainingSchedule } from '../pages/DatasetStudioPage/components/TrainingConfigPanel'
import type { DatasetItem, DatasetProject, Workflow, OutfitMasterPreset, LoraTrainingJob } from '../api/types'

vi.mock('../api/client', () => ({
  datasetApi: {
    createProject: vi.fn(),
    updateProject: vi.fn(),
    calculateMatrix: vi.fn(),
    getItems: vi.fn(),
    updateItem: vi.fn(),
    exportDataset: vi.fn(),
    listOutfits: vi.fn(),
    getProjects: vi.fn().mockResolvedValue([]),
  },
  trainingApi: {
    createJob: vi.fn(),
    startJob: vi.fn(),
    stopJob: vi.fn(),
    getJobStatus: vi.fn(),
    getJob: vi.fn(),
  },
  benchmarkApi: {
    generatePrompts: vi.fn(),
    evaluate: vi.fn(),
  },
  workflowsApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
  comfyApi: {
    queuePrompt: vi.fn(),
    getHistory: vi.fn(),
  },
}))

describe('REQ-319 LoRA Studio End-to-End Pipeline', () => {
  const mockWorkflows: Workflow[] = [
    {
      id: 1,
      name: 'Default SDXL',
      description: '',
      is_default: true,
      json_body: {
        '6': { inputs: { text: '' }, class_type: 'CLIPTextEncode' },
        '3': { inputs: { seed: 100 }, class_type: 'KSampler' },
      },
      mappings: [],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
  ]

  const mockPresets: OutfitMasterPreset[] = [
    {
      id: 1,
      name: 'Casual Hoodie',
      category: 'casual',
      prompt_tags: 'casual hoodie, denim shorts',
      is_builtin: true,
      created_at: '2026-01-01',
    },
    {
      id: 2,
      name: 'Summer Dress',
      category: 'casual',
      prompt_tags: 'summer dress, straw hat',
      is_builtin: true,
      created_at: '2026-01-01',
    },
  ]

  const mockProject: DatasetProject = {
    id: 1,
    name: 'E2E Heroine',
    character_trigger: 'e2e_heroine',
    outfit_trigger: 'e2e_battle_suit',
    workflow_id: 1,
    prompt_meta: 'masterpiece, best quality, 1girl, solo',
    prompt_physical: 'silver twin tails, blue eyes',
    prompt_exclusive_outfit: 'battle armor suit, shoulder pads',
    selected_alt_outfits: JSON.stringify([
      { id: 1, prompt_tags: 'casual hoodie, denim shorts' },
      { id: 2, prompt_tags: 'summer dress, straw hat' },
    ]),
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }

  const mockItems: DatasetItem[] = Array.from({ length: 20 }, (_, i) => ({
    id: 100 + i,
    project_id: 1,
    slot_index: i,
    factors_json: JSON.stringify({
      shot: i < 5 ? 'Close-up' : i < 14 ? 'Bust' : 'Full-body',
      angle: 'front',
      expression: 'smile',
      pose: 'standing',
      outfit_type: i < 15 ? 'default' : 'alt',
    }),
    raw_prompt: i < 15
      ? 'masterpiece, silver twin tails, blue eyes, battle armor suit, shoulder pads, front, smile'
      : 'masterpiece, silver twin tails, blue eyes, casual hoodie, denim shorts, front, smile',
    caption_text: i < 15
      ? 'e2e_heroine, e2e_battle_suit, front, smile'
      : 'e2e_heroine, casual hoodie, denim shorts, front, smile',
    image_path: null,
    seed: 1000 + i,
    status: 'APPROVED',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }))

  const mockJob: LoraTrainingJob = {
    id: 50,
    project_id: 1,
    lora_name: 'e2e_heroine_lora',
    model_type: 'sdxl',
    config_toml_content: 'mixed_precision = "bf16"',
    epochs: 10,
    repeats: 10,
    batch_size: 1,
    total_steps: 2000,
    network_dim: 32,
    network_alpha: 16,
    learning_rate: '1e-4',
    status: 'COMPLETED',
    pid: 1234,
    output_path: 'C:/models/loras/e2e_heroine_lora.safetensors',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(workflowsApi.list).mockResolvedValue(mockWorkflows)
    vi.mocked(datasetApi.listOutfits).mockResolvedValue(mockPresets)
    vi.mocked(datasetApi.createProject).mockResolvedValue(mockProject)
    vi.mocked(datasetApi.calculateMatrix).mockResolvedValue(mockItems)
    vi.mocked(datasetApi.getItems).mockResolvedValue(mockItems)
    vi.mocked(datasetApi.updateItem).mockResolvedValue(mockItems[0])
    vi.mocked(datasetApi.exportDataset).mockResolvedValue({
      status: 'success',
      project_id: 1,
      export_dir: 'C:/export',
      item_count: 20,
      exported_files: ['001.png', '001.txt'],
    } as any)
    vi.mocked(trainingApi.createJob).mockResolvedValue(mockJob)
    vi.mocked(trainingApi.getJobStatus).mockResolvedValue({ is_training_active: false })
    vi.mocked(trainingApi.startJob).mockResolvedValue({ status: 'started', job_id: 50, pid: 1234 })
    vi.mocked(trainingApi.stopJob).mockResolvedValue({ status: 'stopped', job_id: 50 })
    vi.mocked(benchmarkApi.generatePrompts).mockResolvedValue({
      total: 12,
      prompts: [
        { axis_id: 'decoupling', weight: 0.6, prompt: '<lora:e2e_heroine_lora:0.6>, e2e_heroine, wearing red hoodie', seed: 12345678 },
        { axis_id: 'decoupling', weight: 0.8, prompt: '<lora:e2e_heroine_lora:0.8>, e2e_heroine, wearing red hoodie', seed: 12345678 },
        { axis_id: 'decoupling', weight: 1.0, prompt: '<lora:e2e_heroine_lora:1.0>, e2e_heroine, wearing red hoodie', seed: 12345678 },
        { axis_id: 'bake_in', weight: 0.6, prompt: '<lora:e2e_heroine_lora:0.6>, e2e_heroine, e2e_battle_suit', seed: 12345678 },
        { axis_id: 'bake_in', weight: 0.8, prompt: '<lora:e2e_heroine_lora:0.8>, e2e_heroine, e2e_battle_suit', seed: 12345678 },
        { axis_id: 'bake_in', weight: 1.0, prompt: '<lora:e2e_heroine_lora:1.0>, e2e_heroine, e2e_battle_suit', seed: 12345678 },
        { axis_id: 'pose', weight: 0.6, prompt: '<lora:e2e_heroine_lora:0.6>, e2e_heroine, jumping dynamically', seed: 12345678 },
        { axis_id: 'pose', weight: 0.8, prompt: '<lora:e2e_heroine_lora:0.8>, e2e_heroine, jumping dynamically', seed: 12345678 },
        { axis_id: 'pose', weight: 1.0, prompt: '<lora:e2e_heroine_lora:1.0>, e2e_heroine, jumping dynamically', seed: 12345678 },
        { axis_id: 'angle', weight: 0.6, prompt: '<lora:e2e_heroine_lora:0.6>, e2e_heroine, from above, high angle', seed: 12345678 },
        { axis_id: 'angle', weight: 0.8, prompt: '<lora:e2e_heroine_lora:0.8>, e2e_heroine, from above, high angle', seed: 12345678 },
        { axis_id: 'angle', weight: 1.0, prompt: '<lora:e2e_heroine_lora:1.0>, e2e_heroine, from above, high angle', seed: 12345678 },
      ],
    })
    vi.mocked(benchmarkApi.evaluate).mockResolvedValue({
      sweet_spot: {
        recommended_weight_min: 0.75,
        recommended_weight_max: 0.85,
        recommended_weight_display: '0.75 - 0.85',
        reason: 'Optimal decoupling and pose compliance observed.',
      },
      results: [],
    })

    // Reset Zustand store state
    useStudioStore.setState({
      currentStep: 1,
      activeProject: null,
      datasetItems: [],
      selectedAltOutfitIds: [],
      currentJob: null,
      benchmarkResults: {},
      isCalculating: false,
    })
  })

  it('navigates through Studio stages 1 to 4 and completes the studio lifecycle (AC-1 to AC-9)', async () => {
    render(<DatasetStudioPage />)

    // 1. Verify Step 1 Render (AC-1, AC-2, AC-3)
    expect(screen.getByText('LoRA Studio')).toBeDefined()
    expect(screen.getByText('Step 1: 生成')).toBeDefined()

    // Test caption decoupler pure logic (AC-4)
    const decoupledDefault = decoupleCaption({
      rawPrompt: 'masterpiece, silver twin tails, blue eyes, battle armor suit, shoulder pads, smile',
      characterTrigger: mockProject.character_trigger,
      outfitTrigger: mockProject.outfit_trigger,
      physicalTags: ['silver twin tails', 'blue eyes'],
      exclusiveOutfitTags: ['battle armor suit', 'shoulder pads'],
      isDefaultOutfit: true,
    })
    expect(decoupledDefault).toContain('e2e_heroine')
    expect(decoupledDefault).toContain('e2e_battle_suit')
    expect(decoupledDefault).not.toContain('silver twin tails')
    expect(decoupledDefault).not.toContain('battle armor suit')

    const decoupledAlt = decoupleCaption({
      rawPrompt: 'masterpiece, silver twin tails, blue eyes, casual hoodie, denim shorts, smile',
      characterTrigger: mockProject.character_trigger,
      outfitTrigger: mockProject.outfit_trigger,
      physicalTags: ['silver twin tails', 'blue eyes'],
      exclusiveOutfitTags: ['battle armor suit', 'shoulder pads'],
      isDefaultOutfit: false,
    })
    expect(decoupledAlt).toContain('e2e_heroine')
    expect(decoupledAlt).toContain('casual hoodie')
    expect(decoupledAlt).not.toContain('e2e_battle_suit')
    expect(decoupledAlt).not.toContain('silver twin tails')

    // Test training schedule pure logic (AC-6)
    const schedule = computeTrainingSchedule(20, 10, 1, 10, 2)
    expect(schedule.totalSteps).toBe(2000)
    expect(schedule.checkpointsCount).toBe(5)

    // Set state to Step 2
    useStudioStore.setState({
      currentStep: 2,
      activeProject: mockProject,
      items: mockItems,
    })

    // Click Step 2 tab to switch
    fireEvent.click(screen.getByTestId('studio-step-tab-2'))
    await waitFor(() => {
      expect(screen.getByText('Step 2: 選別')).toBeDefined()
    })

    // Verify slots rendered in Step 2 (AC-4, AC-5)
    expect(screen.getByText('#1')).toBeDefined()
    expect(screen.getByTestId('export-dataset-button')).toBeDefined()

    // Export dataset click
    fireEvent.click(screen.getByTestId('export-dataset-button'))
    await waitFor(() => {
      expect(datasetApi.exportDataset).toHaveBeenCalledWith(mockProject.id)
    })

    // Set state to Step 3: captions
    useStudioStore.setState({
      currentStep: 3,
      activeProject: mockProject,
      items: mockItems,
    })
    fireEvent.click(screen.getByTestId('studio-step-tab-3'))
    await waitFor(() => {
      expect(screen.getByText('Step 3: キャプション')).toBeDefined()
    })

    // Set state to Step 4: training
    useStudioStore.setState({ currentStep: 4, activeProject: mockProject })
    fireEvent.click(screen.getByTestId('studio-step-tab-4'))
    await waitFor(() => {
      expect(screen.getByText('Step 4: 学習')).toBeDefined()
      expect(screen.getByTestId('training-config-panel')).toBeDefined()
    })
    expect(screen.getByLabelText(/^Epochs$/i)).toBeDefined()
    expect(screen.getByLabelText(/^Dataset Repeats$/i)).toBeDefined()
    expect(screen.getByTestId('btn-start-training')).toBeDefined()

    // Start training
    fireEvent.click(screen.getByTestId('btn-start-training'))
    await waitFor(() => {
      expect(trainingApi.createJob).toHaveBeenCalled()
      expect(trainingApi.startJob).toHaveBeenCalled()
    })

    // Open the separate post-training evaluation view from its header action.
    const evaluationButton = screen.getByTestId('open-post-training-evaluation')
    expect(evaluationButton).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(evaluationButton)
    await waitFor(() => {
      expect(evaluationButton).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByTestId('benchmark-matrix-table')).toBeDefined()
    })
    // Verify 12 benchmark cells & run benchmark button (AC-8, AC-9)
    expect(screen.getByTestId('run-benchmark-btn')).toBeDefined()
    expect(screen.getByTestId('benchmark-cell-decoupling-0.6')).toBeDefined()
    expect(screen.getByTestId('benchmark-cell-angle-1')).toBeDefined()

    // Run benchmark
    fireEvent.click(screen.getByTestId('run-benchmark-btn'))
    await waitFor(() => {
      expect(benchmarkApi.generatePrompts).toHaveBeenCalledWith({
        lora_name: mockProject.name,
        character_trigger: mockProject.character_trigger,
        outfit_trigger: mockProject.outfit_trigger,
      })
    })

    // Check sweet spot card render
    await waitFor(() => {
      expect(screen.getByTestId('sweet-spot-card')).toBeDefined()
      expect(screen.getByTestId('sweet-spot-weight')).toHaveTextContent('0.75 - 0.85')
    })
  })

  it('restores persisted rejected items without regenerating the matrix', async () => {
    const rejectedItem = { ...mockItems[0], status: 'REJECTED' as const }
    vi.mocked(datasetApi.getProjects).mockResolvedValue([mockProject])
    vi.mocked(datasetApi.getItems).mockResolvedValue([rejectedItem])

    render(<DatasetStudioPage />)

    await waitFor(() => {
      expect(useStudioStore.getState().items).toEqual([rejectedItem])
    })
    expect(datasetApi.getItems).toHaveBeenCalledWith(mockProject.id)
    expect(datasetApi.calculateMatrix).not.toHaveBeenCalled()
  })

  it('keeps a new project empty when its persisted item list is empty', async () => {
    const newProject = { ...mockProject, id: 90, name: 'New empty project' }
    vi.mocked(datasetApi.getProjects).mockResolvedValue([newProject])
    vi.mocked(datasetApi.getItems).mockResolvedValue([])

    render(<DatasetStudioPage />)

    await waitFor(() => {
      expect(datasetApi.getItems).toHaveBeenCalledWith(newProject.id)
      expect(useStudioStore.getState().activeProject?.id).toBe(newProject.id)
    })
    expect(useStudioStore.getState().items).toEqual([])
    expect(datasetApi.calculateMatrix).not.toHaveBeenCalled()
  })

  it('preserves in-memory edits and the current stage when revisiting the same project', async () => {
    const editedItems = [{ ...mockItems[0], caption_text: 'unsaved caption edit' }]
    useStudioStore.setState({ activeProject: mockProject, items: editedItems, currentStep: 3 })
    vi.mocked(datasetApi.getProjects).mockResolvedValue([mockProject])

    render(<DatasetStudioPage />)

    await waitFor(() => expect(screen.getByText('キャプション')).toBeInTheDocument())
    expect(useStudioStore.getState().currentStep).toBe(3)
    expect(useStudioStore.getState().items).toBe(editedItems)
    expect(datasetApi.getItems).not.toHaveBeenCalled()
  })

  it('does not replace newer in-memory items with an older persisted-items response', async () => {
    let resolvePersistedItems!: (items: DatasetItem[]) => void
    vi.mocked(datasetApi.getProjects).mockResolvedValue([mockProject])
    vi.mocked(datasetApi.getItems).mockImplementation(() => new Promise((resolve) => {
      resolvePersistedItems = resolve
    }))

    render(<DatasetStudioPage />)
    await waitFor(() => expect(datasetApi.getItems).toHaveBeenCalledWith(mockProject.id))
    await act(async () => useStudioStore.setState({ items: mockItems }))
    await act(async () => resolvePersistedItems([{ ...mockItems[0], status: 'REJECTED' as const }]))

    expect(useStudioStore.getState().items).toBe(mockItems)
    expect(datasetApi.calculateMatrix).not.toHaveBeenCalled()
  })

  it('ignores an older project response and stale error after switching projects', async () => {
    const secondProject = { ...mockProject, id: 2, name: 'Second project' }
    const itemResolvers = new Map<number, { resolve: (items: DatasetItem[]) => void; reject: (error: Error) => void }>()
    vi.mocked(datasetApi.getProjects).mockResolvedValue([mockProject, secondProject])
    vi.mocked(datasetApi.getItems).mockImplementation((projectId) => new Promise((resolve, reject) => {
      itemResolvers.set(projectId, { resolve, reject })
    }))

    render(<DatasetStudioPage />)
    const selector = await screen.findByTestId('project-selector') as HTMLSelectElement
    await waitFor(() => expect(itemResolvers.has(Number(selector.value))).toBe(true))
    const firstProjectId = Number(selector.value)
    const secondProjectId = firstProjectId === mockProject.id ? secondProject.id : mockProject.id
    const secondItem = { ...mockItems[0], id: 902, project_id: secondProjectId, status: 'REJECTED' as const }

    fireEvent.change(selector, { target: { value: String(secondProjectId) } })
    await waitFor(() => expect(itemResolvers.has(secondProjectId)).toBe(true))
    await act(async () => itemResolvers.get(secondProjectId)?.resolve([secondItem]))
    await waitFor(() => expect(useStudioStore.getState().items).toEqual([secondItem]))
    await act(async () => itemResolvers.get(firstProjectId)?.reject(new Error('stale project load failed')))

    expect(useStudioStore.getState().activeProject?.id).toBe(secondProjectId)
    expect(useStudioStore.getState().items).toEqual([secondItem])
    expect(screen.queryByTestId('studio-items-load-error')).not.toBeInTheDocument()
    expect(datasetApi.calculateMatrix).not.toHaveBeenCalled()
  })

  it('shows a visible error when the current project item restore fails', async () => {
    vi.mocked(datasetApi.getProjects).mockResolvedValue([mockProject])
    vi.mocked(datasetApi.getItems).mockRejectedValue(new Error('restore failed'))

    render(<DatasetStudioPage />)

    expect(await screen.findByTestId('studio-items-load-error')).toHaveTextContent('保存済みの素材を読み込めませんでした')
    expect(useStudioStore.getState().items).toEqual([])
    expect(datasetApi.calculateMatrix).not.toHaveBeenCalled()
  })
})
