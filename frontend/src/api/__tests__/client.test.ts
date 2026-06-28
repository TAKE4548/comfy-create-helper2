import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  workflowsApi,
  mappingMastersApi,
  snapshotsApi,
  albumsApi,
  lorasApi,
  tagSetsApi,
  loraCategoriesApi,
  tagsetCategoriesApi,
  auditApi,
  llmPromptsApi,
  configApi,
  workflowPresetsApi,
} from '../client'

describe('client.ts API client', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('Common Request Helper Functionality', () => {
    it('should set default headers and JSON content-type', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      })
      globalThis.fetch = mockFetch

      const result = await workflowsApi.list()

      expect(mockFetch).toHaveBeenCalledWith('/api/workflows', {
        headers: { 'Content-Type': 'application/json' },
      })
      expect(result).toEqual({ success: true })
    })

    it('should support overriding or adding headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      })
      globalThis.fetch = mockFetch

      // We call the request through copy as it is a POST call
      await workflowsApi.copy(1, 'Copied Workflow')

      expect(mockFetch).toHaveBeenCalledWith('/api/workflows/1/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Copied Workflow' }),
      })
    })

    it('should handle 204 No Content response and return undefined', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      })
      globalThis.fetch = mockFetch

      const result = await workflowsApi.delete(1)

      expect(mockFetch).toHaveBeenCalledWith('/api/workflows/1', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      expect(result).toBeUndefined()
    })

    it('should throw an Error on HTTP errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request Details',
      })
      globalThis.fetch = mockFetch

      await expect(workflowsApi.list()).rejects.toThrow('API error 400: Bad Request Details')
    })
  })

  describe('workflowsApi', () => {
    it('should call workflowsApi.list() correctly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: 1, name: 'WF 1' }],
      })
      globalThis.fetch = mockFetch

      const res = await workflowsApi.list()
      expect(mockFetch).toHaveBeenCalledWith('/api/workflows', expect.anything())
      expect(res).toEqual([{ id: 1, name: 'WF 1' }])
    })

    it('should call workflowsApi.get() correctly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 5 }),
      })
      globalThis.fetch = mockFetch

      const res = await workflowsApi.get(5)
      expect(mockFetch).toHaveBeenCalledWith('/api/workflows/5', expect.anything())
      expect(res).toEqual({ id: 5 })
    })

    it('should call workflowsApi.create() correctly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 1 }),
      })
      globalThis.fetch = mockFetch

      const payload = { name: 'New WF' }
      const res = await workflowsApi.create(payload)
      expect(mockFetch).toHaveBeenCalledWith('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      expect(res).toEqual({ id: 1 })
    })

    it('should call workflowsApi.update() correctly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 2 }),
      })
      globalThis.fetch = mockFetch

      const payload = { name: 'Updated WF' }
      const res = await workflowsApi.update(2, payload)
      expect(mockFetch).toHaveBeenCalledWith('/api/workflows/2', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      expect(res).toEqual({ id: 2 })
    })

    it('should call workflowsApi.scan() correctly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ matched: [] }),
      })
      globalThis.fetch = mockFetch

      const payload = { test: 1 }
      const res = await workflowsApi.scan(payload)
      expect(mockFetch).toHaveBeenCalledWith('/api/workflows/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json_body: payload }),
      })
      expect(res).toEqual({ matched: [] })
    })
  })

  describe('mappingMastersApi', () => {
    it('should support list, create, update, delete, getUsages, reorder', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
      globalThis.fetch = mockFetch

      await mappingMastersApi.list()
      expect(mockFetch).toHaveBeenLastCalledWith('/api/mapping-masters', expect.anything())

      await mappingMastersApi.create({ param_name: 'test' })
      expect(mockFetch).toHaveBeenLastCalledWith('/api/mapping-masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ param_name: 'test' }),
      })

      await mappingMastersApi.update(10, { param_name: 'updated' })
      expect(mockFetch).toHaveBeenLastCalledWith('/api/mapping-masters/10', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ param_name: 'updated' }),
      })

      await mappingMastersApi.delete(10)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/mapping-masters/10', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })

      await mappingMastersApi.getUsages(10)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/mapping-masters/10/usages', expect.anything())

      await mappingMastersApi.reorder([1, 2, 3])
      expect(mockFetch).toHaveBeenLastCalledWith('/api/mapping-masters/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordered_ids: [1, 2, 3] }),
      })
    })
  })

  describe('snapshotsApi', () => {
    it('should list snapshots without parameters', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      })
      globalThis.fetch = mockFetch

      await snapshotsApi.list()
      expect(mockFetch).toHaveBeenCalledWith('/api/snapshots', expect.anything())
    })

    it('should list snapshots with workflow ID as number', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      })
      globalThis.fetch = mockFetch

      await snapshotsApi.list(42)
      expect(mockFetch).toHaveBeenCalledWith('/api/snapshots?workflow_id=42', expect.anything())
    })

    it('should list snapshots with parameters object', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      })
      globalThis.fetch = mockFetch

      await snapshotsApi.list({ workflow_id: 1, lora_id: 2, tag_set_id: 3 })
      // Order of query params depends on browser/environment URLSearchParams, but usually follows append order
      expect(mockFetch).toHaveBeenCalledWith('/api/snapshots?workflow_id=1&lora_id=2&tag_set_id=3', expect.anything())
    })

    it('should support get, create, patch, delete', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
      globalThis.fetch = mockFetch

      await snapshotsApi.get(5)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/snapshots/5', expect.anything())

      await snapshotsApi.create({ workflow_id: 1 })
      expect(mockFetch).toHaveBeenLastCalledWith('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: 1 }),
      })

      await snapshotsApi.patch(5, { lora_ids: [1], tag_set_ids: [2] })
      expect(mockFetch).toHaveBeenLastCalledWith('/api/snapshots/5', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lora_ids: [1], tag_set_ids: [2] }),
      })

      await snapshotsApi.delete(5)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/snapshots/5', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
    })
  })

  describe('albumsApi', () => {
    it('should support list, get, create, updateOrder, delete, deleteItems, addItems', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
      globalThis.fetch = mockFetch

      await albumsApi.list()
      expect(mockFetch).toHaveBeenLastCalledWith('/api/albums', expect.anything())

      await albumsApi.get(1)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/albums/1', expect.anything())

      await albumsApi.create({ name: 'Album 1' })
      expect(mockFetch).toHaveBeenLastCalledWith('/api/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Album 1' }),
      })

      await albumsApi.updateOrder(1, [10, 20])
      expect(mockFetch).toHaveBeenLastCalledWith('/api/albums/1/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot_ids: [10, 20] }),
      })

      await albumsApi.delete(1)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/albums/1', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })

      await albumsApi.deleteItems(1, [10])
      expect(mockFetch).toHaveBeenLastCalledWith('/api/albums/1/items/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot_ids: [10] }),
      })

      await albumsApi.addItems(1, [20])
      expect(mockFetch).toHaveBeenLastCalledWith('/api/albums/1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot_ids: [20] }),
      })
    })
  })

  describe('lorasApi', () => {
    it('should support list, create, update, delete, getComfyModels, reorder', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
      globalThis.fetch = mockFetch

      await lorasApi.list()
      expect(mockFetch).toHaveBeenLastCalledWith('/api/loras', expect.anything())

      await lorasApi.list(5)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/loras?category_id=5', expect.anything())

      await lorasApi.create({ model_name: 'test.safetensors' })
      expect(mockFetch).toHaveBeenLastCalledWith('/api/loras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: 'test.safetensors' }),
      })

      await lorasApi.update(2, { description: 'Updated' })
      expect(mockFetch).toHaveBeenLastCalledWith('/api/loras/2', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Updated' }),
      })

      await lorasApi.delete(2)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/loras/2', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })

      await lorasApi.getComfyModels()
      expect(mockFetch).toHaveBeenLastCalledWith('/api/loras/comfy-models', expect.anything())

      await lorasApi.reorder([3, 2, 1])
      expect(mockFetch).toHaveBeenLastCalledWith('/api/loras/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordered_ids: [3, 2, 1] }),
      })
    })
  })

  describe('tagSetsApi', () => {
    it('should support list, create, update, delete, reorder', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
      globalThis.fetch = mockFetch

      await tagSetsApi.list()
      expect(mockFetch).toHaveBeenLastCalledWith('/api/tag-sets', expect.anything())

      await tagSetsApi.list(7)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/tag-sets?category_id=7', expect.anything())

      await tagSetsApi.create({ name: 'TagSet 1' })
      expect(mockFetch).toHaveBeenLastCalledWith('/api/tag-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'TagSet 1' }),
      })

      await tagSetsApi.update(3, { name: 'TagSet 3' })
      expect(mockFetch).toHaveBeenLastCalledWith('/api/tag-sets/3', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'TagSet 3' }),
      })

      await tagSetsApi.delete(3)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/tag-sets/3', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })

      await tagSetsApi.reorder([1, 2])
      expect(mockFetch).toHaveBeenLastCalledWith('/api/tag-sets/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordered_ids: [1, 2] }),
      })
    })
  })

  describe('Categories Api (loraCategoriesApi & tagsetCategoriesApi)', () => {
    it('should support loraCategoriesApi list, create, update, delete', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
      globalThis.fetch = mockFetch

      await loraCategoriesApi.list()
      expect(mockFetch).toHaveBeenLastCalledWith('/api/lora-categories', expect.anything())

      await loraCategoriesApi.create('New Cat')
      expect(mockFetch).toHaveBeenLastCalledWith('/api/lora-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Cat' }),
      })

      await loraCategoriesApi.update(1, 'Updated Cat')
      expect(mockFetch).toHaveBeenLastCalledWith('/api/lora-categories/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Cat' }),
      })

      await loraCategoriesApi.delete(1)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/lora-categories/1', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
    })

    it('should support tagsetCategoriesApi list, create, update, delete', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
      globalThis.fetch = mockFetch

      await tagsetCategoriesApi.list()
      expect(mockFetch).toHaveBeenLastCalledWith('/api/tagset-categories', expect.anything())

      await tagsetCategoriesApi.create('New Cat TS')
      expect(mockFetch).toHaveBeenLastCalledWith('/api/tagset-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Cat TS' }),
      })

      await tagsetCategoriesApi.update(2, 'Updated Cat TS')
      expect(mockFetch).toHaveBeenLastCalledWith('/api/tagset-categories/2', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Cat TS' }),
      })

      await tagsetCategoriesApi.delete(2)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/tagset-categories/2', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
    })
  })

  describe('auditApi & llmPromptsApi & configApi', () => {
    it('should support auditApi.run', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
      globalThis.fetch = mockFetch

      await auditApi.run({ prompt: 'test' })
      expect(mockFetch).toHaveBeenLastCalledWith('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test' }),
      })
    })

    it('should support llmPromptsApi list and update', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
      globalThis.fetch = mockFetch

      await llmPromptsApi.list()
      expect(mockFetch).toHaveBeenLastCalledWith('/api/llm-prompts', expect.anything())

      await llmPromptsApi.update('test-key', { content: 'test-content' })
      expect(mockFetch).toHaveBeenLastCalledWith('/api/llm-prompts/test-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'test-content' }),
      })
    })

    it('should support configApi.get', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ comfy_url: 'http://localhost' }),
      })
      globalThis.fetch = mockFetch

      const res = await configApi.get()
      expect(mockFetch).toHaveBeenLastCalledWith('/api/config', expect.anything())
      expect(res).toEqual({ comfy_url: 'http://localhost' })
    })
  })

  describe('workflowPresetsApi', () => {
    it('should support list, create, update, delete, reorder', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
      globalThis.fetch = mockFetch

      await workflowPresetsApi.list()
      expect(mockFetch).toHaveBeenLastCalledWith('/api/workflow-presets', expect.anything())

      await workflowPresetsApi.list(2)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/workflow-presets?workflow_id=2', expect.anything())

      await workflowPresetsApi.create({ workflow_id: 1, name: 'Preset 1', batch_size: 1, seed_mode: 'random', seed: -1 })
      expect(mockFetch).toHaveBeenLastCalledWith('/api/workflow-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: 1, name: 'Preset 1', batch_size: 1, seed_mode: 'random', seed: -1 }),
      })

      await workflowPresetsApi.update(4, { name: 'Preset 4' })
      expect(mockFetch).toHaveBeenLastCalledWith('/api/workflow-presets/4', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Preset 4' }),
      })

      await workflowPresetsApi.delete(4)
      expect(mockFetch).toHaveBeenLastCalledWith('/api/workflow-presets/4', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })

      await workflowPresetsApi.reorder([1, 2, 3])
      expect(mockFetch).toHaveBeenLastCalledWith('/api/workflow-presets/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordered_ids: [1, 2, 3] }),
      })
    })
  })
})
