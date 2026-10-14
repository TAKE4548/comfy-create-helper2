import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsPopover, type SettingsPopoverProps } from '../SettingsPopover'
import { useConfig } from '../../../../hooks/useConfig'

vi.mock('../../../../hooks/useConfig', () => ({ useConfig: vi.fn() }))

const mockedUseConfig = vi.mocked(useConfig)

function props(overrides: Partial<SettingsPopoverProps> = {}): SettingsPopoverProps {
  return {
    setIsSettingsOpen: vi.fn(),
    localComfyUrl: 'http://old-local-comfy:8188',
    setLocalComfyUrl: vi.fn(),
    setComfyUrl: vi.fn(),
    selectedWorkflowId: null,
    workflow: null,
    handleSaveDefaultParams: vi.fn(),
    isSavePending: false,
    handleResetDefaultParams: vi.fn(),
    ...overrides,
  }
}

describe('SettingsPopover REQ-333', () => {
  it('shows Backend Comfy URL read-only and never calls legacy URL setters', () => {
    mockedUseConfig.mockReturnValue({ data: { comfy_url: 'http://backend-comfy:8188' }, isLoading: false, isError: false } as ReturnType<typeof useConfig>)
    const viewProps = props()
    const { rerender } = render(<SettingsPopover {...viewProps} />)
    const input = screen.getByRole('textbox', { name: 'ComfyUI URL（本体設定）' }) as HTMLInputElement
    expect(input).toHaveValue('http://backend-comfy:8188')
    expect(input).toHaveAttribute('readonly')
    expect(viewProps.setLocalComfyUrl).not.toHaveBeenCalled()
    expect(viewProps.setComfyUrl).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'http://edited-local:8188' } })
    expect(input).toHaveValue('http://backend-comfy:8188')
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(viewProps.setLocalComfyUrl).not.toHaveBeenCalled()
    expect(viewProps.setComfyUrl).not.toHaveBeenCalled()
    expect(viewProps.setIsSettingsOpen).toHaveBeenCalledWith(false)
    rerender(<SettingsPopover {...viewProps} />)
  })

  it('does not substitute the legacy local URL when Backend config is missing', () => {
    mockedUseConfig.mockReturnValue({ data: undefined, isLoading: true, isError: false } as ReturnType<typeof useConfig>)
    render(<SettingsPopover {...props()} />)
    expect(screen.getByRole('textbox', { name: 'ComfyUI URL（本体設定）' })).toHaveValue('')
    expect(screen.getByText('読み込み中…')).toBeInTheDocument()
  })

  it('provides the Settings system link and preserves workflow default/reset/model callbacks', () => {
    mockedUseConfig.mockReturnValue({ data: { comfy_url: 'http://backend-comfy:8188' }, isLoading: false, isError: false } as ReturnType<typeof useConfig>)
    const save = vi.fn()
    const reset = vi.fn()
    const close = vi.fn()
    const mutate = vi.fn()
    const viewProps = props({
      selectedWorkflowId: 12,
      workflow: { id: 12, target_base_model_id: null },
      baseModels: [{ id: 5, name: 'Model Five' }],
      updateWorkflowBaseModelMutation: { mutate },
      handleSaveDefaultParams: save,
      handleResetDefaultParams: reset,
      setIsSettingsOpen: close,
    })
    render(<SettingsPopover {...viewProps} />)
    expect(screen.getByRole('link', { name: 'サービス管理設定へ' })).toHaveAttribute('href', '/settings#system')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '5' } })
    expect(mutate).toHaveBeenCalledWith({ id: 12, target_base_model_id: 5 })
    fireEvent.click(screen.getByRole('button', { name: 'デフォルト保存' }))
    expect(save).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'リセット' }))
    expect(reset).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledTimes(2)
  })
})
