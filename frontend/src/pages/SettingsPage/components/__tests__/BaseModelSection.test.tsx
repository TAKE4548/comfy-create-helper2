import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BaseModelSection } from '../BaseModelSection'

const queryMocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  mutate: vi.fn(),
  refetch: vi.fn(),
  empty: false,
  createMapping: vi.fn(),
}))

vi.mock('../../../../api/client', () => ({
  baseModelsApi: { create: vi.fn(), delete: vi.fn(), list: vi.fn(), update: vi.fn() },
  checkpointMappingsApi: { create: queryMocks.createMapping, delete: vi.fn(), getComfyCheckpoints: vi.fn(), list: vi.fn() },
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: queryMocks.invalidateQueries }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'base-models') {
      return { data: queryMocks.empty ? [] : [{ id: 1, name: 'SDXL', description: '画像モデル', created_at: '2026-01-01' }], isLoading: false }
    }
    if (queryKey[0] === 'checkpoint-mappings') {
      return {
        data: queryMocks.empty ? [] : [{ id: 2, checkpoint_name: '長いモデル名'.repeat(16) + '.safetensors', base_model_id: 1, created_at: '2026-01-01', base_model: { id: 1, name: 'SDXL', description: null, created_at: '2026-01-01' } }],
        isLoading: false,
      }
    }
    return { data: ['model.safetensors'], refetch: queryMocks.refetch, isFetching: false }
  },
  useMutation: ({ mutationFn }: { mutationFn: (...args: never[]) => unknown }) => ({
    mutate: (...args: never[]) => {
      queryMocks.mutate(...args)
      return mutationFn(...args)
    },
    isPending: false,
  }),
}))

describe('BaseModelSection mobile behavior', () => {
  beforeEach(() => {
    queryMocks.invalidateQueries.mockClear()
    queryMocks.mutate.mockClear()
    queryMocks.refetch.mockClear()
    queryMocks.createMapping.mockClear()
    queryMocks.empty = false
  })

  it('shows mobile table labels and wraps long checkpoint names while retaining both tables', () => {
    render(<BaseModelSection />)

    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(2)
    expect(tables.every((table) => table.classList.contains('settings-mobile-table'))).toBe(true)
    expect(tables[0].querySelector('td[data-label="名前"]')).toHaveTextContent('SDXL')
    expect(tables[0].querySelector('td[data-label="説明"]')).toHaveTextContent('画像モデル')
    expect(screen.getByText('長いモデル名'.repeat(16) + '.safetensors').closest('td')).toHaveAttribute('data-label', 'チェックポイント名')
    expect(screen.getByText('長いモデル名'.repeat(16) + '.safetensors').closest('td')).toHaveClass('break-all')
    expect(screen.getByTitle('編集')).toHaveClass('min-h-11', 'min-w-11', 'focus-visible:ring-2')
    expect(screen.getAllByTitle('削除').every((button) => button.classList.contains('min-h-11') && button.classList.contains('min-w-11') && button.classList.contains('focus-visible:ring-2'))).toBe(true)
  })

  it('keeps mapping create and checkpoint refresh actions available with 44px targets', () => {
    render(<BaseModelSection />)

    fireEvent.click(screen.getByRole('button', { name: /マッピング追加/ }))
    expect(screen.getByRole('heading', { name: 'チェックポイントマッピング追加' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveClass('min-h-11', 'min-w-11')
    expect(screen.getByRole('button', { name: '再取得' })).toHaveClass('min-h-11', 'min-w-11', 'focus-visible:ring-2')
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '作成' })).toHaveClass('min-h-11', 'focus-visible:ring-2')
    fireEvent.click(screen.getByRole('button', { name: '再取得' }))
    expect(queryMocks.refetch).toHaveBeenCalledOnce()
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'model.safetensors' } })
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: '作成' }))
    expect(queryMocks.createMapping).toHaveBeenCalledWith({ checkpoint_name: 'model.safetensors', base_model_id: 1 })
  })

  it('opens a model form with mobile-sized controls', () => {
    render(<BaseModelSection />)
    fireEvent.click(screen.getByRole('button', { name: /モデル追加/ }))

    expect(screen.getByRole('heading', { name: 'ベースモデル作成' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('モデル名を入力してください')).toHaveClass('min-h-11', 'focus-visible:ring-2')
    expect(screen.getByRole('button', { name: '保存' })).toHaveClass('min-h-11')
  })

  it('keeps empty states visible when there are no models or mappings', () => {
    queryMocks.empty = true
    render(<BaseModelSection />)

    expect(screen.getByText('ベースモデルが登録されていません。')).toBeInTheDocument()
    expect(screen.getByText('マッピングが登録されていません。')).toBeInTheDocument()
  })
})
