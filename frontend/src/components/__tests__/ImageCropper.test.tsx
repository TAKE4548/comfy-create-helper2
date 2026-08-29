import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})