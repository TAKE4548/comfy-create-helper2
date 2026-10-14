import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageCarousel } from '../ImageCarousel'

class ResizeObserverHarness {
  static current: ResizeObserverHarness | null = null
  readonly callback: ResizeObserverCallback
  target: Element | null = null
  observe = vi.fn((target: Element) => { this.target = target })
  disconnect = vi.fn()
  unobserve = vi.fn()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ResizeObserverHarness.current = this
  }

  resize(width: number, height: number) {
    const contentRect = { width, height } as DOMRectReadOnly
    const entry = { target: this.target!, contentRect } as ResizeObserverEntry
    this.callback([entry], this as unknown as ResizeObserver)
  }
}

const geometry = (element: HTMLElement) => ({
  width: Number.parseFloat(element.style.width),
  height: Number.parseFloat(element.style.height),
})

function expectedFrame(width: number, height: number, ratio = 2 / 3, area = 0.58) {
  const requestedArea = width * height * area
  let imageWidth = Math.sqrt(requestedArea * ratio)
  let imageHeight = Math.sqrt(requestedArea / ratio)
  const scale = Math.min(1, width / imageWidth, height / imageHeight)
  imageWidth *= scale
  imageHeight *= scale
  return { width: imageWidth, height: imageHeight }
}

beforeEach(() => {
  ResizeObserverHarness.current = null
  vi.stubGlobal('ResizeObserver', ResizeObserverHarness)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ImageCarousel responsive portrait frame', () => {
  it.each([
    [200, 320],
    [220, 320],
  ])('sizes a 2:3 image to 58%% of a %sx%s card and follows resize', async (cardWidth, cardHeight) => {
    render(
      <div data-testid="card">
        <ImageCarousel thumbnailPath="/cover.png" alt="portrait" imageAspectRatio={2 / 3} imageAreaFraction={0.58} />
      </div>,
    )
    await waitFor(() => expect(ResizeObserverHarness.current?.observe).toHaveBeenCalled())
    const observer = ResizeObserverHarness.current!

    act(() => observer.resize(cardWidth, cardHeight))
    const frame = screen.getByTestId('image-carousel-frame')
    const firstFrame = geometry(frame)
    const expected = expectedFrame(cardWidth, cardHeight)
    expect(firstFrame.width).toBeCloseTo(expected.width, 2)
    expect(firstFrame.height).toBeCloseTo(expected.height, 2)
    expect(firstFrame.width / firstFrame.height).toBeCloseTo(2 / 3, 3)
    expect((firstFrame.width * firstFrame.height) / (cardWidth * cardHeight)).toBeCloseTo(0.58, 3)

    const carousel = screen.getByTestId('image-carousel')
    expect(Number.parseFloat(carousel.style.height)).toBeCloseTo(firstFrame.height, 2)
    act(() => observer.resize(cardWidth + 20, cardHeight))
    expect(geometry(frame).width).toBeGreaterThan(firstFrame.width)
    expect(geometry(frame).height).toBeGreaterThan(firstFrame.height)

    const resizedFrame = geometry(frame)
    act(() => observer.resize(0, cardHeight))
    act(() => observer.resize(Number.NaN, cardHeight))
    expect(geometry(frame)).toEqual(resizedFrame)
    expect(frame.style.width).not.toContain('NaN')
  })

  it('keeps the placeholder dark and in the same measured frame when the image is missing', async () => {
    render(
      <div data-testid="card">
        <ImageCarousel alt="missing" imageAspectRatio={2 / 3} imageAreaFraction={0.58} />
      </div>,
    )
    await waitFor(() => expect(ResizeObserverHarness.current?.observe).toHaveBeenCalled())
    act(() => ResizeObserverHarness.current!.resize(220, 320))

    const frame = screen.getByTestId('image-carousel-frame')
    expect(frame).toHaveClass('bg-zinc-950')
    expect(Number.parseFloat(screen.getByTestId('image-carousel').style.height)).toBeCloseTo(expectedFrame(220, 320).height, 2)
    expect(geometry(frame).width).toBeCloseTo(expectedFrame(220, 320).width, 2)
    expect(geometry(frame).height).toBeCloseTo(expectedFrame(220, 320).height, 2)
    expect(screen.getByText('No Preview')).toBeInTheDocument()
  })

  it('updates measured geometry when the configured ratio changes from 2:3 to 1:1', async () => {
    const { rerender } = render(
      <ImageCarousel thumbnailPath="/cover.png" alt="square" imageAspectRatio={2 / 3} imageAreaFraction={0.58} />,
    )
    await waitFor(() => expect(ResizeObserverHarness.current?.observe).toHaveBeenCalled())
    act(() => ResizeObserverHarness.current!.resize(220, 320))

    rerender(
      <ImageCarousel thumbnailPath="/cover.png" alt="square" imageAspectRatio={1} imageAreaFraction={0.58} />,
    )
    const frame = screen.getByTestId('image-carousel-frame')
    const measured = geometry(frame)
    const expected = expectedFrame(220, 320, 1)
    expect(measured.width).toBeCloseTo(expected.width, 2)
    expect(measured.height).toBeCloseTo(expected.height, 2)
    expect(measured.width / measured.height).toBeCloseTo(1, 3)
    expect((measured.width * measured.height) / (220 * 320)).toBeCloseTo(0.58, 3)
  })
})
