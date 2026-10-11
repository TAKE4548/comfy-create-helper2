import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { WorkflowNodePicker } from '../WorkflowNodePicker'

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
})
