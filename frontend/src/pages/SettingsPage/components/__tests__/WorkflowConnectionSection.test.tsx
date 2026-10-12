import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkflowConnectionSection } from '../WorkflowConnectionSection'
import { LS_KEYS } from '../../../../utils/localStorageKeys'

const api = vi.hoisted(() => ({
  workflowsApi: {
    list: vi.fn(), get: vi.fn(), getHistoryStatus: vi.fn(), update: vi.fn(), copy: vi.fn(),
    delete: vi.fn(), diffAnalyze: vi.fn(), rollback: vi.fn(),
  },
  workflowPresetsApi: { list: vi.fn(), update: vi.fn(), reorder: vi.fn() },
  snapshotsApi: { list: vi.fn() },
  mappingMastersApi: { list: vi.fn() },
  baseModelsApi: { list: vi.fn() },
  stageMastersApi: { list: vi.fn() },
}))

vi.mock('../../../../api/client', () => api)
vi.mock('../../../../api/domains/stageMasters', () => ({ stageMastersApi: api.stageMastersApi }))
vi.mock('../../../../hooks/useConfig', () => ({ useConfig: () => ({ data: { comfy_url: 'http://localhost:8188' } }) }))
vi.mock('../../../../hooks/useComfyWebSocket', () => ({ resolveComfyUrl: (url: string) => url }))
vi.mock('../../../../store/useGenerationStore', () => ({ useGenerationStore: (selector: (state: any) => unknown) => selector({ comfyUrl: null, setComfyUrl: vi.fn() }) }))
vi.mock('../ServiceConnectionCard', () => ({ ServiceConnectionCard: () => <div>Service Connection Card</div> }))
vi.mock('../../../../components/WorkflowManageModal', () => ({
  WorkflowManageModal: ({ mode, onSubmit }: any) => <button onClick={() => onSubmit('Renamed')}>{mode}-submit</button>,
}))
vi.mock('../../../../components/WorkflowDiffReplaceModal', () => ({
  WorkflowDiffReplaceModal: ({ onConfirm }: any) => <button onClick={() => onConfirm([{ master_id: 1, node_id: '2' }])}>confirm-diff</button>,
}))
vi.mock('../../../../components/PresetManagerPanel', () => ({ PresetManagerPanel: () => <div>Preset manager</div> }))
vi.mock('../../../../components/SettingsComponents', () => ({
  ConnectionStatus: ({ label }: any) => <div>{label}</div>,
  WorkflowDeleteConfirmDialog: () => <div>Delete workflow dialog</div>,
}))

const workflow = { id: 1, name: 'Example workflow', created_at: '2026-01-01T00:00:00Z' }

function renderSection(props: Partial<React.ComponentProps<typeof WorkflowConnectionSection>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkflowConnectionSection
        isExpandedLongPress
        onToggleLongPress={vi.fn()}
        isExpandedWorkflows
        onToggleWorkflows={vi.fn()}
        isExpandedConnections
        onToggleConnections={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('WorkflowConnectionSection groups', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    api.workflowsApi.list.mockResolvedValue([workflow])
    api.workflowsApi.getHistoryStatus.mockResolvedValue({ has_rollback: true })
    api.workflowsApi.get.mockResolvedValue({ id: 1, name: 'Example workflow', json_body: { nodes: { '2': { class_type: 'KSampler', inputs: { steps: 20 } } } }, mappings: [{ id: 4, master_id: 1, node_id: '2', role: 'sampling', param_name: 'steps' }], target_base_model_id: 1, default_applied_assets: null })
    api.workflowsApi.update.mockResolvedValue(workflow)
    api.workflowsApi.copy.mockResolvedValue(workflow)
    api.workflowsApi.diffAnalyze.mockResolvedValue({ changes: [] })
    api.workflowsApi.rollback.mockResolvedValue(undefined)
    api.workflowPresetsApi.list.mockResolvedValue([])
    api.snapshotsApi.list.mockResolvedValue([])
    api.stageMastersApi.list.mockResolvedValue([{
      id: 1,
      key: 'main',
      name: 'Main',
      suffix: '',
      search_keywords: null,
      previous_suffixes: null,
      is_builtin: true,
      is_active: true,
      sort_order: 0,
    }])
    api.mappingMastersApi.list.mockResolvedValue([{ id: 1, role: 'sampling', param_name: 'steps', input_type: 'int', display_name: 'Steps' }, { id: 2, role: 'sampling', param_name: 'cfg', input_type: 'float', display_name: 'CFG' }])
    api.baseModelsApi.list.mockResolvedValue([{ id: 1, name: 'SD 1.5' }, { id: 2, name: 'SDXL' }])
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('isolates the system group and does not fetch workflows', async () => {
    renderSection({ group: 'system', isExpandedWorkflows: false, isExpandedConnections: false })

    expect(screen.getByText('長押し感度設定（アプリ全体）')).toBeTruthy()
    expect(screen.getByText('Service Connection Card')).toBeTruthy()
    expect(screen.queryByText('ワークフロー管理')).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.workflowsApi.list).not.toHaveBeenCalled()
  })

  it('can hide only the service connection card in the system group', () => {
    renderSection({ group: 'system', showConnections: false, isExpandedWorkflows: false, isExpandedConnections: false })

    expect(screen.queryByText('Service Connection Card')).toBeNull()
    expect(screen.getByText('長押し感度設定（アプリ全体）')).toBeTruthy()
  })

  it('keeps workflow controls and submits rename/copy payloads in the workflows group', async () => {
    renderSection({ group: 'workflows', isExpandedLongPress: false, isExpandedConnections: false })
    await screen.findByText('Example workflow')
    expect(screen.queryByText('長押し感度設定（アプリ全体）')).toBeNull()
    expect(screen.queryByText('Service Connection Card')).toBeNull()
    expect(screen.getByText('ワークフロー管理')).toBeTruthy()

    fireEvent.click(screen.getByTitle('名前を変更'))
    fireEvent.click(await screen.findByText('rename-submit'))
    await waitFor(() => expect(api.workflowsApi.update).toHaveBeenCalledWith(1, { name: 'Renamed' }))

    fireEvent.click(screen.getByTitle('コピーを作成'))
    fireEvent.click(await screen.findByText('copy-submit'))
    await waitFor(() => expect(api.workflowsApi.copy).toHaveBeenCalledWith(1, 'Renamed'))
  })

  it('keeps diff replacement and rollback actions available only with workflows', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { container } = renderSection({ group: 'workflows', isExpandedLongPress: false, isExpandedConnections: false })
    await screen.findByText('Example workflow')

    fireEvent.click(screen.getByTitle('新ワークフローJSONとのスマート差分置換'))
    const file = new File(['{"nodes":{}}'], 'workflow.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => '{"nodes":{}}' })
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } })
    await waitFor(() => expect(api.workflowsApi.diffAnalyze).toHaveBeenCalledWith(1, { nodes: {} }))
    fireEvent.click(await screen.findByText('confirm-diff'))
    await waitFor(() => expect(api.workflowsApi.update).toHaveBeenCalledWith(1, {
      json_body: { nodes: {} }, mappings: [{ master_id: 1, node_id: '2' }],
    }))

    fireEvent.click(await screen.findByTitle('直前のワークフロー状態へ復元'))
    await waitFor(() => expect(api.workflowsApi.rollback).toHaveBeenCalledWith(1))
    confirm.mockRestore()
  })

  it('persists long-press controls with the existing local storage keys', () => {
    const { container } = renderSection({ group: 'system', isExpandedWorkflows: false, isExpandedConnections: false })
    fireEvent.change(container.querySelector('#settings-longpress-multiselect'), { target: { value: '1.4' } })
    expect(screen.getByText('設定を保存しました')).toBeInTheDocument()
    fireEvent.change(container.querySelector('#settings-longpress-cardmove'), { target: { value: '2.2' } })
    expect(localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_MULTI_SELECT)).toBe('1.4')
    expect(localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_CARD_MOVE)).toBe('2.2')
    expect(screen.getByText('設定を保存しました')).toBeInTheDocument()
  })

  it('uses defaults and keeps session changes when browser storage rejects access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage denied', 'SecurityError')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage denied', 'SecurityError')
    })

    const { container } = renderSection({ group: 'system', isExpandedWorkflows: false, isExpandedConnections: false })
    const multiSelect = container.querySelector<HTMLInputElement>('#settings-longpress-multiselect')!
    const cardMove = container.querySelector<HTMLInputElement>('#settings-longpress-cardmove')!
    expect(multiSelect.value).toBe('0.8')
    expect(cardMove.value).toBe('0.5')

    fireEvent.change(multiSelect, { target: { value: '1.3' } })
    fireEvent.change(cardMove, { target: { value: '2.1' } })

    expect(multiSelect.value).toBe('1.3')
    expect(cardMove.value).toBe('2.1')
    expect(setItem).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('alert')).toHaveTextContent('Storage denied')
    expect(screen.getByRole('alert')).toHaveTextContent('設定は未保存です')
    expect(screen.queryByText('設定を保存しました')).toBeNull()
  })

  it('edits role-node-widget mapping and base model in one workflow update', async () => {
    renderSection({ group: 'workflows', isExpandedConnections: false })
    await screen.findByText('Example workflow')
    fireEvent.click(screen.getByRole('button', { name: '対応付け・設定' }))
    await screen.findByText((_, node) => node?.textContent === 'sampling → steps')
    expect(screen.getByText((_, node) => node?.textContent === 'sampling → steps')).toBeTruthy()
    const mainStage = within(screen.getByRole('region', { name: 'Main (main)' }))
    expect(mainStage.getByRole('combobox', { name: 'Main sampling → cfg のノード' })).toBeInTheDocument()
    fireEvent.change(mainStage.getByRole('combobox', { name: 'Main sampling → steps のノード' }), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('ベースモデル関連'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
    await waitFor(() => expect(api.workflowsApi.update).toHaveBeenCalledWith(1, expect.objectContaining({
      json_body: { nodes: { '2': { class_type: 'KSampler', inputs: { steps: 20 } } } },
      mappings: [{ master_id: 1, node_id: '2' }],
      target_base_model_id: 2,
    })))
    expect(await screen.findByRole('status')).toHaveTextContent('設定を保存しました')
  })

  it('reports workflow save failure without losing the current mapping draft', async () => {
    api.workflowsApi.update.mockRejectedValueOnce(new Error('workflow storage unavailable'))
    renderSection({ group: 'workflows', isExpandedConnections: false })
    await screen.findByText('Example workflow')
    fireEvent.click(screen.getByRole('button', { name: '対応付け・設定' }))
    await screen.findByLabelText('ベースモデル関連')
    fireEvent.change(screen.getByLabelText('ベースモデル関連'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('workflow storage unavailable')
    expect(screen.getByRole('alert')).toHaveTextContent('設定は未保存です')
    expect(screen.getByLabelText('ベースモデル関連')).toHaveValue('2')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('previews import without mutation, rejects unknown nodes, and applies only after inline confirmation', async () => {
    renderSection({ group: 'workflows', isExpandedConnections: false })
    await screen.findByText('Example workflow')
    fireEvent.click(screen.getByRole('button', { name: '対応付け・設定' }))
    await screen.findByText((_, node) => node?.textContent === 'sampling → steps')
    const payload = { format: 'prompt-surgeon-workflow-config', version: 1, name: 'Imported', json_body: { nodes: { '8': { class_type: 'KSampler', inputs: {} } } }, mappings: [{ master_id: 1, node_id: '9' }], target_base_model_id: 2, default_applied_assets: null }
    fireEvent.click(screen.getByRole('button', { name: '設定JSONをエクスポート' }))
    const exported = JSON.parse((screen.getByLabelText('エクスポートJSON') as HTMLTextAreaElement).value)
    expect(exported).toMatchObject({ format: 'prompt-surgeon-workflow-config', version: 1, name: 'Example workflow', mappings: [{ master_id: 1, node_id: '2' }], target_base_model_id: 1, default_applied_assets: null })
    const input = screen.getByLabelText('設定JSONをインポート')
    fireEvent.change(input, { target: { value: JSON.stringify(payload) } })
    fireEvent.click(screen.getByRole('button', { name: 'インポート内容を確認' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/ノードIDが不正/)
    expect(api.workflowsApi.update).not.toHaveBeenCalled()

    for (const invalid of [
      { ...payload, version: 2 },
      { ...payload, mappings: [{ master_id: 999, node_id: '8' }] },
      { ...payload, mappings: [{ master_id: 1, node_id: '8' }, { master_id: 1, node_id: '8' }] },
      { ...payload, mappings: [{ master_id: 1, node_id: '8' }], target_base_model_id: 99 },
    ]) {
      fireEvent.change(input, { target: { value: JSON.stringify(invalid) } })
      fireEvent.click(screen.getByRole('button', { name: 'インポート内容を確認' }))
      expect(await screen.findByRole('alert')).toBeTruthy()
      expect(api.workflowsApi.update).not.toHaveBeenCalled()
    }

    const valid = { ...payload, mappings: [{ master_id: 1, node_id: '8' }] }
    fireEvent.change(input, { target: { value: JSON.stringify(valid) } })
    fireEvent.click(screen.getByRole('button', { name: 'インポート内容を確認' }))
    expect(await screen.findByText(/Example workflow.*1件/)).toBeTruthy()
    expect(api.workflowsApi.update).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '適用を確認' }))
    expect(screen.getByText(/Example workflow \/ 1件/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'プレビューを解除' }))
    expect(api.workflowsApi.update).not.toHaveBeenCalled()
    expect(input).toHaveValue(JSON.stringify(valid))
    expect(screen.queryByText(/Example workflow \/ 1件/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'インポート内容を確認' }))
    expect(await screen.findByText(/Example workflow.*1件/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '適用を確認' }))
    fireEvent.click(screen.getByRole('button', { name: 'この内容を適用する' }))
    await waitFor(() => expect(api.workflowsApi.update).toHaveBeenCalledTimes(1))
    expect(api.workflowsApi.update).toHaveBeenCalledWith(1, expect.objectContaining({ json_body: valid.json_body, mappings: valid.mappings, target_base_model_id: 2, default_applied_assets: null }))
  })
})
