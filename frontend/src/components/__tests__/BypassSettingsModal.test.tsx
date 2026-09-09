import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BypassSettingsModal } from '../BypassSettingsModal'
import { useGenerationStore } from '../../store/useGenerationStore'
import { bypassProfilesApi } from '../../api/client'
import type { BypassProfile } from '../../api/types'

vi.mock('../../api/client', () => ({
  bypassProfilesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

const MOCK_WORKFLOW_JSON = {
  '3': {
    class_type: 'KSampler',
    _meta: { title: 'Main KSampler' },
    inputs: { seed: 12345 },
  },
  '4': {
    class_type: 'VAELoader',
    _meta: { title: 'VAE Loader' },
  },
}

const MOCK_PROFILES: BypassProfile[] = [
  {
    id: 1,
    workflow_id: 10,
    name: 'Skip VAE',
    bypassed_node_ids: ['4'],
    is_enabled: true,
    created_at: '2026-01-01T00:00:00Z',
  },
]

describe('BypassSettingsModal Component', () => {
  const onCloseMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    useGenerationStore.setState({
      selectedWorkflowId: 10,
      currentWorkflow: MOCK_WORKFLOW_JSON,
      bypassProfiles: [...MOCK_PROFILES],
      bypassProfilesCache: { 10: [...MOCK_PROFILES] },
    })

    vi.mocked(bypassProfilesApi.list).mockResolvedValue([...MOCK_PROFILES])
    vi.mocked(bypassProfilesApi.create).mockImplementation(async (wid, data) => ({
      id: 2,
      workflow_id: wid,
      name: data.name,
      bypassed_node_ids: data.bypassed_node_ids,
      is_enabled: true,
      created_at: '2026-01-01T00:00:00Z',
    }))
    vi.mocked(bypassProfilesApi.update).mockImplementation(async (id, data) => ({
      id,
      workflow_id: 10,
      name: data.name ?? 'Skip VAE',
      bypassed_node_ids: data.bypassed_node_ids ?? ['4'],
      is_enabled: data.is_enabled ?? true,
      created_at: '2026-01-01T00:00:00Z',
    }))
    vi.mocked(bypassProfilesApi.delete).mockResolvedValue({ status: 'ok' } as any)
  })

  const renderComponent = () =>
    render(<BypassSettingsModal onClose={onCloseMock} workflowJson={MOCK_WORKFLOW_JSON} />)

  it('renders BypassSettingsModal, lists existing profiles, and closes on Escape key', async () => {
    renderComponent()

    expect(screen.getByText('Bypass Settings')).toBeInTheDocument()
    expect(screen.getByText('Skip VAE')).toBeInTheDocument()

    // Escape key closes modal
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' })
    expect(onCloseMock).toHaveBeenCalled()
  })

  it('creates a new bypass profile', async () => {
    renderComponent()

    const addBtn = screen.getByRole('button', { name: /Add/i })
    fireEvent.click(addBtn)

    const nameInput = screen.getByPlaceholderText('Profile name...')
    fireEvent.change(nameInput, { target: { value: 'Skip KSampler' } })

    const form = nameInput.closest('form')
    expect(form).toBeInTheDocument()
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(bypassProfilesApi.create).toHaveBeenCalledWith(10, {
        name: 'Skip KSampler',
        bypassed_node_ids: [],
      })
    })
  })

  it('selects a profile, shows workflow nodes, and toggles node bypass', async () => {
    renderComponent()

    // Click on profile to activate it
    const profileItem = screen.getByText('Skip VAE')
    fireEvent.click(profileItem)

    // Verify nodes are listed
    expect(screen.getByText('Main KSampler')).toBeInTheDocument()
    expect(screen.getByText('VAE Loader')).toBeInTheDocument()

    // Node 4 is currently bypassed in mock profile
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(checkboxes.length).toBe(2)

    // Toggle Main KSampler (Node 3)
    fireEvent.click(checkboxes[0])

    await waitFor(() => {
      expect(bypassProfilesApi.update).toHaveBeenCalledWith(1, {
        bypassed_node_ids: ['4', '3'],
      })
    })
  })

  it('renames an existing profile', async () => {
    renderComponent()

    const profileText = screen.getByText('Skip VAE')
    const profileContainer = profileText.closest('div')!
    const editBtn = profileContainer.querySelector('svg.lucide-pen')?.closest('button') || profileContainer.querySelector('svg.lucide-edit-2')?.closest('button')
    expect(editBtn).toBeInTheDocument()
    fireEvent.click(editBtn!)

    const editInput = screen.getByDisplayValue('Skip VAE')
    fireEvent.change(editInput, { target: { value: 'Skip VAE Renamed' } })

    const saveBtn = editInput.parentElement?.querySelector('svg.lucide-save')?.closest('button')
    expect(saveBtn).toBeInTheDocument()
    fireEvent.click(saveBtn!)

    await waitFor(() => {
      expect(bypassProfilesApi.update).toHaveBeenCalledWith(1, {
        name: 'Skip VAE Renamed',
      })
    })
  })

  it('deletes an existing profile when confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderComponent()

    const profileText = screen.getByText('Skip VAE')
    const profileContainer = profileText.closest('div')!
    const trashBtn = profileContainer.querySelector('svg.lucide-trash2')?.closest('button') || profileContainer.querySelector('svg.lucide-trash-2')?.closest('button')
    expect(trashBtn).toBeInTheDocument()
    fireEvent.click(trashBtn!)

    expect(confirmSpy).toHaveBeenCalledWith('このバイパスプロファイルを削除しますか？')

    await waitFor(() => {
      expect(bypassProfilesApi.delete).toHaveBeenCalledWith(1)
    })
  })
})
