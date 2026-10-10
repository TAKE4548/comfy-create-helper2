import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResizableSplitLayout } from '../ResizableSplitLayout'

function renderSplit(props: Partial<React.ComponentProps<typeof ResizableSplitLayout>> = {}) {
  return render(
    <ResizableSplitLayout
      direction="horizontal"
      first={<span>first</span>}
      second={<span>second</span>}
      initialSize={300}
      minSize={100}
      storageKey="split-test"
      {...props}
    />
  )
}

function setContainerWidth(width: number) {
  const container = screen.getByText('first').parentElement?.parentElement as HTMLElement
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: width, bottom: 600,
    width, height: 600, toJSON: () => ({})
  } as DOMRect)
  return container
}

describe('ResizableSplitLayout REQ-334', () => {
  beforeEach(() => localStorage.clear())

  it('keeps legacy pixel persistence as the default', () => {
    localStorage.setItem('split-test', '350')
    const { container } = renderSplit()
    expect(container.querySelector('.flex-shrink-0')?.getAttribute('style')).toContain('350px')
  })

  it('persists ratio data, reapplies it after reload, and preserves the ratio on resize', () => {
    localStorage.setItem('split-ratio', JSON.stringify({ version: 1, ratio: 0.4 }))
    const { container, rerender } = renderSplit({ storageKey: 'split-ratio', persistenceMode: 'ratio', initialSize: 0.3 })
    const pane = container.querySelector('.flex-shrink-0') as HTMLElement
    const root = setContainerWidth(1000)
    act(() => window.dispatchEvent(new Event('resize')))
    expect(pane.style.width).toBe('400px')
    act(() => window.dispatchEvent(new Event('resize')))
    expect(localStorage.getItem('split-ratio')).toBe(JSON.stringify({ version: 1, ratio: 0.4 }))
    const separator = screen.getByRole('separator')
    fireEvent.pointerDown(separator)
    const pointerMove = new Event('pointermove') as PointerEvent
    Object.defineProperty(pointerMove, 'clientX', { value: 600 })
    act(() => window.dispatchEvent(pointerMove))
    expect(pane.style.width).toBe('600px')
    expect(localStorage.getItem('split-ratio')).toBe(JSON.stringify({ version: 1, ratio: 0.6 }))
    fireEvent.pointerUp(window)
    root.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({})
    }) as DOMRect
    act(() => window.dispatchEvent(new Event('resize')))
    expect(pane.style.width).toBe('480px')
    rerender(<ResizableSplitLayout direction="horizontal" first={<span>first</span>} second={<span>second</span>} initialSize={0.3} minSize={100} storageKey="split-ratio" persistenceMode="ratio" />)
    expect((container.querySelector('.flex-shrink-0') as HTMLElement).style.width).toBe('480px')
  })

  it('falls back for malformed ratio storage and supports accessible keyboard sizing', () => {
    localStorage.setItem('bad-ratio', '{broken')
    const { container } = renderSplit({ storageKey: 'bad-ratio', persistenceMode: 'ratio', initialSize: 0.5 })
    const separator = screen.getByRole('separator')
    setContainerWidth(800)
    act(() => window.dispatchEvent(new Event('resize')))
    expect((container.querySelector('.flex-shrink-0') as HTMLElement).style.width).toBe('400px')
    expect(separator).toHaveAttribute('aria-orientation', 'vertical')
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect((container.querySelector('.flex-shrink-0') as HTMLElement).style.width).toBe('416px')
    fireEvent.keyDown(separator, { key: 'Home' })
    expect((container.querySelector('.flex-shrink-0') as HTMLElement).style.width).toBe('100px')
    fireEvent.keyDown(separator, { key: 'End' })
    expect((container.querySelector('.flex-shrink-0') as HTMLElement).style.width).toBe('700px')
  })

  it('falls back to the initial size when localStorage read or write is refused', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage blocked') })
    const firstRender = renderSplit({ persistenceMode: 'ratio', initialSize: 0.5 })
    expect((firstRender.container.querySelector('.flex-shrink-0') as HTMLElement).style.width).toBe('0.5px')
    firstRender.unmount()
    getItem.mockRestore()

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked') })
    expect(() => renderSplit({ storageKey: 'blocked-write', persistenceMode: 'ratio', initialSize: 0.45 })).not.toThrow()
    expect((screen.getByText('first').parentElement?.parentElement?.querySelector('.flex-shrink-0') as HTMLElement).style.width).toBe('0.45px')
    setItem.mockRestore()
  })

  it('cycles maximize states back to the custom size and cleans up pointercancel styles', () => {
    const { container, unmount } = renderSplit({ resetCycle: true })
    const separator = screen.getByRole('separator')
    const pane = container.querySelector('.flex-shrink-0') as HTMLElement
    setContainerWidth(800)
    act(() => window.dispatchEvent(new Event('resize')))
    fireEvent.doubleClick(separator)
    expect(pane.style.width).toBe('700px')
    fireEvent.doubleClick(separator)
    expect(pane.style.width).toBe('100px')
    fireEvent.doubleClick(separator)
    expect(pane.style.width).toBe('300px')
    fireEvent.pointerDown(separator)
    expect(document.body.style.userSelect).toBe('none')
    fireEvent.pointerCancel(window)
    expect(document.body.style.userSelect).toBe('')
    fireEvent.pointerDown(separator)
    unmount()
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })
})
