import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageCropper } from '../ImageCropper'

// Mock react-easy-crop
vi.mock('react-easy-crop', () => ({
  default: ({ aspect }: { aspect: number }) => (
    <div data-testid="mock-cropper" data-aspect={aspect}>
      Mock Cropper
    </div>
  ),
}))

describe('ImageCropper component', () => {
  it('renders cropper modal with default 3:4 (0.75) aspect ratio', () => {
    render(
      <ImageCropper
        imageSrc="data:image/png;base64,test"
        onCropComplete={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('画像の切り抜き調整')).toBeInTheDocument()
    const cropper = screen.getByTestId('mock-cropper')
    expect(cropper).toHaveAttribute('data-aspect', (3 / 4).toString())
  })

  it('renders cropper modal with custom passed aspect ratio', () => {
    render(
      <ImageCropper
        imageSrc="data:image/png;base64,test"
        aspectRatio={1}
        onCropComplete={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const cropper = screen.getByTestId('mock-cropper')
    expect(cropper).toHaveAttribute('data-aspect', '1')
  })

  it('stops event propagation when clicking inside dialog and does not trigger onCancel', () => {
    const onCancel = vi.fn()
    const parentClick = vi.fn()

    render(
      <div onClick={parentClick} data-testid="parent-container">
        <ImageCropper
          imageSrc="data:image/png;base64,test"
          onCropComplete={vi.fn()}
          onCancel={onCancel}
        />
      </div>
    )

    const dialogTitle = screen.getByText('画像の切り抜き調整')
    fireEvent.click(dialogTitle)

    expect(parentClick).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('calls onCancel when clicking backdrop directly and stops propagation to parent', () => {
    const onCancel = vi.fn()
    const parentClick = vi.fn()

    const { container } = render(
      <div onClick={parentClick} data-testid="parent-container">
        <ImageCropper
          imageSrc="data:image/png;base64,test"
          onCropComplete={vi.fn()}
          onCancel={onCancel}
        />
      </div>
    )

    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement
    expect(backdrop).toBeTruthy()

    fireEvent.click(backdrop)

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('calls onCancel when clicking cancel and close buttons without propagating to parent', () => {
    const onCancel = vi.fn()
    const parentClick = vi.fn()

    render(
      <div onClick={parentClick} data-testid="parent-container">
        <ImageCropper
          imageSrc="data:image/png;base64,test"
          onCropComplete={vi.fn()}
          onCancel={onCancel}
        />
      </div>
    )

    const cancelButton = screen.getByRole('button', { name: 'キャンセル' })
    fireEvent.click(cancelButton)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(parentClick).not.toHaveBeenCalled()

    const closeButton = screen.getByRole('button', { name: '切り抜きを閉じる' })
    expect(closeButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(closeButton)
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(parentClick).not.toHaveBeenCalled()
  })
})
