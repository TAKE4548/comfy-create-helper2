import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CategorySelect } from '../CategorySelect'
import type { Category } from '../../../api/types'

describe('CategorySelect', () => {
  const mockCategories: Category[] = [
    { id: 1, name: 'Anime' },
    { id: 2, name: 'Realistic' },
  ]
  const mockOnChange = vi.fn()
  const mockOnCategoryCreated = vi.fn()
  const mockApiCreateFn = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('選択変更時に onChange が発火すること', () => {
    render(
      <CategorySelect
        value={1}
        onChange={mockOnChange}
        categories={mockCategories}
        onCategoryCreated={mockOnCategoryCreated}
        apiCreateFn={mockApiCreateFn}
      />
    )

    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('1')

    fireEvent.change(select, { target: { value: '2' } })
    expect(mockOnChange).toHaveBeenCalledWith(2)

    fireEvent.change(select, { target: { value: '' } })
    expect(mockOnChange).toHaveBeenCalledWith(undefined)
  })

  it('+ 新規カテゴリを追加 選択時に入力欄が表示されること', () => {
    render(
      <CategorySelect
        value={undefined}
        onChange={mockOnChange}
        categories={mockCategories}
        onCategoryCreated={mockOnCategoryCreated}
        apiCreateFn={mockApiCreateFn}
      />
    )

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '__new__' } })

    expect(screen.getByPlaceholderText('新規カテゴリ名')).toBeInTheDocument()
    expect(screen.getByTitle('追加')).toBeInTheDocument()
    expect(screen.getByTitle('キャンセル')).toBeInTheDocument()
  })

  it('新規カテゴリ作成成功時に apiCreateFn 呼び出しと onCategoryCreated / onChange が通知されること', async () => {
    const createdCategory: Category = { id: 3, name: 'Sci-Fi' }
    mockApiCreateFn.mockResolvedValueOnce(createdCategory)

    render(
      <CategorySelect
        value={undefined}
        onChange={mockOnChange}
        categories={mockCategories}
        onCategoryCreated={mockOnCategoryCreated}
        apiCreateFn={mockApiCreateFn}
      />
    )

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '__new__' } })

    const input = screen.getByPlaceholderText('新規カテゴリ名')
    fireEvent.change(input, { target: { value: 'Sci-Fi' } })

    const addButton = screen.getByTitle('追加')
    fireEvent.click(addButton)

    await waitFor(() => {
      expect(mockApiCreateFn).toHaveBeenCalledWith('Sci-Fi')
      expect(mockOnCategoryCreated).toHaveBeenCalledWith(createdCategory)
      expect(mockOnChange).toHaveBeenCalledWith(3)
    })
  })

  it('空文字入力時にバリデーションエラーメッセージが表示されること', async () => {
    render(
      <CategorySelect
        value={undefined}
        onChange={mockOnChange}
        categories={mockCategories}
        onCategoryCreated={mockOnCategoryCreated}
        apiCreateFn={mockApiCreateFn}
      />
    )

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '__new__' } })

    const addButton = screen.getByTitle('追加')
    fireEvent.click(addButton)

    expect(screen.getByText('カテゴリ名を入力してください')).toBeInTheDocument()
    expect(mockApiCreateFn).not.toHaveBeenCalled()
  })

  it('キャンセルボタンにより元のセレクトボックスに復帰すること', () => {
    render(
      <CategorySelect
        value={undefined}
        onChange={mockOnChange}
        categories={mockCategories}
        onCategoryCreated={mockOnCategoryCreated}
        apiCreateFn={mockApiCreateFn}
      />
    )

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '__new__' } })

    expect(screen.getByPlaceholderText('新規カテゴリ名')).toBeInTheDocument()

    const cancelButton = screen.getByTitle('キャンセル')
    fireEvent.click(cancelButton)

    expect(screen.queryByPlaceholderText('新規カテゴリ名')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
