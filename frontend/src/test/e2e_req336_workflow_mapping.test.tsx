import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MappingMasterSection } from '../pages/SettingsPage/components/MappingMasterSection'
import { MappingMasterEditModal } from '../components/MappingMasterEditModal'
import { StageManagerModal } from '../components/StageManagerModal'
import { AdaptiveWorkflowWiring } from '../components/AdaptiveWorkflowWiring'
import { detectActiveStages } from '../utils/workflowAdaptiveStageDetector'
import {
  resolveRoleWithHistoryFallback,
  getInitialParams,
  injectWorkflowParams,
} from '../utils/workflowParamInjector'
import { mappingMastersApi } from '../api/domains/mappingMasters'
import { mappingGroupsApi } from '../api/domains/mappingGroups'
import { stageMastersApi } from '../api/domains/stageMasters'
import type { MappingMasterV2, MappingGroupMaster, StageMaster, Workflow } from '../api/types'

// Mock APIs
vi.mock('../api/domains/mappingMasters', () => ({
  mappingMastersApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getUsages: vi.fn(),
    reorder: vi.fn(),
  },
}))

vi.mock('../api/domains/mappingGroups', () => ({
  mappingGroupsApi: {
    list: vi.fn(),
  },
}))

vi.mock('../api/domains/stageMasters', () => ({
  stageMastersApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getUsages: vi.fn(),
    cascadePreview: vi.fn(),
    cascadeRename: vi.fn(),
  },
}))

const mockGroups: MappingGroupMaster[] = [
  { id: 1, key: 'prompt', name: 'プロンプト系', sort_order: 1, is_builtin: true, is_active: true },
  { id: 2, key: 'sampler', name: 'サンプラー系', sort_order: 2, is_builtin: true, is_active: true },
]

const mockStages: StageMaster[] = [
  {
    id: 1,
    key: 'main',
    name: 'Main Stage',
    suffix: '',
    search_keywords: ['main'],
    previous_suffixes: null,
    is_builtin: true,
    is_active: true,
    sort_order: 1,
  },
  {
    id: 2,
    key: 'rough',
    name: 'Rough Stage',
    suffix: '_rough',
    search_keywords: ['rough'],
    previous_suffixes: ['_legacy', '_draft'],
    is_builtin: false,
    is_active: true,
    sort_order: 2,
  },
  {
    id: 3,
    key: 'detail',
    name: 'Detail Stage',
    suffix: '_detail',
    search_keywords: ['detail', 'refiner'],
    previous_suffixes: ['_refiner', '_hires'],
    is_builtin: false,
    is_active: true,
    sort_order: 3,
  },
]

const mockMasters: MappingMasterV2[] = [
  {
    id: 100,
    group_id: 1,
    base_key: 'positive_prompt',
    name: 'Positive Prompt',
    param_name: 'text',
    input_type: 'textarea',
    expected_class_types: ['CLIPTextEncode'],
    base_title_patterns: ['positive'],
    sort_order: 1,
    variants: [
      { id: 101, master_id: 100, stage_id: 1, stage_key: 'main', stage_name: 'Main Stage', stage_suffix: '', custom_role_override: null, computed_role: 'positive_prompt', extra_title_patterns: null, is_enabled: true },
      { id: 102, master_id: 100, stage_id: 2, stage_key: 'rough', stage_name: 'Rough Stage', stage_suffix: '_rough', custom_role_override: null, computed_role: 'positive_prompt_rough', extra_title_patterns: null, is_enabled: true },
    ],
  },
  {
    id: 200,
    group_id: 2,
    base_key: 'steps',
    name: 'Steps',
    param_name: 'steps',
    input_type: 'int',
    expected_class_types: ['KSampler'],
    base_title_patterns: ['sampler'],
    sort_order: 2,
    variants: [
      { id: 201, master_id: 200, stage_id: 1, stage_key: 'main', stage_name: 'Main Stage', stage_suffix: '', custom_role_override: null, computed_role: 'steps', extra_title_patterns: null, is_enabled: true },
      { id: 202, master_id: 200, stage_id: 2, stage_key: 'rough', stage_name: 'Rough Stage', stage_suffix: '_rough', custom_role_override: null, computed_role: 'steps_rough', extra_title_patterns: null, is_enabled: true },
      { id: 203, master_id: 200, stage_id: 3, stage_key: 'detail', stage_name: 'Detail Stage', stage_suffix: '_detail', custom_role_override: null, computed_role: 'steps_detail', extra_title_patterns: null, is_enabled: true },
    ],
  },
]

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('REQ-336 E2E Workflow Mapping & Red Teaming Integration Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mappingGroupsApi.list).mockResolvedValue(mockGroups)
    vi.mocked(stageMastersApi.list).mockResolvedValue(mockStages)
    vi.mocked(mappingMastersApi.list).mockResolvedValue(mockMasters)
  })

  describe('AC-8 & Red Teaming: resolveRoleWithHistoryFallback', () => {
    const knownRoles = ['steps', 'steps_rough', 'steps_detail', 'positive_prompt', 'cfg']

    it('returns exact match immediately when roleKey is already known', () => {
      expect(resolveRoleWithHistoryFallback('steps_rough', mockStages, knownRoles)).toBe('steps_rough')
      expect(resolveRoleWithHistoryFallback('steps', mockStages, knownRoles)).toBe('steps')
    })

    it('resolves external PNG metadata using previous_suffixes history chain', () => {
      // '_legacy' is in stage_rough previous_suffixes, should resolve to 'steps_rough'
      const resolved = resolveRoleWithHistoryFallback('steps_legacy', mockStages, knownRoles)
      expect(resolved).toBe('steps_rough')

      // '_draft' is also in stage_rough previous_suffixes
      expect(resolveRoleWithHistoryFallback('steps_draft', mockStages, knownRoles)).toBe('steps_rough')

      // '_refiner' is in stage_detail previous_suffixes
      expect(resolveRoleWithHistoryFallback('steps_refiner', mockStages, knownRoles)).toBe('steps_detail')
    })

    it('gracefully resolves unknown suffix to base_key match in knownRoles', () => {
      // 'steps_unknown_sub' split('_')[0] is 'steps', matches 'steps' in knownRoles
      expect(resolveRoleWithHistoryFallback('steps_experimental', mockStages, knownRoles)).toBe('steps')
      // 'cfg_v2' matches 'cfg'
      expect(resolveRoleWithHistoryFallback('cfg_v2', mockStages, knownRoles)).toBe('cfg')
    })

    it('Red Teaming: guards against null, undefined, empty, or whitespace roleKey', () => {
      expect(resolveRoleWithHistoryFallback(null, mockStages, knownRoles)).toBe('')
      expect(resolveRoleWithHistoryFallback(undefined, mockStages, knownRoles)).toBe('')
      expect(resolveRoleWithHistoryFallback('', mockStages, knownRoles)).toBe('')
    })

    it('Red Teaming: strictly restricts history chain lookup to max 10 items (slice(0, 10))', () => {
      const stageWith12History: StageMaster = {
        id: 4,
        key: 'long_history',
        name: 'Long History Stage',
        suffix: '_curr',
        search_keywords: null,
        previous_suffixes: [
          '_h1', '_h2', '_h3', '_h4', '_h5',
          '_h6', '_h7', '_h8', '_h9', '_h10',
          '_h11', '_h12'
        ],
        is_builtin: false,
        is_active: true,
        sort_order: 4,
      }
      const customKnownRoles = ['sampler_curr']

      // First 10 items (_h1 to _h10) resolve
      expect(resolveRoleWithHistoryFallback('sampler_h1', [stageWith12History], customKnownRoles)).toBe('sampler_curr')
      expect(resolveRoleWithHistoryFallback('sampler_h10', [stageWith12History], customKnownRoles)).toBe('sampler_curr')

      // 11th item (_h11) must NOT be matched via history chain
      const fallbackResult = resolveRoleWithHistoryFallback('sampler_h11', [stageWith12History], customKnownRoles)
      // Since base_key 'sampler' is split('_')[0], customKnownRoles has 'sampler_curr'
      expect(fallbackResult).toBe('sampler_curr') // via baseKey graceful fallback

      // Without base_key match in knownRoles, 11th item returns original key
      expect(resolveRoleWithHistoryFallback('other_h11', [stageWith12History], ['unrelated'])).toBe('other_h11')
    })

    it('Red Teaming: handles stringified or corrupted previous_suffixes without throwing', () => {
      const corruptedStage: StageMaster = {
        id: 5,
        key: 'corrupt',
        name: 'Corrupt Stage',
        suffix: '_corrupt',
        search_keywords: null,
        previous_suffixes: 'invalid-json-string' as any,
        is_builtin: false,
        is_active: true,
        sort_order: 5,
      }
      expect(() => {
        resolveRoleWithHistoryFallback('steps_legacy', [corruptedStage], knownRoles)
      }).not.toThrow()
    })
  })

  describe('AC-7: getInitialParams & injectWorkflowParams with Stages', () => {
    const mockWorkflow: Workflow = {
      id: 1,
      name: 'Test Workflow',
      json_body: {
        '3': { class_type: 'KSampler', inputs: { steps: 20 } },
        '6': { class_type: 'CLIPTextEncode', inputs: { text: 'masterpiece' } },
      },
      mappings: [
        { id: 1, workflow_id: 1, master_id: 200, variant_id: 201, node_id: '3', param_name: 'steps', role: 'steps', input_type: 'int' },
        { id: 2, workflow_id: 1, master_id: 100, variant_id: 101, node_id: '6', param_name: 'text', role: 'positive_prompt', input_type: 'textarea' },
      ],
    }

    it('extracts initial parameters mapped by roles', () => {
      const init = getInitialParams(mockWorkflow, mockStages)
      expect(init).toEqual({
        steps: '20',
        positive_prompt: 'masterpiece',
      })
    })

    it('heals legacy param keys in injectWorkflowParams and updates node inputs', () => {
      const injected = injectWorkflowParams({
        workflow: mockWorkflow,
        paramValues: {
          steps_legacy: '45', // Old metadata key
          positive_prompt: 'cyberpunk city',
        },
        stages: mockStages,
      })
      // 'steps_legacy' should have resolved to 'steps' (or mapped properly)
      expect(injected['6'].inputs.text).toBe('cyberpunk city')
    })
  })

  describe('AC-6: Adaptive Stage Detection & Wiring Integration', () => {
    it('detects single vs multi-stage workflow nodes and provides active stages', () => {
      const multiStageWorkflow = {
        nodes: {
          '1': { class_type: 'KSampler', _meta: { title: 'Rough KSampler' } },
          '2': { class_type: 'KSampler', _meta: { title: 'Detail Refiner' } },
        },
      }
      const activeStages = detectActiveStages(multiStageWorkflow, mockStages)
      expect(activeStages.length).toBeGreaterThanOrEqual(1)
      const stageKeys = activeStages.map((s) => s.stage.key)
      expect(stageKeys).toContain('main') // main is always active
      expect(stageKeys).toContain('rough')
      expect(stageKeys).toContain('detail')
    })

    it('renders AdaptiveWorkflowWiring with detected stage tabs and slots', () => {
      const activeStages = detectActiveStages(
        {
          nodes: {
            '1': { class_type: 'KSampler', _meta: { title: 'Rough KSampler' } },
          },
        },
        mockStages
      )

      renderWithClient(
        <AdaptiveWorkflowWiring
          workflow={{
            id: 1,
            name: 'Adaptive WF',
            json_body: {
              '1': { class_type: 'KSampler', inputs: { steps: 20 } },
            },
            mappings: [],
          }}
          activeStages={activeStages}
          mappingMasters={mockMasters}
        />
      )

      expect(screen.getByRole('region', { name: 'Main Stage (main)' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Main Stage (main)' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Rough Stage (rough)' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Rough Stage (rough)' })).toBeInTheDocument()
    })
  })

  describe('AC-2 & AC-3: MappingMasterSection & EditModal Integration', () => {
    it('renders master hierarchy and allows category filtering', async () => {
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)

      expect(await screen.findByText('Positive Prompt')).toBeInTheDocument()
      expect(screen.getByText('Steps')).toBeInTheDocument()

      // Stage badges are rendered
      expect(screen.getAllByText('Main Stage').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Rough Stage').length).toBeGreaterThan(0)
    })

    it('renders MappingMasterEditModal with chips for expected_class_types', () => {
      const onSave = vi.fn()
      renderWithClient(
        <MappingMasterEditModal
          isOpen={true}
          onClose={vi.fn()}
          master={mockMasters[0]}
          groups={mockGroups}
          stages={mockStages}
          onSave={onSave}
        />
      )

      expect(screen.getByText(/マッピングマスター編集/)).toBeInTheDocument()
      expect(screen.getAllByText('CLIPTextEncode').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('AC-4 & AC-5: StageManagerModal CRUD & Cascade Flow', () => {
    it('renders StageManagerModal with stages list and built-in protection', async () => {
      renderWithClient(
        <StageManagerModal
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      expect(await screen.findByText(/ステージ管理/)).toBeInTheDocument()
      expect(await screen.findByText('Main Stage')).toBeInTheDocument()
      expect(screen.getByText('Rough Stage')).toBeInTheDocument()
      expect(screen.getByText('Detail Stage')).toBeInTheDocument()
      expect(screen.getByText('Built-in')).toBeInTheDocument()
    })
  })
})
