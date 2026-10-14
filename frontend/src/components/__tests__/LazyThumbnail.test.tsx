import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LazyThumbnail } from '../LazyThumbnail'

describe('LazyThumbnail success notification', () => {
  let intersect: (isIntersecting: boolean) => void

  beforeEach(() => {
    intersect = () => {}
    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersect = (isIntersecting) => callback(
          [{ isIntersecting, target: document.createElement('div') } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver
        )
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] { return [] }
      root = null
      rootMargin = ''
      thresholds: number[] = []
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  })

  it('renders no image before intersection and notifies once when it loads', () => {
    const onLoad = vi.fn()
    render(<LazyThumbnail src="/thumb.png" alt="thumbnail" onLoad={onLoad} />)

    expect(screen.queryByRole('img')).toBeNull()
    expect(onLoad).not.toHaveBeenCalled()

    act(() => intersect(true))
    const image = screen.getByRole('img')
    expect(onLoad).not.toHaveBeenCalled()
    fireEvent.load(image)
    expect(onLoad).toHaveBeenCalledTimes(1)
  })

  it('keeps error notification and supports omitted callbacks', () => {
    const onError = vi.fn()
    const { rerender } = render(<LazyThumbnail src="/thumb.png" alt="thumbnail" onError={onError} />)
    act(() => intersect(true))
    fireEvent.error(screen.getByRole('img'))
    expect(onError).toHaveBeenCalledTimes(1)

    rerender(<LazyThumbnail src="/thumb.png" alt="thumbnail" />)
    expect(() => fireEvent.load(screen.getByRole('img'))).not.toThrow()
  })

  it('loads immediately when IntersectionObserver is unavailable', () => {
    vi.unstubAllGlobals()
    delete (window as Window & { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver
    const onLoad = vi.fn()
    render(<LazyThumbnail src="/thumb.png" alt="thumbnail" onLoad={onLoad} />)
    fireEvent.load(screen.getByRole('img'))
    expect(onLoad).toHaveBeenCalledTimes(1)
  })
})
