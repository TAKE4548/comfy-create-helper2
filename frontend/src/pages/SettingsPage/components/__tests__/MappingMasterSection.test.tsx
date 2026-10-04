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
})
