import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MappingMasterEditModal } from '../MappingMasterEditModal'
import { comfyApi } from '../../api/client'

vi.mock('../../api/client', () => ({
  comfyApi: {
    getObjectInfoAll: vi.fn(),
  },
}))

describe('MappingMasterEditModal Dynamic ClassType Autocomplete Dropdown', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  const renderComponent = (props: Partial<Parameters<typeof MappingMasterEditModal>[0]> = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MappingMasterEditModal
          isOpen={true}
          onClose={vi.fn()}
          master={null}
          groups={[]}
          stages={[]}
          onSave={vi.fn()}
          {...props}
        />
      </QueryClientProvider>
    )
  }

  it('renders autocomplete dropdown on typing matching text and adds on click', async () => {
    vi.mocked(comfyApi.getObjectInfoAll).mockResolvedValue({
      KSampler: { input: {} },
      KSamplerAdvanced: { input: {} },
      VAEDecode: { input: {} },
    })

    renderComponent()

    const input = screen.getByPlaceholderText('クラス名を入力してEnter...')
    fireEvent.change(input, { target: { value: 'ksam' } })

    await waitFor(() => {
      expect(screen.getByTestId('classtype-autocomplete-dropdown')).toBeInTheDocument()
    })

    const option = screen.getByText('KSampler')
    expect(option).toBeInTheDocument()
    expect(screen.getByText('KSamplerAdvanced')).toBeInTheDocument()

    fireEvent.mouseDown(option)

    // Option should be added as chip
    await waitFor(() => {
      expect(screen.getByLabelText('KSampler を削除')).toBeInTheDocument()
      expect(input).toHaveValue('')
    })
  })

  it('navigates candidates with keyboard (ArrowDown/ArrowUp) and selects on Enter', async () => {
    vi.mocked(comfyApi.getObjectInfoAll).mockResolvedValue({
      KSampler: { input: {} },
      KSamplerAdvanced: { input: {} },
    })

    renderComponent()

    const input = screen.getByPlaceholderText('クラス名を入力してEnter...')
    fireEvent.change(input, { target: { value: 'ksam' } })

    await waitFor(() => {
      expect(screen.getByTestId('classtype-autocomplete-dropdown')).toBeInTheDocument()
    })

    // Down arrow to highlight first item (index 0)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // Down arrow to highlight second item (index 1)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // Enter to select
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByLabelText('KSamplerAdvanced を削除')).toBeInTheDocument()
      expect(input).toHaveValue('')
    })
  })

  it('navigates with Tab key to select highlighted candidate', async () => {
    vi.mocked(comfyApi.getObjectInfoAll).mockResolvedValue({
      KSampler: { input: {} },
      KSamplerAdvanced: { input: {} },
    })

    renderComponent()

    const input = screen.getByPlaceholderText('クラス名を入力してEnter...')
    fireEvent.change(input, { target: { value: 'ksam' } })

    await waitFor(() => {
      expect(screen.getByTestId('classtype-autocomplete-dropdown')).toBeInTheDocument()
    })

    // Down arrow to highlight first item
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // Tab to select
    fireEvent.keyDown(input, { key: 'Tab' })

    await waitFor(() => {
      expect(screen.getByLabelText('KSampler を削除')).toBeInTheDocument()
      expect(input).toHaveValue('')
    })
  })

  it('closes dropdown on Escape key', async () => {
    vi.mocked(comfyApi.getObjectInfoAll).mockResolvedValue({
      KSampler: { input: {} },
    })

    renderComponent()

    const input = screen.getByPlaceholderText('クラス名を入力してEnter...')
    fireEvent.change(input, { target: { value: 'ksam' } })

    await waitFor(() => {
      expect(screen.getByTestId('classtype-autocomplete-dropdown')).toBeInTheDocument()
    })

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByTestId('classtype-autocomplete-dropdown')).not.toBeInTheDocument()
  })

  it('prevents duplicate additions when selecting existing class type', async () => {
    vi.mocked(comfyApi.getObjectInfoAll).mockResolvedValue({
      KSampler: { input: {} },
    })

    renderComponent()

    const input = screen.getByPlaceholderText('クラス名を入力してEnter...')
    fireEvent.change(input, { target: { value: 'KSampler' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByLabelText('KSampler を削除')).toBeInTheDocument()
    })

    // Try adding again via input
    fireEvent.change(input, { target: { value: 'KSampler' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Check chips count via delete buttons
    const deleteButtons = screen.getAllByLabelText('KSampler を削除')
    expect(deleteButtons).toHaveLength(1)
  })

  it('allows manual input and static candidate palette when ComfyUI is in error or disconnected', async () => {
    vi.mocked(comfyApi.getObjectInfoAll).mockRejectedValue(new Error('Network error'))

    renderComponent()

    const input = screen.getByPlaceholderText('クラス名を入力してEnter...')
    // Manual input works
    fireEvent.change(input, { target: { value: 'CustomManualNode' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByLabelText('CustomManualNode を削除')).toBeInTheDocument()
      expect(input).toHaveValue('')
    })

    // Static palette works
    const candidateBtn = screen.getByRole('button', { name: '+ KSampler' })
    fireEvent.click(candidateBtn)

    await waitFor(() => {
      expect(screen.getByLabelText('KSampler を削除')).toBeInTheDocument()
    })
  })
})
