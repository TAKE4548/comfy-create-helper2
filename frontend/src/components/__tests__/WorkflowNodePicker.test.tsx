import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { WorkflowNodePicker } from '../WorkflowNodePicker'
import { Modal } from '../common/Modal'

describe('WorkflowNodePicker', () => {
  const dummyWorkflow = {
    '1': {
      class_type: 'KSampler',
      _meta: { title: 'KSampler Main' },
      inputs: { seed: 100, steps: 20 },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      _meta: { title: 'Positive Prompt' },
      inputs: { text: 'masterpiece' },
    },
  }

  it('lists nodes and selects parameter for application', () => {
    const onSelectNode = vi.fn()
    const onClose = vi.fn()

    render(
      <WorkflowNodePicker
        isOpen={true}
        onClose={onClose}
        workflowJson={dummyWorkflow}
        hasExistingValues={false}
        onSelectNode={onSelectNode}
      />
    )

    expect(screen.getByText('#1 KSampler Main')).toBeInTheDocument()
    expect(screen.getByText('#2 Positive Prompt')).toBeInTheDocument()

    // Click node 1
    fireEvent.click(screen.getByText('#1 KSampler Main'))

    // Click parameter "steps"
    expect(screen.getByText('steps')).toBeInTheDocument()
    fireEvent.click(screen.getByText('steps'))

    // Click Apply
    fireEvent.click(screen.getByText('設定フォームへ反映'))

    expect(onSelectNode).toHaveBeenCalledWith({
      classType: 'KSampler',
      title: 'KSampler Main',
      paramName: 'steps',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('prompts confirmation when existing values present', () => {
    const onSelectNode = vi.fn()
    const onClose = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(
      <WorkflowNodePicker
        isOpen={true}
        onClose={onClose}
        workflowJson={dummyWorkflow}
        hasExistingValues={true}
        onSelectNode={onSelectNode}
      />
    )

    fireEvent.click(screen.getByText('#2 Positive Prompt'))
    fireEvent.click(screen.getByText('設定フォームへ反映'))

    expect(confirmSpy).toHaveBeenCalled()
    expect(onSelectNode).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
  })

  const TITLE = 'ワークフローからノードを選択して逆引き登録'

  it('[REQ-365/AC-9] picker renders in the common bottom-sheet Modal (one handle, max-h-[85dvh], no own overlay)', () => {
    const { rerender, container } = render(
      <WorkflowNodePicker isOpen={true} onClose={vi.fn()} workflowJson={dummyWorkflow} hasExistingValues={false} onSelectNode={vi.fn()} />
    )
    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(1)
    const dialog = dialogs[0]
    expect(dialog).toHaveAttribute('aria-label', TITLE)
    expect(screen.getAllByTestId('modal-sheet-handle')).toHaveLength(1)
    expect(dialog).toHaveAttribute('data-radius-exempt')
    expect(dialog.style.getPropertyValue('--modal-sheet-max-height')).toBe('85dvh')
    expect(dialog.className).toContain('rounded-t-2xl')
    expect(dialog.closest('.fixed.inset-0.z-50')).toBeNull()
    rerender(
      <WorkflowNodePicker isOpen={false} onClose={vi.fn()} workflowJson={dummyWorkflow} hasExistingValues={false} onSelectNode={vi.fn()} />
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(screen.queryAllByRole('dialog')).toHaveLength(0)
  })

  it('[REQ-365/AC-9] nested in another Modal: Escape closes only the picker and backdrop click does not close it', () => {
    const outerClose = vi.fn()
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={outerClose} closeOnEsc={false} ariaLabel="outer">
        <WorkflowNodePicker isOpen={true} onClose={onClose} workflowJson={dummyWorkflow} hasExistingValues={false} onSelectNode={vi.fn()} />
      </Modal>
    )
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    const pickerBackdrop = screen.getByLabelText(TITLE).closest('.modal-backdrop') as HTMLElement
    fireEvent.click(pickerBackdrop)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(outerClose).not.toHaveBeenCalled()
  })

  it('[REQ-302/AC-4] preserves nested exception: Escape closes picker only and does not bubble to outer modal', () => {
    const outerClose = vi.fn()
    const outerAction = vi.fn()

    function NestedHarness() {
      const [pickerOpen, setPickerOpen] = React.useState(false)
      return (
        <Modal isOpen onClose={outerClose} closeOnEsc={!pickerOpen} ariaLabel="Master Edit Modal">
          <div>
            <button type="button" onClick={() => setPickerOpen(true)} aria-label="open-picker-button">
              Open Picker
            </button>
            <button type="button" onClick={outerAction} aria-label="outer-action-button">
              Outer Action
            </button>
            <WorkflowNodePicker
              isOpen={pickerOpen}
              onClose={() => setPickerOpen(false)}
              workflowJson={dummyWorkflow}
              hasExistingValues={false}
              onSelectNode={vi.fn()}
            />
          </div>
        </Modal>
      )
    }

    render(<NestedHarness />)

    // Initially only outer dialog is open
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'open-picker-button' })).toBeInTheDocument()

    // Open nested picker
    fireEvent.click(screen.getByRole('button', { name: 'open-picker-button' }))

    // Now both dialogs are present in DOM
    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(2)
    const [outerDialog, innerDialog] = dialogs
    expect(outerDialog).toHaveAttribute('aria-label', 'Master Edit Modal')
    expect(innerDialog).toHaveAttribute('aria-label', TITLE)

    // Inner modal captures active focus
    expect(innerDialog).toContainElement(document.activeElement)

    // Focus trap maintains focus within inner dialog when pressing Tab
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(innerDialog).toContainElement(document.activeElement)
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'outer-action-button' }))

    // Backdrop click on inner picker does not bubble or close outer modal
    const pickerBackdrop = screen.getByLabelText(TITLE).closest('.modal-backdrop') as HTMLElement
    fireEvent.click(pickerBackdrop)
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    expect(outerClose).not.toHaveBeenCalled()

    // Escape closes ONLY the inner picker; outer modal remains open
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(outerClose).not.toHaveBeenCalled()

    // Inner picker is closed; outer dialog remains
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByLabelText(TITLE)).toBeNull()

    // Outer modal controls are interactive again
    const outerBtn = screen.getByRole('button', { name: 'outer-action-button' })
    fireEvent.click(outerBtn)
    expect(outerAction).toHaveBeenCalledTimes(1)

    // Once picker is closed, Escape closes outer modal
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(outerClose).toHaveBeenCalledTimes(1)
  })

  it('[REQ-365/AC-9] picker close button and cancel call onClose; touch targets expose min-h-[44px]', () => {
    const onClose = vi.fn()
    render(
      <WorkflowNodePicker isOpen={true} onClose={onClose} workflowJson={dummyWorkflow} hasExistingValues={false} onSelectNode={vi.fn()} />
    )
    const closeBtn = screen.getByRole('button', { name: '閉じる' })
    expect(closeBtn.className).toContain('min-h-[44px]')
    expect(closeBtn.className).toContain('min-w-[44px]')
    const nodeRow = screen.getByText('#1 KSampler Main').closest('div[class*="cursor-pointer"]') as HTMLElement
    expect(nodeRow.className).toContain('min-h-[44px]')
    fireEvent.click(nodeRow)
    const paramRow = screen.getByText('steps').closest('div[class*="cursor-pointer"]') as HTMLElement
    expect(paramRow.className).toContain('min-h-[44px]')
    const cancel = screen.getByRole('button', { name: 'キャンセル' })
    expect(cancel.className).toContain('min-h-[44px]')
    expect(screen.getByRole('button', { name: '設定フォームへ反映' }).className).toContain('min-h-[44px]')
    fireEvent.click(closeBtn)
    fireEvent.click(cancel)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
