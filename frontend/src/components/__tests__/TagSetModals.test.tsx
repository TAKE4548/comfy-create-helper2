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
    const addBtn = screen.getByText('+ Add Subset')
    fireEvent.click(addBtn)

    expect(setFormMock).toHaveBeenCalled()
    const addUpdater = setFormMock.mock.calls[0][0]
    const addedState = addUpdater(formWithSubsets)
    expect(addedState.subsets).toHaveLength(3)
    expect(addedState.subsets[2]).toEqual({ name: '', tags: '' })

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
    const trashButtons = screen.getAllByRole('button').filter(
      (btn) => btn.querySelector('svg.lucide-trash-2') !== null
    )
    expect(trashButtons.length).toBe(2)
    fireEvent.click(trashButtons[0])

    expect(setFormMock).toHaveBeenCalled()
    const removeUpdater = setFormMock.mock.calls[0][0]
    const removedState = removeUpdater(formWithSubsets)
    expect(removedState.subsets).toHaveLength(1)
    expect(removedState.subsets[0].name).toBe('Winter')
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
})
