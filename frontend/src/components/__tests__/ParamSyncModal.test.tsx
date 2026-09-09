import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ParamSyncModal } from '../ParamSyncModal'
import { useGenerationStore } from '../../store/useGenerationStore'
import { mappingMastersApi, workflowsApi } from '../../api/client'
import type { MappingMaster, Workflow, ParamSyncGroup } from '../../api/types'

vi.mock('../../api/client', () => ({
  mappingMastersApi: {
    list: vi.fn(),
  },
  workflowsApi: {
    get: vi.fn(),
  },
}))

const MOCK_MAPPING_MASTERS: MappingMaster[] = [
  { id: 1, role: 'seed', display_name: 'Seed', input_type: 'int' },
  { id: 2, role: 'subseed', display_name: 'Subseed', input_type: 'int' },
  { id: 3, role: 'prompt', display_name: 'Prompt', input_type: 'string' },
]

const MOCK_ACTIVE_WORKFLOW: Workflow = {
  id: 1,
  name: 'Default Workflow',
  mappings: [
    { role: 'seed', node_id: '3', input_name: 'seed' },
    { role: 'subseed', node_id: '3', input_name: 'subseed' },
    { role: 'prompt', node_id: '6', input_name: 'text' },
  ],
  target_base_model_id: null,
}

const MOCK_PARAM_SYNC_GROUPS: ParamSyncGroup[] = [
  {
    id: 101,
    workflow_id: 1,
    name: 'Seed Sync',
    master_role: 'seed',
    slave_roles: ['subseed'],
    is_enabled: true,
    created_at: '2026-01-01T00:00:00Z',
  },
]

describe('ParamSyncModal Component', () => {
  const onCloseMock = vi.fn()
  const fetchParamSyncGroupsMock = vi.fn()
  const createParamSyncGroupMock = vi.fn()
  const updateParamSyncGroupMock = vi.fn()
  const deleteParamSyncGroupMock = vi.fn()
  const toggleParamSyncGroupMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    useGenerationStore.setState({
      selectedWorkflowId: 1,
      paramSyncGroups: [...MOCK_PARAM_SYNC_GROUPS],
      fetchParamSyncGroups: fetchParamSyncGroupsMock,
      createParamSyncGroup: createParamSyncGroupMock,
      updateParamSyncGroup: updateParamSyncGroupMock,
      deleteParamSyncGroup: deleteParamSyncGroupMock,
      toggleParamSyncGroup: toggleParamSyncGroupMock,
    })

    vi.mocked(mappingMastersApi.list).mockResolvedValue([...MOCK_MAPPING_MASTERS])
    vi.mocked(workflowsApi.get).mockResolvedValue({ ...MOCK_ACTIVE_WORKFLOW })
  })

  it('mounts, fetches masters/workflow, and closes on Escape key', async () => {
    render(<ParamSyncModal onClose={onCloseMock} />)

    expect(screen.getByText('Parameter Sync Settings')).toBeInTheDocument()
    expect(fetchParamSyncGroupsMock).toHaveBeenCalledWith(1)

    await waitFor(() => {
      expect(mappingMastersApi.list).toHaveBeenCalled()
      expect(workflowsApi.get).toHaveBeenCalledWith(1)
    })

    // Escape key closes modal
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCloseMock).toHaveBeenCalled()
  })

  it('displays sync groups and toggles group enable state', () => {
    render(<ParamSyncModal onClose={onCloseMock} />)

    expect(screen.getByText('Seed Sync')).toBeInTheDocument()
    const toggleBtn = screen.getByTitle('Enabled')
    expect(toggleBtn).toBeInTheDocument()

    fireEvent.click(toggleBtn)
    expect(toggleParamSyncGroupMock).toHaveBeenCalledWith(101, false)
  })

  it('selects a sync group and displays candidate slave roles with same input_type, filtering out different types (Red Team)', async () => {
    render(<ParamSyncModal onClose={onCloseMock} />)

    await waitFor(() => {
      expect(workflowsApi.get).toHaveBeenCalledWith(1)
    })

    // Click on the group row to activate it
    fireEvent.click(screen.getByText('Seed Sync'))

    // Seed has input_type = 'int'.
    // Subseed also has input_type = 'int', so it should appear as candidate slave role checkbox.
    // Prompt has input_type = 'string', so it must NOT appear in slave candidate list (Red Team).
    expect(screen.getByText('Subseed')).toBeInTheDocument()
    expect(screen.queryByText('Prompt')).not.toBeInTheDocument()

    // Toggle slave checkbox
    const subseedCheckbox = screen.getByRole('checkbox')
    expect(subseedCheckbox).toBeChecked()

    fireEvent.click(subseedCheckbox)
    expect(updateParamSyncGroupMock).toHaveBeenCalledWith(101, { slave_roles: [] })
  })

  it('creates a new param sync group', async () => {
    createParamSyncGroupMock.mockResolvedValue({
      id: 102,
      workflow_id: 1,
      name: 'New Sync',
      master_role: 'seed',
      slave_roles: [],
      is_enabled: true,
      created_at: '2026-01-01T00:00:00Z',
    })

    render(<ParamSyncModal onClose={onCloseMock} />)

    await waitFor(() => {
      expect(workflowsApi.get).toHaveBeenCalledWith(1)
    })

    // Click Add Group
    fireEvent.click(screen.getByText('Add Group'))

    const nameInput = screen.getByPlaceholderText('Group name...')
    fireEvent.change(nameInput, { target: { value: 'New Sync' } })

    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(createParamSyncGroupMock).toHaveBeenCalledWith(1, {
        name: 'New Sync',
        master_role: 'seed',
        slave_roles: [],
        is_enabled: true,
      })
    })
  })

  it('deletes a sync group when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<ParamSyncModal onClose={onCloseMock} />)

    const groupItem = screen.getByText('Seed Sync').closest('.cursor-pointer')!
    expect(groupItem).toBeInTheDocument()

    const buttons = groupItem.querySelectorAll('button')
    // buttons: [0] = toggle, [1] = rename, [2] = delete
    const deleteBtn = buttons[buttons.length - 1]
    fireEvent.click(deleteBtn)

    expect(window.confirm).toHaveBeenCalled()
    expect(deleteParamSyncGroupMock).toHaveBeenCalledWith(101)
  })
})
