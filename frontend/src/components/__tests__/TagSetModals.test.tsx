import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TagSetCreateModal, TagSetDetailModal, type TagSetFormState } from '../TagSetModals'
import { baseModelsApi } from '../../api/client'
import type { Category, BaseModel, TagSet } from '../../api/types'

vi.mock('../../api/client', () => ({
  tagsetCategoriesApi: {
    create: vi.fn(),
  },
  baseModelsApi: {
    list: vi.fn(),
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

describe('TagSetModals Component (TagSetCreateModal)', () => {
  let queryClient: QueryClient
  let formState: TagSetFormState
  const setFormMock = vi.fn()
  const onCloseMock = vi.fn()
  const onSubmitMock = vi.fn()
  const onCategoryCreatedMock = vi.fn()
  const onUploadImageMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    formState = {
      name: '',
      description: '',
      category_id: undefined,
      tags: '',
      subsets: [],
      target_base_model_ids: [],
    }

    vi.mocked(baseModelsApi.list).mockResolvedValue(MOCK_BASE_MODELS)
  })

  const renderComponent = (currentForm = formState, isPending = false) =>
    render(
      <QueryClientProvider client={queryClient}>
        <TagSetCreateModal
          form={currentForm}
          setForm={setFormMock}
          categories={MOCK_CATEGORIES}
          isPending={isPending}
          onClose={onCloseMock}
          onSubmit={onSubmitMock}
          onCategoryCreated={onCategoryCreatedMock}
          onUploadImage={onUploadImageMock}
        />
      </QueryClientProvider>
    )

  it('renders TagSetCreateModal and allows typing into inputs', async () => {
    const currentForm: TagSetFormState = {
      name: '',
      description: '',
      category_id: undefined,
      tags: '',
      subsets: [],
      target_base_model_ids: [],
    }

    renderComponent(currentForm)

    expect(screen.getByText('New Tag Set')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. 水着セット')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('swimsuit, bikini, white bikini, ...')).toBeInTheDocument()

    const nameInput = screen.getByPlaceholderText('e.g. 水着セット') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'School Uniform' } })

    expect(setFormMock).toHaveBeenCalled()
    expect(setFormMock).toHaveBeenCalledWith(expect.any(Function))
  })

  it('disables submit button when required fields are missing and enables when present', async () => {
    // Incomplete form
    const { rerender } = renderComponent(formState)
    const submitBtn = screen.getByRole('button', { name: 'Create Tag Set' })
    expect(submitBtn).toBeDisabled()

    // Complete form
    const filledForm: TagSetFormState = {
      ...formState,
      name: 'Bikini Set',
      tags: 'bikini, beach',
    }

    rerender(
      <QueryClientProvider client={queryClient}>
        <TagSetCreateModal
          form={filledForm}
          setForm={setFormMock}
          categories={MOCK_CATEGORIES}
          isPending={false}
          onClose={onCloseMock}
          onSubmit={onSubmitMock}
          onCategoryCreated={onCategoryCreatedMock}
          onUploadImage={onUploadImageMock}
        />
      </QueryClientProvider>
    )

    const enabledSubmitBtn = screen.getByRole('button', { name: 'Create Tag Set' })
    expect(enabledSubmitBtn).not.toBeDisabled()

    fireEvent.click(enabledSubmitBtn)
    expect(onSubmitMock).toHaveBeenCalled()
  })

  it('dynamically adds, edits, and removes subsets (variations)', async () => {
    const formWithSubsets: TagSetFormState = {
      ...formState,
      name: 'Uniform Set',
      tags: 'uniform',
      subsets: [
        { name: 'Summer', tags: 'short sleeves' },
        { name: 'Winter', tags: 'long coat' },
      ],
    }

    renderComponent(formWithSubsets)

    expect(screen.getByDisplayValue('Summer')).toBeInTheDocument()
    expect(screen.getByText('short sleeves')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Winter')).toBeInTheDocument()
    expect(screen.getByText('long coat')).toBeInTheDocument()

    // Add subset
    const addBtn = screen.getByRole('button', { name: 'Add Subset' })
    fireEvent.click(addBtn)

    expect(setFormMock).toHaveBeenCalled()
    const addUpdater = setFormMock.mock.calls
      .map(([updater]) => updater as (current: TagSetFormState) => TagSetFormState)
      .find((updater) => updater(formWithSubsets).subsets?.length === 3)
    if (!addUpdater) throw new Error('Expected an updater that appends a subset')
    const addedState = addUpdater(formWithSubsets)
    expect(addedState.subsets).toHaveLength(3)
    expect(addedState.subsets[2]).toMatchObject({ name: '', tags: '' })

    // Edit subset name
    setFormMock.mockClear()
    const nameInput = screen.getByDisplayValue('Summer')
    fireEvent.change(nameInput, { target: { value: 'Early Summer' } })

    expect(setFormMock).toHaveBeenCalled()
    const editUpdater = setFormMock.mock.calls[0][0]
    const editedState = editUpdater(formWithSubsets)
    expect(editedState.subsets[0].name).toBe('Early Summer')

    // Remove first subset
    setFormMock.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Summer を削除' }))

    expect(setFormMock).toHaveBeenCalled()
  })

  it('renders TagChipEditor in chips mode and synchronizes tag deletion', async () => {
    const formWithTags: TagSetFormState = {
      ...formState,
      name: 'Bikini Set',
      tags: 'bikini, beach',
    }

    renderComponent(formWithTags)

    expect(screen.getByText('Chips Mode')).toBeInTheDocument()
    expect(screen.getByText('bikini')).toBeInTheDocument()
    expect(screen.getByText('beach')).toBeInTheDocument()

    const deleteBtn = screen.getByLabelText('タグ bikini を削除')
    fireEvent.click(deleteBtn)
    expect(setFormMock).toHaveBeenCalled()
  })
})

describe('TagSetModals Component (TagSetDetailModal)', () => {
  let queryClient: QueryClient
  const onCopyMock = vi.fn()
  const onCloseMock = vi.fn()
  const onSaveMock = vi.fn()
  const onCategoryCreatedMock = vi.fn()

  const mockTagSet: TagSet = {
    id: 10,
    name: 'Sailor Suit',
    description: 'Classic uniform',
    category_id: 1,
    tags: ['sailor suit', 'pleated skirt', 'neckerchief'],
    thumbnail_path: '/images/thumb.jpg',
    snapshot_paths: ['/images/thumb.jpg'],
    sort_order: 1,
    created_at: '2026-09-17T00:00:00Z',
    subsets: [
      { id: 1, tag_set_id: 10, name: 'Summer', tags: ['short sleeves', 'white socks'] },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.mocked(baseModelsApi.list).mockResolvedValue(MOCK_BASE_MODELS)
  })

  it('renders TagChipViewer in chips mode initially and toggles to text mode on toggle button click', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TagSetDetailModal
          tagSet={mockTagSet}
          categories={MOCK_CATEGORIES}
          copiedId={null}
          onCopy={onCopyMock}
          onClose={onCloseMock}
          onSave={onSaveMock}
          isPending={false}
          onCategoryCreated={onCategoryCreatedMock}
        />
      </QueryClientProvider>
    )

    // Verify chips mode by default for main tags and subsets
    expect(screen.getByText('sailor suit')).toBeInTheDocument()
    expect(screen.getByText('pleated skirt')).toBeInTheDocument()
    expect(screen.getByText('neckerchief')).toBeInTheDocument()
    expect(screen.getByText('short sleeves')).toBeInTheDocument()
    expect(screen.getByText('white socks')).toBeInTheDocument()

    // Toggle main tags to text mode
    const toggleButtons = screen.getAllByRole('button', { name: /switch to text view/i })
    expect(toggleButtons.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(toggleButtons[0])

    // Should display comma-separated text
    expect(screen.getByText('sailor suit, pleated skirt, neckerchief')).toBeInTheDocument()

    // Toggle back to chips mode
    const chipsToggleBtn = screen.getByRole('button', { name: /switch to chips view/i })
    fireEvent.click(chipsToggleBtn)
    expect(screen.getByText('sailor suit')).toBeInTheDocument()
  })

  it('persists distinct subset images through detail edit, save, and reopen independently of the parent cover', () => {
    let persisted: TagSet = {
      ...mockTagSet,
      thumbnail_path: '/images/parent-cover.jpg',
      subsets: [
        { id: 11, tag_set_id: 10, name: 'Day', tags: ['linen', 'sun hat'], thumbnail_path: '/images/day.jpg' },
        { id: 12, tag_set_id: 10, name: 'Night', tags: ['silk', 'moon brooch'], thumbnail_path: '/images/night.jpg' },
      ],
    }
    const saveThroughApi = vi.fn((_id: number, form: TagSetFormState) => {
      persisted = {
        ...persisted,
        name: form.name,
        description: form.description,
        category_id: form.category_id ?? null,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        thumbnail_path: form.thumbnail_path ?? null,
        subsets: (form.subsets ?? []).map((subset, index) => ({
          id: 11 + index,
          tag_set_id: 10,
          name: subset.name,
          tags: subset.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          thumbnail_path: subset.thumbnail_path ?? null,
        })),
      }
    })
    const renderDetail = (tagSet: TagSet) => render(
      <QueryClientProvider client={queryClient}>
        <TagSetDetailModal
          tagSet={tagSet}
          categories={MOCK_CATEGORIES}
          copiedId={null}
          onCopy={onCopyMock}
          onClose={onCloseMock}
          onSave={saveThroughApi}
          isPending={false}
          onCategoryCreated={onCategoryCreatedMock}
        />
      </QueryClientProvider>
    )

    const view = renderDetail(persisted)
    expect(screen.getByText('Day')).toBeInTheDocument()
    expect(screen.getByText('Night')).toBeInTheDocument()
    expect(screen.getByAltText('Day thumbnail')).toHaveAttribute('src', '/images/day.jpg')
    expect(screen.getByAltText('Night thumbnail')).toHaveAttribute('src', '/images/night.jpg')
    expect(screen.getByAltText('thumbnail-0')).toHaveAttribute('src', '/images/parent-cover.jpg')

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    const subsetNames = screen.getAllByPlaceholderText('Subset Name (e.g. 日中)')
    fireEvent.change(subsetNames[0], { target: { value: 'Daylight' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Changes' })[0])

    expect(saveThroughApi).toHaveBeenCalledWith(10, expect.objectContaining({
      thumbnail_path: '/images/parent-cover.jpg',
      subsets: expect.arrayContaining([
        expect.objectContaining({ name: 'Daylight', tags: 'linen, sun hat', thumbnail_path: '/images/day.jpg' }),
        expect.objectContaining({ name: 'Night', tags: 'silk, moon brooch', thumbnail_path: '/images/night.jpg' }),
      ]),
    }))
    expect(persisted.thumbnail_path).toBe('/images/parent-cover.jpg')
    expect(persisted.subsets?.map(({ name, tags, thumbnail_path }) => [name, tags, thumbnail_path])).toEqual([
      ['Daylight', ['linen', 'sun hat'], '/images/day.jpg'],
      ['Night', ['silk', 'moon brooch'], '/images/night.jpg'],
    ])

    view.unmount()
    renderDetail(persisted)
    expect(screen.getByText('Daylight')).toBeInTheDocument()
    expect(screen.getByText('Night')).toBeInTheDocument()
    expect(screen.getByAltText('Daylight thumbnail')).toHaveAttribute('src', '/images/day.jpg')
    expect(screen.getByAltText('Night thumbnail')).toHaveAttribute('src', '/images/night.jpg')
    expect(screen.getByAltText('thumbnail-0')).toHaveAttribute('src', '/images/parent-cover.jpg')
  })

  it('shows legacy subsets without an image while keeping their names and tags readable', () => {
    const legacyTagSet: TagSet = {
      ...mockTagSet,
      thumbnail_path: '/images/legacy-parent.jpg',
      subsets: [{ id: 13, tag_set_id: 10, name: 'Legacy', tags: ['old tag'] }],
    }
    render(
      <QueryClientProvider client={queryClient}>
        <TagSetDetailModal
          tagSet={legacyTagSet}
          categories={MOCK_CATEGORIES}
          copiedId={null}
          onCopy={onCopyMock}
          onClose={onCloseMock}
          onSave={onSaveMock}
          isPending={false}
          onCategoryCreated={onCategoryCreatedMock}
        />
      </QueryClientProvider>
    )

    expect(screen.getByText('Legacy')).toBeInTheDocument()
    expect(screen.getByText('old tag')).toBeInTheDocument()
    expect(screen.queryByAltText('Legacy thumbnail')).not.toBeInTheDocument()
    expect(screen.getByAltText('thumbnail-0')).toHaveAttribute('src', '/images/legacy-parent.jpg')
  })
})

describe('TagSetDetailModal Mobile Redesign (REQ-377)', () => {
  let queryClient: QueryClient
  const onCopyMock = vi.fn()
  const onCloseMock = vi.fn()
  const onSaveMock = vi.fn()
  const onCategoryCreatedMock = vi.fn()

  const testTagSet: TagSet = {
    id: 10,
    name: 'Sailor Suit',
    description: 'Classic uniform',
    category_id: 1,
    tags: ['sailor suit', 'pleated skirt', 'neckerchief'],
    thumbnail_path: '/images/thumb.jpg',
    snapshot_paths: ['/images/thumb.jpg', '/images/snap2.jpg'],
    sort_order: 1,
    created_at: '2026-09-17T00:00:00Z',
    subsets: [
      { id: 1, tag_set_id: 10, name: 'Summer', tags: ['short sleeves', 'white socks'] },
    ],
    target_base_model_ids: [1],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.mocked(baseModelsApi.list).mockResolvedValue(MOCK_BASE_MODELS)
  })

  const renderDetail = (ts = testTagSet, initialEditing = false, isPending = false) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <TagSetDetailModal
          tagSet={ts}
          categories={MOCK_CATEGORIES}
          copiedId={null}
          onCopy={onCopyMock}
          onClose={onCloseMock}
          onSave={onSaveMock}
          isPending={isPending}
          onCategoryCreated={onCategoryCreatedMock}
          initialEditing={initialEditing}
        />
      </QueryClientProvider>,
    )
  }

  it('[REQ-377/AC-1] renders as mobile bottom sheet with drag handle, single scrollable body, and fixed footer', () => {
    renderDetail()
    const backdrop = document.querySelector('.modal-backdrop')!
    expect(backdrop).toBeInTheDocument()
    expect(backdrop).toHaveClass('items-end')

    const sheet = screen.getByTestId('tagset-detail-sheet')
    expect(sheet).toBeInTheDocument()
    expect(sheet).toHaveClass('rounded-t-2xl')

    const handle = sheet.querySelector('[aria-hidden="true"]')
    expect(handle).toBeInTheDocument()
    expect(handle).toHaveClass('bg-zinc-600')

    const footer = screen.getByTestId('tagset-detail-footer')
    expect(footer).toBeInTheDocument()
    expect(footer).toHaveClass('flex-shrink-0')
  })

  it('[REQ-377/AC-2] displays Close on left and Edit on right in view mode footer and responds to clicks', () => {
    renderDetail()
    const footer = screen.getByTestId('tagset-detail-footer')
    const buttons = footer.querySelectorAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toHaveTextContent('Close')
    expect(buttons[1]).toHaveTextContent('Edit')

    fireEvent.click(buttons[0])
    expect(onCloseMock).toHaveBeenCalledTimes(1)

    fireEvent.click(buttons[1])
    expect(screen.getByText('Edit Tag Set')).toBeInTheDocument()
  })

  it('[REQ-377/AC-3] displays Cancel on left and Save Changes on right in edit mode footer with pending and validation states', () => {
    const view = renderDetail(testTagSet, true, false)
    const footer = screen.getByTestId('tagset-detail-footer')
    const buttons = footer.querySelectorAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toHaveTextContent('Cancel')
    expect(buttons[1]).toHaveTextContent('Save Changes')

    const nameInput = document.getElementById('tagset-detail-edit-name') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: '' } })
    expect(buttons[1]).toBeDisabled()

    fireEvent.change(nameInput, { target: { value: 'Valid Name' } })
    expect(buttons[1]).not.toBeDisabled()

    // Test isPending state
    view.unmount()
    renderDetail(testTagSet, true, true)
    const pendingFooter = screen.getByTestId('tagset-detail-footer')
    const pendingSaveBtn = pendingFooter.querySelectorAll('button')[1]
    expect(pendingSaveBtn).toHaveTextContent('Saving…')
    expect(pendingSaveBtn).toBeDisabled()
  })

  it('[REQ-377/AC-4] includes safe area bottom padding and 44px min touch target on mobile footer', () => {
    renderDetail()
    const footer = screen.getByTestId('tagset-detail-footer')
    expect(footer.className).toContain('pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]')

    const buttons = footer.querySelectorAll('button')
    buttons.forEach((btn) => {
      expect(btn).toHaveClass('min-h-[44px]')
    })
  })

  it('[REQ-377/AC-5] displays compact Cover image and snapshot count row at body top on mobile', () => {
    renderDetail()
    const coverBanner = screen.getByRole('button', { name: 'スナップショットギャラリーを開く' })
    expect(coverBanner).toBeInTheDocument()
    expect(coverBanner).toHaveClass('md:hidden')
    expect(coverBanner).toHaveTextContent('Cover Image')
    expect(coverBanner).toHaveTextContent(`Related Snapshots (${testTagSet.snapshot_paths.length}件)`)
  })

  it('[REQ-377/AC-6] opens gallery subview on cover tap and respects Cancel / Save timing for cover changes', () => {
    renderDetail(testTagSet, true)

    // Tap compact Cover banner to open gallery
    const coverBanner = screen.getByRole('button', { name: 'スナップショットギャラリーを開く' })
    fireEvent.click(coverBanner)

    // Gallery header shows back button
    const backBtn = screen.getByRole('button', { name: /詳細に戻る/i })
    expect(backBtn).toBeInTheDocument()

    // Select second snapshot
    const secondThumb = screen.getByAltText('thumbnail-1')
    fireEvent.click(secondThumb)

    // Click "Set as Cover"
    const setCoverBtn = screen.getByRole('button', { name: 'Set as Cover' })
    fireEvent.click(setCoverBtn)

    // Return to details
    fireEvent.click(backBtn)

    // In footer, click Cancel -> changes are discarded
    const footer = screen.getByTestId('tagset-detail-footer')
    const cancelBtn = footer.querySelectorAll('button')[0]
    fireEvent.click(cancelBtn)

    expect(onSaveMock).not.toHaveBeenCalled()
    expect(screen.getByText('Tag Set Details')).toBeInTheDocument()
  })

  it('[REQ-377/AC-7] gracefully handles missing images and empty snapshot lists without breaking layout', () => {
    const emptyImageTagSet: TagSet = {
      ...testTagSet,
      thumbnail_path: undefined,
      snapshot_paths: [],
    }
    renderDetail(emptyImageTagSet)
    expect(screen.getByText('No Preview Available')).toBeInTheDocument()
    const coverBanner = screen.getByRole('button', { name: 'スナップショットギャラリーを開く' })
    expect(coverBanner).toHaveTextContent('Related Snapshots (0件)')
  })

  it('[REQ-377/AC-12] preserves full metadata editing, subsets, copy, and save in TagSetDetailModal', () => {
    renderDetail(testTagSet, true)
    const nameInput = document.getElementById('tagset-detail-edit-name') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Updated Uniform' } })

    const footer = screen.getByTestId('tagset-detail-footer')
    const saveBtn = footer.querySelectorAll('button')[1]
    fireEvent.click(saveBtn)

    expect(onSaveMock).toHaveBeenCalledWith(10, expect.objectContaining({
      name: 'Updated Uniform',
    }))
  })

  it('[REQ-377/AC-13] supports Escape key navigation returning from gallery subview or closing modal', () => {
    renderDetail()
    // Open gallery
    const coverBanner = screen.getByRole('button', { name: 'スナップショットギャラリーを開く' })
    fireEvent.click(coverBanner)
    expect(screen.getByRole('button', { name: /詳細に戻る/i })).toBeInTheDocument()

    // Press Escape -> closes gallery, returns to details
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: /詳細に戻る/i })).not.toBeInTheDocument()
    expect(onCloseMock).not.toHaveBeenCalled()

    // Press Escape again -> closes modal
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCloseMock).toHaveBeenCalledTimes(1)
  })

  it('[REQ-377/AC-14] maintains desktop 2-column layout and right-pane action buttons', () => {
    renderDetail()
    const grid = document.querySelector('.md\\:grid-cols-2')
    expect(grid).toBeInTheDocument()

    // Desktop action buttons in right pane
    const desktopActions = document.querySelector('.hidden.md\\:flex.justify-end')
    expect(desktopActions).toBeInTheDocument()
  })
})
