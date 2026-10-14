import { describe, it, expect, expectTypeOf, vi, beforeEach, afterEach } from 'vitest'
import { stageMastersApi } from '../domains/stageMasters'
import { mappingGroupsApi } from '../domains/mappingGroups'
import { mappingMastersApi } from '../domains/mappingMasters'
import type {
  StageMaster,
  StageMasterCreate,
  StageMasterUpdate,
  MappingGroupMaster,
  MappingGroupMasterCreate,
  MappingGroupMasterUpdate,
  MappingMasterV2,
  MappingMasterV2Create,
  MappingMasterV2Update,
  MappingVariant,
  CascadePreviewResult,
  CascadeRenamePayload,
  MappingMaster,
  MappingMasterCreate,
  Workflow,
  WorkflowCreate,
  WorkflowUpdate,
} from '../types'

describe('mappingApi domain clients (REQ-336)', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('stageMastersApi', () => {
    it('list calls /api/stage-masters with default include_inactive=true', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: 1, key: 'main', name: 'Main', suffix: '', is_builtin: true, is_active: true, sort_order: 0, search_keywords: null, previous_suffixes: null }],
      })
      globalThis.fetch = mockFetch

      const res = await stageMastersApi.list()
      expect(mockFetch).toHaveBeenCalledWith('/api/stage-masters?include_inactive=true', expect.anything())
      expect(res).toHaveLength(1)
      expect(res[0].key).toBe('main')
    })

    it('list respects include_inactive=false', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      })
      globalThis.fetch = mockFetch

      await stageMastersApi.list(false)
      expect(mockFetch).toHaveBeenCalledWith('/api/stage-masters?include_inactive=false', expect.anything())
    })

    it('get calls /api/stage-masters/:id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 2, key: 'rough', name: 'Rough', suffix: '_rough' }),
      })
      globalThis.fetch = mockFetch

      const res = await stageMastersApi.get(2)
      expect(mockFetch).toHaveBeenCalledWith('/api/stage-masters/2', expect.anything())
      expect(res.suffix).toBe('_rough')
    })

    it('create calls POST /api/stage-masters', async () => {
      const payload: StageMasterCreate = {
        key: 'detail',
        name: 'Detail',
        suffix: '_detail',
        is_builtin: false,
        is_active: true,
        sort_order: 2,
      }
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: 3, ...payload }),
      })
      globalThis.fetch = mockFetch

      const res = await stageMastersApi.create(payload)
      expect(mockFetch).toHaveBeenCalledWith('/api/stage-masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      expect(res.id).toBe(3)
    })

    it('update calls PUT /api/stage-masters/:id', async () => {
      const payload: StageMasterUpdate = { name: 'Updated Detail', suffix: '_draft' }
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 3, key: 'detail', ...payload }),
      })
      globalThis.fetch = mockFetch

      const res = await stageMastersApi.update(3, payload)
      expect(mockFetch).toHaveBeenCalledWith('/api/stage-masters/3', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      expect(res.name).toBe('Updated Detail')
    })

    it('delete calls DELETE /api/stage-masters/:id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      })
      globalThis.fetch = mockFetch

      await stageMastersApi.delete(3)
      expect(mockFetch).toHaveBeenCalledWith('/api/stage-masters/3', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
    })

    it('reorder calls PUT /api/stage-masters/reorder', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      })
      globalThis.fetch = mockFetch

      await stageMastersApi.reorder([3, 1, 2])
      expect(mockFetch).toHaveBeenCalledWith('/api/stage-masters/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordered_ids: [3, 1, 2] }),
      })
    })

    it('getUsages calls GET /api/stage-masters/:id/usages', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ mapping_id: 10, workflow_id: 1, workflow_name: 'WF', node_id: '5', variant_id: 2 }],
      })
      globalThis.fetch = mockFetch

      const res = await stageMastersApi.getUsages(2)
      expect(mockFetch).toHaveBeenCalledWith('/api/stage-masters/2/usages', expect.anything())
      expect(res).toHaveLength(1)
      expect(res[0].mapping_id).toBe(10)
    })

    it('cascadePreview calls GET /api/stage-masters/:id/cascade-preview', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          stage_id: 2,
          old_suffix: '_rough',
          new_suffix: '_draft',
          affected_variants_count: 3,
          affected_presets_count: 2,
          affected_snapshots_count: 1,
          role_diffs: [{ old_role: 'prompt_rough', new_role: 'prompt_draft' }],
        }),
      })
      globalThis.fetch = mockFetch

      const res = await stageMastersApi.cascadePreview(2, '_draft')
      expect(mockFetch).toHaveBeenCalledWith('/api/stage-masters/2/cascade-preview?new_suffix=_draft', expect.anything())
      expect(res.affected_variants_count).toBe(3)
      expect(res.role_diffs).toHaveLength(1)
    })

    it('cascadeRename calls POST /api/stage-masters/:id/cascade-rename', async () => {
      const payload: CascadeRenamePayload = {
        new_suffix: '_draft',
        update_presets: true,
        update_snapshots: true,
      }
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 2,
          key: 'rough',
          name: 'Rough',
          suffix: '_draft',
          previous_suffixes: ['_rough'],
          is_builtin: true,
          is_active: true,
          sort_order: 1,
        }),
      })
      globalThis.fetch = mockFetch

      const res = await stageMastersApi.cascadeRename(2, payload)
      expect(mockFetch).toHaveBeenCalledWith('/api/stage-masters/2/cascade-rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      expect(res.suffix).toBe('_draft')
      expect(res.previous_suffixes).toEqual(['_rough'])
    })
  })

  describe('mappingGroupsApi', () => {
    it('list calls /api/mapping-groups with include_inactive query param', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: 1, key: 'prompt', name: 'Prompt', sort_order: 0, is_builtin: true, is_active: true, master_count: 4 }],
      })
      globalThis.fetch = mockFetch

      const res = await mappingGroupsApi.list()
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-groups?include_inactive=true', expect.anything())
      expect(res).toHaveLength(1)
      expect(res[0].name).toBe('Prompt')
    })

    it('get calls /api/mapping-groups/:id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 1, key: 'prompt', name: 'Prompt', sort_order: 0, is_builtin: true, is_active: true }),
      })
      globalThis.fetch = mockFetch

      const res = await mappingGroupsApi.get(1)
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-groups/1', expect.anything())
      expect(res.key).toBe('prompt')
    })

    it('create calls POST /api/mapping-groups', async () => {
      const payload: MappingGroupMasterCreate = { key: 'sampler', name: 'Sampler', sort_order: 1, is_active: true }
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: 2, ...payload, is_builtin: false, master_count: 0 }),
      })
      globalThis.fetch = mockFetch

      const res = await mappingGroupsApi.create(payload)
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      expect(res.id).toBe(2)
    })

    it('update calls PUT /api/mapping-groups/:id', async () => {
      const payload: MappingGroupMasterUpdate = { name: 'Updated Sampler' }
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 2, key: 'sampler', name: 'Updated Sampler', sort_order: 1, is_builtin: false, is_active: true }),
      })
      globalThis.fetch = mockFetch

      const res = await mappingGroupsApi.update(2, payload)
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-groups/2', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      expect(res.name).toBe('Updated Sampler')
    })

    it('delete calls DELETE /api/mapping-groups/:id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      })
      globalThis.fetch = mockFetch

      await mappingGroupsApi.delete(2)
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-groups/2', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
    })

    it('reorder calls PUT /api/mapping-groups/reorder', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      })
      globalThis.fetch = mockFetch

      await mappingGroupsApi.reorder([2, 1])
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-groups/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordered_ids: [2, 1] }),
      })
    })
  })

  describe('mappingMastersApi (2-axis structure)', () => {
    it('list calls /api/mapping-masters without group_id when omitted', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      })
      globalThis.fetch = mockFetch

      await mappingMastersApi.list()
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-masters', expect.anything())
    })

    it('list appends ?group_id=... when groupId is provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      })
      globalThis.fetch = mockFetch

      await mappingMastersApi.list(5)
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-masters?group_id=5', expect.anything())
    })

    it('get calls /api/mapping-masters/:id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 10,
          group_id: 1,
          base_key: 'prompt',
          name: 'Prompt',
          param_name: 'text',
          input_type: 'textarea',
          variants: [
            { id: 101, master_id: 10, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', computed_role: 'prompt', is_enabled: true },
          ],
        }),
      })
      globalThis.fetch = mockFetch

      const res = await mappingMastersApi.get(10)
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-masters/10', expect.anything())
      expect(res.variants).toHaveLength(1)
      expect(res.variants[0].computed_role).toBe('prompt')
    })

    it('create calls POST /api/mapping-masters with V2 payload', async () => {
      const payload: MappingMasterV2Create = {
        base_key: 'denoise',
        name: 'Denoise',
        param_name: 'denoise',
        input_type: 'float',
        group_id: 2,
        expected_class_types: ['KSampler'],
        base_title_patterns: ['Denoise*'],
      }
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: 20, ...payload, sort_order: 1, variants: [] }),
      })
      globalThis.fetch = mockFetch

      const res = await mappingMastersApi.create(payload)
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      expect(res.id).toBe(20)
    })

    it('update calls PUT /api/mapping-masters/:id with variants', async () => {
      const payload: MappingMasterV2Update = {
        name: 'Updated Denoise',
        variants: [
          { stage_id: 2, custom_role_override: 'custom_denoise_rough', is_enabled: true },
        ],
      }
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 20, base_key: 'denoise', name: 'Updated Denoise', variants: [] }),
      })
      globalThis.fetch = mockFetch

      const res = await mappingMastersApi.update(20, payload)
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-masters/20', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      expect(res.name).toBe('Updated Denoise')
    })

    it('delete calls DELETE /api/mapping-masters/:id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      })
      globalThis.fetch = mockFetch

      await mappingMastersApi.delete(20)
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-masters/20', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
    })

    it('getUsages calls GET /api/mapping-masters/:id/usages', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ workflow_id: 1, workflow_name: 'WF', node_id: '12' }],
      })
      globalThis.fetch = mockFetch

      const res = await mappingMastersApi.getUsages(20)
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-masters/20/usages', expect.anything())
      expect(res).toHaveLength(1)
    })

    it('reorder calls PUT /api/mapping-masters/reorder', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      })
      globalThis.fetch = mockFetch

      await mappingMastersApi.reorder([20, 10])
      expect(mockFetch).toHaveBeenCalledWith('/api/mapping-masters/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordered_ids: [20, 10] }),
      })
    })
  })
})

describe('REQ-358/API_TYPES', () => {
  it('[REQ-358/AC-19] preserves optional master default_enabled types', () => {
    const legacyMaster: MappingMaster = {
      id: 1,
      role: 'prompt',
      expected_class_types: ['TextEncode'],
      param_name: 'text',
      input_type: 'textarea',
      display_name: 'Prompt',
      title_patterns: null,
      sort_order: 0,
    }
    const masterCreate: MappingMasterCreate = {
      role: 'prompt',
      param_name: 'text',
      input_type: 'textarea',
      display_name: 'Prompt',
      default_enabled: false,
    }

    expectTypeOf<MappingMaster['default_enabled']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<MappingMasterCreate['default_enabled']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<MappingMasterV2['default_enabled']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<MappingMasterV2Create['default_enabled']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<MappingMasterV2Update['default_enabled']>().toEqualTypeOf<boolean | undefined>()
    expect(legacyMaster.default_enabled).toBeUndefined()
    expect(masterCreate.default_enabled).toBe(false)
    // @ts-expect-error null is outside the optional boolean contract
    const invalidMaster: MappingMasterCreate = { ...masterCreate, default_enabled: null }
    void invalidMaster
  })

  it('[REQ-358/AC-26] allows optional mapping_slot_states and false values', () => {
    const legacyWorkflow: Workflow = {
      id: 1,
      name: 'Legacy',
      json_body: {},
      mappings: [],
      created_at: '2026-01-01T00:00:00Z',
    }
    const legacyCreate: WorkflowCreate = { name: 'Legacy', json_body: {}, mappings: [] }
    const emptyUpdate: WorkflowUpdate = {}
    const states: Workflow['mapping_slot_states'] = { 'v:1': false, 'm:2': true }
    const updatedWorkflow: WorkflowUpdate = { mapping_slot_states: states }

    expectTypeOf<Workflow['mapping_slot_states']>().toEqualTypeOf<Record<string, boolean> | undefined>()
    expectTypeOf<WorkflowCreate['mapping_slot_states']>().toEqualTypeOf<Record<string, boolean> | undefined>()
    expectTypeOf<WorkflowUpdate['mapping_slot_states']>().toEqualTypeOf<Record<string, boolean> | undefined>()
    expect(legacyWorkflow.mapping_slot_states).toBeUndefined()
    expect(legacyCreate.mapping_slot_states).toBeUndefined()
    expect(emptyUpdate.mapping_slot_states).toBeUndefined()
    expect(updatedWorkflow.mapping_slot_states).toEqual({ 'v:1': false, 'm:2': true })
    // @ts-expect-error slot states accept boolean values only
    const invalidStates: WorkflowUpdate = { mapping_slot_states: { 'v:1': null } }
    void invalidStates
  })

  it('[REQ-358/AC-31] supports legacy read defaults without making state required', () => {
    const master: MappingMaster = {
      id: 2,
      role: 'sampler',
      expected_class_types: null,
      param_name: 'sampler_name',
      input_type: 'select_sampler',
      display_name: 'Sampler',
      title_patterns: [],
      sort_order: 1,
    }
    const workflow: Workflow = {
      id: 2,
      name: 'Old workflow',
      json_body: {},
      mappings: [],
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(master.default_enabled ?? true).toBe(true)
    expect(workflow.mapping_slot_states ?? {}).toEqual({})
  })
})
