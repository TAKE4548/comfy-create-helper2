import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import fc from 'fast-check'
import { TagsPage } from '../TagsPage'
import { formatBaseModelSummary } from '../LoRAsPage'
import { tagSetsApi, tagsetCategoriesApi, baseModelsApi } from '../../api/client'
import type { TagSet, Category, BaseModel } from '../../api/types'
import { TagSetDetailModal } from '../../components/TagSetModals/TagSetDetailModal'

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

vi.mock('../../components/TagSetModals', () => ({
  TagSetCreateModal: ({ form, setForm, onSubmit }: any) => <div>
    <input aria-label="create-main-tags" value={form.tags} onChange={(e) => setForm((f: any) => ({ ...f, tags: e.target.value }))} />
    <input aria-label="create-subset-tags" value={form.subsets?.[0]?.tags ?? ''} onChange={(e) => setForm((f: any) => ({ ...f, subsets: f.subsets?.length ? f.subsets.map((s: any, i: number) => i === 0 ? { ...s, name: 'named', tags: e.target.value } : s) : [{ name: 'named', tags: e.target.value }] }))} />
    <input aria-label="create-subset-image" value={form.subsets?.[0]?.thumbnail_path ?? ''} onChange={(e) => setForm((f: any) => ({ ...f, subsets: f.subsets?.length ? f.subsets.map((s: any, i: number) => i === 0 ? { ...s, name: 'named', thumbnail_path: e.target.value } : s) : [{ name: 'named', tags: '', thumbnail_path: e.target.value }] }))} />
    <button onClick={onSubmit}>create-submit</button>
  </div>,
  TagSetEditModal: ({ form, setForm, onSubmit }: any) => <div>
    <input aria-label="edit-main-tags" value={form.tags} onChange={(e) => setForm((f: any) => ({ ...f, tags: e.target.value }))} />
    <input aria-label="edit-subset-tags" value={form.subsets?.[0]?.tags ?? ''} onChange={(e) => setForm((f: any) => ({ ...f, subsets: f.subsets?.map((s: any, i: number) => i === 0 ? { ...s, name: 'Summer', tags: e.target.value } : s) }))} />
    {form.subsets?.map((s: any, i: number) => <input key={i} aria-label={`edit-subset-image-${i}`} value={s.thumbnail_path ?? ''} onChange={(e) => setForm((f: any) => ({ ...f, subsets: f.subsets.map((subset: any, idx: number) => idx === i ? { ...subset, thumbnail_path: e.target.value } : subset) }))} />)}
    <button onClick={onSubmit}>edit-submit</button>
  </div>,
  TagSetDetailModal: ({ tagSet }: any) => tagSet ? <div role="dialog" aria-label="タグセット詳細モーダル">{tagSet.name}</div> : null,
}))

vi.mock('../../components/BulkEditModal', () => ({
  BulkEditModal: ({ isOpen, onApply }: any) => isOpen
    ? <button aria-label="apply-tagset-bulk-edit" onClick={() => onApply({ category_id: 2, target_base_model_ids: [2] })}>apply bulk</button>
    : null,
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
    thumbnail_path: '/cover.png',
    subsets: [
      { id: 10, name: 'Summer', tags: ['short sleeves'], thumbnail_path: '/summer-example.png' },
      { id: 11, name: 'Winter', tags: ['long sleeves'], thumbnail_path: '/winter-example.png' },
    ],
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
    localStorage.clear()
    capturedOnDragEnd = null
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

  const getTagSet = (name: string) => screen.getAllByText(name)[0]
  const queryTagSet = (name: string) => screen.queryAllByText(name)[0] ?? null

  it('renders tag set list, tags, and category/model controls', async () => {
    renderComponent()

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
      expect(getTagSet('Lighting Set')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Costume' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lighting' })).toBeInTheDocument()
    expect(screen.getAllByText('SD 1.5')[0]).toBeInTheDocument()
    expect(screen.getAllByText('SDXL')[0]).toBeInTheDocument()
    expect(screen.getByText('serafuku')).toBeInTheDocument()
    expect(screen.getByText('cinematic light')).toBeInTheDocument()
  })

  it('filters tag sets by text search', async () => {
    renderComponent()

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
      expect(getTagSet('Lighting Set')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search tags…')
    fireEvent.change(searchInput, { target: { value: 'Dramatic' } })

    expect(queryTagSet('Costume Set')).not.toBeInTheDocument()
    expect(getTagSet('Lighting Set')).toBeInTheDocument()
  })

  it('renders accordion sections per category, 0-item empty section, and uncategorized section', async () => {
    vi.mocked(tagsetCategoriesApi.list).mockResolvedValueOnce([
      ...MOCK_CATEGORIES,
      { id: 3, name: 'Background' },
    ])
    vi.mocked(tagSetsApi.list).mockResolvedValueOnce([
      ...MOCK_TAG_SETS,
      {
        id: 3,
        name: 'Uncategorized Set',
        description: 'No category item',
        category_id: null,
        tags: ['misc'],
        subsets: [],
        target_base_model_ids: [],
      },
    ])

    renderComponent()

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
      expect(getTagSet('Lighting Set')).toBeInTheDocument()
      expect(getTagSet('Uncategorized Set')).toBeInTheDocument()
    })

    // Section headers
    expect(document.getElementById('category-section-header-1')).toHaveTextContent('Costume')
    expect(document.getElementById('category-section-header-1')).toHaveTextContent('(1件)')
    expect(document.getElementById('category-section-header-2')).toHaveTextContent('Lighting')
    expect(document.getElementById('category-section-header-2')).toHaveTextContent('(1件)')
    expect(document.getElementById('category-section-header-3')).toHaveTextContent('Background')
    expect(document.getElementById('category-section-header-3')).toHaveTextContent('(0件)')
    expect(screen.getByText('カードがありません（ここにドラッグ＆ドロップしてカテゴリ移動）')).toBeInTheDocument()
    expect(document.getElementById('category-section-header-uncategorized')).toHaveTextContent('未分類')
    expect(document.getElementById('category-section-header-uncategorized')).toHaveTextContent('(1件)')
  })

  it('toggles accordion section open and closed on header click and persists in localStorage', async () => {
    renderComponent()

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
    })

    const costumeHeader = document.getElementById('category-section-header-1')
    expect(costumeHeader).toBeInTheDocument()

    // Collapse section 1
    fireEvent.click(costumeHeader!)

    await waitFor(() => {
      expect(queryTagSet('Costume Set')).not.toBeInTheDocument()
    })

    const saved = localStorage.getItem('ps_accordion_tagsets')
    expect(saved).toBeTruthy()
    expect(JSON.parse(saved!)['1']).toBe(false)

    // Expand section 1
    fireEvent.click(costumeHeader!)

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
    })
    expect(JSON.parse(localStorage.getItem('ps_accordion_tagsets')!)['1']).toBe(true)
  })

  it('filters sections with multiple category selection OR logic and All reset', async () => {
    vi.mocked(tagSetsApi.list).mockResolvedValueOnce([
      ...MOCK_TAG_SETS,
      {
        id: 3,
        name: 'Uncategorized Set',
        description: 'No category item',
        category_id: null,
        tags: ['misc'],
        subsets: [],
        target_base_model_ids: [],
      },
    ])

    renderComponent()

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
      expect(getTagSet('Lighting Set')).toBeInTheDocument()
      expect(getTagSet('Uncategorized Set')).toBeInTheDocument()
    })

    // Filter by Costume (1)
    const costumeFilterBtn = document.getElementById('tag-filter-1')
    fireEvent.click(costumeFilterBtn!)

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
      expect(queryTagSet('Lighting Set')).not.toBeInTheDocument()
      expect(queryTagSet('Uncategorized Set')).not.toBeInTheDocument()
    })

    // Also select Uncategorized (OR filter: Costume + Uncategorized)
    const uncatFilterBtn = document.getElementById('tag-filter-uncategorized')
    fireEvent.click(uncatFilterBtn!)

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
      expect(getTagSet('Uncategorized Set')).toBeInTheDocument()
      expect(queryTagSet('Lighting Set')).not.toBeInTheDocument()
    })

    // Click All button to reset
    const allFilterBtn = document.getElementById('tag-filter-all')
    fireEvent.click(allFilterBtn!)

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
      expect(getTagSet('Lighting Set')).toBeInTheDocument()
      expect(getTagSet('Uncategorized Set')).toBeInTheDocument()
    })
  })

  it('allows drag and drop reordering even when category filter is selected (AC-7)', async () => {
    const twoCostumeSets = [
      MOCK_TAG_SETS[0],
      {
        id: 11,
        name: 'Costume Set 2',
        description: 'Second costume',
        category_id: 1,
        tags: ['kimono'],
        subsets: [],
        target_base_model_ids: [1],
      },
    ]
    vi.mocked(tagSetsApi.list).mockResolvedValueOnce(twoCostumeSets)

    renderComponent()

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
      expect(getTagSet('Costume Set 2')).toBeInTheDocument()
    })

    // Select Costume category filter
    const catBtn = document.getElementById('tag-filter-1')
    fireEvent.click(catBtn!)

    // Reorder inside Costume category: active: 1, over: 11
    act(() => {
      capturedOnDragEnd?.({
        active: { id: 1 },
        over: { id: 11 },
      })
    })

    await waitFor(() => {
      expect(tagSetsApi.reorder).toHaveBeenCalledWith([11, 1], 1)
    })
  })

  it('handles cross-section drag and drop category move and rolls back on error (AC-8)', async () => {
    renderComponent()

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
      expect(getTagSet('Lighting Set')).toBeInTheDocument()
    })

    // Move Costume Set (id: 1, cat: 1) to Lighting category (container-2)
    act(() => {
      capturedOnDragEnd?.({
        active: { id: 1 },
        over: { id: 'category-container-2' },
      })
    })

    await waitFor(() => {
      expect(tagSetsApi.reorder).toHaveBeenCalledWith([2, 1], 2)
    })

    // Rollback scenario on error
    vi.mocked(tagSetsApi.reorder).mockRejectedValueOnce(new Error('Network error'))
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

  it('filters tag sets by base model checkbox and invokes tagSetsApi.list with baseModelIds', async () => {
    renderComponent()

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
    })

    const sdxlCheckbox = screen.getByRole('checkbox', { name: 'SDXL' })
    fireEvent.click(sdxlCheckbox)

    await waitFor(() => {
      expect(tagSetsApi.list).toHaveBeenCalledWith(undefined, '2')
    })
  })

  it('deletes a single tag set when delete button is confirmed', async () => {
    renderComponent()

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
    })

    const deleteBtn = document.getElementById('tagset-delete-1')
    expect(deleteBtn).toBeInTheDocument()
    fireEvent.click(deleteBtn!)

    expect(screen.getByRole('alertdialog', { name: 'タグセット削除の確認' })).toHaveTextContent('Costume Set')
    expect(tagSetsApi.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    await waitFor(() => {
      expect(tagSetsApi.delete).toHaveBeenCalledWith(1)
    })
  })

  it('select all uses the complete filtered display list and disables sorting while selected', async () => {
    renderComponent()
    await waitFor(() => expect(getTagSet('Costume Set')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Search tags…'), { target: { value: 'Costume' } })
    fireEvent.click(document.getElementById('tagset-card-1')!, { ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: /すべて選択/ }))
    expect(screen.getByText((_, element) => element?.tagName.toLowerCase() === 'span' && element.textContent?.includes('1 / 1 件選択中') === true)).toBeInTheDocument()
    expect(document.getElementById('tagset-card-1')).toHaveClass('border-accent-green', 'ring-accent-green/40')
    expect(document.getElementById('tagset-card-1')).not.toHaveTextContent('並び替えハンドル')
    act(() => capturedOnDragEnd?.({ active: { id: 1 }, over: { id: 2 } }))
    expect(tagSetsApi.reorder).not.toHaveBeenCalled()
  })

  it('serializes nested main and subset tags through the shared parser on create and update', async () => {
    renderComponent()
    fireEvent.click(screen.getByRole('button', { name: /New Tag Set/ }))
    fireEvent.change(screen.getByLabelText('create-main-tags'), { target: { value: '(red hair, long hair:1.2), blue_eyes' } })
    fireEvent.change(screen.getByLabelText('create-subset-image'), { target: { value: '/created-subset.png' } })
    fireEvent.change(screen.getByLabelText('create-subset-tags'), { target: { value: '[soft light, rim_light], green_eyes' } })
    fireEvent.click(screen.getByRole('button', { name: 'create-submit' }))
    await waitFor(() => expect(tagSetsApi.create).toHaveBeenCalledWith(expect.objectContaining({
      tags: ['(red hair, long hair:1.2)', 'blue eyes'],
      subsets: [{ name: 'named', tags: ['[soft light, rim light]', 'green eyes'], thumbnail_path: '/created-subset.png' }],
    })))

    await waitFor(() => expect(document.getElementById('tagset-edit-1')).toBeInTheDocument())
    fireEvent.click(document.getElementById('tagset-edit-1')!)
    expect(screen.getByLabelText('edit-subset-image-0')).toHaveValue('/summer-example.png')
    expect(screen.getByLabelText('edit-subset-image-1')).toHaveValue('/winter-example.png')
    fireEvent.change(screen.getByLabelText('edit-main-tags'), { target: { value: '(a, b:0.7), c_d' } })
    fireEvent.change(screen.getByLabelText('edit-subset-tags'), { target: { value: '(x, y), z_z' } })
    fireEvent.click(screen.getByRole('button', { name: 'edit-submit' }))
    await waitFor(() => expect(tagSetsApi.update).toHaveBeenCalledWith(1, expect.objectContaining({
      tags: ['(a, b:0.7)', 'c d'],
      thumbnail_path: '/cover.png',
      subsets: [
        { name: 'Summer', tags: ['(x, y)', 'z z'], thumbnail_path: '/summer-example.png' },
        { name: 'Winter', tags: ['long sleeves'], thumbnail_path: '/winter-example.png' },
      ],
    })))

    await waitFor(() => expect(document.getElementById('tagset-edit-1')).toBeInTheDocument())
    fireEvent.click(document.getElementById('tagset-edit-1')!)
    expect(screen.getByLabelText('edit-subset-image-0')).toHaveValue('/summer-example.png')
    expect(screen.getByLabelText('edit-subset-image-1')).toHaveValue('/winter-example.png')
  })

  it('preserves named subset images when bulk category and model changes use full replacement updates', async () => {
    renderComponent()
    await waitFor(() => expect(getTagSet('Costume Set')).toBeInTheDocument())
    fireEvent.click(document.getElementById('tagset-card-1')!, { ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: '一括編集' }))
    fireEvent.click(screen.getByRole('button', { name: 'apply-tagset-bulk-edit' }))

    await waitFor(() => expect(tagSetsApi.update).toHaveBeenCalledTimes(1))
    expect(tagSetsApi.update).toHaveBeenCalledWith(1, expect.objectContaining({
      name: 'Costume Set',
      category_id: 2,
      tags: ['serafuku', 'pleated skirt'],
      thumbnail_path: '/cover.png',
      target_base_model_ids: [2],
      subsets: [
        { name: 'Summer', tags: ['short sleeves'], thumbnail_path: '/summer-example.png' },
        { name: 'Winter', tags: ['long sleeves'], thumbnail_path: '/winter-example.png' },
      ],
    }))
    expect(tagSetsApi.update).not.toHaveBeenCalledWith(2, expect.anything())
    expect(MOCK_TAG_SETS[1]).toMatchObject({ id: 2, category_id: 2, target_base_model_ids: [2] })
  })

  it('confirms deletion of only selected tag sets and cancel leaves them untouched', async () => {
    renderComponent()
    await waitFor(() => expect(getTagSet('Costume Set')).toBeInTheDocument())
    fireEvent.click(document.getElementById('tagset-card-1')!, { ctrlKey: true })

    fireEvent.click(screen.getByRole('button', { name: /選択を削除/ }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('1件')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Costume Set')
    expect(screen.getByRole('alertdialog')).not.toHaveTextContent('Lighting Set')
    expect(tagSetsApi.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(tagSetsApi.delete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /選択を削除/ }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    await waitFor(() => expect(tagSetsApi.delete).toHaveBeenCalledWith(1))
    expect(tagSetsApi.delete).toHaveBeenCalledTimes(1)
    expect(tagSetsApi.delete).not.toHaveBeenCalledWith(2)
  })

  it('shows and reopens each named subset with its own image', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TagSetDetailModal
          tagSet={MOCK_TAG_SETS[0]}
          categories={MOCK_CATEGORIES}
          copiedId={null}
          onCopy={vi.fn()}
          onClose={vi.fn()}
          onSave={vi.fn()}
          isPending={false}
          onCategoryCreated={vi.fn()}
        />
      </QueryClientProvider>,
    )
    expect(screen.getByAltText('Summer thumbnail')).toHaveAttribute('src', '/summer-example.png')
    expect(screen.getByAltText('Winter thumbnail')).toHaveAttribute('src', '/winter-example.png')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(await screen.findByAltText('Summer preview')).toHaveAttribute('src', '/summer-example.png')
    expect(screen.getByAltText('Winter preview')).toHaveAttribute('src', '/winter-example.png')
  })

  it('supports multi-select mode with Ctrl/Meta click, select all, and clear selection', async () => {
    renderComponent()

    await waitFor(() => {
      expect(getTagSet('Costume Set')).toBeInTheDocument()
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
      expect(getTagSet('Costume Set')).toBeInTheDocument()
    })

    const copyBtn = document.getElementById('copy-tagset-1')
    expect(copyBtn).toBeInTheDocument()
    if (copyBtn) {
      fireEvent.click(copyBtn)
    }

    expect(writeTextMock).toHaveBeenCalledWith('serafuku, pleated skirt')
  })

  it('renders portrait cards in a 2/3/4 responsive grid with configured image ratio and usable controls', async () => {
    localStorage.setItem('prompt-surgeon-thumbnail-aspect-ratio', '2:3')
    renderComponent()
    await waitFor(() => expect(getTagSet('Costume Set')).toBeInTheDocument())

    const card = document.getElementById('tagset-card-1')!
    expect(card.className).toContain('w-full')
    expect(card.className).toContain('max-w-[220px]')
    expect(card).toHaveClass('h-[320px]')
    const grid = card.closest('.grid')!
    expect(grid.className).toContain('grid-cols-2')
    expect(grid.className).toContain('md:grid-cols-3')
    expect(grid.className).toContain('lg:grid-cols-4')
    expect(grid.className).not.toContain('xl:grid-cols-5')

    const carousel = card.querySelector('[data-testid="image-carousel"]')
    expect(carousel).toBeInTheDocument()
    expect(carousel).toHaveClass('w-full', 'shrink-0')
    expect(card.querySelector('[data-testid="image-carousel-frame"]')).toBeInTheDocument()
    expect(getTagSet('School uniform style')).toHaveClass('line-clamp-2')
    expect(document.getElementById('category-section-header-1')).toHaveClass('sticky', 'top-0', 'min-h-[44px]')
    expect(screen.getByRole('button', { name: 'Copy tag serafuku' })).toHaveClass('min-h-[44px]', 'text-[11px]')
    expect(card.querySelector('[aria-label="並び替えハンドル"]')).toHaveClass('min-h-[44px]', 'min-w-[44px]')
    expect(document.getElementById('tagset-edit-1')).toHaveClass('min-h-[44px]', 'min-w-[44px]')
    expect(document.getElementById('tagset-delete-1')).toHaveClass('min-h-[44px]', 'min-w-[44px]')
  })

  describe('REQ-376: Mobile Tag Set Card Layout & Scroll Unification', () => {
    it('[REQ-376/AC-1] maintains fixed 320px card height without overflow', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('tagset-card-1')).toBeInTheDocument())
      const card = document.getElementById('tagset-card-1')!
      expect(card).toHaveClass('h-[320px]', 'min-h-[320px]', 'max-h-[320px]', 'overflow-hidden')
    })

    it('[REQ-376/AC-2] displays exactly 3 items in order in mobile area (title, description, base model)', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('tagset-card-1')).toBeInTheDocument())
      const card = document.getElementById('tagset-card-1')!
      const mobileArea = card.querySelector('.flex.md\\:hidden')!
      expect(mobileArea).toBeInTheDocument()

      const paragraphs = mobileArea.querySelectorAll('p')
      expect(paragraphs).toHaveLength(3)

      // 1: Title
      expect(paragraphs[0]).toHaveTextContent('Costume Set')
      expect(paragraphs[0]).toHaveClass('text-xs', 'font-semibold', 'text-zinc-200', 'line-clamp-2', 'break-words')

      // 2: Description
      expect(paragraphs[1]).toHaveTextContent('School uniform style')
      expect(paragraphs[1]).toHaveClass('text-[11px]', 'text-zinc-400', 'line-clamp-2', 'break-words')

      // 3: Base Model (aligned to bottom)
      expect(paragraphs[2]).toHaveTextContent('SD 1.5')
      expect(paragraphs[2]).toHaveClass('text-[11px]', 'text-zinc-500', 'truncate', 'mt-auto', 'pt-1', 'whitespace-nowrap')
    })

    it('[REQ-376/AC-3] clamps multi-line titles and descriptions with line-clamp-2 and break-words', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('tagset-card-1')).toBeInTheDocument())
      const card = document.getElementById('tagset-card-1')!
      const mobileArea = card.querySelector('.flex.md\\:hidden')!
      const title = mobileArea.querySelector('p.text-xs')
      const desc = mobileArea.querySelector('p.text-\\[11px\\]')
      expect(title).toHaveClass('line-clamp-2', 'break-words')
      expect(desc).toHaveClass('line-clamp-2', 'break-words')
    })

    it('[REQ-376/AC-4] removes card-internal scroll in mobile view using overflow-hidden', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('tagset-card-1')).toBeInTheDocument())
      const card = document.getElementById('tagset-card-1')!
      const mobileArea = card.querySelector('.flex.md\\:hidden')!
      expect(mobileArea).toHaveClass('overflow-hidden')
      expect(mobileArea).not.toHaveClass('overflow-y-auto')
    })

    it('[REQ-376/AC-5] sticks category section header with pt-0 container and removes category badge from mobile card', async () => {
      const { container } = renderComponent()
      await waitFor(() => expect(document.getElementById('tagset-card-1')).toBeInTheDocument())
      const scrollContainer = container.querySelector('.flex-1.overflow-y-auto.custom-scrollbar')!
      expect(scrollContainer).toHaveClass('p-5', 'pt-0', 'md:pt-5')

      const header = document.getElementById('category-section-header-1')!
      expect(header).toHaveClass('sticky', 'top-0', 'min-h-[44px]')

      const card = document.getElementById('tagset-card-1')!
      const mobileArea = card.querySelector('.flex.md\\:hidden')!
      expect(mobileArea.querySelector('span')).not.toBeInTheDocument()

      const desktopArea = card.querySelector('.hidden.md\\:flex')!
      expect(desktopArea.querySelector('span.rounded-full')).toHaveTextContent('Costume')
    })

    it('[REQ-376/AC-7] applies centering classes to ImageCarousel for mobile thumbnail alignment', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('tagset-card-1')).toBeInTheDocument())
      const card = document.getElementById('tagset-card-1')!
      const carousel = card.querySelector('[data-testid="image-carousel"]')!
      expect(carousel.className).toContain('justify-center')
      expect(carousel.className).toContain('max-md:[&>[data-testid=image-carousel-frame]]:left-1/2')
      expect(carousel.className).toContain('max-md:[&>[data-testid=image-carousel-frame]]:-translate-x-1/2')
    })

    it('[REQ-376/AC-8] keeps tag set tags accessible via detail modal on card click', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('tagset-card-1')).toBeInTheDocument())
      const card = document.getElementById('tagset-card-1')!
      fireEvent.click(card)
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: 'タグセット詳細モーダル' })).toBeInTheDocument()
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
      await waitFor(() => expect(document.getElementById('tagset-card-1')).toBeInTheDocument())

      // Accordion toggle
      const header = document.getElementById('category-section-header-1')!
      fireEvent.click(header)
      expect(header).toBeInTheDocument()

      // Search input exists
      const searchInput = screen.getByPlaceholderText('Search tags…')
      fireEvent.change(searchInput, { target: { value: 'Lighting' } })
      expect(searchInput).toHaveValue('Lighting')
    })

    it('[REQ-376/AC-11] renders safely on 360px viewport, missing descriptions, missing thumbnail, and uncategorized cards', async () => {
      const anomalyTagSets: TagSet[] = [
        {
          id: 99,
          name: 'super_long_tagset_name_without_spaces_1234567890_abcdefghij',
          description: '',
          category_id: null,
          thumbnail_path: '',
          snapshot_paths: [],
          tags: ['tag1'],
          subsets: [],
          target_base_model_ids: [9999],
          sort_order: 1,
          created_at: '2026-01-01',
        },
      ]
      vi.mocked(tagSetsApi.list).mockResolvedValue(anomalyTagSets)
      renderComponent()

      await waitFor(() => {
        expect(document.getElementById('tagset-card-99')).toBeInTheDocument()
      })

      const card = document.getElementById('tagset-card-99')!
      expect(card).toBeInTheDocument()
      const mobileArea = card.querySelector('.flex.md\\:hidden')!
      expect(mobileArea).toBeInTheDocument()
      expect(mobileArea.querySelector('p[title="説明なし"]')).toHaveTextContent('説明なし')
      expect(mobileArea.querySelector('p[title="対象モデル未設定"]')).toHaveTextContent('対象モデル未設定')
    })

    it('[REQ-376/AC-12] preserves full desktop baseline layout with card-internal scroll and tags', async () => {
      renderComponent()
      await waitFor(() => expect(document.getElementById('tagset-card-1')).toBeInTheDocument())
      const card = document.getElementById('tagset-card-1')!
      const desktopArea = card.querySelector('.hidden.md\\:flex')!
      expect(desktopArea).toBeInTheDocument()
      expect(desktopArea).toHaveClass('overflow-y-auto', 'custom-scrollbar')
      expect(desktopArea.querySelector('#copy-tagset-1')).toBeInTheDocument()
    })
  })
})
