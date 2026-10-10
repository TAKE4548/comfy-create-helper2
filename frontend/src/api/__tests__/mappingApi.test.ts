import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
} from '../types'

describe('mappingApi domain clients (REQ-336)', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
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
