import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoRAsPage } from '../LoRAsPage'
import { lorasApi, loraCategoriesApi, baseModelsApi } from '../../api/client'
import type { Lora, Category, BaseModel } from '../../api/types'

vi.mock('../../api/client', () => ({
  lorasApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
  },
  loraCategoriesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  baseModelsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

const MOCK_CATEGORIES: Category[] = [
  { id: 1, name: 'Character' },
  { id: 2, name: 'Style' },
]

const MOCK_BASE_MODELS: BaseModel[] = [
  { id: 1, name: 'SD 1.5', key: 'sd15' },
  { id: 2, name: 'SDXL', key: 'sdxl' },
]

const MOCK_LORAS: Lora[] = [
  {
    id: 1,
    model_name: 'lora_alpha',
    description: 'Anime character style',
    recommended_strength_min: 0.8,
    recommended_strength_max: 1.2,
    category_id: 1,
    file_path: 'loras/alpha.safetensors',
    thumbnail_path: '/thumbnails/alpha.webp',
    trigger_word_sets: [{ id: 101, name: 'main', words: ['alpha_trigger'] }],
    target_base_model_ids: [1],
  },
  {
    id: 2,
    model_name: 'lora_beta',
    description: 'Realistic scenery',
    recommended_strength_min: 0.7,
    recommended_strength_max: 0.7,
    category_id: 2,
    file_path: 'loras/beta.safetensors',
    thumbnail_path: '',
    trigger_word_sets: [],
    target_base_model_ids: [2],
  },
]

describe('LoRAsPage Component', () => {
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

    vi.mocked(loraCategoriesApi.list).mockResolvedValue(MOCK_CATEGORIES)
    vi.mocked(baseModelsApi.list).mockResolvedValue(MOCK_BASE_MODELS)
    vi.mocked(lorasApi.list).mockResolvedValue(MOCK_LORAS)
    vi.mocked(lorasApi.delete).mockResolvedValue({} as any)
    vi.mocked(lorasApi.reorder).mockResolvedValue({} as any)
  })

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <LoRAsPage />
      </QueryClientProvider>
    )

  it('renders LoRA list and category/model controls', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
      expect(screen.getByText('lora_beta')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Character' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Style' })).toBeInTheDocument()
    expect(screen.getByText('SD 1.5')).toBeInTheDocument()
    expect(screen.getByText('SDXL')).toBeInTheDocument()
    expect(screen.getByText('0.8~1.2')).toBeInTheDocument()
    expect(screen.getByText('×0.7')).toBeInTheDocument()
  })

  it('filters LoRAs by text search', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
      expect(screen.getByText('lora_beta')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search LoRAs…')
    fireEvent.change(searchInput, { target: { value: 'scenery' } })

    expect(screen.queryByText('lora_alpha')).not.toBeInTheDocument()
    expect(screen.getByText('lora_beta')).toBeInTheDocument()
  })

  it('filters LoRAs by category click and invokes lorasApi.list with category ID', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
    })

    const catBtn = screen.getByRole('button', { name: 'Character' })
    fireEvent.click(catBtn)

    await waitFor(() => {
      expect(lorasApi.list).toHaveBeenCalledWith(1, undefined)
    })
  })

  it('filters LoRAs by base model checkbox and invokes lorasApi.list with baseModelIds', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
    })

    const sdxlCheckbox = screen.getByRole('checkbox', { name: 'SDXL' })
    fireEvent.click(sdxlCheckbox)

    await waitFor(() => {
      expect(lorasApi.list).toHaveBeenCalledWith(undefined, '2')
    })
  })

  it('deletes a single LoRA when delete button is confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true)
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
    })

    const deleteBtn = document.getElementById('lora-delete-1')
    expect(deleteBtn).toBeInTheDocument()
    fireEvent.click(deleteBtn!)

    expect(confirmSpy).toHaveBeenCalledWith('Delete this LoRA?')
    await waitFor(() => {
      expect(lorasApi.delete).toHaveBeenCalledWith(1)
    })
  })

  it('supports multi-select mode with Ctrl/Meta click, select all, and clear selection', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
    })

    const card1 = document.getElementById('lora-card-1')
    expect(card1).toBeInTheDocument()

    // Ctrl+Click enters multi-select mode
    fireEvent.click(card1!, { ctrlKey: true })

    await waitFor(() => {
      expect(screen.getByText('複数選択モード')).toBeInTheDocument()
    })

    expect(screen.getByText((content, element) => {
      return element?.tagName.toLowerCase() === 'span' && element.textContent?.includes('1 / 2 件選択中') === true
    })).toBeInTheDocument()

    // Click "すべて選択"
    const selectAllBtn = screen.getByRole('button', { name: /すべて選択/ })
    fireEvent.click(selectAllBtn)

    await waitFor(() => {
      expect(screen.getByText((content, element) => {
        return element?.tagName.toLowerCase() === 'span' && element.textContent?.includes('2 / 2 件選択中') === true
      })).toBeInTheDocument()
    })

    // Click "選択解除"
    const clearBtn = screen.getByRole('button', { name: /選択解除/ })
    fireEvent.click(clearBtn)

    await waitFor(() => {
      expect(screen.getByText((content, element) => {
        return element?.tagName.toLowerCase() === 'span' && element.textContent?.includes('0 / 2 件選択中') === true
      })).toBeInTheDocument()
    })

    // Exit mode
    const exitBtn = screen.getByTitle('選択モード終了')
    fireEvent.click(exitBtn)

    await waitFor(() => {
      expect(screen.queryByText('複数選択モード')).not.toBeInTheDocument()
    })
  })

  it('copies trigger words to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('alpha_trigger')).toBeInTheDocument()
    })

    const copyBtn = document.getElementById('copy-trigger-101')
    expect(copyBtn).toBeInTheDocument()
    if (copyBtn) {
      fireEvent.click(copyBtn)
    }

    expect(writeTextMock).toHaveBeenCalledWith('alpha_trigger')
  })
})
