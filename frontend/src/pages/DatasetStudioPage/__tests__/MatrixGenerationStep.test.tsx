import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MatrixGenerationStep, injectPromptAndSeed } from '../components/MatrixGenerationStep'
import { DatasetStudioPage } from '../index'
import { useStudioStore } from '../useStudioStore'
import { datasetApi, workflowsApi, mappingMastersApi } from '../../../api/client'
import type { DatasetItem, DatasetProject, Workflow, MappingMaster } from '../../../api/types'
import { saveStudioDraft, saveActiveProjectId } from '../utils/studioDraftStorage'
import { useGenerationStore } from '../../../store/useGenerationStore'
import { cleanupAllTestState, resetTestStorage } from '../../../test/utils'

vi.mock('../../../api/client', () => ({
  datasetApi: {
    getProjects: vi.fn(),
    getItems: vi.fn(),
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
  mappingMastersApi: {
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

  const mockMappingMasters: MappingMaster[] = [
    {
      id: 1,
      role: 'Main_Positive_Prompt',
      expected_class_types: ['CLIPTextEncode'],
      param_name: 'text',
      input_type: 'textarea',
      display_name: 'Positive Prompt',
      title_patterns: ['positive'],
      sort_order: 1,
    },
    {
      id: 2,
      role: 'Negative_Prompt',
      expected_class_types: ['CLIPTextEncode'],
      param_name: 'text',
      input_type: 'textarea',
      display_name: 'Negative Prompt',
      title_patterns: ['negative'],
      sort_order: 2,
    },
  ]

  beforeEach(() => {
    cleanupAllTestState()
    resetTestStorage()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    sessionStorage.clear()
    useStudioStore.getState().resetStudio()
    useGenerationStore.setState({ generationSnapshot: null, generationSyncing: false, errorToast: null })
    vi.mocked(datasetApi.getProjects).mockResolvedValue([mockProject])
    vi.mocked(datasetApi.getItems).mockImplementation(async (projectId) =>
      projectId === mockProject.id ? mockItems : [],
    )
    vi.mocked(workflowsApi.list).mockResolvedValue(mockWorkflows)
    vi.mocked(workflowsApi.get).mockResolvedValue(mockWorkflows[0])
    vi.mocked(mappingMastersApi.list).mockResolvedValue(mockMappingMasters)
    vi.mocked(datasetApi.createProject).mockResolvedValue(mockProject)
    vi.mocked(datasetApi.updateProject).mockResolvedValue(mockProject)
    vi.mocked(datasetApi.calculateMatrix).mockResolvedValue(mockItems)
  })

  afterEach(() => {
    cleanupAllTestState()
    resetTestStorage()
    useStudioStore.getState().resetStudio()
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

  it('uses semantic section labels without circled-number decorators', async () => {
    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('project-name-input')).toBeInTheDocument()
    })

    for (const label of [
      'マトリクス因子プロンプト・衣装設定 (Prompts & Outfits)',
      'メタ情報 (Meta & Quality)',
      '身体的特徴・顔 (Face & Body)',
      '専用の服装 (Default Outfit)',
      'ネガティブプロンプト (Negative Prompt)',
      '生成パラメータ設定 (Generation Parameters)',
      'バイパス・ノード詳細設定 (Bypasses & Mappings)',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryAllByText(/^[①②③④]/)).toHaveLength(0)
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

  it('retains the batch submission extension and uses its returned batch identity', async () => {
    const mockDirectSubmit = vi.fn().mockResolvedValue({ batch_id: 'studio-batch-1', job_ids: ['job-1'] })

    useStudioStore.getState().setItems(mockItems)
    render(<MatrixGenerationStep onDirectBatchSubmit={mockDirectSubmit} />)

    await waitFor(() => {
      expect(screen.getByTestId('submit-batch-button')).toBeInTheDocument()
    })
    const submitBtn = screen.getByTestId('submit-batch-button')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockDirectSubmit).toHaveBeenCalledWith(mockItems, mockWorkflows[0].json_body)
    })

    await waitFor(() => {
      expect(screen.getByTestId('status-message')).toHaveTextContent(/Studioバッチ20件の受付が完了しました/)
      expect(screen.getByTestId('batch-progress-container')).toHaveTextContent('0/20')
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

  it('[REQ-321/AC-1] remaps and saves mappings when workflow initially has empty mappings, and updates node badges from fresh workflow', async () => {
    const unmappedWorkflow: Workflow = {
      id: 1,
      name: 'Unmapped Workflow',
      description: '',
      is_default: false,
      json_body: {
        '6': { inputs: { text: '' }, class_type: 'CLIPTextEncode', _meta: { title: 'Positive Prompt Node' } },
        '7': { inputs: { text: '' }, class_type: 'CLIPTextEncode', _meta: { title: 'Negative Prompt Node' } },
      },
      mappings: [],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    }

    const remappedWorkflow: Workflow = {
      ...unmappedWorkflow,
      mappings: [
        { id: 201, master_id: 1, node_id: '6', role: 'Main_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Positive Prompt' },
        { id: 202, master_id: 2, node_id: '7', role: 'Negative_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Negative Prompt' },
      ],
    }

    vi.mocked(workflowsApi.list).mockResolvedValue([unmappedWorkflow])
    vi.mocked(workflowsApi.get).mockResolvedValue(unmappedWorkflow)
    vi.mocked(workflowsApi.update).mockImplementation(async () => {
      vi.mocked(workflowsApi.get).mockResolvedValue(remappedWorkflow)
      return remappedWorkflow
    })

    render(<MatrixGenerationStep />)

    // Initial render with mappings: [] -> badges show #未設定
    await waitFor(() => {
      expect(screen.getByTestId('positive-node-badge')).toBeInTheDocument()
      expect(screen.getByTestId('negative-node-badge')).toBeInTheDocument()
    })
    expect(screen.getByTestId('positive-node-badge')).toHaveTextContent('#未設定')
    expect(screen.getByTestId('negative-node-badge')).toHaveTextContent('#未設定')

    // Open remap modal
    fireEvent.click(screen.getByTestId('open-remap-modal-button'))
    await waitFor(() => {
      expect(screen.getByTestId('node-remap-modal')).toBeInTheDocument()
    })

    // Select #6 for positive, #7 for negative
    const posSelect = screen.getByTestId('remap-positive-select')
    const negSelect = screen.getByTestId('remap-negative-select')
    fireEvent.change(posSelect, { target: { value: '6' } })
    fireEvent.change(negSelect, { target: { value: '7' } })

    // Save
    fireEvent.click(screen.getByTestId('save-remap-button'))

    // Verify workflowsApi.update called with master_id resolved from mappingMastersApi.list
    await waitFor(() => {
      expect(workflowsApi.update).toHaveBeenCalledWith(1, {
        mappings: [
          { master_id: 1, node_id: '6' },
          { master_id: 2, node_id: '7' },
        ],
      })
    })

    // Verify fresh workflow re-fetch and modal closure
    await waitFor(() => {
      expect(workflowsApi.get).toHaveBeenCalledWith(1)
      expect(screen.queryByTestId('node-remap-modal')).not.toBeInTheDocument()
    })

    // Badges updated to #6 and #7
    await waitFor(() => {
      expect(screen.getByTestId('positive-node-badge')).toHaveTextContent('Positive:#6')
      expect(screen.getByTestId('negative-node-badge')).toHaveTextContent('Negative:#7')
    })
  })

  it('[REQ-321/AC-2] displays error message and keeps modal open when workflowsApi.update fails', async () => {
    vi.mocked(workflowsApi.update).mockRejectedValueOnce(new Error('Database update failed'))

    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('open-remap-modal-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('open-remap-modal-button'))
    await waitFor(() => {
      expect(screen.getByTestId('node-remap-modal')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('save-remap-button'))

    await waitFor(() => {
      expect(screen.getByText('Database update failed')).toBeInTheDocument()
      expect(screen.getByTestId('node-remap-modal')).toBeInTheDocument()
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

  it('AC-4: submits all frozen Studio graphs in one project-scoped request and follows only that batch snapshot', async () => {
    // Setup store with items, customized paramValues, and bypassed node
    useStudioStore.getState().setItems(mockItems)
    useStudioStore.getState().setParamValues({ steps: '42' })
    useStudioStore.getState().toggleBypassedNodeId('7') // bypass negative node

    useStudioStore.getState().setActiveProject(mockProject)
    const jobIds = Array.from({ length: 20 }, (_, index) => `studio-job-${index}`)
    const submit = vi.spyOn(useGenerationStore.getState(), 'submitGenerationBatch').mockResolvedValue({ batch_id: 'studio-batch-accepted', job_ids: jobIds })

    // Provide workflow with parameter mapping
    const customWf: Workflow = {
      ...mockWorkflows[0],
      mappings: [
        ...mockWorkflows[0].mappings,
        { id: 103, master_id: 3, node_id: '3', role: 'steps', param_name: 'steps', input_type: 'int', display_name: 'Steps' },
      ],
    }
    vi.mocked(workflowsApi.list).mockResolvedValue([customWf])
    vi.mocked(workflowsApi.get).mockResolvedValue(customWf)

    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('submit-batch-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('submit-batch-button'))

    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1)
    })

    const request = submit.mock.calls[0][0]
    expect(request.scope).toBe('studio')
    expect(request.project_id).toBe(mockProject.id)
    expect(request.session_id).toBe(useGenerationStore.getState().clientId)
    expect(request.items).toHaveLength(20)
    expect(request.items[0].graph['6'].inputs.text).toBe(mockItems[0].raw_prompt)
    expect(request.items[0].graph['3'].inputs.steps).toBe(42)
    expect(request.items[0].graph['7'].mode).toBe(2)
    expect(screen.getByTestId('status-message')).toHaveTextContent(/受付が完了しました/)
    expect(useStudioStore.getState().currentStep).toBe(1)

    const makeJob = (job_id: string, batch_id: string, scope: string, project_id: number | null, status: string, failure: any = null) => ({
      job_id, request_id: `request-${job_id}`, prompt_id: `prompt-${job_id}`,
      session_id: useGenerationStore.getState().clientId, scope, batch_id,
      normal_group_id: null, project_id, status, started_at: null, finished_at: null,
      node: null, outputs: [], failure,
    })
    const snapshotJobs = [
      ...jobIds.slice(0, 12).map((job_id) => makeJob(job_id, 'studio-batch-accepted', 'studio', mockProject.id, 'succeeded')),
      ...jobIds.slice(12).map((job_id) => makeJob(job_id, 'studio-batch-accepted', 'studio', mockProject.id, 'cancelled')),
      makeJob('other-batch-job', 'different-batch', 'studio', mockProject.id, 'running'),
      makeJob('normal-job', 'normal-batch', 'normal', null, 'succeeded'),
    ]
    const snapshot = {
      version: 1, epoch: 'studio-progress-epoch', revision: 1, normal_group_id: null, jobs: snapshotJobs,
      batches: [
        { batch_id: 'studio-batch-accepted', scope: 'studio', project_id: mockProject.id },
        { batch_id: 'different-batch', scope: 'studio', project_id: mockProject.id },
      ],
      upstream: { http_ready: true, ws_connected: true, failure_since: null },
    }
    act(() => {
      useGenerationStore.setState({ generationSnapshot: snapshot as any })
    })
    expect(screen.getByTestId('batch-progress-container')).toHaveTextContent('12/20')
    expect(screen.getByTestId('batch-progress-text')).toHaveTextContent('60%')
    act(() => {
      useGenerationStore.getState().applyGenerationSnapshot({
        ...snapshot,
        revision: 2,
        jobs: snapshotJobs.map((job: any) => job.job_id === 'other-batch-job'
          ? { ...job, status: 'failed', failure: { reason: 'Other batch failed', outcome: 'failed' } }
          : job),
      } as any)
    })
    expect(useGenerationStore.getState().errorToast?.message).toBe('Other batch failed')
    expect(useStudioStore.getState().paramValues.steps).toBe('42')
    expect(useStudioStore.getState().currentStep).toBe(1)
  })

  it('[REQ-330/AC-1] displays an error when batch acceptance fails', async () => {
    useStudioStore.getState().setItems(mockItems)
    useStudioStore.getState().setActiveProject(mockProject)
    vi.spyOn(useGenerationStore.getState(), 'submitGenerationBatch').mockRejectedValueOnce(new Error('Generation API unavailable'))

    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('submit-batch-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('submit-batch-button'))

    await waitFor(() => {
      expect(screen.getByTestId('status-message')).toBeInTheDocument()
    })
    expect(screen.getByTestId('status-message')).toHaveTextContent('Studioバッチ受付エラー: Generation API unavailable')
    expect(screen.getByTestId('submit-batch-button')).not.toBeDisabled()
  })

  it('[REQ-330/AC-2] reports server generation rejection without per-item POSTs', async () => {
    useStudioStore.getState().setItems(mockItems)
    useStudioStore.getState().setActiveProject(mockProject)
    vi.spyOn(useGenerationStore.getState(), 'submitGenerationBatch').mockRejectedValueOnce(new Error('Invalid workflow node connection'))

    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('submit-batch-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('submit-batch-button'))

    await waitFor(() => {
      expect(screen.getByTestId('status-message')).toBeInTheDocument()
    })
    expect(screen.getByTestId('status-message')).toHaveTextContent('Studioバッチ受付エラー: Invalid workflow node connection')
    expect(screen.getByTestId('submit-batch-button')).not.toBeDisabled()
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

  it('restores draft and displays draft-restored-alert when a newer draft exists in sessionStorage (AC-3)', async () => {
    saveStudioDraft({
      projectId: 10,
      name: 'Restored Draft Chara',
      character_trigger: 'restored_chara',
      outfit_trigger: 'restored_outfit',
      workflow_id: 1,
      prompt_meta: 'restored meta',
      prompt_physical: 'restored physical',
      prompt_exclusive_outfit: 'restored dress',
      prompt_negative: 'restored negative',
      selected_alt_outfits: '[]',
      updated_at: '2026-02-01T00:00:00.000Z',
      base_server_updated_at: '2026-01-01T00:00:00.000Z',
      is_synced: false,
    })

    useStudioStore.getState().setActiveProject({
      ...mockProject,
      updated_at: '2026-01-01T00:00:00.000Z',
    })

    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('draft-restored-alert')).toBeInTheDocument()
    })
    expect(screen.getByTestId('draft-restored-alert')).toHaveTextContent('未保存の下書きを復元しました')
    expect(screen.getByTestId('project-name-input')).toHaveValue('Restored Draft Chara')
    expect(screen.getByTestId('character-trigger-input')).toHaveValue('restored_chara')

    // Dismiss alert
    fireEvent.click(screen.getByText('閉じる'))
    expect(screen.queryByTestId('draft-restored-alert')).not.toBeInTheDocument()
  })

  it('displays draft-conflict-alert and resolves conflict with draft (Red Team 5)', async () => {
    saveStudioDraft({
      projectId: 10,
      name: 'Draft Overwrite Name',
      character_trigger: 'draft_chara',
      outfit_trigger: 'draft_outfit',
      workflow_id: 1,
      prompt_meta: 'draft meta',
      prompt_physical: 'draft physical',
      prompt_exclusive_outfit: 'draft dress',
      prompt_negative: 'draft neg',
      selected_alt_outfits: '[]',
      updated_at: '2026-02-01T00:00:00.000Z',
      base_server_updated_at: '2026-01-01T00:00:00.000Z',
      is_synced: false,
    })

    const serverProject: DatasetProject = {
      ...mockProject,
      name: 'Server Latest Name',
      updated_at: '2026-01-15T00:00:00.000Z',
    }
    useStudioStore.getState().setActiveProject(serverProject)

    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('draft-conflict-alert')).toBeInTheDocument()
    })
    expect(screen.getByTestId('resolve-conflict-draft-btn')).toBeInTheDocument()
    expect(screen.getByTestId('resolve-conflict-server-btn')).toBeInTheDocument()

    // Click "下書きで上書き"
    fireEvent.click(screen.getByTestId('resolve-conflict-draft-btn'))

    await waitFor(() => {
      expect(datasetApi.updateProject).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ name: 'Draft Overwrite Name' })
      )
      expect(screen.queryByTestId('draft-conflict-alert')).not.toBeInTheDocument()
    })
  })

  it('displays draft-conflict-alert and resolves conflict with server (Red Team 5)', async () => {
    saveStudioDraft({
      projectId: 10,
      name: 'Draft Local Name',
      character_trigger: 'draft_chara',
      outfit_trigger: 'draft_outfit',
      workflow_id: 1,
      prompt_meta: 'draft meta',
      prompt_physical: 'draft physical',
      prompt_exclusive_outfit: 'draft dress',
      prompt_negative: 'draft neg',
      selected_alt_outfits: '[]',
      updated_at: '2026-02-01T00:00:00.000Z',
      base_server_updated_at: '2026-01-01T00:00:00.000Z',
      is_synced: false,
    })

    const serverProject: DatasetProject = {
      ...mockProject,
      name: 'Server Kept Name',
      character_trigger: 'server_chara',
      prompt_negative: 'server neg',
      updated_at: '2026-01-15T00:00:00.000Z',
    }
    useStudioStore.getState().setActiveProject(serverProject)

    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('draft-conflict-alert')).toBeInTheDocument()
    })

    // Click "サーバーの最新を読込"
    fireEvent.click(screen.getByTestId('resolve-conflict-server-btn'))

    await waitFor(() => {
      expect(screen.queryByTestId('draft-conflict-alert')).not.toBeInTheDocument()
      expect(screen.getByTestId('project-name-input')).toHaveValue('Server Kept Name')
      expect(screen.getByTestId('character-trigger-input')).toHaveValue('server_chara')
    })
  })

  it('flushes auto-save before calculating matrix when activeProject exists (AC-6)', async () => {
    useStudioStore.getState().setActiveProject(mockProject)
    render(<MatrixGenerationStep />)

    await waitFor(() => {
      expect(screen.getByTestId('calculate-matrix-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('calculate-matrix-button'))

    await waitFor(() => {
      expect(datasetApi.updateProject).toHaveBeenCalledWith(
        mockProject.id,
        expect.objectContaining({ name: mockProject.name })
      )
      expect(datasetApi.calculateMatrix).toHaveBeenCalledWith(mockProject.id)
    })
  })

  it('renders header with project selector, new project button, and autosave status badge in DatasetStudioPage (AC-6)', async () => {
    const projectA: DatasetProject = {
      ...mockProject,
      id: 10,
      name: 'Project Alpha',
      prompt_negative: 'worst quality, bad anatomy',
    }
    const projectB: DatasetProject = {
      ...mockProject,
      id: 20,
      name: 'Project Beta',
      prompt_negative: 'worst quality, bad anatomy',
    }
    vi.mocked(datasetApi.getProjects).mockResolvedValue([projectA, projectB])

    render(<DatasetStudioPage />)

    await waitFor(() => {
      expect(screen.getByTestId('project-selector')).toBeInTheDocument()
      expect(screen.getByTestId('open-create-project-modal-btn')).toBeInTheDocument()
      expect(screen.getByTestId('autosave-status')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: '新規プロジェクト' })).toBeInTheDocument()
    expect(screen.queryByText('＋ 新規プロジェクト')).not.toBeInTheDocument()

    expect(screen.getByTestId('autosave-status')).toHaveTextContent('未保存（下書き保持）')

    // Check project list in select
    const selector = screen.getByTestId('project-selector') as HTMLSelectElement
    expect(selector.options).toHaveLength(2)
    expect(selector.options[0].text).toBe('Project Alpha')
    expect(selector.options[1].text).toBe('Project Beta')

    // Change selected project
    fireEvent.change(selector, { target: { value: '20' } })
    expect(useStudioStore.getState().activeProject?.id).toBe(20)
  })

  it('transitions save status badge to unsaved, saving, and saved upon form editing in DatasetStudioPage (AC-6)', async () => {
    useStudioStore.getState().setActiveProject({
      ...mockProject,
      prompt_negative: 'worst quality, bad anatomy',
    })

    render(<DatasetStudioPage />)

    await waitFor(() => {
      expect(screen.getByTestId('autosave-status')).toHaveTextContent('未保存（下書き保持）')
    })

    // Edit project name in form
    const nameInput = screen.getByTestId('project-name-input')
    fireEvent.change(nameInput, { target: { value: 'Modified Name' } })

    // Immediately transitions to unsaved
    expect(screen.getByTestId('autosave-status')).toHaveTextContent('未保存（下書き保持）')

    // After debounce finishes (750ms), API call completes
    await waitFor(() => {
      expect(datasetApi.updateProject).toHaveBeenCalledWith(
        mockProject.id,
        expect.objectContaining({ name: 'Modified Name' })
      )
      expect(screen.getByTestId('autosave-status')).toHaveTextContent('自動保存済み')
    }, { timeout: 3000 })
  })

  it('opens CreateProjectModal when clicking new project button and updates activeProject on creation (AC-6)', async () => {
    const newCreatedProject: DatasetProject = {
      ...mockProject,
      id: 99,
      name: 'Newly Created LoRA Project',
    }
    vi.mocked(datasetApi.createProject).mockResolvedValue(newCreatedProject)

    render(<DatasetStudioPage />)

    await waitFor(() => {
      expect(screen.getByTestId('open-create-project-modal-btn')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('open-create-project-modal-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('create-project-modal')).toBeInTheDocument()
    })

    // Submit modal
    const submitBtn = screen.getByTestId('submit-create-project-btn')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(useStudioStore.getState().activeProject?.id).toBe(99)
      expect(screen.queryByTestId('create-project-modal')).not.toBeInTheDocument()
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

  it('AC-4: injectPromptAndSeed injects paramValues (int, float, boolean, text) and bypasses nodes (mode=2)', () => {
    const workflowJson: any = {
      '3': { inputs: { steps: 20, cfg: 7.0, sampler_name: 'euler' }, class_type: 'KSampler' },
      '10': { inputs: { text: '' }, class_type: 'CLIPTextEncode' },
      '11': { inputs: { text: '' }, class_type: 'CLIPTextEncode' },
      '20': { inputs: { enabled: true }, class_type: 'FaceDetailer' },
      '25': { inputs: { upscale_by: 2.0 }, class_type: 'UpscaleModelLoader' },
    }

    const mappings = [
      { role: 'steps', node_id: '3', param_name: 'steps', input_type: 'int' },
      { role: 'cfg', node_id: '3', param_name: 'cfg', input_type: 'float' },
      { role: 'sampler', node_id: '3', param_name: 'sampler_name', input_type: 'combo' },
      { role: 'enabled', node_id: '20', param_name: 'enabled', input_type: 'boolean' },
    ]

    const paramValues = {
      steps: '35',
      cfg: '8.5',
      sampler: 'dpmpp_2m',
      enabled: 'false',
    }

    const bypassedNodeIds = ['20', '25']

    const result = injectPromptAndSeed(workflowJson, 'pos text', 1234, {
      positiveNodeId: '10',
      negativeNodeId: '11',
      negativePrompt: 'neg text',
      paramValues,
      mappings,
      bypassedNodeIds,
    })

    // Parameters injected
    expect(result['3'].inputs.steps).toBe(35)
    expect(result['3'].inputs.cfg).toBe(8.5)
    expect(result['3'].inputs.sampler_name).toBe('dpmpp_2m')
    expect(result['20'].inputs.enabled).toBe(false)

    // Nodes bypassed (mode = 2)
    expect(result['20'].mode).toBe(2)
    expect(result['25'].mode).toBe(2)
  })

  it('Red Team 1: safely skips missing node_ids in paramValues and bypassedNodeIds without throwing', () => {
    const workflowJson: any = {
      '10': { inputs: { text: '' }, class_type: 'CLIPTextEncode' },
    }

    const mappings = [
      { role: 'steps', node_id: '999', param_name: 'steps', input_type: 'int' },
    ]

    const paramValues = { steps: '40' }
    const bypassedNodeIds = ['888', '777']

    expect(() => {
      const result = injectPromptAndSeed(workflowJson, 'pos', 1, {
        positiveNodeId: '10',
        paramValues,
        mappings,
        bypassedNodeIds,
      })
      expect(result['10'].inputs.text).toBe('pos')
      expect(result['999']).toBeUndefined()
    }).not.toThrow()
  })
})
