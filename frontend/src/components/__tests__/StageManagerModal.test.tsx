import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StageManagerModal } from '../StageManagerModal'
import { stageMastersApi } from '../../api/domains/stageMasters'
import type { StageMaster } from '../../api/types'

vi.mock('../../api/domains/stageMasters', () => ({
  stageMastersApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getUsages: vi.fn(),
    cascadePreview: vi.fn(),
    cascadeRename: vi.fn(),
  },
}))

const stages: StageMaster[] = [
  { id: 10, key: 'normal', name: '通常', suffix: '', search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 1 },
  { id: 20, key: 'rough', name: 'Rough', suffix: '_rough', search_keywords: ['rough'], previous_suffixes: null, is_builtin: false, is_active: true, sort_order: 2 },
]

function renderModal(isOpen = true, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={qc}>
      <StageManagerModal isOpen={isOpen} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { ...utils, onClose }
}

describe('StageManagerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(stageMastersApi.list).mockResolvedValue(stages)
  })

  it('[REQ-365/AC-9] renders in the common bottom-sheet Modal (single handle, max-h-[85dvh], exactly one dialog)', async () => {
    renderModal()
    const dialog = await screen.findByRole('dialog', { name: /ステージ管理/ })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getAllByTestId('modal-sheet-handle')).toHaveLength(1)
    expect(dialog).toHaveAttribute('data-radius-exempt')
    expect(dialog).toHaveAttribute('data-sheet-max-height')
    expect(dialog.getAttribute('style')).toContain('--modal-sheet-max-height: 85dvh')
    expect(dialog.className).toContain('rounded-t-2xl')
    expect(dialog).toHaveAttribute('aria-label', 'ステージ管理 (Stage Manager)')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('ステージ管理')
    let el: HTMLElement | null = dialog.parentElement
    while (el) {
      expect(el.classList.contains('fixed') && el.classList.contains('inset-0') && el.classList.contains('z-50')).toBe(false)
      el = el.parentElement
    }
  })

  it('[REQ-365/AC-9] closes via Escape, backdrop click and both close buttons', async () => {
    const { onClose, container } = renderModal()
    const dialog = await screen.findByRole('dialog', { name: /ステージ管理/ })
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(container.ownerDocument.querySelector('.modal-backdrop') as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(2)

    const closes = screen.getAllByRole('button', { name: '閉じる' })
    expect(closes).toHaveLength(2)
    fireEvent.click(closes[0])
    fireEvent.click(closes[1])
    expect(onClose).toHaveBeenCalledTimes(4)
  })

  it('[REQ-365/AC-9] inline delete guard and add form stay inside the single dialog', async () => {
    renderModal()
    await screen.findByRole('dialog', { name: /ステージ管理/ })
    fireEvent.click(await screen.findByRole('button', { name: '通常 を削除' }))
    expect(await screen.findByText(/組み込みステージ \(Built-in\) は削除できません/)).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /新規ステージ追加/ }))
    expect(await screen.findByText('新規ステージ登録')).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))
  })

  it('[REQ-365/AC-9] touch targets: close/edit/delete/footer buttons expose min-h-[44px]', async () => {
    renderModal()
    await screen.findByRole('dialog', { name: /ステージ管理/ })
    const closes = screen.getAllByRole('button', { name: '閉じる' })
    const edit = await screen.findByRole('button', { name: 'Rough を編集' })
    const del = screen.getByRole('button', { name: 'Rough を削除' })
    for (const b of [...closes, edit, del, screen.getByRole('button', { name: /新規ステージ追加/ })]) {
      expect(b.className).toContain('min-h-[44px]')
      expect(b.className).toContain('touch-manipulation')
    }
    expect(closes[0].className).toContain('min-w-[44px]')
    expect(edit.className).toContain('min-w-[44px]')
    expect(del.className).toContain('min-w-[44px]')
  })

  it('[REQ-365/AC-9] renders nothing when isOpen is false', () => {
    renderModal(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByTestId('modal-sheet-handle')).toBeNull()
  })

  it('[REQ-419/AC-8] stage create and edit forms have no search keyword input', async () => {
    vi.mocked(stageMastersApi.create).mockResolvedValue(stages[1])
    vi.mocked(stageMastersApi.update).mockResolvedValue(stages[1])
    renderModal()
    const dialog = await screen.findByRole('dialog', { name: /ステージ管理/ })
    const labelsOf = () =>
      within(dialog)
        .getAllByRole('textbox')
        .map((el) => el.previousElementSibling?.textContent ?? '')
    const forbidden = /検索|キーワード|keyword/i

    // create form
    fireEvent.click(screen.getByRole('button', { name: /新規ステージ追加/ }))
    await screen.findByText('新規ステージ登録')
    expect(new Set(labelsOf())).toEqual(new Set(['キー (ID)', 'ステージ名', '接尾辞 (Suffix)']))
    expect(labelsOf()).toHaveLength(3)
    expect(within(dialog).queryByText(forbidden)).toBeNull()
    expect(within(dialog).queryByPlaceholderText(forbidden)).toBeNull()
    const [keyEl, nameEl, suffixEl] = within(dialog).getAllByRole('textbox')
    fireEvent.change(keyEl, { target: { value: 'upscale' } })
    fireEvent.change(nameEl, { target: { value: '高解像度化' } })
    fireEvent.change(suffixEl, { target: { value: '_up' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await waitFor(() => expect(stageMastersApi.create).toHaveBeenCalledTimes(1))
    const createBody = vi.mocked(stageMastersApi.create).mock.calls[0][0]
    expect(createBody).toEqual({ key: 'upscale', name: '高解像度化', suffix: '_up' })
    expect(createBody).not.toHaveProperty('search_keywords')

    // edit form (stage with existing search_keywords)
    fireEvent.click(await screen.findByRole('button', { name: 'Rough を編集' }))
    await screen.findByText(/ステージ編集: Rough/)
    expect(labelsOf()).toEqual(['ステージ名', '接尾辞 (Suffix)'])
    expect(within(dialog).queryByText(forbidden)).toBeNull()
    expect(within(dialog).queryByPlaceholderText(forbidden)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(stageMastersApi.update).toHaveBeenCalledTimes(1))
    const updateBody = vi.mocked(stageMastersApi.update).mock.calls[0][1]
    expect(updateBody).not.toHaveProperty('search_keywords')
  })
})
