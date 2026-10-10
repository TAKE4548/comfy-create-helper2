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
})
