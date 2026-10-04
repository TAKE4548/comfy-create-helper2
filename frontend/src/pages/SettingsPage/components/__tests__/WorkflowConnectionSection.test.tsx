import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
}))

vi.mock('../../../../api/client', () => api)
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
    api.workflowsApi.get.mockResolvedValue({ mappings: [] })
    api.workflowsApi.update.mockResolvedValue(workflow)
    api.workflowsApi.copy.mockResolvedValue(workflow)
    api.workflowsApi.diffAnalyze.mockResolvedValue({ changes: [] })
    api.workflowsApi.rollback.mockResolvedValue(undefined)
    api.workflowPresetsApi.list.mockResolvedValue([])
    api.snapshotsApi.list.mockResolvedValue([])
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
    fireEvent.change(container.querySelector('#settings-longpress-cardmove'), { target: { value: '2.2' } })
    expect(localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_MULTI_SELECT)).toBe('1.4')
    expect(localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_CARD_MOVE)).toBe('2.2')
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
  })
})
