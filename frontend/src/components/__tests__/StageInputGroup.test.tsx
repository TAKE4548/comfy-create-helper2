import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import StageInputGroup from '../StageInputGroup'

function setRect(element: Element, rect: Partial<DOMRect>) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, width: 100, height: 30, top: 0, right: 100, bottom: 30, left: 0, toJSON: () => ({}), ...rect } as DOMRect)
}

function TestRoot({ children, id }: React.PropsWithChildren<{ id: string }>) { return <div id={id} data-stage-scroll-root="" className="stage-input-scroll-root">{children}</div> }

describe('StageInputGroup', () => {
  it('shows only the configured name while exposing key and group identity accessibly', () => {
    render(
      <TestRoot id="root">
        <StageInputGroup groupKey="prompt" stageName="Positive prompt" stageKey="stage-1"><input aria-label="first" /></StageInputGroup>
        <StageInputGroup groupKey="negative" stageName="Negative prompt" stageKey="stage-1"><input aria-label="second" /></StageInputGroup>
      </TestRoot>,
    )

    const first = screen.getByRole('region', { name: 'Positive prompt (stage-1)' })
    const second = screen.getByRole('region', { name: 'Negative prompt (stage-1)' })
    expect(first).toHaveAttribute('data-group-key', 'prompt')
    expect(first).toHaveAttribute('data-stage-key', 'stage-1')
    const firstHeading = screen.getByRole('heading', { name: 'Positive prompt (stage-1)' })
    const secondHeading = screen.getByRole('heading', { name: 'Negative prompt (stage-1)' })
    expect(firstHeading).toHaveTextContent('Positive prompt')
    expect(firstHeading.textContent).toBe('Positive prompt')
    expect(secondHeading.textContent).toBe('Negative prompt')
    expect(firstHeading).toHaveAttribute('title', 'Positive prompt')
    expect(firstHeading.id).not.toBe(secondHeading.id)
  })
  it('preserves configured names and falls back for blank names', () => {
    const { rerender } = render(<StageInputGroup groupKey="g" stageName="Rough Prompt" stageKey="rough"><input /></StageInputGroup>)
    let heading = screen.getByRole('heading', { name: 'Rough Prompt (rough)' })
    expect(heading).toHaveTextContent('Rough Prompt')
    expect(heading).toHaveAttribute('title', 'Rough Prompt')
    rerender(<StageInputGroup groupKey="g" stageName="   " stageKey="rough"><input /></StageInputGroup>)
    heading = screen.getByRole('heading', { name: 'rough (rough)' })
    expect(heading).toHaveTextContent('rough')
    rerender(<StageInputGroup groupKey="fallback-group" stageName="" stageKey=""><input /></StageInputGroup>)
    heading = screen.getByRole('heading', { name: 'ステージ不明 (fallback-group)' })
    expect(heading).toHaveAttribute('title', 'ステージ不明')
    expect(heading.textContent).toBe('ステージ不明')
  })
  it('scrolls only the nearest root enough to expose an overlapped focused control', () => {
    const outerScroll = vi.fn()
    const innerScroll = vi.fn()
    render(
      <TestRoot id="outer">
        <TestRoot id="inner">
          <StageInputGroup groupKey="g" stageName="Stage" stageKey="k"><input aria-label="control" /></StageInputGroup>
        </TestRoot>
      </TestRoot>,
    )
    const outer = document.getElementById('outer')!
    const inner = document.getElementById('inner')!
    const heading = screen.getByRole('heading', { name: 'Stage (k)' })
    const control = screen.getByRole('textbox', { name: 'control' })
    Object.defineProperty(inner, 'clientTop', { configurable: true, value: 0 })
    Object.defineProperty(inner, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(outer, 'clientTop', { configurable: true, value: 0 })
    Object.defineProperty(outer, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(inner, 'scrollBy', { configurable: true, value: innerScroll })
    Object.defineProperty(outer, 'scrollBy', { configurable: true, value: outerScroll })
    setRect(inner, { top: 100, bottom: 300, height: 200 })
    setRect(outer, { top: 90, bottom: 290, height: 200 })
    setRect(heading, { top: 100, bottom: 136, height: 36 })
    setRect(control, { top: 120, bottom: 150, height: 30 })

    fireEvent.focus(control)

    expect(innerScroll).toHaveBeenCalledTimes(1)
    expect(innerScroll).toHaveBeenCalledWith({ top: -24, behavior: 'auto' })
    expect(outerScroll).not.toHaveBeenCalled()
  })
  it('does not scroll an already exposed control or when the root is missing', () => {
    const scroll = vi.fn()
    const { rerender } = render(
      <TestRoot id="root">
        <StageInputGroup groupKey="g" stageName="Stage" stageKey="k"><input aria-label="control" /></StageInputGroup>
      </TestRoot>,
    )
    const root = document.getElementById('root')!
    const heading = screen.getByRole('heading', { name: 'Stage (k)' })
    const control = screen.getByRole('textbox', { name: 'control' })
    Object.defineProperty(root, 'clientTop', { configurable: true, value: 0 })
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(root, 'scrollBy', { configurable: true, value: scroll })
    setRect(root, { top: 100, bottom: 300, height: 200 })
    setRect(heading, { top: 100, bottom: 136, height: 36 })
    setRect(control, { top: 144, bottom: 174, height: 30 })
    fireEvent.focus(control)
    expect(scroll).not.toHaveBeenCalled()

    rerender(<StageInputGroup groupKey="g" stageName="Stage" stageKey="k"><input aria-label="outside" /></StageInputGroup>)
    fireEvent.focus(screen.getByRole('textbox', { name: 'outside' }))
    expect(scroll).not.toHaveBeenCalled()
  })
  it('does not scroll when the nearest root does not contain its section or the header is not visible', () => {
    const scroll = vi.fn()
    const { rerender } = render(
      <StageInputGroup groupKey="g" stageName="Stage" stageKey="k">
        <div data-stage-scroll-root="" className="stage-input-scroll-root"><input aria-label="nested" /></div>
      </StageInputGroup>,
    )
    const root = document.querySelector('[data-stage-scroll-root]')!
    const heading = screen.getByRole('heading', { name: 'Stage (k)' })
    const nested = screen.getByRole('textbox', { name: 'nested' })
    Object.defineProperty(root, 'clientTop', { configurable: true, value: 0 })
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(root, 'scrollBy', { configurable: true, value: scroll })
    setRect(root, { top: 100, bottom: 300, height: 200 })
    setRect(heading, { top: 100, bottom: 136, height: 36 })
    setRect(nested, { top: 120, bottom: 150, height: 30 })
    fireEvent.focus(nested)
    expect(scroll).not.toHaveBeenCalled()

    rerender(
      <TestRoot id="visible-header-root">
        <StageInputGroup groupKey="g" stageName="Stage" stageKey="k"><input aria-label="no-header" /></StageInputGroup>
      </TestRoot>,
    )
    const visibleRoot = document.getElementById('visible-header-root')!
    const noHeader = screen.getByRole('textbox', { name: 'no-header' })
    Object.defineProperty(visibleRoot, 'clientTop', { configurable: true, value: 0 })
    Object.defineProperty(visibleRoot, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(visibleRoot, 'scrollBy', { configurable: true, value: scroll })
    setRect(visibleRoot, { top: 100, bottom: 300, height: 200 })
    setRect(screen.getByRole('heading', { name: 'Stage (k)' }), { top: 310, bottom: 346, height: 36 })
    setRect(noHeader, { top: 120, bottom: 150, height: 30 })
    fireEvent.focus(noHeader)
    expect(scroll).not.toHaveBeenCalled()
  })
  it('removes physical root padding while retaining scroll padding and heading layout', () => {
    const styles = readFileSync(join(process.cwd(), 'src/components/StageInputGroup.css'), 'utf8')
    expect(styles).toContain('.stage-input-scroll-root[data-stage-scroll-root]')
    expect(styles).toMatch(/padding-top:\s*0/)
    expect(styles).toMatch(/padding-bottom:\s*0/)
    expect(styles).toMatch(/scroll-padding-top:\s*44px/)
    expect(styles).toMatch(/height:\s*36px/)
    expect(styles).toMatch(/top:\s*0/)
    expect(styles).toMatch(/background:\s*#18181b/)
    expect(styles).toMatch(/padding:\s*8px 0 12px/)
    expect(styles).not.toContain('stage-input-group__key')
    expect(styles).toMatch(/\.stage-input-group\s+input/)
    expect(styles).toMatch(/scroll-margin-top:\s*44px/)
  })
})
