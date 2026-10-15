import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ParamTypeMaster } from '../../api/types'
import { ParamTypeMasterManagerModal } from '../ParamTypeMasterManagerModal'

const make = (id: number, name: string, widget_type: ParamTypeMaster['widget_type'] = 'select') =>
  ({ id, name, widget_type } as unknown as ParamTypeMaster)

function setup(items: ParamTypeMaster[] = [make(1, 'Sampler'), make(2, 'Steps', 'int')]) {
  const props = {
    isOpen: true,
    items,
    onClose: vi.fn(),
    onCreate: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  const utils = render(<ParamTypeMasterManagerModal {...props} />)
  return { props, ...utils }
}

describe('ParamTypeMasterManagerModal', () => {
  it('[REQ-365/AC-4] renders as a single dialog listing param types with create/edit/delete callbacks', () => {
    const { props } = setup()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByText('カスタム型マスタ管理 (2)')).toBeInTheDocument()
    expect(screen.getByText('Sampler')).toBeInTheDocument()
    expect(screen.getByText('int')).toBeInTheDocument()
    fireEvent.click(screen.getByText('新規型を作成'))
    expect(props.onCreate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByLabelText('Sampler を編集'))
    expect(props.onEdit).toHaveBeenCalledWith(props.items[0])
    fireEvent.click(screen.getByLabelText('Steps を削除'))
    fireEvent.click(screen.getByText('削除する'))
    expect(props.onDelete).toHaveBeenCalledWith(props.items[1])
  })

  it('[REQ-365/AC-4] shows empty message and still offers create', () => {
    const { props } = setup([])
    expect(screen.getByText('カスタム型マスターはまだ登録されていません。')).toBeInTheDocument()
    fireEvent.click(screen.getByText('新規型を作成'))
    expect(props.onCreate).toHaveBeenCalledTimes(1)
  })

  it('[REQ-365/AC-4] closes on Escape and backdrop click via onClose, and delete requires inline confirmation', () => {
    const { props, container } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(container.querySelector('.modal-backdrop') as HTMLElement)
    expect(props.onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByLabelText('閉じる'))
    expect(props.onClose).toHaveBeenCalledTimes(3)

    fireEvent.click(screen.getByLabelText('Sampler を削除'))
    expect(props.onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('キャンセル'))
    expect(props.onDelete).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Sampler を削除')).toBeInTheDocument()
  })

  it('[REQ-365/AC-9] uses the common bottom-sheet Modal (modal-backdrop, rounded-t-2xl, modal-sheet-handle, max-h-[85dvh])', () => {
    const { container } = setup()
    expect(container.querySelector('.modal-backdrop')).not.toBeNull()
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('rounded-t-2xl')
    expect(dialog.className).toContain('max-h-[85dvh]')
    expect(screen.getAllByTestId('modal-sheet-handle')).toHaveLength(1)
  })

  it('[REQ-365/AC-4] Tab key keeps focus inside the dialog and focus returns to the opener on close', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const props = { isOpen: true, items: [make(1, 'A')], onClose: vi.fn(), onCreate: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() }
    const { rerender } = render(<ParamTypeMasterManagerModal {...props} />)
    const dialog = screen.getByRole('dialog')
    const last = screen.getByLabelText('A を削除')
    last.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(last)
    rerender(<ParamTypeMasterManagerModal {...props} isOpen={false} />)
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('[REQ-365/AC-4] keeps full 200-char name in aria-label and title while truncating visually (RT-11)', () => {
    const long = 'あ'.repeat(200)
    setup([make(1, long)])
    expect(screen.getByLabelText(`${long} を編集`)).toBeInTheDocument()
    const span = screen.getByTitle(long)
    expect(span.className).toContain('truncate')
  })
})
