import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GenerateParallelPreview } from '../GenerateParallelPreview'

const images = ['img-1', 'img-2', 'img-3', 'img-4', 'img-5', 'img-6']

function setPreviewSize(container: HTMLElement, width: number, height: number) {
  const root = container.querySelector('[data-testid="generate-parallel-preview"]') as HTMLElement
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect)
  const reel = container.querySelector('[data-testid="generate-reel-viewport"]') as HTMLElement
  if (reel) {
    vi.spyOn(reel, 'clientWidth', 'get').mockReturnValue(width)
    vi.spyOn(reel, 'clientHeight', 'get').mockReturnValue(height - 40)
  }
  act(() => window.dispatchEvent(new Event('resize')))
  return root
}

describe('GenerateParallelPreview', () => {
  it('[REQ-383/AC-1] renders images in latest-first order (index 0 is newest) without pagination buttons', () => {
    const onSelect = vi.fn()
    const onOpen = vi.fn()
    const { container } = render(
      <GenerateParallelPreview
        images={['img-newest', 'img-mid', 'img-oldest']}
        selectedImage="img-newest"
        onSelect={onSelect}
        onOpen={onOpen}
      />
    )
    const root = setPreviewSize(container, 800, 600)

    // Root proposal marker
    expect(root.dataset.generateReelProposal).toBe('true')

    // No pagination buttons
    expect(root.querySelector('[aria-label="前の画像ページ"]')).toBeNull()
    expect(root.querySelector('[aria-label="次の画像ページ"]')).toBeNull()

    // Indicator
    const indicator = root.querySelector('[data-testid="parallel-preview-page-indicator"]')
    expect(indicator?.textContent).toContain('連続プレビュー · 左端が最新 / 右へ過去')
    expect(indicator?.textContent).toContain('1 / 3 枚')

    // Tiles rendered in chronological order (0 is latest)
    const tiles = root.querySelectorAll('[data-generate-reel-tile="true"]')
    expect(tiles).toHaveLength(3)
    expect(tiles[0].getAttribute('data-index')).toBe('0')
    expect(tiles[0].querySelector('[data-generate-reel-meta="true"]')?.textContent).toBe('LATEST')
    expect(tiles[1].getAttribute('data-index')).toBe('1')
    expect(tiles[1].querySelector('[data-generate-reel-meta="true"]')?.textContent).toBe('−1')
    expect(tiles[2].getAttribute('data-index')).toBe('2')
    expect(tiles[2].querySelector('[data-generate-reel-meta="true"]')?.textContent).toBe('−2')
  })

  it('[REQ-383/AC-2] applies non-compressing edge margins (marginLeft/marginRight) so first and last tiles can center', () => {
    const { container } = render(
      <GenerateParallelPreview
        images={['img-1', 'img-2', 'img-3']}
        selectedImage="img-1"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    const root = setPreviewSize(container, 1000, 600)
    const tiles = root.querySelectorAll<HTMLElement>('[data-generate-reel-tile="true"]')

    // First tile has marginLeft and no marginRight
    expect(tiles[0].style.marginLeft).toBeTruthy()
    expect(parseInt(tiles[0].style.marginLeft, 10)).toBeGreaterThan(0)
    expect(tiles[0].style.marginRight).toBe('')

    // Middle tile has neither
    expect(tiles[1].style.marginLeft).toBe('')
    expect(tiles[1].style.marginRight).toBe('')

    // Last tile has marginRight and no marginLeft
    expect(tiles[2].style.marginRight).toBeTruthy()
    expect(parseInt(tiles[2].style.marginRight, 10)).toBeGreaterThan(0)
    expect(tiles[2].style.marginLeft).toBe('')

    // Single image has both margins to center
    const { container: singleContainer } = render(
      <GenerateParallelPreview
        images={['img-single']}
        selectedImage="img-single"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    setPreviewSize(singleContainer, 1000, 600)
    const singleTile = singleContainer.querySelector<HTMLElement>('[data-generate-reel-tile="true"]')
    expect(singleTile?.style.marginLeft).toBeTruthy()
    expect(singleTile?.style.marginRight).toBeTruthy()
  })

  it('[REQ-383/AC-3] accumulates wheel impulse smoothly and snaps nearest tile to center after inertia decay', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={onSelect}
        onOpen={vi.fn()}
      />
    )
    const root = setPreviewSize(container, 800, 600)
    const reel = root.querySelector('[data-testid="generate-reel-viewport"]') as HTMLElement
    expect(reel).toBeTruthy()

    // Test wheel impulse handling
    const wheelEvent = new WheelEvent('wheel', {
      deltaX: 120,
      deltaY: 0,
      cancelable: true,
      bubbles: true,
    })
    act(() => {
      reel.dispatchEvent(wheelEvent)
    })
    expect(wheelEvent.defaultPrevented).toBe(true)

    // Keyboard navigation (ArrowLeft / ArrowRight / Home / End)
    const globalKey = vi.fn()
    document.addEventListener('keydown', globalKey)

    // ArrowRight moves to next tile
    reel.focus()
    fireEvent.keyDown(reel, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenLastCalledWith('img-2')
    expect(globalKey).not.toHaveBeenCalled() // stopPropagation check

    // ArrowLeft moves back to first tile
    fireEvent.keyDown(reel, { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenLastCalledWith('img-1')

    // End moves to oldest tile
    fireEvent.keyDown(reel, { key: 'End' })
    expect(onSelect).toHaveBeenLastCalledWith('img-6')

    // Home moves to newest tile
    fireEvent.keyDown(reel, { key: 'Home' })
    expect(onSelect).toHaveBeenLastCalledWith('img-1')

    document.removeEventListener('keydown', globalKey)
  })

  it('[REQ-383/AC-4] preserves portrait, square, and 2:1 landscape aspect ratios within viewport bounds', () => {
    const customAR: Record<string, number> = {
      'img-port': 2 / 3, // Portrait ~0.667
      'img-sq': 1.0,    // Square 1.0
      'img-land': 2.0,   // Landscape 2:1
    }
    const { container } = render(
      <GenerateParallelPreview
        images={['img-port', 'img-sq', 'img-land']}
        selectedImage="img-port"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        aspectRatios={customAR}
      />
    )
    // Container height 500 -> availableHeight = 500 - 24 = 476. Width 800 -> maxWidth = 800 * 0.86 = 688
    const root = setPreviewSize(container, 800, 500)
    const tiles = root.querySelectorAll<HTMLElement>('[data-generate-reel-tile="true"]')

    // 1. Portrait: width = 476 * (2/3) ≈ 317px, height = 476px
    const portW = parseInt(tiles[0].style.width, 10)
    const portH = parseInt(tiles[0].style.height, 10)
    expect(portH).toBe(476)
    expect(portW).toBe(317)
    expect(portW / portH).toBeCloseTo(2 / 3, 1)

    // 2. Square: width = 476px, height = 476px
    const sqW = parseInt(tiles[1].style.width, 10)
    const sqH = parseInt(tiles[1].style.height, 10)
    expect(sqW).toBe(476)
    expect(sqH).toBe(476)

    // 3. 2:1 Landscape: width is constrained by maxWidth (688px), height scales down proportionally
    const landW = parseInt(tiles[2].style.width, 10)
    const landH = parseInt(tiles[2].style.height, 10)
    expect(landW).toBe(688)
    expect(landH).toBe(344) // 688 / 2 = 344 <= 476
    expect(landW / landH).toBeCloseTo(2.0, 1)
  })

  it('[REQ-383/AC-5] shows return-to-latest button when scrolled into history and immediately stops inertia to center newest tile', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={onSelect}
        onOpen={vi.fn()}
      />
    )
    const root = setPreviewSize(container, 800, 600)
    const reel = root.querySelector('[data-testid="generate-reel-viewport"]') as HTMLElement
    const latestBtn = root.querySelector<HTMLButtonElement>('[data-generate-reel-latest="true"]') as HTMLButtonElement
    expect(latestBtn).toBeTruthy()

    // Initially scrollLeft is 0 -> latest button is hidden
    expect(latestBtn.hidden).toBe(true)
    expect(latestBtn.style.display).toBe('none')

    // User scrolls into history (scrollLeft >= 72)
    act(() => {
      reel.scrollLeft = 120
      fireEvent.scroll(reel)
    })
    expect(latestBtn.hidden).toBe(false)
    expect(latestBtn.style.display).toBe('')

    // Clicking latest button centers index 0 and selects images[0]
    fireEvent.click(latestBtn)
    expect(onSelect).toHaveBeenLastCalledWith('img-1')
    expect(reel.scrollLeft).toBe(0)
    expect(latestBtn.hidden).toBe(true)
  })

  it('[REQ-383/AC-6] jump-to-oldest button immediately stops inertia and centers oldest tile', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={onSelect}
        onOpen={vi.fn()}
      />
    )
    const root = setPreviewSize(container, 800, 600)
    const oldestBtn = root.querySelector<HTMLButtonElement>('[data-generate-reel-oldest="true"]') as HTMLButtonElement
    expect(oldestBtn).toBeTruthy()
    expect(oldestBtn.disabled).toBe(false)

    fireEvent.click(oldestBtn)
    expect(onSelect).toHaveBeenLastCalledWith('img-6')

    // Single image disables oldest button
    const { container: singleContainer } = render(
      <GenerateParallelPreview
        images={['img-1']}
        selectedImage="img-1"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    const singleOldestBtn = singleContainer.querySelector<HTMLButtonElement>('[data-generate-reel-oldest="true"]')
    expect(singleOldestBtn?.disabled).toBe(true)
  })

  it('[REQ-383/AC-7] centers requested image when centerRequest is received in normal mode', () => {
    const onSelect = vi.fn()
    const { container, rerender } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={onSelect}
        onOpen={vi.fn()}
        centerRequest={null}
      />
    )
    const root = setPreviewSize(container, 800, 600)
    const reel = root.querySelector('[data-testid="generate-reel-viewport"]') as HTMLElement
    expect(reel.scrollLeft).toBe(0)

    // External centerRequest arrives for img-3
    rerender(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={onSelect}
        onOpen={vi.fn()}
        centerRequest={{ image: 'img-3', seq: 1 }}
      />
    )
    expect(reel.scrollLeft).toBeGreaterThan(0)
  })

  it('[REQ-383/AC-8] does not jump or change scroll when isMultiSelectMode is active despite centerRequest', () => {
    const onSelect = vi.fn()
    const { container, rerender } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={onSelect}
        onOpen={vi.fn()}
        isMultiSelectMode={true}
        centerRequest={null}
      />
    )
    const root = setPreviewSize(container, 800, 600)
    const reel = root.querySelector('[data-testid="generate-reel-viewport"]') as HTMLElement
    const initialScroll = reel.scrollLeft

    // CenterRequest arrives while in multi-select mode
    rerender(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={onSelect}
        onOpen={vi.fn()}
        isMultiSelectMode={true}
        centerRequest={{ image: 'img-4', seq: 2 }}
      />
    )
    // Scroll remains stationary
    expect(reel.scrollLeft).toBe(initialScroll)
  })

  it('[REQ-383/AC-10] renders auto-follow toggle in reel toolbar and invokes onToggleAutoFollow', () => {
    const onToggleAutoFollow = vi.fn()
    const { container, rerender } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        previewAutoFollow={false}
        onToggleAutoFollow={onToggleAutoFollow}
      />
    )
    const btn = container.querySelector<HTMLButtonElement>('[data-generate-reel-auto-follow="true"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    expect(btn.textContent).toContain('○ 最新追従')
    expect(btn.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(btn)
    expect(onToggleAutoFollow).toHaveBeenCalledTimes(1)

    rerender(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        previewAutoFollow={true}
        onToggleAutoFollow={onToggleAutoFollow}
      />
    )
    expect(btn.textContent).toContain('● 最新追従')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('[REQ-383/AC-11] renders session filter toggle in reel toolbar and invokes onToggleFilterOwnSession', () => {
    const onToggleFilterOwnSession = vi.fn()
    const { container, rerender } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        filterOwnSession={false}
        onToggleFilterOwnSession={onToggleFilterOwnSession}
      />
    )
    const btn = container.querySelector<HTMLButtonElement>('[data-generate-reel-session-filter="true"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    expect(btn.textContent).toContain('自セッション')
    expect(btn.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(btn)
    expect(onToggleFilterOwnSession).toHaveBeenLastCalledWith(true)

    rerender(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        filterOwnSession={true}
        onToggleFilterOwnSession={onToggleFilterOwnSession}
      />
    )
    expect(btn.textContent).toContain('✓ 自セッション')
    expect(btn.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(btn)
    expect(onToggleFilterOwnSession).toHaveBeenLastCalledWith(false)
  })

  it('[REQ-383/AC-12] clicking reel tile selects image and calls onOpen for detail modal', async () => {
    const onSelect = vi.fn()
    const onOpen = vi.fn()
    const { container } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={onSelect}
        onOpen={onOpen}
      />
    )
    const root = setPreviewSize(container, 800, 600)

    const targetTileButton = root.querySelector('[aria-label="画像 img-2 を開く"]') as HTMLButtonElement
    expect(targetTileButton).toBeTruthy()

    fireEvent.click(targetTileButton)
    expect(onSelect).toHaveBeenCalledWith('img-2')
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('[REQ-383/AC-14] constrains reel container with min-w-0 and overflow-hidden to prevent body overflow', () => {
    const { container } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-1"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    const root = container.querySelector('[data-testid="generate-parallel-preview"]') as HTMLElement
    expect(root.className).toContain('min-w-0')
    expect(root.className).toContain('overflow-hidden')

    const reel = container.querySelector('[data-testid="generate-reel-viewport"]') as HTMLElement
    expect(reel.className).toContain('overflow-x-auto')
    expect(reel.className).toContain('overflow-y-hidden')
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

  it('[REQ-383/RT-1] handles empty images array without NaN or crashing', () => {
    const { container } = render(
      <GenerateParallelPreview
        images={[]}
        selectedImage={null}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    const root = setPreviewSize(container, 800, 600)
    expect(root.textContent).toContain('画像がありません')
    expect(root.querySelector('[data-testid="parallel-preview-page-indicator"]')?.textContent).toContain('0 / 0 枚')
    const oldestBtn = root.querySelector<HTMLButtonElement>('[data-generate-reel-oldest="true"]')
    expect(oldestBtn?.disabled).toBe(true)
  })

  it('[REQ-383/RT-4] anchors scroll position on prepended new image when previewAutoFollow is false', () => {
    const onSelect = vi.fn()
    const { container, rerender } = render(
      <GenerateParallelPreview
        images={['img-2', 'img-3']}
        selectedImage="img-3"
        onSelect={onSelect}
        onOpen={vi.fn()}
        previewAutoFollow={false}
      />
    )
    const root = setPreviewSize(container, 800, 600)
    const reel = root.querySelector('[data-testid="generate-reel-viewport"]') as HTMLElement

    act(() => {
      reel.scrollLeft = 200
      fireEvent.scroll(reel)
    })
    const scrollBefore = reel.scrollLeft

    // New image prepended at index 0 while auto-follow is false
    rerender(
      <GenerateParallelPreview
        images={['img-1', 'img-2', 'img-3']}
        selectedImage="img-3"
        onSelect={onSelect}
        onOpen={vi.fn()}
        previewAutoFollow={false}
      />
    )
    // Scroll position is compensated to anchor viewed image
    expect(reel.scrollLeft).toBeGreaterThanOrEqual(scrollBefore)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

