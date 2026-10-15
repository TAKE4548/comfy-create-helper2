import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ParamTypeMasterModal } from '../ParamTypeMasterModal'

vi.mock('../../api/client', () => ({
  workflowsApi: { list: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue(null) },
  comfyApi: { getObjectInfo: vi.fn().mockResolvedValue({}) },
}))

function renderModal(overrides: Partial<React.ComponentProps<typeof ParamTypeMasterModal>> = {}) {
  const props = {
    mode: 'create' as const,
    isPending: false,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={qc}>
      <ParamTypeMasterModal {...props} />
    </QueryClientProvider>,
  )
  return { ...utils, props }
}

describe('ParamTypeMasterModal', () => {
  it('[REQ-365/AC-9] renders inside the common bottom-sheet Modal with handle and 85dvh cap', () => {
    const { container } = renderModal()
    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(1)
    expect(container.ownerDocument.querySelector('.modal-backdrop')).not.toBeNull()
    expect(dialogs[0].className).toContain('rounded-t-2xl')
    expect(dialogs[0].className).toContain('max-h-[85dvh]')
    expect(screen.getByTestId('modal-sheet-handle')).toBeInTheDocument()
  })

  it('[REQ-365/AC-4] keeps create validation and submit contract', () => {
    const { props, container } = renderModal()
    const form = container.ownerDocument.querySelector('form') as HTMLFormElement
    const nameInput = screen.getByPlaceholderText('例: SamplerType, DenoiseStep') as HTMLInputElement
    fireEvent.submit(form)
    expect(screen.getByText('マスター型名を入力してください。')).toBeInTheDocument()
    expect(props.onSubmit).not.toHaveBeenCalled()

    fireEvent.change(nameInput, { target: { value: ' MyType ' } })
    fireEvent.submit(form)
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MyType', widget_type: 'select', combo_options: [] }),
    )
  })

  it('[REQ-365/AC-9] closes on Escape and backdrop click', () => {
    const { props, container } = renderModal()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
    const backdrop = container.ownerDocument.querySelector('.modal-backdrop') as HTMLElement
    fireEvent.click(backdrop)
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })

  it('[REQ-365/AC-9] close button has accessible label and 44px target', () => {
    renderModal()
    const btn = screen.getByRole('button', { name: '閉じる' })
    expect(btn.className).toContain('min-h-11')
    expect(btn.className).toContain('min-w-11')
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('[REQ-365/AC-4] toggles the Auto-Fill section', () => {
    renderModal()
    expect(screen.queryByText('対象ワークフロー')).toBeNull()
    fireEvent.click(screen.getByText('ComfyUI から自動取得'))
    expect(screen.getByText('対象ワークフロー')).toBeInTheDocument()
    fireEvent.click(screen.getByText('ComfyUI から自動取得'))
    expect(screen.queryByText('対象ワークフロー')).toBeNull()
  })
})
