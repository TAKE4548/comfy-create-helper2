import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HistoryModalPreview } from '../HistoryModalPreview'
import { promptMetadataApi } from '../../api/client'

vi.mock('../../api/client', () => ({
  snapshotsApi: {
    get: vi.fn(),
    patch: vi.fn(),
  },
  lorasApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  tagSetsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  promptMetadataApi: {
    get: vi.fn(),
    create: vi.fn(),
  },
}))

describe('HistoryModalPreview', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  const renderComponent = (props: Partial<React.ComponentProps<typeof HistoryModalPreview>> = {}) => {
    const defaultProps = {
      isOpen: true,
      onClose: vi.fn(),
      images: ['/output/image1.png?t=test-prompt-id-123'],
      currentIndex: 0,
      onChangeIndex: vi.fn(),
      snapshotIds: [null],
    }
    return render(
      <QueryClientProvider client={queryClient}>
        <HistoryModalPreview {...defaultProps} {...props} />
      </QueryClientProvider>
    )
  }

  it('renders Info button when metadata is available from localStorage and toggles panel', async () => {
    localStorage.setItem(
      'prompt-surgeon-meta-test-prompt-id-123',
      JSON.stringify({
        paramValues: {
          prompt: '1girl, fantasy, solo',
          negative: 'low quality',
          aspect_ratio: '16:9',
          sampler_name: 'euler_ancestral',
          scheduler: 'karras',
          cfg_scale: '7.5',
          steps: '30',
          seed: '999888',
        },
      })
    )

    renderComponent()

    const infoButton = await screen.findByRole('button', { name: /show info/i })
    expect(infoButton).toBeDefined()

    fireEvent.click(infoButton)

    // Panel content assertions
    expect(await screen.findByText('1girl, fantasy, solo')).toBeDefined()
    expect(screen.getByText('low quality')).toBeDefined()
    expect(screen.getByText('16:9')).toBeDefined()
    expect(screen.getByText('euler_ancestral')).toBeDefined()
    expect(screen.getByText('karras')).toBeDefined()
    expect(screen.getByText('7.5')).toBeDefined()
    expect(screen.getByText('30')).toBeDefined()
    expect(screen.getByText('999888')).toBeDefined()
  })

  it('fetches server metadata when not found in localStorage', async () => {
    vi.mocked(promptMetadataApi.get).mockResolvedValue({
      prompt_id: 'test-prompt-id-123',
      workflow_id: 1,
      param_values: {
        prompt: 'cyberpunk street',
        resolution_aspect: '3:4',
        steps: '25',
      },
      applied_assets: null,
      created_at: '2026-09-07T00:00:00',
    })

    renderComponent()

    await waitFor(() => {
      expect(promptMetadataApi.get).toHaveBeenCalledWith('test-prompt-id-123')
    })

    const infoButton = await screen.findByRole('button', { name: /show info/i })
    fireEvent.click(infoButton)

    expect(await screen.findByText('cyberpunk street')).toBeDefined()
    expect(screen.getByText('3:4')).toBeDefined()
    expect(screen.getByText('25')).toBeDefined()
  })

  it('renders correctly when toggled from isOpen=false to isOpen=true without hook mismatch error', async () => {
    const { rerender } = renderComponent({ isOpen: false })

    expect(screen.queryByRole('button', { name: /close preview/i })).toBeNull()

    // Rerender with isOpen=true to simulate modal opening
    rerender(
      <QueryClientProvider client={queryClient}>
        <HistoryModalPreview
          isOpen={true}
          onClose={vi.fn()}
          images={['/output/image1.png?t=test-prompt-id-123']}
          currentIndex={0}
          onChangeIndex={vi.fn()}
          snapshotIds={[null]}
        />
      </QueryClientProvider>
    )

    const closeButton = await screen.findByRole('button', { name: /close preview/i })
    expect(closeButton).toBeDefined()
  })
})
