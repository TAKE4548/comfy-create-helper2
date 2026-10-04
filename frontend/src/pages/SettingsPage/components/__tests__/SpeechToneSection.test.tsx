import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SpeechToneSection } from '../SpeechToneSection'

const mocks = vi.hoisted(() => ({
  presets: [
    { id: 17, name: '丁寧', prompt: '長い指示文です。'.repeat(20), description: '説明', sort_order: 2, created_at: '' },
  ],
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('../../../../api/client', () => ({
  speechTonePresetsApi: {
    list: vi.fn(),
    create: mocks.create,
    update: mocks.update,
    delete: mocks.remove,
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mocks.presets, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn }: { mutationFn: (...args: never[]) => unknown }) => ({
    isPending: false,
    mutate: (...args: never[]) => mutationFn(...args),
  }),
}))

describe('SpeechToneSection', () => {
  beforeEach(() => {
    mocks.presets.splice(0, mocks.presets.length, {
      id: 17, name: '丁寧', prompt: '長い指示文です。'.repeat(20), description: '説明', sort_order: 2, created_at: '',
    })
    mocks.create.mockReset().mockResolvedValue({})
    mocks.update.mockReset().mockResolvedValue({})
    mocks.remove.mockReset().mockResolvedValue({})
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('shows a responsive labeled card with the full preset details and 44px actions', () => {
    render(<SpeechToneSection isExpanded onToggle={vi.fn()} />)

    expect(screen.getByRole('columnheader', { name: 'プリセット名' })).toBeInTheDocument()
    expect(screen.getByText('丁寧')).toHaveAttribute('data-label', 'プリセット名')
    expect(screen.getByText(mocks.presets[0].prompt)).toHaveAttribute('data-label', 'プロンプト指示')
    expect(screen.getAllByText('説明').find((element) => element.tagName === 'TD')).toHaveAttribute('data-label', '説明')
    expect(screen.getByText('2')).toHaveAttribute('data-label', '順序')

    const edit = screen.getByTitle('編集')
    const remove = screen.getByTitle('削除')
    expect(edit).toHaveClass('min-h-11', 'min-w-11')
    expect(remove).toHaveClass('min-h-11', 'min-w-11')
    expect(screen.getByRole('button', { name: /プリセット追加/ })).toHaveClass('min-h-11', 'min-w-11')
  })

  it('edits the selected ID, supports modal cancel, and creates a preset', () => {
    render(<SpeechToneSection isExpanded onToggle={vi.fn()} />)

    fireEvent.click(screen.getByTitle('編集'))
    const editModal = screen.getByTestId('speech-tone-preset-modal')
    expect(within(editModal).getByRole('dialog', { name: '口調プリセット編集' })).toHaveAttribute('aria-modal', 'true')
    expect(within(editModal).getByDisplayValue('丁寧')).toBeInTheDocument()
    fireEvent.click(within(editModal).getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByTestId('speech-tone-preset-modal')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTitle('編集'))
    const modal = screen.getByTestId('speech-tone-preset-modal')
    fireEvent.click(within(modal).getByRole('button', { name: '保存' }))
    expect(mocks.update).toHaveBeenCalledWith(17, expect.objectContaining({ name: '丁寧' }))

    fireEvent.click(screen.getByRole('button', { name: /プリセット追加/ }))
    const createModal = screen.getByTestId('speech-tone-preset-modal')
    fireEvent.change(within(createModal).getByPlaceholderText('例: ツンデレ風, お嬢様風'), { target: { value: '新規' } })
    fireEvent.change(within(createModal).getByPlaceholderText(/ツンデレな口調で/), { target: { value: '口調' } })
    fireEvent.click(within(createModal).getByRole('button', { name: '保存' }))
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: '新規', prompt: '口調' }))
  })

  it('deletes the exact selected preset ID and handles an empty list', () => {
    const { rerender } = render(<SpeechToneSection isExpanded onToggle={vi.fn()} />)
    fireEvent.click(screen.getByTitle('削除'))
    expect(mocks.remove).toHaveBeenCalledWith(17)

    mocks.presets.splice(0)
    rerender(<SpeechToneSection isExpanded onToggle={vi.fn()} />)
    expect(screen.getByText('登録されている口調プリセットはありません。')).toBeInTheDocument()
  })
})
