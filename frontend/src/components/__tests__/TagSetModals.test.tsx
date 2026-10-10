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

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const subsetNames = screen.getAllByPlaceholderText('Subset Name (e.g. 日中)')
    fireEvent.change(subsetNames[0], { target: { value: 'Daylight' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

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
