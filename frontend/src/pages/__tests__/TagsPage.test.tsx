import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TagsPage } from '../TagsPage'
import { tagSetsApi, tagsetCategoriesApi, baseModelsApi } from '../../api/client'
import type { TagSet, Category, BaseModel } from '../../api/types'

vi.mock('../../api/client', () => ({
  tagSetsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
  },
  tagsetCategoriesApi: {
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
  { id: 1, name: 'Costume' },
  { id: 2, name: 'Lighting' },
]

const MOCK_BASE_MODELS: BaseModel[] = [
  { id: 1, name: 'SD 1.5', key: 'sd15' },
  { id: 2, name: 'SDXL', key: 'sdxl' },
]

const MOCK_TAG_SETS: TagSet[] = [
  {
    id: 1,
    name: 'Costume Set',
    description: 'School uniform style',
    category_id: 1,
    tags: ['serafuku', 'pleated skirt'],
    subsets: [{ id: 10, name: 'Summer', tags: ['short sleeves'] }],
    target_base_model_ids: [1],
  },
  {
    id: 2,
    name: 'Lighting Set',
    description: 'Dramatic lighting setup',
    category_id: 2,
    tags: ['cinematic light', 'soft shadow'],
    subsets: [],
    target_base_model_ids: [2],
  },
]

describe('TagsPage Component', () => {
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

    vi.mocked(tagsetCategoriesApi.list).mockResolvedValue(MOCK_CATEGORIES)
    vi.mocked(baseModelsApi.list).mockResolvedValue(MOCK_BASE_MODELS)
    vi.mocked(tagSetsApi.list).mockResolvedValue(MOCK_TAG_SETS)
    vi.mocked(tagSetsApi.delete).mockResolvedValue({} as any)
    vi.mocked(tagSetsApi.reorder).mockResolvedValue({} as any)
  })

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <TagsPage />
      </QueryClientProvider>
    )

  it('renders tag set list, tags, and category/model controls', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Costume Set')).toBeInTheDocument()
      expect(screen.getByText('Lighting Set')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Costume' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lighting' })).toBeInTheDocument()
    expect(screen.getByText('SD 1.5')).toBeInTheDocument()
    expect(screen.getByText('SDXL')).toBeInTheDocument()
    expect(screen.getByText('serafuku')).toBeInTheDocument()
    expect(screen.getByText('cinematic light')).toBeInTheDocument()
  })

  it('filters tag sets by text search', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Costume Set')).toBeInTheDocument()
      expect(screen.getByText('Lighting Set')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search tags…')
    fireEvent.change(searchInput, { target: { value: 'Dramatic' } })

    expect(screen.queryByText('Costume Set')).not.toBeInTheDocument()
    expect(screen.getByText('Lighting Set')).toBeInTheDocument()
  })

  it('filters tag sets by category click and invokes tagSetsApi.list with category ID', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Costume Set')).toBeInTheDocument()
    })

    const catBtn = screen.getByRole('button', { name: 'Costume' })
    fireEvent.click(catBtn)

    await waitFor(() => {
      expect(tagSetsApi.list).toHaveBeenCalledWith(1, undefined)
    })
  })

  it('filters tag sets by base model checkbox and invokes tagSetsApi.list with baseModelIds', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Costume Set')).toBeInTheDocument()
    })

    const sdxlCheckbox = screen.getByRole('checkbox', { name: 'SDXL' })
    fireEvent.click(sdxlCheckbox)

    await waitFor(() => {
      expect(tagSetsApi.list).toHaveBeenCalledWith(undefined, '2')
    })
  })

  it('deletes a single tag set when delete button is confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true)
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Costume Set')).toBeInTheDocument()
    })

    const deleteBtn = document.getElementById('tagset-delete-1')
    expect(deleteBtn).toBeInTheDocument()
    fireEvent.click(deleteBtn!)

    expect(confirmSpy).toHaveBeenCalledWith('Delete this tag set?')
    await waitFor(() => {
      expect(tagSetsApi.delete).toHaveBeenCalledWith(1)
    })
  })

  it('supports multi-select mode with Ctrl/Meta click, select all, and clear selection', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Costume Set')).toBeInTheDocument()
    })

    const card1 = document.getElementById('tagset-card-1')
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

  it('copies tag set tags to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Costume Set')).toBeInTheDocument()
    })

    const copyBtn = document.getElementById('copy-tagset-1')
    expect(copyBtn).toBeInTheDocument()
    if (copyBtn) {
      fireEvent.click(copyBtn)
    }

    expect(writeTextMock).toHaveBeenCalledWith('serafuku, pleated skirt')
  })
})
