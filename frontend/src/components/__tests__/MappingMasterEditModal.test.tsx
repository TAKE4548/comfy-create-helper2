import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MappingMasterEditModal } from '../MappingMasterEditModal'
import { comfyApi } from '../../api/client'
import { stageMastersApi } from '../../api/domains/stageMasters'
import { mappingGroupsApi } from '../../api/domains/mappingGroups'
import { workflowsApi } from '../../api/domains/workflows'

vi.mock('../../api/client', () => ({
  comfyApi: {
    getObjectInfoAll: vi.fn(),
  },
}))
vi.mock('../../api/domains/stageMasters', () => ({
  stageMastersApi: { list: vi.fn() },
}))
vi.mock('../../api/domains/mappingGroups', () => ({
  mappingGroupsApi: { list: vi.fn() },
}))
vi.mock('../../api/domains/workflows', () => ({
  workflowsApi: { list: vi.fn(), get: vi.fn() },
}))

const flush = () => act(async () => {})

const TITLE = '新規マッピングマスター作成'

describe('MappingMasterEditModal common bottom-sheet Modal', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(comfyApi.getObjectInfoAll).mockResolvedValue({})
    vi.mocked(stageMastersApi.list).mockResolvedValue([])
    vi.mocked(mappingGroupsApi.list).mockResolvedValue([])
    vi.mocked(workflowsApi.list).mockResolvedValue([])
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  const renderComponent = (props: Partial<Parameters<typeof MappingMasterEditModal>[0]> = {}) => {
    const onClose = vi.fn()
    const onSave = vi.fn()
    const utils = render(
      <QueryClientProvider client={queryClient}>
        <MappingMasterEditModal
          isOpen={true}
          onClose={onClose}
          master={null}
          groups={[]}
          stages={[]}
          onSave={onSave}
          {...props}
        />
      </QueryClientProvider>
    )
    return { onClose, onSave, ...utils }
  }

  it('[REQ-365/AC-9] renders in the common bottom-sheet Modal (single handle, max-h-[85dvh], exactly one dialog)', async () => {
    renderComponent()
    await flush()

    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(1)
    expect(screen.getAllByTestId('modal-sheet-handle')).toHaveLength(1)

    const dialog = dialogs[0]
    expect(dialog).toHaveAttribute('data-radius-exempt')
    expect(dialog).toHaveAttribute('data-sheet-max-height')
    expect(dialog.style.getPropertyValue('--modal-sheet-max-height')).toBe('85dvh')
    expect(dialog.className).toContain('rounded-t-2xl')
    expect(dialog).toHaveAttribute('aria-label', TITLE)
    expect(screen.getByRole('dialog', { name: new RegExp(TITLE) })).toBe(dialog)
    expect(dialog.closest('.fixed.inset-0.z-50')).toBeNull()
  })

  it('[REQ-365/AC-9] closes via Escape, backdrop click and close/cancel buttons', async () => {
    const { onClose, container } = renderComponent()
    await flush()
    const dialog = screen.getByRole('dialog')

    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    const backdrop = document.querySelector('.modal-backdrop') as HTMLElement
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.click(within(dialog).getByLabelText('閉じる'))
    expect(onClose).toHaveBeenCalledTimes(3)

    fireEvent.click(within(dialog).getByText('キャンセル'))
    expect(onClose).toHaveBeenCalledTimes(4)
    expect(container).toBeTruthy()
  })

  it('[REQ-365/AC-9] does not close on Escape while the workflow node picker is open', async () => {
    vi.mocked(workflowsApi.list).mockResolvedValue([{ id: 1, name: 'wf-one' }] as never)
    vi.mocked(workflowsApi.get).mockResolvedValue({
      id: 1,
      name: 'wf-one',
      json_body: { '1': { class_type: 'KSampler', inputs: { steps: 20 }, _meta: { title: 'Sampler' } } },
    } as never)
    const { onClose } = renderComponent()

    await waitFor(() => expect(screen.getByRole('option', { name: 'wf-one' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('登録済みワークフロー選択'), { target: { value: '1' } })
    fireEvent.click(await screen.findByText('ワークフローからノード選択 (逆引き)'))

    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(2))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('[REQ-365/AC-9] nested node picker backdrop is not inside the space-y form (no sibling margin)', async () => {
    vi.mocked(workflowsApi.list).mockResolvedValue([{ id: 1, name: 'wf-one' }] as never)
    vi.mocked(workflowsApi.get).mockResolvedValue({
      id: 1,
      name: 'wf-one',
      json_body: { '1': { class_type: 'KSampler', inputs: { steps: 20 }, _meta: { title: 'Sampler' } } },
    } as never)
    renderComponent()

    await waitFor(() => expect(screen.getByRole('option', { name: 'wf-one' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('登録済みワークフロー選択'), { target: { value: '1' } })
    fireEvent.click(await screen.findByText('ワークフローからノード選択 (逆引き)'))

    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(2))
    const picker = screen.getByRole('dialog', { name: /ワークフローからノードを選択/ })
    const backdrop = picker.parentElement as HTMLElement
    expect(backdrop).toHaveClass('modal-backdrop')
    expect(backdrop.closest('form')).toBeNull()
    for (let el: HTMLElement | null = backdrop.parentElement; el; el = el.parentElement) {
      expect(el.className).not.toMatch(/(^|\s)(space-[xy]-|divide-[xy])/)
      if (el.getAttribute('role') === 'dialog') break
    }
  })

  it('[REQ-365/AC-9] form submit and validation are unchanged inside the sheet', async () => {
    const { onSave } = renderComponent()
    await flush()
    const save = screen.getByText('マスターを保存')
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('例: Positive Prompt'), { target: { value: 'Prompt' } })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('例: text, steps, cfg'), { target: { value: 'text' } })
    expect(save).not.toBeDisabled()

    fireEvent.submit(save.closest('form') as HTMLFormElement)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Prompt', display_name: 'Prompt', param_name: 'text', input_type: expect.any(String) })
    )
  })

  it('[REQ-365/AC-9] touch targets: close/cancel/save expose min-h-[44px]; chip delete and candidate buttons have hit-slop', async () => {
    renderComponent()
    await flush()
    const dialog = screen.getByRole('dialog')

    for (const el of [
      within(dialog).getByLabelText('閉じる'),
      within(dialog).getByText('キャンセル'),
      within(dialog).getByText('マスターを保存'),
    ]) {
      expect(el.className).toContain('min-h-[44px]')
      expect(el.className).toContain('touch-manipulation')
    }

    const candidate = within(dialog).getByText('+ KSampler')
    expect(candidate.className).toContain('before:-inset-2')
    expect(candidate.className).toContain('touch-manipulation')

    fireEvent.click(candidate)
    const del = within(dialog).getByLabelText('KSampler を削除')
    expect(del.className).toContain('before:absolute')
    expect(del.className).toContain('before:-inset-2')
    expect(del.className).toContain('touch-manipulation')
  })

  it('[REQ-365/AC-9] renders nothing when isOpen is false', async () => {
    renderComponent({ isOpen: false })
    await flush()
    expect(screen.queryAllByRole('dialog')).toHaveLength(0)
  })
})
