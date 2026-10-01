import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BaseModelSelect } from '../BaseModelSelect'
import { baseModelsApi } from '../../../api/client'
import type { BaseModel } from '../../../api/types'

vi.mock('../../../api/client', () => ({
  baseModelsApi: {
    list: vi.fn(),
  },
}))

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

describe('BaseModelSelect', () => {
  const mockBaseModels: BaseModel[] = [
    { id: 1, name: 'SD 1.5' },
    { id: 2, name: 'SDXL' },
    { id: 3, name: 'Pony' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders base models passed via prop', () => {
    renderWithClient(
      <BaseModelSelect
        baseModels={mockBaseModels}
        selectedIds={[]}
        onChange={() => {}}
      />
    )

    expect(screen.getByText('SD 1.5')).toBeInTheDocument()
    expect(screen.getByText('SDXL')).toBeInTheDocument()
    expect(screen.getByText('Pony')).toBeInTheDocument()
  })

  it('marks checkboxes as checked when their id is in selectedIds', () => {
    renderWithClient(
      <BaseModelSelect
        baseModels={mockBaseModels}
        selectedIds={[1, 3]}
        onChange={() => {}}
      />
    )

    const checkbox1 = screen.getByRole('checkbox', { name: 'SD 1.5' }) as HTMLInputElement
    const checkbox2 = screen.getByRole('checkbox', { name: 'SDXL' }) as HTMLInputElement
    const checkbox3 = screen.getByRole('checkbox', { name: 'Pony' }) as HTMLInputElement

    expect(checkbox1.checked).toBe(true)
    expect(checkbox2.checked).toBe(false)
    expect(checkbox3.checked).toBe(true)
  })

  it('calls onChange with added ID when an unchecked box is clicked', () => {
    const handleChange = vi.fn()
    renderWithClient(
      <BaseModelSelect
        baseModels={mockBaseModels}
        selectedIds={[1]}
        onChange={handleChange}
      />
    )

    const checkbox2 = screen.getByRole('checkbox', { name: 'SDXL' })
    fireEvent.click(checkbox2)

    expect(handleChange).toHaveBeenCalledWith([1, 2])
  })

  it('calls onChange with removed ID when a checked box is clicked', () => {
    const handleChange = vi.fn()
    renderWithClient(
      <BaseModelSelect
        baseModels={mockBaseModels}
        selectedIds={[1, 2]}
        onChange={handleChange}
      />
    )

    const checkbox1 = screen.getByRole('checkbox', { name: 'SD 1.5' })
    fireEvent.click(checkbox1)

    expect(handleChange).toHaveBeenCalledWith([2])
  })

  it('renders "No base models configured." when baseModels is empty', () => {
    renderWithClient(
      <BaseModelSelect
        baseModels={[]}
        selectedIds={[]}
        onChange={() => {}}
      />
    )

    expect(screen.getByText('No base models configured.')).toBeInTheDocument()
  })

  it('fetches base models via baseModelsApi.list when baseModels prop is not provided', async () => {
    vi.mocked(baseModelsApi.list).mockResolvedValue(mockBaseModels)

    renderWithClient(
      <BaseModelSelect
        selectedIds={[]}
        onChange={() => {}}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('SD 1.5')).toBeInTheDocument()
    })
    expect(baseModelsApi.list).toHaveBeenCalledTimes(1)
  })

  it('applies purple accent class by default and green accent class when specified', () => {
    const { rerender } = renderWithClient(
      <BaseModelSelect
        baseModels={mockBaseModels}
        selectedIds={[1]}
        onChange={() => {}}
        accentClass="purple"
      />
    )

    const checkbox = screen.getByRole('checkbox', { name: 'SD 1.5' })
    expect(checkbox.className).toContain('accent-[#7C6FDD]')

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <BaseModelSelect
          baseModels={mockBaseModels}
          selectedIds={[1]}
          onChange={() => {}}
          accentClass="green"
        />
      </QueryClientProvider>
    )

    const checkboxGreen = screen.getByRole('checkbox', { name: 'SD 1.5' })
    expect(checkboxGreen.className).toContain('accent-accent-green')
  })
})
