import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkflowActionsMenu } from '../WorkflowActionsMenu'
import type { Workflow, BaseModel } from '../../../../api/types'

describe('WorkflowActionsMenu (REQ-341 AC-6)', () => {
  const mockWorkflow: Workflow = {
    id: 1,
    name: 'Test Workflow',
    json_body: { '1': { class_type: 'KSampler' } },
    mappings: [],
    target_base_model_id: 2,
  }

  const mockBaseModels: BaseModel[] = [
    { id: 1, name: 'SD 1.5' },
    { id: 2, name: 'SDXL' },
    { id: 3, name: 'Anima' },
  ]

  const createProps = (overrides = {}) => ({
    workflowId: 1,
    workflow: mockWorkflow,
    baseModels: mockBaseModels,
    onSaveDefaults: vi.fn(),
    isSavePending: false,
    onResetDefaults: vi.fn(),
    onUpdateBaseModel: vi.fn(),
    onRenameWorkflow: vi.fn(),
    onDuplicateWorkflow: vi.fn(),
    onRescanNodes: vi.fn(),
    ...overrides,
  })

  it('renders null when workflowId or workflow is missing', () => {
    const { container: c1 } = render(<WorkflowActionsMenu {...createProps({ workflowId: null })} />)
    expect(c1.firstChild).toBeNull()

    const { container: c2 } = render(<WorkflowActionsMenu {...createProps({ workflow: null })} />)
    expect(c2.firstChild).toBeNull()
  })

  it('renders workflow actions button and toggles menu on click', () => {
    const props = createProps()
    render(<WorkflowActionsMenu {...props} />)

    const btn = screen.getByRole('button', { name: 'ワークフロー設定' })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('id', 'workflow-actions-btn')
    expect(screen.queryByRole('menu')).toBeNull()

    // Click to open
    fireEvent.click(btn)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('ワークフロー個別設定')).toBeInTheDocument()
    expect(screen.getByText('ID: 1')).toBeInTheDocument()

    // Click to close
    fireEvent.click(btn)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('triggers onUpdateBaseModel when base model is changed', () => {
    const props = createProps()
    render(<WorkflowActionsMenu {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'ワークフロー設定' }))
    const select = screen.getByLabelText('ベースモデル') as HTMLSelectElement
    expect(select.value).toBe('2')

    // Change to SD 1.5 (id: 1)
    fireEvent.change(select, { target: { value: '1' } })
    expect(props.onUpdateBaseModel).toHaveBeenCalledWith(1)

    // Change to Auto (value: '')
    fireEvent.change(select, { target: { value: '' } })
    expect(props.onUpdateBaseModel).toHaveBeenCalledWith(null)
  })

  it('triggers onSaveDefaults and closes menu on save click', () => {
    const props = createProps()
    render(<WorkflowActionsMenu {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'ワークフロー設定' }))
    const saveBtn = screen.getByRole('button', { name: 'デフォルト保存' })
    expect(saveBtn).not.toBeDisabled()

    fireEvent.click(saveBtn)
    expect(props.onSaveDefaults).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('disables save button when isSavePending is true', () => {
    const props = createProps({ isSavePending: true })
    render(<WorkflowActionsMenu {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'ワークフロー設定' }))
    const saveBtn = screen.getByRole('button', { name: 'デフォルト保存' })
    expect(saveBtn).toBeDisabled()
  })

  it('triggers onResetDefaults and closes menu on reset click', () => {
    const props = createProps()
    render(<WorkflowActionsMenu {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'ワークフロー設定' }))
    const resetBtn = screen.getByRole('button', { name: 'リセット' })

    fireEvent.click(resetBtn)
    expect(props.onResetDefaults).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('triggers onRenameWorkflow, onDuplicateWorkflow, and onRescanNodes', () => {
    const props = createProps()
    const { rerender } = render(<WorkflowActionsMenu {...props} />)

    // Rename
    fireEvent.click(screen.getByRole('button', { name: 'ワークフロー設定' }))
    fireEvent.click(screen.getByRole('button', { name: '名前を変更' }))
    expect(props.onRenameWorkflow).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()

    // Duplicate
    rerender(<WorkflowActionsMenu {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'ワークフロー設定' }))
    fireEvent.click(screen.getByRole('button', { name: '複製' }))
    expect(props.onDuplicateWorkflow).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()

    // Rescan
    rerender(<WorkflowActionsMenu {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'ワークフロー設定' }))
    fireEvent.click(screen.getByRole('button', { name: 'ノード再スキャン' }))
    expect(props.onRescanNodes).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes menu when clicking outside', () => {
    const props = createProps()
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <WorkflowActionsMenu {...props} />
      </div>
    )

    fireEvent.click(screen.getByRole('button', { name: 'ワークフロー設定' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('WorkflowActionsMenu HeaderDropdown migration (REQ-346)', () => {
  const mockWorkflow: Workflow = {
    id: 1,
    name: 'Test Workflow',
    json_body: { '1': { class_type: 'KSampler' } },
    mappings: [],
    target_base_model_id: 2,
  }

  const createProps = (overrides = {}) => ({
    workflowId: 1,
    workflow: mockWorkflow,
    baseModels: [{ id: 1, name: 'SD 1.5' }, { id: 2, name: 'SDXL' }],
    onSaveDefaults: vi.fn(),
    isSavePending: false,
    onResetDefaults: vi.fn(),
    onUpdateBaseModel: vi.fn(),
    onRenameWorkflow: vi.fn(),
    onDuplicateWorkflow: vi.fn(),
    onRescanNodes: vi.fn(),
    ...overrides,
  })

  const originalInnerHeight = window.innerHeight

  afterEach(() => {
    window.innerHeight = originalInnerHeight
  })

  it('[REQ-346/AC-1] renders the workflow settings panel in a body-level fixed layer, not inside the header action slot', () => {
    render(
      <div className="overflow-x-auto">
        <WorkflowActionsMenu {...createProps()} />
      </div>
    )

    fireEvent.click(screen.getByRole('button', { name: 'ワークフロー設定' }))
    const menu = screen.getByRole('menu')
    const slot = document.querySelector('div.overflow-x-auto') as HTMLElement

    expect(menu.parentElement).toBe(document.body)
    expect(slot.contains(menu)).toBe(false)
    expect(menu.style.position).toBe('fixed')
    expect(menu).toHaveAttribute('data-header-menu-panel')
  })

  it('[REQ-346/AC-2] runs rename/duplicate/rescan from items positioned below the anchor', () => {
    const props = createProps()
    render(<WorkflowActionsMenu {...props} />)

    const btn = screen.getByRole('button', { name: 'ワークフロー設定' })
    const anchor = btn.parentElement as HTMLElement
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
      top: 10, bottom: 38, left: 100, right: 126, width: 26, height: 28, x: 100, y: 10, toJSON: () => ({}),
    } as DOMRect)

    fireEvent.click(btn)
    const menu = screen.getByRole('menu')
    expect(menu.style.top).not.toBe('')
    expect(within(menu).getByRole('button', { name: '名前を変更' })).toBeInTheDocument()

    fireEvent.click(within(menu).getByRole('button', { name: '名前を変更' }))
    expect(props.onRenameWorkflow).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(btn)
    fireEvent.click(screen.getByRole('button', { name: '複製' }))
    expect(props.onDuplicateWorkflow).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(btn)
    fireEvent.click(screen.getByRole('button', { name: 'ノード再スキャン' }))
    expect(props.onRescanNodes).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('[REQ-346/AC-3] caps the panel height to the viewport and keeps the last item (ノード再スキャン) in the scrollable panel', () => {
    window.innerHeight = 360
    render(<WorkflowActionsMenu {...createProps()} />)

    fireEvent.click(screen.getByRole('button', { name: 'ワークフロー設定' }))
    const menu = screen.getByRole('menu')
    expect(menu.style.maxHeight).not.toBe('')
    expect(menu.className).toContain('overflow-y-auto')
    expect(menu.querySelector('#workflow-actions-rescan')).not.toBeNull()
  })

  it('[REQ-346/AC-4] closes on the second trigger press and on outside mouseDown/pointerDown', () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <WorkflowActionsMenu {...createProps()} />
      </div>
    )
    const btn = screen.getByRole('button', { name: 'ワークフロー設定' })

    fireEvent.click(btn)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(btn)
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(btn)
    fireEvent.pointerDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(btn)
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('[REQ-346/AC-6] recomputes the panel height when the window is resized while open', () => {
    window.innerHeight = 360
    render(<WorkflowActionsMenu {...createProps()} />)

    fireEvent.click(screen.getByRole('button', { name: 'ワークフロー設定' }))
    const before = screen.getByRole('menu').style.maxHeight
    expect(before).not.toBe('')

    window.innerHeight = 200
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    const after = screen.getByRole('menu').style.maxHeight
    expect(after).not.toBe('')
    expect(after).not.toBe(before)
  })
})
