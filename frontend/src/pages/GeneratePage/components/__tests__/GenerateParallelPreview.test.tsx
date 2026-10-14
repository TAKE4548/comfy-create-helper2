import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GenerateParallelPreview } from '../GenerateParallelPreview'

const images = ['img-1', 'img-2', 'img-3', 'img-4', 'img-5', 'img-6']

function setPreviewSize(container: HTMLElement, width: number, height: number) {
  const root = container.querySelector('[data-testid="generate-parallel-preview"]') as HTMLElement
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({})
  } as DOMRect)
  act(() => window.dispatchEvent(new Event('resize')))
  return root
}

describe('GenerateParallelPreview', () => {
  it('fits 2:3 images at two, three, and four columns only when the measured viewport has room', () => {
    const { container } = render(<GenerateParallelPreview images={images} selectedImage="img-1" onSelect={vi.fn()} onOpen={vi.fn()} />)
    const root = setPreviewSize(container, 811, 600)
    expect(root.querySelectorAll('img')).toHaveLength(1)
    setPreviewSize(container, 812, 600)
    expect(root.querySelectorAll('img')).toHaveLength(2)
    setPreviewSize(container, 1224, 600)
    expect(root.querySelectorAll('img')).toHaveLength(3)
    setPreviewSize(container, 1636, 600)
    expect(root.querySelectorAll('img')).toHaveLength(4)
    expect(root.querySelectorAll('img')).toHaveLength(4)
  })

  it('anchors pages to the selected image, moves by the visible count, and clamps at both ends', () => {
    const onSelect = vi.fn()
    const onOpen = vi.fn()
    const { container, rerender } = render(<GenerateParallelPreview images={images} selectedImage="img-3" onSelect={onSelect} onOpen={onOpen} />)
    const root = setPreviewSize(container, 812, 600)
    expect(Array.from(root.querySelectorAll('img')).map((image) => image.getAttribute('src'))).toEqual(['img-3', 'img-4'])
    expect(root.querySelector('[aria-label="前の画像ページ"] svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(root.querySelector('[aria-label="次の画像ページ"] svg')?.getAttribute('aria-hidden')).toBe('true')

    fireEvent.click(root.querySelector('[aria-label="次の画像ページ"]') as HTMLElement)
    expect(onSelect).toHaveBeenLastCalledWith('img-5')
    rerender(<GenerateParallelPreview images={images} selectedImage="img-5" onSelect={onSelect} onOpen={onOpen} />)
    expect(Array.from(root.querySelectorAll('img')).map((image) => image.getAttribute('src'))).toEqual(['img-5', 'img-6'])
    fireEvent.click(root.querySelector('[aria-label="次の画像ページ"]') as HTMLElement)
    expect(onSelect).toHaveBeenCalledTimes(1)
    fireEvent.click(root.querySelector('[aria-label="前の画像ページ"]') as HTMLElement)
    expect(onSelect).toHaveBeenLastCalledWith('img-3')
    rerender(<GenerateParallelPreview images={images} selectedImage="img-1" onSelect={onSelect} onOpen={onOpen} />)

    onSelect.mockClear()
    root.focus()
    fireEvent.keyDown(root, { key: 'ArrowLeft' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('selects and opens the clicked image, and prevents a duplicate global arrow action', async () => {
    const onSelect = vi.fn()
    const onOpen = vi.fn()
    const globalKey = vi.fn()
    document.addEventListener('keydown', globalKey)
    const { container } = render(<GenerateParallelPreview images={images} selectedImage="img-1" onSelect={onSelect} onOpen={onOpen} />)
    const root = setPreviewSize(container, 812, 600)

    fireEvent.click(root.querySelector('[aria-label="画像 img-2 を開く"]') as HTMLElement)
    expect(onSelect).toHaveBeenCalledWith('img-2')
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1))
    fireEvent.keyDown(root, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenLastCalledWith('img-3')
    expect(globalKey).not.toHaveBeenCalled()
    document.removeEventListener('keydown', globalKey)
  })

  it('adapts visible count dynamically according to aspect ratios (16:9, 1:1, mixed)', () => {
    const customAR: Record<string, number> = {
      'img-1': 16 / 9, // Landscape (~1.778, width at H=600 is ~1066.7px)
      'img-2': 16 / 9,
      'img-3': 1.0,    // Square (1.0, width at H=600 is 600px)
      'img-4': 1.0,
      'img-5': 2 / 3,  // Portrait (0.667, width at H=600 is 400px)
      'img-6': 2 / 3,
    }
    const { container } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        aspectRatios={customAR}
      />
    )
    // For 16:9 at H=600: 1 image is 1066.7px. Two images need 1066.7*2 + 12 = 2145.4px
    const root = setPreviewSize(container, 1200, 600)
    expect(root.querySelectorAll('img')).toHaveLength(1)

    // With 2200px width, two 16:9 images fit
    setPreviewSize(container, 2200, 600)
    expect(root.querySelectorAll('img')).toHaveLength(2)
  })

  it('calculates mixed aspect ratios cleanly with uniform height', () => {
    const mixedImages = ['img-sq', 'img-port1', 'img-port2']
    const customAR: Record<string, number> = {
      'img-sq': 1.0,    // 600px
      'img-port1': 2 / 3, // 400px
      'img-port2': 2 / 3, // 400px
    }
    const { container } = render(
      <GenerateParallelPreview
        images={mixedImages}
        selectedImage="img-sq"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        aspectRatios={customAR}
      />
    )
    // 600px + 12 + 400px = 1012px -> 2 images fit at 1020px
    const root = setPreviewSize(container, 1020, 600)
    expect(root.querySelectorAll('img')).toHaveLength(2)

    // 600px + 12 + 400px + 12 + 400px = 1424px -> all 3 fit at 1430px
    setPreviewSize(container, 1430, 600)
    expect(root.querySelectorAll('img')).toHaveLength(3)
  })
it('renders progressive thumbnail placeholder first and transitions to full-size WebP [REQ-362/AC-7]', () => {
    const viewUrl = '/api/comfy/view?filename=prompt_123.png&subfolder=&type=output'
    const { container } = render(
      <GenerateParallelPreview
        images={[viewUrl]}
        selectedImage={viewUrl}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    const root = setPreviewSize(container, 800, 600)

    // 1. Initial render: thumbnail placeholder is visible, full image is opacity-0
    const thumbImg = root.querySelector('[data-testid="preview-thumbnail"]') as HTMLImageElement
    const fullImg = root.querySelector('[data-testid="preview-full"]') as HTMLImageElement

    expect(thumbImg).toBeTruthy()
    expect(thumbImg.getAttribute('src')).toContain('/api/comfy/thumbnail?filename=prompt_123.png')
    expect(fullImg).toBeTruthy()
    expect(fullImg.getAttribute('src')).toBe(viewUrl)
    expect(fullImg.className).toContain('opacity-0')

    // 2. Full image loads: opacity transitions to opacity-100, thumbnail is unmounted
    act(() => {
      fireEvent.load(fullImg)
    })
    expect(fullImg.className).toContain('opacity-100')
    expect(root.querySelector('[data-testid="preview-thumbnail"]')).toBeNull()
  })

  it('maintains thumbnail fallback if full-size WebP fails to load [REQ-362/AC-7]', () => {
    const viewUrl = '/api/comfy/view?filename=prompt_failed.png&subfolder=&type=output'
    const { container } = render(
      <GenerateParallelPreview
        images={[viewUrl]}
        selectedImage={viewUrl}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    const root = setPreviewSize(container, 800, 600)

    const fullImg = root.querySelector('[data-testid="preview-full"]') as HTMLImageElement
    expect(fullImg).toBeTruthy()

    // Full image fails
    act(() => {
      fireEvent.error(fullImg)
    })

    // Full image is unmounted, thumbnail remains as fallback
    expect(root.querySelector('[data-testid="preview-full"]')).toBeNull()
    const thumbImg = root.querySelector('[data-testid="preview-thumbnail"]') as HTMLImageElement
    expect(thumbImg).toBeTruthy()
    expect(thumbImg.getAttribute('src')).toContain('/api/comfy/thumbnail?filename=prompt_failed.png')
  })
})
