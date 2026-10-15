import { DndContext } from '@dnd-kit/core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MappingMaster } from '../../../../api/types'
import {
  MappingMasterDeleteModal,
  MappingMasterModal,
  SortableMasterRow,
  WorkflowDeleteConfirmDialog,
  emptyMasterForm,
} from '../../../../components/SettingsComponents'

const master: MappingMaster = {
  id: 42,
  role: 'positive_prompt',
  expected_class_types: ['CLIPTextEncode'],
  param_name: 'text',
  input_type: 'textarea',
  display_name: 'Positive Prompt',
  title_patterns: ['positive'],
  sort_order: 1,
}

function renderRow(isMultiSelectMode = false) {
  const onClick = vi.fn()
  const openEditModal = vi.fn()
  const openCopyModal = vi.fn()
  const openDeleteModal = vi.fn()
  render(
    <DndContext>
      <table><tbody><SortableMasterRow
        mm={master}
        openEditModal={openEditModal}
        openDeleteModal={openDeleteModal}
        openCopyModal={openCopyModal}
        isMultiSelectMode={isMultiSelectMode}
        isSelected={isMultiSelectMode}
        onClick={onClick}
        longPressHandlers={{ onMouseDown: vi.fn(), onMouseUp: vi.fn(), onMouseLeave: vi.fn(), onTouchStart: vi.fn(), onTouchEnd: vi.fn() }}
      /></tbody></table>
    </DndContext>,
  )
  return { onClick, openEditModal, openCopyModal, openDeleteModal }
}

describe('MappingMasterSection mobile row and dialogs', () => {
  it('labels every mapping field, exposes 44px controls, and keeps action clicks out of row selection', () => {
    const handlers = renderRow()
    const row = screen.getByRole('row')

    expect(row.querySelector('td[data-label="Role"]')).toHaveTextContent(master.role)
    expect(row.querySelector('td[data-label="Display Name"]')).toHaveTextContent(master.display_name)
    expect(row.querySelector('td[data-label="Param Name"]')).toHaveTextContent(master.param_name)
    expect(row.querySelector('td[data-label="Input Type"]')).toHaveTextContent(master.input_type)
    expect(row.querySelector('td[data-label="Expected Class Types"]')).toHaveTextContent('CLIPTextEncode')
    expect(row.querySelector('td[data-label="Title Patterns"]')).toHaveTextContent('positive')

    const reorder = screen.getByRole('button', { name: '並び替えハンドル' })
    expect(reorder).toHaveClass('min-w-[44px]', 'min-h-[44px]')
    const edit = screen.getByRole('button', { name: 'positive_prompt を編集' })
    const copy = screen.getByRole('button', { name: 'positive_prompt を複製' })
    const remove = screen.getByRole('button', { name: 'positive_prompt を削除' })
    for (const action of [edit, copy, remove]) expect(action).toHaveClass('min-w-[44px]', 'min-h-[44px]')

    fireEvent.click(edit)
    fireEvent.click(copy)
    fireEvent.click(remove)
    expect(handlers.openEditModal).toHaveBeenCalledWith(master)
    expect(handlers.openCopyModal).toHaveBeenCalledWith(master)
    expect(handlers.openDeleteModal).toHaveBeenCalledWith(master)
    expect(handlers.onClick).not.toHaveBeenCalled()
  })

  it('exposes the multi-select affordance as a keyboard-operable 44px checkbox', () => {
    const { onClick } = renderRow(true)
    const checkbox = screen.getByRole('checkbox', { name: 'positive_prompt を選択' })
    expect(checkbox).toHaveAttribute('aria-checked', 'true')
    expect(checkbox).toHaveClass('w-[44px]', 'h-[44px]')
    fireEvent.click(checkbox)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('gives each owned modal a labelled modal dialog with a distinct heading id', () => {
    const form = emptyMasterForm()
    const setForm = vi.fn()
    const close = vi.fn()
    const { unmount: unmountCreate } = render(
      <MappingMasterModal mode="create" form={form} setForm={setForm} isPending={false} onClose={close} onSubmit={vi.fn()} />,
    )
    const createDialog = screen.getByRole('dialog', { name: 'Create Mapping Master' })
    expect(createDialog).toHaveAttribute('aria-modal', 'true')
    const createHeadingId = within(createDialog).getByRole('heading').id
    unmountCreate()

    const { unmount: unmountDelete } = render(
      <MappingMasterDeleteModal master={master} isLoadingUsages={false} isPending={false} onClose={close} onDelete={vi.fn()} />,
    )
    const deleteDialog = screen.getByRole('dialog', { name: 'Delete Mapping Master?' })
    expect(deleteDialog).toHaveAttribute('aria-modal', 'true')
    const deleteHeadingId = within(deleteDialog).getByRole('heading').id
    unmountDelete()

    render(<WorkflowDeleteConfirmDialog workflowName="sample" isPending={false} onClose={close} onConfirm={vi.fn()} mappingsCount={0} presetsCount={0} snapshotsCount={0} isLoadingDetails={false} />)
    const workflowDialog = screen.getByRole('dialog', { name: /sample/ })
    expect(workflowDialog).toHaveAttribute('aria-modal', 'true')
    const workflowHeadingId = within(workflowDialog).getByRole('heading').id
    expect(new Set([createHeadingId, deleteHeadingId, workflowHeadingId]).size).toBe(3)
  })

  const renderMasterDelete = (props: Partial<{ onClose: () => void; isPending: boolean }> = {}) =>
    render(<MappingMasterDeleteModal master={master} isLoadingUsages={false} isPending={props.isPending ?? false} onClose={props.onClose ?? vi.fn()} onDelete={vi.fn()} />)
  const renderWorkflowDelete = (props: Partial<{ onClose: () => void; isPending: boolean }> = {}) =>
    render(<WorkflowDeleteConfirmDialog workflowName="sample" isPending={props.isPending ?? false} onClose={props.onClose ?? vi.fn()} onConfirm={vi.fn()} mappingsCount={1} presetsCount={2} snapshotsCount={3} isLoadingDetails={false} />)

  it('[REQ-365/AC-9] delete dialogs render in the common bottom-sheet Modal (single dialog, one handle, max-h-[85dvh], role stays dialog)', () => {
    for (const renderDialog of [renderMasterDelete, renderWorkflowDelete]) {
      const { unmount } = renderDialog()
      const dialogs = screen.getAllByRole('dialog')
      expect(dialogs).toHaveLength(1)
      const dialog = dialogs[0]
      expect(screen.getAllByTestId('modal-sheet-handle')).toHaveLength(1)
      expect(dialog).toHaveAttribute('data-radius-exempt')
      expect(dialog.style.getPropertyValue('--modal-sheet-max-height')).toBe('85dvh')
      expect(dialog.className).toContain('rounded-t-2xl')
      expect(dialog.getAttribute('role')).toBe('dialog')
      expect(dialog.getAttribute('aria-label')).toBe(within(dialog).getByRole('heading').textContent)
      expect(dialog.closest('.fixed.inset-0.z-50')).toBeNull()
      unmount()
    }
  })

  it('[REQ-365/AC-9] MappingMasterDeleteModal: backdrop click does not close; Cancel closes; Delete is not initially focused', () => {
    const onClose = vi.fn()
    const { container } = renderMasterDelete({ onClose })
    fireEvent.click(container.ownerDocument.querySelector('.modal-backdrop') as HTMLElement)
    expect(onClose).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('[REQ-365/AC-9] WorkflowDeleteConfirmDialog: delete stays disabled until acknowledged; backdrop closes unless pending', () => {
    const onClose = vi.fn()
    const { unmount } = renderWorkflowDelete({ onClose })
    expect(screen.getByRole('button', { name: '削除する' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: '削除する' })).toBeEnabled()
    fireEvent.click(document.querySelector('.modal-backdrop') as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()

    const pendingClose = vi.fn()
    renderWorkflowDelete({ onClose: pendingClose, isPending: true })
    fireEvent.click(document.querySelector('.modal-backdrop') as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(pendingClose).not.toHaveBeenCalled()
  })

  it('[REQ-365/AC-9] delete dialogs: close/cancel/confirm controls expose min-h-[44px]', () => {
    const { unmount } = renderMasterDelete()
    for (const name of ['Cancel', 'Delete']) expect(screen.getByRole('button', { name })).toHaveClass('min-h-[44px]', 'touch-manipulation')
    unmount()
    renderWorkflowDelete()
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveClass('min-h-[44px]', 'min-w-[44px]', 'touch-manipulation')
    for (const name of ['キャンセル', '削除する']) expect(screen.getByRole('button', { name })).toHaveClass('min-h-[44px]', 'touch-manipulation')
    expect(screen.getByRole('checkbox').closest('label')).toHaveClass('min-h-[44px]')
  })
})
