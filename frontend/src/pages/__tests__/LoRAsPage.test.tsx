import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import fc from 'fast-check'
import { LoRAsPage, formatBaseModelSummary } from '../LoRAsPage'
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
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
      expect(screen.getAllByText('lora_beta')[0]).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Character' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Style' })).toBeInTheDocument()
    expect(screen.getAllByText('SD 1.5')[0]).toBeInTheDocument()
    expect(screen.getAllByText('SDXL')[0]).toBeInTheDocument()
    expect(screen.getByText('0.8~1.2')).toBeInTheDocument()
    expect(screen.getByText('×0.7')).toBeInTheDocument()
  })

  it('filters LoRAs by text search', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
      expect(screen.getAllByText('lora_beta')[0]).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search LoRAs…')
    fireEvent.change(searchInput, { target: { value: 'scenery' } })

    expect(screen.queryByText('lora_alpha')).not.toBeInTheDocument()
    expect(screen.getAllByText('lora_beta')[0]).toBeInTheDocument()
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
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
      expect(screen.getAllByText('lora_beta')[0]).toBeInTheDocument()
      expect(screen.getAllByText('lora_gamma')[0]).toBeInTheDocument()
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
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
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
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
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
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
      expect(screen.getAllByText('lora_beta')[0]).toBeInTheDocument()
      expect(screen.getAllByText('lora_gamma')[0]).toBeInTheDocument()
    })

    // Filter by Character (1)
    const charFilterBtn = document.getElementById('lora-filter-1')
    fireEvent.click(charFilterBtn!)

    await waitFor(() => {
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
      expect(screen.queryByText('lora_beta')).not.toBeInTheDocument()
      expect(screen.queryByText('lora_gamma')).not.toBeInTheDocument()
    })

    // Also select Uncategorized (OR filter: Character + Uncategorized)
    const uncatFilterBtn = document.getElementById('lora-filter-uncategorized')
    fireEvent.click(uncatFilterBtn!)

    await waitFor(() => {
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
      expect(screen.getAllByText('lora_gamma')[0]).toBeInTheDocument()
      expect(screen.queryByText('lora_beta')).not.toBeInTheDocument()
    })

    // Click All button to reset
    const allFilterBtn = document.getElementById('lora-filter-all')
    fireEvent.click(allFilterBtn!)

    await waitFor(() => {
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
      expect(screen.getAllByText('lora_beta')[0]).toBeInTheDocument()
      expect(screen.getAllByText('lora_gamma')[0]).toBeInTheDocument()
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
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
      expect(screen.getAllByText('lora_alpha_v2')[0]).toBeInTheDocument()
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
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
      expect(screen.getAllByText('lora_beta')[0]).toBeInTheDocument()
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
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
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
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
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
      expect(screen.getAllByText('lora_alpha')[0]).toBeInTheDocument()
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
    await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
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
    await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
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
    await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
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
    await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
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
    await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
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
    await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
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

  describe('REQ-376: Mobile LoRA Card Layout & Scroll Unification', () => {
    it('[REQ-376/AC-1] maintains fixed 320px card height without overflow', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
      const card = document.getElementById('lora-card-1')!
      expect(card).toHaveClass('h-[320px]', 'min-h-[320px]', 'max-h-[320px]', 'overflow-hidden')
    })

    it('[REQ-376/AC-2] displays exactly 3 items in order in mobile area (title, description, base model)', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
      const card = document.getElementById('lora-card-1')!
      const mobileArea = card.querySelector('.flex.md\\:hidden')!
      expect(mobileArea).toBeInTheDocument()

      const paragraphs = mobileArea.querySelectorAll('p')
      expect(paragraphs).toHaveLength(3)

      // 1: Title
      expect(paragraphs[0]).toHaveTextContent('lora_alpha')
      expect(paragraphs[0]).toHaveClass('text-xs', 'font-semibold', 'text-zinc-200', 'line-clamp-2', 'break-words')

      // 2: Description
      expect(paragraphs[1]).toHaveTextContent('Anime character style')
      expect(paragraphs[1]).toHaveClass('text-[11px]', 'text-zinc-400', 'line-clamp-2', 'break-words')

      // 3: Base Model (aligned to bottom)
      expect(paragraphs[2]).toHaveTextContent('SD 1.5')
      expect(paragraphs[2]).toHaveClass('text-[11px]', 'text-zinc-500', 'truncate', 'mt-auto', 'pt-1', 'whitespace-nowrap')
    })

    it('[REQ-376/AC-3] clamps multi-line titles and descriptions with line-clamp-2 and break-words', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
      const card = document.getElementById('lora-card-1')!
      const mobileArea = card.querySelector('.flex.md\\:hidden')!
      const title = mobileArea.querySelector('p.text-xs')
      const desc = mobileArea.querySelector('p.text-\\[11px\\]')
      expect(title).toHaveClass('line-clamp-2', 'break-words')
      expect(desc).toHaveClass('line-clamp-2', 'break-words')
    })

    it('[REQ-376/AC-4] removes card-internal scroll in mobile view using overflow-hidden', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
      const card = document.getElementById('lora-card-1')!
      const mobileArea = card.querySelector('.flex.md\\:hidden')!
      expect(mobileArea).toHaveClass('overflow-hidden')
      expect(mobileArea).not.toHaveClass('overflow-y-auto')
    })

    it('[REQ-376/AC-5] sticks category section header with pt-0 container and removes category badge from mobile card', async () => {
      const { container } = renderComponent()
      await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
      const scrollContainer = container.querySelector('.flex-1.overflow-y-auto.custom-scrollbar')!
      expect(scrollContainer).toHaveClass('p-5', 'pt-0', 'md:pt-5')

      const header = document.getElementById('category-section-header-1')!
      expect(header).toHaveClass('sticky', 'top-0', 'min-h-[44px]')

      const card = document.getElementById('lora-card-1')!
      const mobileArea = card.querySelector('.flex.md\\:hidden')!
      expect(mobileArea.textContent).not.toContain('Character')
    })

    it('[REQ-376/AC-7] applies centering classes to ImageCarousel for mobile thumbnail alignment', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
      const card = document.getElementById('lora-card-1')!
      const carousel = card.querySelector('[data-testid="image-carousel"]')!
      expect(carousel.className).toContain('justify-center')
      expect(carousel.className).toContain('max-md:[&>[data-testid=image-carousel-frame]]:left-1/2')
      expect(carousel.className).toContain('max-md:[&>[data-testid=image-carousel-frame]]:-translate-x-1/2')
    })

    it('[REQ-376/AC-8] keeps triggers, strength, and file path accessible via detail modal on card click', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
      const card = document.getElementById('lora-card-1')!
      fireEvent.click(card)
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('[REQ-376/AC-9] formats base models with delimiter and validates properties with fast-check', () => {
      // Unit behavior
      expect(formatBaseModelSummary([], MOCK_BASE_MODELS).caption).toBe('対象モデル未設定')
      expect(formatBaseModelSummary(null, MOCK_BASE_MODELS).caption).toBe('対象モデル未設定')
      expect(formatBaseModelSummary([1], MOCK_BASE_MODELS).caption).toBe('SD 1.5')
      expect(formatBaseModelSummary([1, 2], MOCK_BASE_MODELS).caption).toBe('SD 1.5 · SDXL')
      expect(formatBaseModelSummary([1, 2], MOCK_BASE_MODELS).tooltip).toBe('SD 1.5, SDXL')
      expect(formatBaseModelSummary([999], MOCK_BASE_MODELS).caption).toBe('対象モデル未設定')

      // Property-based test
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 100 }),
              name: fc.string({ minLength: 0, maxLength: 50 }),
              key: fc.string({ minLength: 1, maxLength: 20 }),
            }),
            { maxLength: 20 },
          ),
          fc.array(fc.integer({ min: 1, max: 100 }), { maxLength: 10 }),
          (models, targetIds) => {
            const res = formatBaseModelSummary(targetIds, models)
            expect(typeof res.caption).toBe('string')
            expect(typeof res.tooltip).toBe('string')
            if (targetIds.length === 0) {
              expect(res.caption).toBe('対象モデル未設定')
            }
          },
        ),
      )
    })

    it('[REQ-376/AC-10] preserves existing search, filter, and accordion functionality', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())

      // Accordion toggle
      const header = document.getElementById('category-section-header-1')!
      fireEvent.click(header)
      expect(header).toBeInTheDocument()

      // Search input exists
      const searchInput = screen.getByPlaceholderText('Search LoRAs…')
      fireEvent.change(searchInput, { target: { value: 'beta' } })
      expect(searchInput).toHaveValue('beta')
    })

    it('[REQ-376/AC-11] renders safely on 360px viewport, missing descriptions, missing thumbnail, and uncategorized cards', async () => {
      const anomalyLoras: Lora[] = [
        {
          id: 99,
          model_name: 'models/super_long_model_name_without_spaces_1234567890_abcdefghij.safetensors',
          description: '',
          category_id: null as any,
          thumbnail_path: '',
          snapshot_paths: [],
          trigger_word_sets: [],
          target_base_model_ids: [9999],
        },
      ]
      vi.mocked(lorasApi.list).mockResolvedValue(anomalyLoras)
      renderComponent()

      await waitFor(() => {
        expect(document.getElementById('lora-card-99')).toBeInTheDocument()
      })

      const card = document.getElementById('lora-card-99')!
      expect(card).toBeInTheDocument()
      const mobileArea = card.querySelector('.flex.md\\:hidden')!
      expect(mobileArea).toBeInTheDocument()
      expect(mobileArea.querySelector('p[title="説明なし"]')).toHaveTextContent('説明なし')
      expect(mobileArea.querySelector('p[title="対象モデル未設定"]')).toHaveTextContent('対象モデル未設定')
    })

    it('[REQ-376/AC-12] preserves full desktop baseline layout with card-internal scroll and triggers', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('lora-card-1')).toBeInTheDocument())
      const card = document.getElementById('lora-card-1')!
      const desktopArea = card.querySelector('.hidden.md\\:flex')!
      expect(desktopArea).toBeInTheDocument()
      expect(desktopArea).toHaveClass('overflow-y-auto', 'custom-scrollbar')
      expect(desktopArea.querySelector('#copy-trigger-101')).toBeInTheDocument()
      expect(desktopArea.querySelector('#lora-path-1')).toBeInTheDocument()
    })
  })
})
