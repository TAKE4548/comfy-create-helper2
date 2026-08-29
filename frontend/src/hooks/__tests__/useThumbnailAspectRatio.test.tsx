import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useThumbnailAspectRatio } from '../useThumbnailAspectRatio'
import { LS_KEYS } from '../../utils/localStorageKeys'

describe('useThumbnailAspectRatio hook', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initializes with default 3:4 aspect ratio', () => {
    const { result } = renderHook(() => useThumbnailAspectRatio())
    expect(result.current.presetId).toBe('3:4')
    expect(result.current.ratioStr).toBe('3 / 4')
    expect(result.current.numericRatio).toBe(0.75)
    expect(result.current.aspectRatioStyle).toEqual({ aspectRatio: '3 / 4' })
  })

  it('updates preset and synchronizes to localStorage', () => {
    const { result } = renderHook(() => useThumbnailAspectRatio())
    
    act(() => {
      result.current.setPreset('1:1')
    })

    expect(result.current.presetId).toBe('1:1')
    expect(result.current.ratioStr).toBe('1 / 1')
    expect(result.current.numericRatio).toBe(1)
    expect(localStorage.getItem(LS_KEYS.THUMBNAIL_ASPECT_RATIO)).toBe('1:1')
  })

  it('handles custom aspect ratio input', () => {
    const { result } = renderHook(() => useThumbnailAspectRatio())

    act(() => {
      result.current.setPreset('custom')
      result.current.setCustomRatio('16:9')
    })

    expect(result.current.presetId).toBe('custom')
    expect(result.current.ratioStr).toBe('16 / 9')
    expect(result.current.numericRatio).toBeCloseTo(16 / 9)
    expect(localStorage.getItem(LS_KEYS.THUMBNAIL_ASPECT_RATIO_CUSTOM)).toBe('16:9')
  })
})