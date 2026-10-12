import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkflowConnectionSection } from '../pages/SettingsPage/components/WorkflowConnectionSection'

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), update: vi.fn(), mappingMasters: vi.fn(), stageMasters: vi.fn() }))
vi.mock('../api/client', () => ({
  workflowsApi: { list: api.list, get: api.get, update: api.update, getHistoryStatus: vi.fn().mockResolvedValue({ has_rollback: false }) },
  workflowPresetsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  snapshotsApi: { list: vi.fn().mockResolvedValue([]), get: vi.fn(), restore: vi.fn() },
  mappingMastersApi: { list: api.mappingMasters },
  baseModelsApi: { list: vi.fn().mockResolvedValue([{ id: 1, name: 'Model A' }, { id: 2, name: 'Model B' }]) },
}))
vi.mock('../api/domains/stageMasters', () => ({ stageMastersApi: { list: api.stageMasters } }))
vi.mock('../hooks/useConfig', () => ({ useConfig: () => ({ data: {} }) }))

const workflow = (target = 1, id = 7, roughNode = 'B') => ({
  id, name: id === 7 ? 'Workflow' : 'Other Workflow', created_at: '2026-01-01', json_body: { nodes: {
    A: { class_type: 'KSampler', title: 'Main sampler' },
    B: { class_type: 'KSampler', title: 'Rough sampler' },
    C: { class_type: 'KSampler', title: 'Rough sampler C' },
    D: { class_type: 'KSampler', title: 'Rough sampler D' },
  } },
  mappings: [{ master_id: 1, node_id: 'A', variant_id: 11 }, { master_id: 1, node_id: roughNode, variant_id: 12 }],
  target_base_model_id: target, default_applied_assets: null,
})
const props = {
  group: 'workflows' as const, isExpandedLongPress: false, onToggleLongPress: vi.fn(),
  isExpandedWorkflows: true, onToggleWorkflows: vi.fn(), isExpandedConnections: false,
  onToggleConnections: vi.fn(), showConnections: false,
}
function mount(client: QueryClient) {
  return render(<QueryClientProvider client={client}><WorkflowConnectionSection {...props} /></QueryClientProvider>)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
async function openSettings() {
  fireEvent.click(await screen.findByRole('button', { name: '対応付け・設定' }))
  await screen.findByRole('heading', { name: 'Workflow の対応付け' })
}

describe('REQ-347 Settings config draft session integration', () => {
  let client: QueryClient
  beforeEach(() => {
    api.mappingMasters.mockResolvedValue([{
      id: 1, group_id: null, base_key: 'steps', name: 'Steps', param_name: 'steps', input_type: 'int',
      expected_class_types: null, base_title_patterns: null, sort_order: 1,
      variants: [
        { id: 11, master_id: 1, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'Steps', extra_title_patterns: null, is_enabled: true },
        { id: 12, master_id: 1, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: 'Rough', custom_role_override: null, computed_role: 'Rough Steps', extra_title_patterns: null, is_enabled: true },
      ],
    }])
    api.stageMasters.mockResolvedValue([
      { id: 1, key: 'main', name: 'Main', suffix: '', search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 1 },
      { id: 2, key: 'rough', name: 'Rough', suffix: 'Rough', search_keywords: ['rough'], previous_suffixes: null, is_builtin: false, is_active: true, sort_order: 2 },
    ])
    api.list.mockResolvedValue([{ id: 7, name: 'Workflow', created_at: '2026-01-01' }])
    api.get.mockResolvedValue(workflow())
    api.update.mockResolvedValue(workflow())
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  })
  afterEach(() => { client.clear(); vi.clearAllMocks() })

  it('keeps a re-edited draft when the previous save and its refetch finish, then saves the latest value', async () => {
    const firstSave = deferred<unknown>()
    api.update.mockReturnValueOnce(firstSave.promise).mockResolvedValueOnce(workflow(2))
    api.get.mockResolvedValue(workflow(1))
    mount(client)
    await openSettings()
    const mainNode = await screen.findByRole('combobox', { name: /Main .*のノード/ })
    const roughNode = await screen.findByRole('combobox', { name: /Rough .*のノード/ })
    expect(mainNode).toHaveValue('A')
    expect(roughNode).toHaveValue('B')
    fireEvent.change(roughNode, { target: { value: 'C' } })
    const model = await screen.findByRole('combobox', { name: 'ベースモデル関連' })
    fireEvent.change(model, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1))
    fireEvent.change(model, { target: { value: '1' } })
    fireEvent.change(roughNode, { target: { value: 'D' } })
    api.get.mockResolvedValue(workflow(2, 7, 'C'))
    firstSave.resolve(workflow(2, 7, 'C'))
    await waitFor(() => expect(screen.getByText('変更は未保存です')).toBeTruthy())
    expect(model).toHaveValue('1')
    expect(mainNode).toHaveValue('A')
    expect(roughNode).toHaveValue('D')
    expect(screen.queryByText('設定を保存しました')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: '対応付けを保存' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2))
    expect(api.update.mock.calls[1][0]).toBe(7)
    expect(api.update.mock.calls[1][1].target_base_model_id).toBe(1)
    expect(api.update.mock.calls[1][1].mappings).toEqual([
      { master_id: 1, node_id: 'A', variant_id: 11 },
      { master_id: 1, node_id: 'D', variant_id: 12 },
    ])
    await screen.findByText('設定を保存しました')
  })

  it('does not show an old save rejection over a newer draft and does not retry automatically', async () => {
    const failedSave = deferred<unknown>()
    api.update.mockReturnValueOnce(failedSave.promise)
    mount(client)
    await openSettings()
    const model = await screen.findByRole('combobox', { name: 'ベースモデル関連' })
    fireEvent.change(model, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
    fireEvent.change(model, { target: { value: '1' } })
    failedSave.reject(new Error('old failure'))
    await waitFor(() => expect(screen.getByText('変更は未保存です')).toBeTruthy())
    expect(model).toHaveValue('1')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(api.update).toHaveBeenCalledTimes(1)
  })

  it('keeps a failed current snapshot marked unsaved and reports the failure', async () => {
    api.update.mockRejectedValueOnce(new Error('offline'))
    mount(client)
    await openSettings()
    fireEvent.change(await screen.findByRole('combobox', { name: 'ベースモデル関連' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存に失敗しました')
    expect(screen.getByText('変更は未保存です')).toBeTruthy()
  })

  it('blocks a warm cached form until the first GET hydrates and resets saved state when reopened', async () => {
    const firstGet = deferred<ReturnType<typeof workflow>>()
    api.list.mockResolvedValue([
      { id: 7, name: 'Workflow', created_at: '2026-01-01' },
      { id: 8, name: 'Other Workflow', created_at: '2026-01-01' },
    ])
    api.get.mockReturnValueOnce(firstGet.promise).mockResolvedValue(workflow(2, 7, 'C'))
    api.update.mockResolvedValue(workflow(2, 7, 'D'))
    client.setQueryData(['workflow-config', 7], workflow(1, 7, 'B'))
    mount(client)
    fireEvent.click((await screen.findAllByRole('button', { name: '対応付け・設定' }))[0])
    expect(await screen.findByText('設定を読み込み中...')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: /Main .*のノード/ })).toBeNull()
    expect(screen.queryByRole('combobox', { name: /Rough .*のノード/ })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'ベースモデル関連' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: '設定JSONをインポート' })).toBeNull()
    expect(screen.queryByRole('button', { name: '対応付けを保存' })).toBeNull()
    expect(api.update).not.toHaveBeenCalled()

    firstGet.resolve(workflow(2, 7, 'C'))
    const main = await screen.findByRole('combobox', { name: /Main .*のノード/ })
    const rough = await screen.findByRole('combobox', { name: /Rough .*のノード/ })
    const model = await screen.findByRole('combobox', { name: 'ベースモデル関連' })
    expect(main).toHaveValue('A')
    expect(rough).toHaveValue('C')
    expect(model).toHaveValue('2')

    fireEvent.change(rough, { target: { value: 'D' } })
    await client.invalidateQueries({ queryKey: ['workflow-config', 7] })
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    expect(rough).toHaveValue('D')
    expect(screen.getByText('変更は未保存です')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
    await screen.findByText('設定を保存しました')
    fireEvent.click(screen.getAllByRole('button', { name: '対応付け・設定' })[0])
    expect(screen.queryByText('設定を保存しました')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: '対応付け・設定' })[0])
    await screen.findByRole('combobox', { name: /Rough .*のノード/ })
    expect(screen.queryByText('設定を保存しました')).toBeNull()
  })

  it('isolates a completed save from a switched session and permits the new session to hydrate', async () => {
    const oldSave = deferred<unknown>()
    api.list.mockResolvedValue([
      { id: 7, name: 'Workflow', created_at: '2026-01-01' },
      { id: 8, name: 'Other Workflow', created_at: '2026-01-01' },
    ])
    api.get.mockImplementation((id: number) => Promise.resolve(workflow(id === 8 ? 2 : 1, id)))
    api.update.mockReturnValueOnce(oldSave.promise)
    client.setQueryData(['workflow', 7], { id: 7, marker: 'cached' })
    mount(client)
    const settingsButtons = await screen.findAllByRole('button', { name: '対応付け・設定' })
    fireEvent.click(settingsButtons[0])
    await screen.findByRole('heading', { name: 'Workflow の対応付け' })
    fireEvent.change(await screen.findByRole('combobox', { name: 'ベースモデル関連' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getAllByRole('button', { name: '対応付け・設定' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: '対応付け・設定' })[1])
    await screen.findByRole('heading', { name: 'Other Workflow の対応付け' })
    expect(await screen.findByRole('combobox', { name: 'ベースモデル関連' })).toHaveValue('2')
    oldSave.resolve(workflow(2))
    await waitFor(() => expect(client.getQueryState(['workflow', 7])?.isInvalidated).toBe(true))
    expect(screen.queryByText('設定を保存しました')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Other Workflow の対応付け' })).toBeTruthy()
    expect(api.get).toHaveBeenCalledWith(8)
    fireEvent.click(screen.getAllByRole('button', { name: '対応付け・設定' })[1])
    api.get.mockImplementation((id: number) => Promise.resolve(workflow(1, id)))
    fireEvent.click(screen.getAllByRole('button', { name: '対応付け・設定' })[1])
    await waitFor(() => expect(api.get.mock.calls.filter(([id]) => id === 8)).toHaveLength(2))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'ベースモデル関連' })).toHaveValue('1'))
  })
})
