import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoRAsPage } from '../LoRAsPage'
import { ImageCarousel } from '../../components/ImageCarousel'
import { lorasApi, loraCategoriesApi, baseModelsApi } from '../../api/client'
import type { Lora, Category, BaseModel } from '../../api/types'

let capturedOnDragEnd: ((event: any) => void) | null = null

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: ({ children, onDragEnd }: any) => {
      capturedOnDragEnd = onDragEnd
      return <div data-testid="dnd-context">{children}</div>
    },
  }
})

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

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    capturedOnDragEnd = null
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

  it('renders accordion sections per category, 0-item empty section, and uncategorized section', async () => {
    vi.mocked(loraCategoriesApi.list).mockResolvedValueOnce([
      ...MOCK_CATEGORIES,
      { id: 3, name: 'Poses' },
    ])
    vi.mocked(lorasApi.list).mockResolvedValueOnce([
      ...MOCK_LORAS,
      {
        id: 3,
        model_name: 'lora_gamma',
        description: 'Uncategorized LoRA',
        recommended_strength_min: 1.0,
        recommended_strength_max: 1.0,
        category_id: null,
        file_path: 'loras/gamma.safetensors',
        thumbnail_path: '',
        trigger_word_sets: [],
        target_base_model_ids: [],
      },
    ])

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
      expect(screen.getByText('lora_beta')).toBeInTheDocument()
      expect(screen.getByText('lora_gamma')).toBeInTheDocument()
    })

    // Section headers
    expect(document.getElementById('category-section-header-1')).toHaveTextContent('Character')
    expect(document.getElementById('category-section-header-1')).toHaveTextContent('(1件)')
    expect(document.getElementById('category-section-header-2')).toHaveTextContent('Style')
    expect(document.getElementById('category-section-header-2')).toHaveTextContent('(1件)')
    expect(document.getElementById('category-section-header-3')).toHaveTextContent('Poses')
    expect(document.getElementById('category-section-header-3')).toHaveTextContent('(0件)')
    expect(screen.getByText('カードがありません（ここにドラッグ＆ドロップしてカテゴリ移動）')).toBeInTheDocument()
    expect(document.getElementById('category-section-header-uncategorized')).toHaveTextContent('未分類')
    expect(document.getElementById('category-section-header-uncategorized')).toHaveTextContent('(1件)')
  })

  it('toggles accordion section open and closed on header click and persists in localStorage', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
    })

    const charHeader = document.getElementById('category-section-header-1')
    expect(charHeader).toBeInTheDocument()

    // Collapse section 1
    fireEvent.click(charHeader!)

    await waitFor(() => {
      expect(screen.queryByText('lora_alpha')).not.toBeInTheDocument()
    })

    const saved = localStorage.getItem('ps_accordion_loras')
    expect(saved).toBeTruthy()
    expect(JSON.parse(saved!)['1']).toBe(false)

    // Expand section 1
    fireEvent.click(charHeader!)

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
    })
    expect(JSON.parse(localStorage.getItem('ps_accordion_loras')!)['1']).toBe(true)
  })

  it('filters sections with multiple category selection OR logic and All reset', async () => {
    vi.mocked(lorasApi.list).mockResolvedValueOnce([
      ...MOCK_LORAS,
      {
        id: 3,
        model_name: 'lora_gamma',
        description: 'Uncategorized LoRA',
        recommended_strength_min: 1.0,
        recommended_strength_max: 1.0,
        category_id: null,
        file_path: 'loras/gamma.safetensors',
        thumbnail_path: '',
        trigger_word_sets: [],
        target_base_model_ids: [],
      },
    ])

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
      expect(screen.getByText('lora_beta')).toBeInTheDocument()
      expect(screen.getByText('lora_gamma')).toBeInTheDocument()
    })

    // Filter by Character (1)
    const charFilterBtn = document.getElementById('lora-filter-1')
    fireEvent.click(charFilterBtn!)

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
      expect(screen.queryByText('lora_beta')).not.toBeInTheDocument()
      expect(screen.queryByText('lora_gamma')).not.toBeInTheDocument()
    })

    // Also select Uncategorized (OR filter: Character + Uncategorized)
    const uncatFilterBtn = document.getElementById('lora-filter-uncategorized')
    fireEvent.click(uncatFilterBtn!)

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
      expect(screen.getByText('lora_gamma')).toBeInTheDocument()
      expect(screen.queryByText('lora_beta')).not.toBeInTheDocument()
    })

    // Click All button to reset
    const allFilterBtn = document.getElementById('lora-filter-all')
    fireEvent.click(allFilterBtn!)

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
      expect(screen.getByText('lora_beta')).toBeInTheDocument()
      expect(screen.getByText('lora_gamma')).toBeInTheDocument()
    })
  })

  it('allows drag and drop reordering even when category filter is selected (AC-7)', async () => {
    const twoCharLoras = [
      MOCK_LORAS[0],
      {
        id: 11,
        model_name: 'lora_alpha_v2',
        description: 'Second character',
        recommended_strength_min: 0.9,
        recommended_strength_max: 1.1,
        category_id: 1,
        file_path: 'loras/alpha2.safetensors',
        thumbnail_path: '',
        trigger_word_sets: [],
        target_base_model_ids: [1],
      },
    ]
    vi.mocked(lorasApi.list).mockResolvedValueOnce(twoCharLoras)

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
      expect(screen.getByText('lora_alpha_v2')).toBeInTheDocument()
    })

    // Select Character category filter
    const catBtn = document.getElementById('lora-filter-1')
    fireEvent.click(catBtn!)

    // Reorder inside Character category: active: 1, over: 11
    act(() => {
      capturedOnDragEnd?.({
        active: { id: 1 },
        over: { id: 11 },
      })
    })

    await waitFor(() => {
      expect(lorasApi.reorder).toHaveBeenCalledWith([11, 1], 1)
    })
  })

  it('handles cross-section drag and drop category move and rolls back on error (AC-8)', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('lora_alpha')).toBeInTheDocument()
      expect(screen.getByText('lora_beta')).toBeInTheDocument()
    })

    // Move lora_alpha (id: 1, cat: 1) to Style category (container-2)
    act(() => {
      capturedOnDragEnd?.({
        active: { id: 1 },
        over: { id: 'category-container-2' },
      })
    })

    await waitFor(() => {
      expect(lorasApi.reorder).toHaveBeenCalledWith([2, 1], 2)
    })

    // Rollback scenario on error
    vi.mocked(lorasApi.reorder).mockRejectedValueOnce(new Error('Network error'))
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    act(() => {
      capturedOnDragEnd?.({
        active: { id: 2 },
        over: { id: 'category-container-1' },
      })
    })

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('カテゴリ移動の保存に失敗しました。元の位置に戻します。')
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

  it('selects the filtered display order, counts collapsed cards, and blocks reorder in selection mode', async () => {
    const secondCharacter = { ...MOCK_LORAS[0], id: 11, model_name: 'lora_alpha_2' }
    vi.mocked(lorasApi.list).mockResolvedValueOnce([MOCK_LORAS[0], secondCharacter, MOCK_LORAS[1]])
    renderComponent()
    await waitFor(() => expect(screen.getByText('lora_alpha')).toBeInTheDocument())
    fireEvent.click(document.getElementById('lora-filter-1')!)

    const first = document.getElementById('lora-card-1')!
    const second = document.getElementById('lora-card-11')!
    fireEvent.click(first, { ctrlKey: true })
    fireEvent.click(second, { shiftKey: true })
    expect(first.className).toContain('border-[#3ECF8E]')
    expect(screen.getByText((_, element) => element?.tagName.toLowerCase() === 'span' && element.textContent?.includes('2 / 2 件選択中') === true)).toBeInTheDocument()

    fireEvent.click(document.getElementById('category-section-header-1')!)
    expect(document.getElementById('lora-card-1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /選択解除/ }))
    fireEvent.click(screen.getByRole('button', { name: /すべて選択/ }))
    expect(screen.getByText((_, element) => element?.tagName.toLowerCase() === 'span' && element.textContent?.includes('2 / 2 件選択中') === true)).toBeInTheDocument()

    act(() => capturedOnDragEnd?.({ active: { id: 1 }, over: { id: 11 } }))
    expect(lorasApi.reorder).not.toHaveBeenCalled()
  })

  it('bulk-updates only the selected LoRA category and leaves the other fixture untouched', async () => {
    renderComponent()
    await waitFor(() => expect(screen.getByText('lora_alpha')).toBeInTheDocument())
    fireEvent.click(document.getElementById('lora-card-1')!, { ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: '一括編集' }))

    const bulkEditor = document.querySelector('.modal-backdrop')!
    fireEvent.change(within(bulkEditor).getByRole('combobox'), { target: { value: '2' } })
    fireEvent.click(within(bulkEditor).getByRole('button', { name: '適用する' }))

    await waitFor(() => expect(lorasApi.update).toHaveBeenCalledTimes(1))
    expect(lorasApi.update).toHaveBeenCalledWith(1, expect.objectContaining({
      model_name: 'lora_alpha',
      category_id: 2,
      target_base_model_ids: [1],
      trigger_word_sets: [{ name: 'main', words: ['alpha_trigger'] }],
    }))
    expect(lorasApi.update).not.toHaveBeenCalledWith(2, expect.anything())
    expect(MOCK_LORAS[1]).toMatchObject({ id: 2, category_id: 2, target_base_model_ids: [2] })
  })

  it('assigns base models to only the selected LoRA and preserves its example paths', async () => {
    const selectedLora = { ...MOCK_LORAS[0], target_base_model_ids: [], example_paths: ['/examples/alpha.webp'] }
    vi.mocked(lorasApi.list).mockResolvedValueOnce([selectedLora, MOCK_LORAS[1]])
    renderComponent()
    await waitFor(() => expect(screen.getByText('lora_alpha')).toBeInTheDocument())
    fireEvent.click(document.getElementById('lora-card-1')!, { ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: '一括編集' }))

    const bulkEditor = document.querySelector('.modal-backdrop')!
    fireEvent.click(within(bulkEditor).getByRole('checkbox', { name: 'SDXL' }))
    fireEvent.click(within(bulkEditor).getByRole('button', { name: '適用する' }))

    await waitFor(() => expect(lorasApi.update).toHaveBeenCalledTimes(1))
    expect(lorasApi.update).toHaveBeenCalledWith(1, expect.objectContaining({
      model_name: 'lora_alpha',
      category_id: 1,
      target_base_model_ids: [2],
      example_paths: ['/examples/alpha.webp'],
    }))
    expect(lorasApi.update).not.toHaveBeenCalledWith(2, expect.anything())
  })

  it('downloads JSON containing only the selected LoRA records', async () => {
    const createObjectURL = vi.fn(() => 'blob:selected-loras')
    const downloadClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() })
    renderComponent()
    await waitFor(() => expect(screen.getByText('lora_alpha')).toBeInTheDocument())
    fireEvent.click(document.getElementById('lora-card-1')!, { ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: '選択をJSONエクスポート' }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(downloadClick).toHaveBeenCalledTimes(1)
    const [blob] = createObjectURL.mock.calls[0] as [Blob]
    const serialized = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
    const exported = JSON.parse(serialized) as Lora[]
    expect(exported.map((lora) => lora.id)).toEqual([1])
    expect(exported).toContainEqual(expect.objectContaining({ model_name: 'lora_alpha' }))
    expect(exported.some((lora) => lora.id === 2)).toBe(false)
  })

  it('confirms the selected LoRA deletion in-page and leaves state unchanged when cancelled', async () => {
    renderComponent()
    await waitFor(() => expect(screen.getByText('lora_alpha')).toBeInTheDocument())
    fireEvent.click(document.getElementById('lora-card-1')!, { ctrlKey: true })

    fireEvent.click(screen.getByRole('button', { name: /選択を削除/ }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('1件を削除')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('lora_alpha')
    expect(lorasApi.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(lorasApi.delete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /選択を削除/ }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    await waitFor(() => expect(lorasApi.delete).toHaveBeenCalledWith(1))
    expect(lorasApi.delete).toHaveBeenCalledTimes(1)
    expect(lorasApi.delete).not.toHaveBeenCalledWith(2)
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

  it('renders portrait library cards in responsive two, three, and four column layouts', async () => {
    const { container } = renderComponent()
    await waitFor(() => expect(screen.getByText('lora_alpha')).toBeInTheDocument())
    const card = document.getElementById('lora-card-1')!
    const grid = container.querySelector('[class*="max-w-[928px]"]') as HTMLElement
    expect(grid.className).toContain('grid-cols-2')
    expect(grid.className).toContain('md:grid-cols-3')
    expect(grid.className).toContain('lg:grid-cols-4')
    expect(grid.className).toContain('max-w-[928px]')
    expect(card).toHaveClass('h-[320px]')
    expect(card.querySelector('[data-testid="image-carousel"]')).toHaveClass('w-full', 'shrink-0')
  })

  it('scrubs examples on hover and swipes on touch without opening the parent card', () => {
    const onCardOpen = vi.fn()
    const { container, rerender } = render(
      <div onClick={onCardOpen}><ImageCarousel thumbnailPath="/cover.png" snapshotPaths={['/example-a.png', '/example-b.png']} alt="examples" /></div>
    )
    const carousel = container.querySelector('[data-testid="image-carousel"]')!
    fireEvent.mouseEnter(carousel)
    fireEvent.mouseEnter(screen.getByTestId('image-carousel-scrub-2'))
    expect(carousel.querySelector('img')).toHaveAttribute('src', '/example-b.png')

    const touchStart = new Event('touchstart', { bubbles: true })
    Object.defineProperty(touchStart, 'touches', { value: [{ clientX: 80 }] })
    const touchEnd = new Event('touchend', { bubbles: true })
    Object.defineProperty(touchEnd, 'changedTouches', { value: [{ clientX: 180 }] })
    const touchObserved = vi.fn()
    carousel.addEventListener('touchstart', touchObserved)
    const touchEndObserved = vi.fn()
    carousel.addEventListener('touchend', touchEndObserved)
    act(() => { carousel.dispatchEvent(touchStart); carousel.dispatchEvent(touchEnd) })
    expect(touchObserved).toHaveBeenCalledOnce()
    expect(touchObserved.mock.calls[0][0].touches[0].clientX).toBe(80)
    expect(touchEndObserved).toHaveBeenCalledOnce()
    expect(touchEndObserved.mock.calls[0][0].changedTouches[0].clientX).toBe(180)
    expect(carousel.querySelector('img')).toHaveAttribute('src', '/example-a.png')
    fireEvent.click(carousel)
    expect(onCardOpen).not.toHaveBeenCalled()
    fireEvent.click(carousel)
    expect(onCardOpen).toHaveBeenCalledTimes(1)

    rerender(<ImageCarousel thumbnailPath="/only.png" alt="single" />)
    expect(screen.getByAltText('single preview 1')).toHaveAttribute('src', '/only.png')
    expect(screen.queryByTestId('image-carousel-scrub-1')).not.toBeInTheDocument()
    rerender(<ImageCarousel alt="missing" />)
    expect(screen.getByText('No Preview')).toBeInTheDocument()
    expect(screen.getByTestId('image-carousel')).toHaveClass('bg-zinc-950')
  })
})
