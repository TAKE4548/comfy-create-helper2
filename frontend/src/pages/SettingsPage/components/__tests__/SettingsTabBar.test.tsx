import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsTabBar } from '../SettingsTabBar'

const labels = [
  ['workflows', 'ワークフロー・モデル', 'モデル'],
  ['prompt', 'プロンプト支援', '呪文'],
  ['dialogue', 'セリフ支援', 'セリフ'],
  ['translation', '翻訳', '翻訳'],
  ['system', 'システム・一般', 'システム'],
] as const

describe('SettingsTabBar', () => {
  it('[REQ-291/AC-1][REQ-381/AC-9] renders the five tabs with associated panels and a single roving tab stop', () => {
    render(<SettingsTabBar activeTab="workflows" onSelect={vi.fn()} />)
    const tabs = screen.getAllByRole('tab')
    const tablist = screen.getByRole('tablist', { name: '設定カテゴリー' })
    expect(tabs).toHaveLength(5)
    expect(tablist).toHaveAttribute('aria-orientation', 'horizontal')
    expect(tablist).toHaveAttribute('data-settings-swipe-ignore', 'true')
    expect(tablist.className).toContain('overflow-x-auto')
    expect(tablist.className).toContain('md:grid-cols-5')
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual(labels.map(([, long]) => long))
    expect(tabs.map((tab) => tab.getAttribute('aria-controls'))).toEqual(labels.map(([id]) => `settings-panel-${id}`))
    expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1)
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1, -1])
    labels.forEach(([, long, short]) => {
      const tab = screen.getByRole('tab', { name: long })
      expect(tab).toHaveTextContent(short)
      expect(tab).toHaveTextContent(long)
      expect(tab.className).toContain('min-h-11')
      expect(tab.className).toContain('md:min-w-0')
      expect(tab.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(tab.getAttribute('aria-label')).not.toMatch(/[①②③④⑤]/)
    })
  })

  it('[REQ-365/AC-2] shows numbered compact labels below md while keeping unnumbered aria-labels', () => {
    render(<SettingsTabBar activeTab="workflows" onSelect={vi.fn()} />)
    const compact = ['① モデル', '② 呪文', '③ セリフ', '④ 翻訳', '⑤ システム']
    const tablist = screen.getByRole('tablist', { name: '設定カテゴリー' })
    expect(tablist.className).toContain('overflow-x-auto')
    expect(tablist.className).toContain('snap-x')
    expect(tablist.className).toContain('snap-mandatory')
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(5)
    tabs.forEach((tab, index) => {
      expect(tab.querySelector('span.md\\:hidden')?.textContent).toBe(compact[index])
      expect(tab.getAttribute('aria-label')).toBe(labels[index][1])
      expect(tab.getAttribute('aria-label')).not.toMatch(/[①②③④⑤]/)
      expect(tab.className).toContain('min-h-11')
      expect(tab.className).toContain('touch-manipulation')
    })
  })

  it('reflects an externally restored active tab without invoking selection', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<SettingsTabBar activeTab="workflows" onSelect={onSelect} />)

    rerender(<SettingsTabBar activeTab="translation" onSelect={onSelect} />)

    expect(screen.getByRole('tab', { name: '翻訳' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '翻訳' })).toHaveAttribute('tabindex', '0')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('scrolls the active tab into view on initial and external changes without moving focus', () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
    const scrolledElements: HTMLElement[] = []
    const scrollIntoView = vi.fn(function (this: HTMLElement) { scrolledElements.push(this) })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    const focusOwner = document.createElement('button')
    document.body.append(focusOwner)
    focusOwner.focus()

    try {
      const onSelect = vi.fn()
      const { rerender } = render(<SettingsTabBar activeTab="system" onSelect={onSelect} />)
      const systemTab = screen.getByRole('tab', { name: 'システム・一般' })
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrolledElements[0]).toBe(systemTab)
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
      expect(focusOwner).toHaveFocus()
      expect(systemTab).not.toHaveFocus()

      scrollIntoView.mockClear()
      rerender(<SettingsTabBar activeTab="translation" onSelect={onSelect} />)
      const translationTab = screen.getByRole('tab', { name: '翻訳' })
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrolledElements[1]).toBe(translationTab)
      expect(focusOwner).toHaveFocus()
      expect(translationTab).not.toHaveFocus()
      expect(onSelect).not.toHaveBeenCalled()
    } finally {
      focusOwner.remove()
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor)
      else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
    }
  })

  it('corrects fractional overflow at the tablist viewport edge without focusing the tab', () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    const focusOwner = document.createElement('button')
    document.body.append(focusOwner)
    focusOwner.focus()

    try {
      const onSelect = vi.fn()
      const { rerender } = render(<SettingsTabBar activeTab="workflows" onSelect={onSelect} />)
      const tablist = screen.getByRole('tablist', { name: '設定カテゴリー' })
      const systemTab = screen.getByRole('tab', { name: 'システム・一般' })
      let scrollLeft = 0
      Object.defineProperties(tablist, {
        clientLeft: { configurable: true, value: 0 },
        clientWidth: { configurable: true, value: 375 },
        scrollLeft: { configurable: true, get: () => scrollLeft, set: (value: number) => { scrollLeft = value } },
      })
      tablist.getBoundingClientRect = () => ({ left: 0, right: 375, width: 375 } as DOMRect)
      systemTab.getBoundingClientRect = () => ({
        left: 277 - scrollLeft,
        right: 375.15625 - scrollLeft,
        width: 98.15625,
      } as DOMRect)

      rerender(<SettingsTabBar activeTab="system" onSelect={onSelect} />)

      expect(scrollLeft).toBeGreaterThan(0)
      expect(systemTab.getBoundingClientRect().right).toBeLessThanOrEqual(375)
      expect(focusOwner).toHaveFocus()
      expect(systemTab).not.toHaveFocus()
      expect(onSelect).not.toHaveBeenCalled()
    } finally {
      focusOwner.remove()
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor)
      else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
    }
  })

  it.each([
    ['ArrowRight', 'workflows', 'prompt'],
    ['ArrowLeft', 'workflows', 'system'],
    ['Home', 'dialogue', 'workflows'],
    ['End', 'prompt', 'system'],
  ])('handles %s by focusing and selecting the destination tab', (key, from, to) => {
    const onSelect = vi.fn()
    render(<SettingsTabBar activeTab={from as 'workflows'} onSelect={onSelect} />)
    const target = screen.getByRole('tab', { name: labels.find(([id]) => id === to)?.[1] })
    const source = screen.getByRole('tab', { name: labels.find(([id]) => id === from)?.[1] })
    source.focus()
    fireEvent.keyDown(source, { key })
    expect(onSelect).toHaveBeenCalledWith(to)
    expect(target).toHaveFocus()
  })

  it('leaves Tab to native focus navigation and selects a tab on click', () => {
    const onSelect = vi.fn()
    render(<SettingsTabBar activeTab="workflows" onSelect={onSelect} />)
    const tab = screen.getByRole('tab', { name: '翻訳' })
    fireEvent.keyDown(tab, { key: 'Tab' })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(tab)
    expect(onSelect).toHaveBeenCalledWith('translation')
    expect(tab).toHaveFocus()
  })
})
