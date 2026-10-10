import { fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useGenerateKeyboardShortcuts, useImageNavigation } from '../useImageNavigation'
import { useGenerationStore } from '../../../../store/useGenerationStore'

vi.mock('../../../../store/useGenerationStore', () => ({ useGenerationStore: vi.fn() }))
const store = vi.mocked(useGenerationStore)

describe('Generate keyboard shortcuts', () => {
  it('generates once on Ctrl+Enter even from an input and uses the latest callback', () => {
    const firstGenerate = vi.fn()
    const latestGenerate = vi.fn()
    const { rerender } = renderHook(
      (props: Parameters<typeof useGenerateKeyboardShortcuts>[0]) => useGenerateKeyboardShortcuts(props),
      { initialProps: { onGenerate: firstGenerate, onSave: vi.fn(), onOpenPreview: vi.fn(), hasSelectedImage: false, modalOpen: false } },
    )
    rerender({ onGenerate: latestGenerate, onSave: vi.fn(), onOpenPreview: vi.fn(), hasSelectedImage: false, modalOpen: false })
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    expect(firstGenerate).not.toHaveBeenCalled()
    expect(latestGenerate).toHaveBeenCalledTimes(1)
  })

  it('ignores repeat, IME, prevented keys, modifier variants, and open modal state', () => {
    const onGenerate = vi.fn()
    const props = { onGenerate, onSave: vi.fn(), onOpenPreview: vi.fn(), hasSelectedImage: true, modalOpen: false }
    renderHook(() => useGenerateKeyboardShortcuts(props))
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true, repeat: true })
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true, isComposing: true })
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true, shiftKey: true })
    const prevented = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })
    prevented.preventDefault()
    window.dispatchEvent(prevented)
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('blocks Ctrl+Enter when a modal prop or mounted dialog/backdrop is present', () => {
    const onGenerate = vi.fn()
    const { rerender } = renderHook(
      (modalOpen: boolean) => useGenerateKeyboardShortcuts({ onGenerate, onSave: vi.fn(), onOpenPreview: vi.fn(), hasSelectedImage: false, modalOpen }),
      { initialProps: false },
    )
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    rerender(true)
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    expect(onGenerate).toHaveBeenCalledTimes(1)
    rerender(false)
    const modal = document.createElement('div')
    modal.className = 'modal-backdrop'
    document.body.append(modal)
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    expect(onGenerate).toHaveBeenCalledTimes(1)
    modal.remove()
  })

  it('saves on S and opens preview on Space only while a selected preview has focus', () => {
    const onSave = vi.fn()
    const onOpenPreview = vi.fn()
    renderHook(() => useGenerateKeyboardShortcuts({ onGenerate: vi.fn(), onSave, onOpenPreview, hasSelectedImage: true, modalOpen: false }))
    const preview = document.createElement('div')
    preview.dataset.testid = 'generate-parallel-preview'
    preview.tabIndex = 0
    document.body.append(preview)
    preview.focus()

    const saveEvent = new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true })
    preview.dispatchEvent(saveEvent)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(saveEvent.defaultPrevented).toBe(true)
    const openEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    preview.dispatchEvent(openEvent)
    expect(onOpenPreview).toHaveBeenCalledTimes(1)
    expect(openEvent.defaultPrevented).toBe(true)
    preview.remove()
  })

  it('leaves editable keys alone and arrow navigation respects prevented keys and modal DOM', () => {
    const setSelectedImg = vi.fn()
    store.mockReturnValue({ selectedImg: 'one', setSelectedImg } as ReturnType<typeof useGenerationStore>)
    const { unmount } = renderHook(() => {
      useImageNavigation(['one', 'two'])
      useGenerateKeyboardShortcuts({ onGenerate: vi.fn(), onSave: vi.fn(), onOpenPreview: vi.fn(), hasSelectedImage: true, modalOpen: false })
    })
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    for (const key of ['s', ' ', 'ArrowRight']) fireEvent.keyDown(input, { key })
    expect(setSelectedImg).not.toHaveBeenCalled()
    input.remove()

    const preview = document.createElement('div')
    preview.dataset.testid = 'generate-parallel-preview'
    preview.tabIndex = 0
    document.body.append(preview)
    preview.focus()
    const preventedArrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    preventedArrow.preventDefault()
    window.dispatchEvent(preventedArrow)
    expect(setSelectedImg).not.toHaveBeenCalled()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    fireEvent.keyDown(preview, { key: 'ArrowRight' })
    expect(setSelectedImg).not.toHaveBeenCalled()
    dialog.remove()
    preview.remove()
    unmount()
    store.mockReset()
  })

  it('removes its window listener on unmount', () => {
    const onGenerate = vi.fn()
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useGenerateKeyboardShortcuts({ onGenerate, onSave: vi.fn(), onOpenPreview: vi.fn(), hasSelectedImage: false, modalOpen: false }))
    unmount()
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    expect(onGenerate).not.toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })
})
