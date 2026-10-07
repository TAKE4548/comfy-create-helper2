import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { CreateProjectModal } from '../CreateProjectModal'
import { useStudioStore } from '../../useStudioStore'
import { datasetApi } from '../../../../api/client'
import type { DatasetProject, Workflow } from '../../../../api/types'

vi.mock('../../../../api/client', () => ({
  datasetApi: {
    createProject: vi.fn(),
  },
}))

const mockWorkflows: Workflow[] = [
  {
    id: 10,
    name: 'Default SDXL Workflow',
    json_body: {},
    mappings: [],
  },
  {
    id: 20,
    name: 'Anime Full Workflow',
    json_body: {},
    mappings: [],
  },
]

const mockCreatedProject: DatasetProject = {
  id: 99,
  name: 'Custom Chara',
  character_trigger: 'mychar',
  outfit_trigger: 'mychar_suit',
  workflow_id: 10,
  prompt_meta: 'masterpiece, best quality, ultra-detailed',
  prompt_physical: '1girl, solo',
  prompt_exclusive_outfit: 'mychar_suit',
  selected_alt_outfits: '[]',
  prompt_negative: 'lowres, bad hands',
  created_at: '2026-10-07T00:00:00Z',
  updated_at: '2026-10-07T00:00:00Z',
}

describe('CreateProjectModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <CreateProjectModal
        isOpen={false}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        workflows={mockWorkflows}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders inputs with default values when isOpen is true', () => {
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        workflows={mockWorkflows}
      />
    )

    expect(screen.getByTestId('create-project-name-input')).toHaveValue('My New Chara LoRA')
    expect(screen.getByTestId('create-character-trigger-input')).toHaveValue('mychara')
    expect(screen.getByTestId('create-outfit-trigger-input')).toHaveValue('mychara_outfit')
    expect(screen.getByTestId('create-workflow-select')).toHaveValue('10')
  })

  it('AC-1: successfully calls datasetApi.createProject, triggers onCreated and closes on submission', async () => {
    const onCreated = vi.fn()
    const onClose = vi.fn()
    vi.mocked(datasetApi.createProject).mockResolvedValueOnce(mockCreatedProject)

    render(
      <CreateProjectModal
        isOpen={true}
        onClose={onClose}
        onCreated={onCreated}
        workflows={mockWorkflows}
      />
    )

    fireEvent.change(screen.getByTestId('create-project-name-input'), {
      target: { value: 'Custom Chara' },
    })
    fireEvent.change(screen.getByTestId('create-character-trigger-input'), {
      target: { value: 'mychar' },
    })
    fireEvent.change(screen.getByTestId('create-outfit-trigger-input'), {
      target: { value: 'mychar_suit' },
    })
    fireEvent.change(screen.getByTestId('create-workflow-select'), {
      target: { value: '20' },
    })

    fireEvent.click(screen.getByTestId('submit-create-project-btn'))

    await waitFor(() => {
      expect(datasetApi.createProject).toHaveBeenCalledTimes(1)
    })

    expect(datasetApi.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Custom Chara',
        character_trigger: 'mychar',
        outfit_trigger: 'mychar_suit',
        workflow_id: 20,
      })
    )

    expect(onCreated).toHaveBeenCalledWith(mockCreatedProject)
    expect(onClose).toHaveBeenCalled()
  })

  it('AC-1 & Red Team 3: on API error, displays error message, keeps modal open, and preserves user inputs for retry', async () => {
    const onCreated = vi.fn()
    const onClose = vi.fn()
    vi.mocked(datasetApi.createProject).mockRejectedValueOnce(
      new Error('Server error: 500 Internal Error')
    )

    render(
      <CreateProjectModal
        isOpen={true}
        onClose={onClose}
        onCreated={onCreated}
        workflows={mockWorkflows}
      />
    )

    const nameInput = screen.getByTestId('create-project-name-input')
    const charInput = screen.getByTestId('create-character-trigger-input')
    const outfitInput = screen.getByTestId('create-outfit-trigger-input')

    fireEvent.change(nameInput, { target: { value: 'My Retry Project' } })
    fireEvent.change(charInput, { target: { value: 'retry_chara' } })
    fireEvent.change(outfitInput, { target: { value: 'retry_outfit' } })

    fireEvent.click(screen.getByTestId('submit-create-project-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('create-project-error')).toBeInTheDocument()
    })

    expect(screen.getByTestId('create-project-error')).toHaveTextContent(
      'Server error: 500 Internal Error'
    )
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    // Verify inputs are retained (no data loss)
    expect(nameInput).toHaveValue('My Retry Project')
    expect(charInput).toHaveValue('retry_chara')
    expect(outfitInput).toHaveValue('retry_outfit')

    // Retry successfully
    vi.mocked(datasetApi.createProject).mockResolvedValueOnce({
      ...mockCreatedProject,
      name: 'My Retry Project',
    })

    fireEvent.click(screen.getByTestId('submit-create-project-btn'))

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={onClose}
        onCreated={vi.fn()}
        workflows={mockWorkflows}
      />
    )

    fireEvent.click(screen.getByTestId('close-create-project-modal'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn()
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={onClose}
        onCreated={vi.fn()}
        workflows={mockWorkflows}
      />
    )

    fireEvent.click(screen.getByTestId('cancel-create-project-btn'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('useStudioStore additions (REQ-323-T2)', () => {
  it('initializes with default saveStatus idle and projectsList empty', () => {
    const state = useStudioStore.getState()
    expect(state.saveStatus).toBe('idle')
    expect(state.projectsList).toEqual([])
  })

  it('updates saveStatus and projectsList via setters', () => {
    useStudioStore.getState().setSaveStatus('saving')
    expect(useStudioStore.getState().saveStatus).toBe('saving')

    useStudioStore.getState().setProjectsList([mockCreatedProject])
    expect(useStudioStore.getState().projectsList).toEqual([mockCreatedProject])
  })

  it('resets saveStatus back to idle on resetStudio', () => {
    useStudioStore.getState().setSaveStatus('error')
    useStudioStore.getState().resetStudio()
    expect(useStudioStore.getState().saveStatus).toBe('idle')
  })
})

