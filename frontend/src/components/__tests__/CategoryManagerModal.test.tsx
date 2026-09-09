import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CategoryManagerModal } from '../CategoryManagerModal'
import { loraCategoriesApi } from '../../api/client'
import type { Category } from '../../api/types'

vi.mock('../../api/client', () => ({
  loraCategoriesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  tagsetCategoriesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

const MOCK_CATEGORIES: Category[] = [
  { id: 1, name: 'Characters' },
  { id: 2, name: 'Styles' },
]

describe('CategoryManagerModal Component', () => {
  let queryClient: QueryClient
  const onCloseMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    vi.mocked(loraCategoriesApi.list).mockResolvedValue(MOCK_CATEGORIES)
    vi.mocked(loraCategoriesApi.create).mockResolvedValue({ id: 3, name: 'Concept' })
    vi.mocked(loraCategoriesApi.update).mockResolvedValue({ id: 1, name: 'Characters Updated' })
    vi.mocked(loraCategoriesApi.delete).mockResolvedValue({} as any)
  })

  const renderComponent = (type: 'lora' | 'tagset' = 'lora') =>
    render(
      <QueryClientProvider client={queryClient}>
        <CategoryManagerModal type={type} onClose={onCloseMock} />
      </QueryClientProvider>
    )

  it('renders category list and new category input', async () => {
    renderComponent('lora')

    expect(screen.getByText('LoRAカテゴリ管理')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Characters')).toBeInTheDocument()
      expect(screen.getByText('Styles')).toBeInTheDocument()
    })

    expect(screen.getByPlaceholderText('新しいカテゴリ名を入力')).toBeInTheDocument()
  })

  it('creates a new category when form is submitted', async () => {
    renderComponent('lora')

    await waitFor(() => {
      expect(screen.getByText('Characters')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('新しいカテゴリ名を入力')
    const addBtn = screen.getByRole('button', { name: /追加/ })

    expect(addBtn).toBeDisabled()

    fireEvent.change(input, { target: { value: 'Concept' } })
    expect(addBtn).not.toBeDisabled()

    fireEvent.click(addBtn)

    await waitFor(() => {
      expect(loraCategoriesApi.create).toHaveBeenCalledWith('Concept')
    })
  })

  it('updates an existing category via inline edit', async () => {
    renderComponent('lora')

    await waitFor(() => {
      expect(screen.getByText('Characters')).toBeInTheDocument()
    })

    const catNameSpan = screen.getByText('Characters')
    fireEvent.click(catNameSpan) // triggers handleStartEdit

    const editInput = screen.getByDisplayValue('Characters')
    fireEvent.change(editInput, { target: { value: 'Characters Updated' } })
    fireEvent.keyDown(editInput, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(loraCategoriesApi.update).toHaveBeenCalledWith(1, 'Characters Updated')
    })
  })

  it('deletes category when confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderComponent('lora')

    await waitFor(() => {
      expect(screen.getByText('Characters')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByTitle('削除')
    expect(deleteButtons.length).toBe(2)

    fireEvent.click(deleteButtons[0])

    expect(confirmSpy).toHaveBeenCalledWith(
      'カテゴリ「Characters」を削除しますか？\n※このカテゴリに属するアイテムのカテゴリ設定は解除されます。'
    )

    await waitFor(() => {
      expect(loraCategoriesApi.delete).toHaveBeenCalledWith(1)
    })
  })

  it('does NOT delete category when confirm is canceled (Red Team)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderComponent('lora')

    await waitFor(() => {
      expect(screen.getByText('Characters')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByTitle('削除')
    fireEvent.click(deleteButtons[0])

    expect(confirmSpy).toHaveBeenCalled()
    expect(loraCategoriesApi.delete).not.toHaveBeenCalled()
  })
})
