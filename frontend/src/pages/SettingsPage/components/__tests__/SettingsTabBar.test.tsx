import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsTabBar } from '../SettingsTabBar'

const labels = [
  ['workflows', '① ワークフロー・モデル', '① モデル'],
  ['prompt', '② プロンプト支援', '② 呪文'],
  ['dialogue', '③ セリフ支援', '③ セリフ'],
  ['translation', '④ 翻訳', '④ 翻訳'],
  ['system', '⑤ システム・一般', '⑤ システム'],
] as const

describe('SettingsTabBar', () => {
  it('renders the five tabs with associated panels and a single roving tab stop', () => {
    render(<SettingsTabBar activeTab="workflows" onSelect={vi.fn()} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(5)
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual(labels.map(([, long]) => long))
    expect(tabs.map((tab) => tab.getAttribute('aria-controls'))).toEqual(labels.map(([id]) => `settings-panel-${id}`))
    expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1)
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1, -1])
    labels.forEach(([, long, short]) => {
      const tab = screen.getByRole('tab', { name: long })
      expect(tab).toHaveTextContent(short)
      expect(tab).toHaveTextContent(long)
    })
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
    const tab = screen.getByRole('tab', { name: '④ 翻訳' })
    fireEvent.keyDown(tab, { key: 'Tab' })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(tab)
    expect(onSelect).toHaveBeenCalledWith('translation')
    expect(tab).toHaveFocus()
  })
})
