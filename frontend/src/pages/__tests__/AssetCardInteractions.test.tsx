import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupAllTestState, resetTestStorage } from '../../test/utils'
import { LoRAsPage } from '../LoRAsPage'
import { TagsPage } from '../TagsPage'
import { lorasApi, tagSetsApi, loraCategoriesApi, tagsetCategoriesApi, baseModelsApi } from '../../api/client'

vi.mock('../../api/client', () => ({
  lorasApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), reorder: vi.fn() },
  tagSetsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), reorder: vi.fn() },
  loraCategoriesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  tagsetCategoriesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  baseModelsApi: { list: vi.fn() },
}))
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
    useSensors: (...sensors: any[]) => sensors,
    useSensor: (sensor: any) => sensor,
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  }
})
vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>()
  return {
    ...actual,
    SortableContext: ({ children }: any) => <div>{children}</div>,
    useSortable: ({ id }: any) => ({
      attributes: { role: 'button', tabIndex: 0, 'aria-roledescription': 'sortable' },
      listeners: {
        onPointerDown: () => window.dispatchEvent(new CustomEvent('sortable-handle-fired', { detail: id })),
        onKeyDown: () => window.dispatchEvent(new CustomEvent('sortable-handle-fired', { detail: id })),
      },
      setNodeRef: () => {}, transform: null, transition: undefined, isDragging: false,
    }),
  }
})
vi.mock('../../components/ImageCarousel', () => ({ ImageCarousel: ({ children, alt }: any) => <div aria-label={`${alt} image`}>{children}</div> }))
vi.mock('../../components/LoraModals', () => ({
  LoraRegisterModal: () => null,
  LoraDetailModal: ({ lora }: any) => <div data-testid="lora-detail">{lora.model_name}</div>,
}))
vi.mock('../../components/TagSetModals', () => ({
  TagSetCreateModal: () => null,
  TagSetEditModal: () => null,
  TagSetDetailModal: ({ tagSet, initialEditing }: any) => (
    <div data-testid={initialEditing ? 'tagset-edit' : 'tagset-detail'}>{tagSet.name}</div>
  ),
}))

const lora = {
  id: 51, model_name: 'models/portrait.safetensors', description: 'A long LoRA description that should be clamped after the second visual line',
  category_id: 1, trigger_word_sets: [{ id: 510, name: 'main', words: ['alpha_trigger', 'blue_eyes'] }],
  recommended_strength_min: null, recommended_strength_max: null, file_path: '', thumbnail_path: '', snapshot_paths: [],
}
const tagSet = {
  id: 61, name: 'Portrait tags', description: 'Description', category_id: 1, tags: ['silver hair', 'blue eyes'],
  subsets: [], target_base_model_ids: [], thumbnail_path: '', snapshot_paths: [],
}

function mount(page: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>)
}

describe('asset card copy and drag interactions', () => {
  beforeEach(() => {
    cleanupAllTestState()
    resetTestStorage()
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(lorasApi.list).mockResolvedValue([lora] as any)
    vi.mocked(tagSetsApi.list).mockResolvedValue([tagSet] as any)
    vi.mocked(loraCategoriesApi.list).mockResolvedValue([{ id: 1, name: 'People' }] as any)
    vi.mocked(tagsetCategoriesApi.list).mockResolvedValue([{ id: 1, name: 'People' }] as any)
    vi.mocked(baseModelsApi.list).mockResolvedValue([] as any)
  })

  afterEach(() => {
    cleanupAllTestState()
    resetTestStorage()
  })

  it('copies only the clicked LoRA trigger word and confines drag listeners to the handle', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    mount(<LoRAsPage />)
    await waitFor(() => expect(document.getElementById('lora-card-51')).toBeInTheDocument())
    const card = document.getElementById('lora-card-51')!
    const handle = screen.getByRole('button', { name: '並び替えハンドル' })
    expect(card).not.toHaveAttribute('role')
    expect(card).not.toHaveAttribute('tabindex')
    expect(handle).toHaveAttribute('tabindex', '0')
    const fired = vi.fn()
    window.addEventListener('sortable-handle-fired', fired)
    fireEvent.pointerDown(card)
    expect(fired).not.toHaveBeenCalled()
    fireEvent.pointerDown(handle)
    expect(fired).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Copy trigger word alpha_trigger' }))
    expect(writeText).toHaveBeenCalledWith('alpha_trigger')
    expect(screen.getByRole('button', { name: 'Copy trigger word alpha_trigger' })).toHaveTextContent('Copied')
    expect(screen.queryByTestId('lora-detail')).not.toBeInTheDocument()
    fireEvent.click(card)
    expect(screen.getByTestId('lora-detail')).toHaveTextContent('models/portrait.safetensors')
    expect(document.getElementById('category-section-header-1')).toHaveClass('sticky', 'top-0')
    expect(card.querySelector('.line-clamp-2')).toBeInTheDocument()
    window.removeEventListener('sortable-handle-fired', fired)
  })

  it('copies one TagSet chip without opening its card and keeps sorting handle-only', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    mount(<TagsPage />)
    await waitFor(() => expect(document.getElementById('tagset-card-61')).toBeInTheDocument())
    const card = document.getElementById('tagset-card-61')!
    const handle = screen.getByRole('button', { name: '並び替えハンドル' })
    expect(card).not.toHaveAttribute('role')
    const fired = vi.fn()
    window.addEventListener('sortable-handle-fired', fired)
    fireEvent.keyDown(card, { key: ' ' })
    expect(fired).not.toHaveBeenCalled()
    fireEvent.keyDown(handle, { key: ' ' })
    expect(fired).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Copy tag silver hair' }))
    expect(writeText).toHaveBeenCalledWith('silver hair')
    expect(screen.getByRole('button', { name: 'Copy tag silver hair' })).toHaveTextContent('Copied')
    expect(screen.queryByTestId('tagset-detail')).not.toBeInTheDocument()
    fireEvent.click(card)
    expect(screen.getByTestId('tagset-detail')).toHaveTextContent('Portrait tags')
    expect(document.getElementById('category-section-header-1')).toHaveClass('sticky', 'top-0')
    expect(card.querySelector('.line-clamp-2')).toBeInTheDocument()
    window.removeEventListener('sortable-handle-fired', fired)
  })

  it('[REQ-376/AC-6] isolates edit and delete touch targets (>= 44x44px) without overlapping and stops card click bubbling', async () => {
    mount(<LoRAsPage />)
    await waitFor(() => expect(document.getElementById('lora-card-51')).toBeInTheDocument())

    const editBtn = document.getElementById('lora-edit-51')!
    const deleteBtn = document.getElementById('lora-delete-51')!

    expect(editBtn).toBeInTheDocument()
    expect(deleteBtn).toBeInTheDocument()

    // 44x44px touch targets on mobile and non-overlapping positioning
    expect(editBtn).toHaveClass('min-h-[44px]', 'min-w-[44px]', 'top-1', 'right-[50px]')
    expect(deleteBtn).toHaveClass('min-h-[44px]', 'min-w-[44px]', 'top-1', 'right-1')

    // Desktop positioning preservation
    expect(editBtn).toHaveClass('md:top-2', 'md:right-8', 'md:min-h-0', 'md:min-w-0')
    expect(deleteBtn).toHaveClass('md:top-2', 'md:right-2', 'md:min-h-0', 'md:min-w-0')

    // Click delete stops propagation (does not open lora-detail)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(deleteBtn)
    expect(confirmSpy).toHaveBeenCalledWith('Delete this LoRA?')
    expect(screen.queryByTestId('lora-detail')).not.toBeInTheDocument()

    // Click edit opens detail modal directly
    fireEvent.click(editBtn)
    expect(screen.getByTestId('lora-detail')).toHaveTextContent('models/portrait.safetensors')

    confirmSpy.mockRestore()

    // TagSet card: edit and delete buttons isolation and non-overlapping touch targets
    cleanupAllTestState()
    mount(<TagsPage />)
    await waitFor(() => expect(document.getElementById('tagset-card-61')).toBeInTheDocument())

    const tagEditBtn = document.getElementById('tagset-edit-61')!
    const tagDeleteBtn = document.getElementById('tagset-delete-61')!

    expect(tagEditBtn).toBeInTheDocument()
    expect(tagDeleteBtn).toBeInTheDocument()

    // 44x44px touch targets on mobile and non-overlapping positioning
    expect(tagEditBtn).toHaveClass('min-h-[44px]', 'min-w-[44px]', 'top-1', 'right-[50px]')
    expect(tagDeleteBtn).toHaveClass('min-h-[44px]', 'min-w-[44px]', 'top-1', 'right-1')

    // Desktop positioning
    expect(tagEditBtn).toHaveClass('md:top-2', 'md:right-12')
    expect(tagDeleteBtn).toHaveClass('md:top-2', 'md:right-2')

    // Click delete opens confirmation alertdialog without triggering card click (detail modal)
    fireEvent.click(tagDeleteBtn)
    expect(screen.getByRole('alertdialog', { name: 'タグセット削除の確認' })).toBeInTheDocument()
    expect(screen.queryByTestId('tagset-detail')).not.toBeInTheDocument()

    // Click edit stops propagation and does not trigger detail modal
    fireEvent.click(tagEditBtn)
    expect(screen.queryByTestId('tagset-detail')).not.toBeInTheDocument()
  })
})
