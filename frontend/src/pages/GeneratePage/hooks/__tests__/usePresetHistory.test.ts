import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePresetHistory } from '../usePresetHistory'
import type { HistoryState } from '../presetStateUtils'

describe('usePresetHistory', () => {
  const dummyState1: HistoryState = {
    sampler: 'euler',
    scheduler: 'normal',
    steps: 20,
    cfg: 7,
    seed: 12345,
    width: 512,
    height: 512,
    clip_skip: 1,
    denoise: 1.0,
    positive_prompt: 'prompt 1',
    negative_prompt: 'negative 1',
  }

  const dummyState2: HistoryState = {
    ...dummyState1,
    steps: 25,
    positive_prompt: 'prompt 2',
  }

  const dummyState3: HistoryState = {
    ...dummyState1,
    steps: 30,
    positive_prompt: 'prompt 3',
  }

  beforeEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('initializes with canUndo = false and canRedo = false when no history exists', () => {
    const onApplyState = vi.fn()
    const { result } = renderHook(() =>
      usePresetHistory({
        activeSetId: 'preset-1',
        currentState: dummyState1,
        onApplyState,
      })
    )

    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('records history and updates canUndo to true', () => {
    const onApplyState = vi.fn()
    const { result } = renderHook(() =>
      usePresetHistory({
        activeSetId: 'preset-1',
        currentState: dummyState2,
        onApplyState,
      })
    )

    act(() => {
      result.current.recordHistory('preset-1', dummyState1)
    })

    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
  })

  it('performs undo and calls onApplyState with prevState while enabling canRedo', () => {
    const onApplyState = vi.fn()
    const { result, rerender } = renderHook(
      ({ current }) =>
        usePresetHistory({
          activeSetId: 'preset-1',
          currentState: current,
          onApplyState,
        }),
      { initialProps: { current: dummyState1 } }
    )

    // Record dummyState1 before moving to dummyState2
    act(() => {
      result.current.recordHistory('preset-1', dummyState1)
    })

    // Update current state to dummyState2
    rerender({ current: dummyState2 })

    // Execute Undo
    act(() => {
      result.current.undo('preset-1')
    })

    expect(onApplyState).toHaveBeenCalledTimes(1)
    expect(onApplyState).toHaveBeenCalledWith(dummyState1)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)
  })

  it('performs redo and calls onApplyState with nextState', () => {
    const onApplyState = vi.fn()
    const { result, rerender } = renderHook(
      ({ current }) =>
        usePresetHistory({
          activeSetId: 'preset-1',
          currentState: current,
          onApplyState,
        }),
      { initialProps: { current: dummyState1 } }
    )

    act(() => {
      result.current.recordHistory('preset-1', dummyState1)
    })
    rerender({ current: dummyState2 })

    act(() => {
      result.current.undo('preset-1')
    })

    expect(result.current.canRedo).toBe(true)

    // Perform Redo
    act(() => {
      result.current.redo('preset-1')
    })

    expect(onApplyState).toHaveBeenCalledWith(dummyState2)
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
  })

  it('handles Ctrl+Z and Ctrl+Y keyboard shortcuts when not focused on input elements', () => {
    const onApplyState = vi.fn()
    const { result, rerender } = renderHook(
      ({ current }) =>
        usePresetHistory({
          activeSetId: 'preset-1',
          currentState: current,
          onApplyState,
        }),
      { initialProps: { current: dummyState1 } }
    )

    act(() => {
      result.current.recordHistory('preset-1', dummyState1)
    })
    rerender({ current: dummyState2 })

    // Trigger Ctrl+Z on window
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
      window.dispatchEvent(event)
    })

    expect(onApplyState).toHaveBeenCalledWith(dummyState1)

    // Trigger Ctrl+Y on window
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'y',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
      window.dispatchEvent(event)
    })

    expect(onApplyState).toHaveBeenCalledWith(dummyState2)
  })

  it('ignores keyboard shortcuts when active element is INPUT, TEXTAREA, or contenteditable', () => {
    const onApplyState = vi.fn()
    const { result, rerender } = renderHook(
      ({ current }) =>
        usePresetHistory({
          activeSetId: 'preset-1',
          currentState: current,
          onApplyState,
        }),
      { initialProps: { current: dummyState1 } }
    )

    act(() => {
      result.current.recordHistory('preset-1', dummyState1)
    })
    rerender({ current: dummyState2 })

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
      window.dispatchEvent(event)
    })

    expect(onApplyState).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })
})
