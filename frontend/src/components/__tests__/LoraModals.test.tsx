import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoraRegisterModal, type LoraFormState } from '../LoraModals'
import { lorasApi, baseModelsApi } from '../../api/client'
import type { Category, BaseModel, ComfyLoraModel } from '../../api/types'

vi.mock('../../api/client', () => ({
  lorasApi: {
    getComfyModels: vi.fn(),
  },
  loraCategoriesApi: {
    create: vi.fn(),
  },
  baseModelsApi: {
    list: vi.fn(),
  },
}))

const MOCK_CATEGORIES: Category[] = [
  { id: 1, name: 'Characters' },
  { id: 2, name: 'Styles' },
]

const MOCK_BASE_MODELS: BaseModel[] = [
  { id: 1, name: 'SD 1.5', key: 'sd15' },
  { id: 2, name: 'SDXL', key: 'sdxl' },
]

const MOCK_COMFY_MODELS: ComfyLoraModel[] = [
  { file_path: 'models/loras/available_model.safetensors', is_registered: false },
  { file_path: 'models/loras/registered_model.safetensors', is_registered: true },
]

describe('LoraModals Component (LoraRegisterModal)', () => {
  let queryClient: QueryClient
  let formState: LoraFormState
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
      model_name: '',
      description: '',
      recommended_strength_min: undefined,
      recommended_strength_max: undefined,
      category_id: undefined,
      file_path: '',
      trigger_word_sets: [],
      target_base_model_ids: [],
    }

    vi.mocked(lorasApi.getComfyModels).mockResolvedValue(MOCK_COMFY_MODELS)
    vi.mocked(baseModelsApi.list).mockResolvedValue(MOCK_BASE_MODELS)
  })

  const renderComponent = (currentForm = formState) =>
    render(
      <QueryClientProvider client={queryClient}>
        <LoraRegisterModal
          form={currentForm}
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

  it('renders LoraRegisterModal and opens ComfyUI model suggestions on focus', async () => {
    renderComponent()

    expect(screen.getByText('Register LoRA Model')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('my_awesome_lora')).toBeInTheDocument()

    const filePathInput = screen.getByPlaceholderText('Select or enter path (e.g. folder/model.safetensors)')
    fireEvent.focus(filePathInput)

    await waitFor(() => {
      expect(screen.getByText('models/loras/available_model.safetensors')).toBeInTheDocument()
      expect(screen.getByText('models/loras/registered_model.safetensors')).toBeInTheDocument()
      expect(screen.getByText('登録済み')).toBeInTheDocument()
    })
  })

  it('auto-fills file_path and model_name when an unregistered model is selected', async () => {
    renderComponent()

    const filePathInput = screen.getByPlaceholderText('Select or enter path (e.g. folder/model.safetensors)')
    fireEvent.focus(filePathInput)

    await waitFor(() => {
      expect(screen.getByText('models/loras/available_model.safetensors')).toBeInTheDocument()
    })

    const availableItem = screen.getByText('models/loras/available_model.safetensors')
    fireEvent.click(availableItem)

    expect(setFormMock).toHaveBeenCalled()
    const updater = setFormMock.mock.calls[0][0]
    const updated = typeof updater === 'function' ? updater(formState) : updater

    expect(updated.file_path).toBe('models/loras/available_model.safetensors')
    expect(updated.model_name).toBe('available_model.safetensors')
  })

  it('does NOT select or update form when a registered model is clicked (Red Team)', async () => {
    renderComponent()

    const filePathInput = screen.getByPlaceholderText('Select or enter path (e.g. folder/model.safetensors)')
    fireEvent.focus(filePathInput)

    await waitFor(() => {
      expect(screen.getByText('models/loras/registered_model.safetensors')).toBeInTheDocument()
    })

    const registeredItem = screen.getByText('models/loras/registered_model.safetensors')
    fireEvent.click(registeredItem)

    expect(setFormMock).not.toHaveBeenCalled()
  })

  it('dynamically adds and removes trigger word sets', async () => {
    const formWithSets: LoraFormState = {
      ...formState,
      trigger_word_sets: [
        { name: 'Costume', words: 'maid apron, ribbon' },
        { name: 'Hair', words: 'blonde hair, twin tails' },
      ],
    }

    renderComponent(formWithSets)

    expect(screen.getByDisplayValue('Costume')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Hair')).toBeInTheDocument()

    // Add set
    const addBtn = screen.getByText('+ Add Set')
    fireEvent.click(addBtn)

    expect(setFormMock).toHaveBeenCalled()
    const addUpdater = setFormMock.mock.calls[0][0]
    const addedState = addUpdater(formWithSets)
    expect(addedState.trigger_word_sets).toHaveLength(3)
    expect(addedState.trigger_word_sets[2]).toEqual({ name: '', words: '' })

    // Remove first set
    setFormMock.mockClear()
    const trashButtons = screen.getAllByRole('button').filter(
      (btn) => btn.querySelector('svg.lucide-trash-2') !== null
    )
    expect(trashButtons.length).toBe(2)
    fireEvent.click(trashButtons[0])

    expect(setFormMock).toHaveBeenCalled()
    const removeUpdater = setFormMock.mock.calls[0][0]
    const removedState = removeUpdater(formWithSets)
    expect(removedState.trigger_word_sets).toHaveLength(1)
    expect(removedState.trigger_word_sets[0].name).toBe('Hair')
  })
})
