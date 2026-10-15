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
