import { fireEvent, render, screen, within } from '@testing-library/react'
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


  const LONG = '長いモデル名'.repeat(16) + '.safetensors'
  const openManager = () => fireEvent.click(screen.getByRole('button', { name: 'モデルマスタ管理' }))

  it('[REQ-365/AC-3] checkpoint mapping rows expose data-cell=actions and keep thead as accessible hidden header', () => {
    render(<BaseModelSection />)

    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(1)
    expect(tables[0]).toHaveClass('settings-mobile-table')
    expect(tables[0].querySelectorAll('thead th')).toHaveLength(3)
    const nameCell = screen.getByText(LONG).closest('td')
    expect(nameCell).toHaveAttribute('data-label', 'チェックポイント名')
    expect(nameCell).toHaveClass('min-w-0', 'break-words')
    expect(nameCell).not.toHaveClass('truncate')
    expect(tables[0].querySelector('td[data-label="アクション"]')).toHaveAttribute('data-cell', 'actions')
    const del = screen.getByRole('button', { name: `${LONG} のマッピングを削除` })
    expect(del).toHaveClass('min-h-11', 'min-w-11', 'touch-manipulation', 'before:-inset-2', 'focus-visible:ring-2')
  })

  it('[REQ-365/AC-3] model master list lives only inside the manager dialog with 44px actions', () => {
    render(<BaseModelSection />)
    expect(screen.queryByText('ベースモデル一覧')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /モデル追加/ })).not.toBeInTheDocument()

    const trigger = screen.getByRole('button', { name: 'モデルマスタ管理' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'ベースモデルマスタ管理' })
    const table = within(dialog).getByRole('table')
    expect(table.querySelector('td[data-label="名前"]')).toHaveTextContent('SDXL')
    expect(table.querySelector('td[data-label="説明"]')).toHaveTextContent('画像モデル')
    expect(within(dialog).getByRole('button', { name: 'SDXL を編集' })).toHaveClass('min-h-11', 'min-w-11', 'focus-visible:ring-2')
    expect(within(dialog).getByRole('button', { name: 'SDXL を削除' })).toHaveClass('min-h-11', 'min-w-11')
  })

  it('[REQ-365/AC-9] model master manager and create/edit/mapping dialogs render in the common bottom-sheet Modal (handle, rounded-t-2xl, max-h-[85dvh])', () => {
    const { unmount } = render(<BaseModelSection />)
    const expectSheet = (name: string) => {
      const dialog = screen.getByRole('dialog', { name })
      expect(dialog).toHaveClass('rounded-t-2xl', 'max-h-[85dvh]')
      expect(within(dialog).getByTestId('modal-sheet-handle')).toBeInTheDocument()
    }

    openManager()
    expectSheet('ベースモデルマスタ管理')
    fireEvent.click(screen.getByRole('button', { name: /モデル追加/ }))
    expectSheet('ベースモデル作成')
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    fireEvent.click(screen.getByRole('button', { name: 'SDXL を編集' }))
    expectSheet('ベースモデル編集')
    unmount()

    render(<BaseModelSection />)
    fireEvent.click(screen.getByRole('button', { name: /マッピング追加/ }))
    expectSheet('チェックポイントマッピング追加')
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveClass('min-h-11', 'min-w-11')
    expect(screen.getByRole('button', { name: '再取得' })).toHaveClass('min-h-11', 'min-w-11', 'focus-visible:ring-2')
  })

  it('[REQ-365/AC-9] dialogs are not rendered inside a space-y/divide wrapper (backdrop must not receive a margin)', () => {
    const first = render(<BaseModelSection />)
    const expectBackdropUnmargined = (name: string, container: HTMLElement) => {
      const backdrop = screen.getByRole('dialog', { name }).parentElement as HTMLElement
      expect(backdrop).toHaveClass('modal-backdrop')
      // No ancestor up to (and including) the render container may apply sibling margin.
      for (let el: HTMLElement | null = backdrop.parentElement; el; el = el.parentElement) {
        expect(el.className).not.toMatch(/(^|\s)(space-[xy]-|divide-[xy])/)
        if (el === container) break
      }
      expect(backdrop.parentElement).toBe(container) // Fragment root: backdrop is a direct child of the container
    }
    openManager()
    expectBackdropUnmargined('ベースモデルマスタ管理', first.container)
    fireEvent.click(screen.getByRole('button', { name: /モデル追加/ }))
    expectBackdropUnmargined('ベースモデル作成', first.container)
    first.unmount()
    const second = render(<BaseModelSection />)
    fireEvent.click(screen.getByRole('button', { name: /マッピング追加/ }))
    expectBackdropUnmargined('チェックポイントマッピング追加', second.container)
  })

  it('[REQ-365/AC-9] manager -> edit -> manager transition keeps exactly one dialog open', () => {
    render(<BaseModelSection />)
    expect(screen.queryAllByRole('dialog')).toHaveLength(0)

    openManager()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'SDXL を編集' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'ベースモデル編集' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('モデル名を入力してください')).toHaveValue('SDXL')
    expect(screen.getByRole('button', { name: '保存' })).toHaveClass('min-h-11')

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'ベースモデルマスタ管理' })).toBeInTheDocument()
  })

  it('[REQ-365/AC-9] Escape and backdrop close the manager dialog', () => {
    render(<BaseModelSection />)
    openManager()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    openManager()
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement
    fireEvent.click(backdrop)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('[REQ-365/AC-9] keeps mapping create and checkpoint refresh actions available with 44px targets', () => {
    render(<BaseModelSection />)

    fireEvent.click(screen.getByRole('button', { name: /マッピング追加/ }))
    expect(screen.getByRole('heading', { name: 'チェックポイントマッピング追加' })).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '作成' })).toHaveClass('min-h-11', 'focus-visible:ring-2')
    fireEvent.click(screen.getByRole('button', { name: '再取得' }))
    expect(queryMocks.refetch).toHaveBeenCalledOnce()
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'model.safetensors' } })
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: '作成' }))
    expect(queryMocks.createMapping).toHaveBeenCalledWith({ checkpoint_name: 'model.safetensors', base_model_id: 1 })
  })

  it('[REQ-365/AC-3] keeps empty states visible without model master list inline', () => {
    queryMocks.empty = true
    render(<BaseModelSection />)

    expect(screen.getByText('マッピングが登録されていません。')).toBeInTheDocument()
    expect(screen.queryByText('ベースモデルが登録されていません。')).not.toBeInTheDocument()
    openManager()
    expect(screen.getByText('ベースモデルが登録されていません。')).toBeInTheDocument()
  })
})
