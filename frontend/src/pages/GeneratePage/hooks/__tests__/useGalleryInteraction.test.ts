import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type React from 'react'
import { useGalleryInteraction } from '../useGalleryInteraction'
import type { UseMultiSelectReturn } from '../../../hooks/useMultiSelect'

describe('useGalleryInteraction', () => {
  const createMockMultiSelect = (overrides?: Partial<UseMultiSelectReturn<string>>): UseMultiSelectReturn<string> => ({
    selectedIds: new Set<string>(),
    isMultiSelectMode: false,
    handleItemClick: vi.fn(),
    toggleItem: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    setMultiSelectMode: vi.fn(),
    exitMultiSelectMode: vi.fn(),
    getLongPressHandlers: vi.fn().mockReturnValue({
      onMouseDown: vi.fn(),
      onMouseUp: vi.fn(),
      onMouseLeave: vi.fn(),
      onTouchStart: vi.fn(),
      onTouchEnd: vi.fn(),
      onContextMenu: vi.fn(),
    }),
    ...overrides,
  })

  it('Desktop mode: click calls multiSelect.handleItemClick and setSelectedImg, but NOT onOpenModalPreview', () => {
    const setSelectedImg = vi.fn()
    const onOpenModalPreview = vi.fn()
    const multiSelect = createMockMultiSelect()

    const { result } = renderHook(() =>
      useGalleryInteraction({
        isMobile: false,
        selectedImg: null,
        setSelectedImg,
        multiSelect,
        onOpenModalPreview,
      })
    )

    const event = {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    } as unknown as React.MouseEvent

    act(() => {
      result.current.handleThumbnailClick('img-1.png', 0, event)
    })

    expect(multiSelect.handleItemClick).toHaveBeenCalledWith('img-1.png', event)
    expect(setSelectedImg).toHaveBeenCalledWith('img-1.png')
    expect(onOpenModalPreview).not.toHaveBeenCalled()
  })

  it('Mobile mode: click calls setSelectedImg AND onOpenModalPreview', () => {
    const setSelectedImg = vi.fn()
    const onOpenModalPreview = vi.fn()
    const multiSelect = createMockMultiSelect()

    const { result } = renderHook(() =>
      useGalleryInteraction({
        isMobile: true,
        selectedImg: null,
        setSelectedImg,
        multiSelect,
        onOpenModalPreview,
      })
    )

    const event = {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    } as unknown as React.MouseEvent

    act(() => {
      result.current.handleThumbnailClick('img-2.png', 3, event)
    })

    expect(multiSelect.handleItemClick).toHaveBeenCalledWith('img-2.png', event)
    expect(setSelectedImg).toHaveBeenCalledWith('img-2.png')
    expect(onOpenModalPreview).toHaveBeenCalledWith(3)
  })

  it('does NOT call setSelectedImg or onOpenModalPreview when isMultiSelectMode is true or modifier key is pressed', () => {
    const setSelectedImg = vi.fn()
    const onOpenModalPreview = vi.fn()
    const multiSelectActive = createMockMultiSelect({ isMultiSelectMode: true })

    const { result: r1 } = renderHook(() =>
      useGalleryInteraction({
        isMobile: true,
        selectedImg: null,
        setSelectedImg,
        multiSelect: multiSelectActive,
        onOpenModalPreview,
      })
    )

    const normalEvent = {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    } as unknown as React.MouseEvent

    act(() => {
      r1.current.handleThumbnailClick('img-1.png', 0, normalEvent)
    })

    expect(setSelectedImg).not.toHaveBeenCalled()
    expect(onOpenModalPreview).not.toHaveBeenCalled()

    const multiSelectInactive = createMockMultiSelect({ isMultiSelectMode: false })
    const { result: r2 } = renderHook(() =>
      useGalleryInteraction({
        isMobile: true,
        selectedImg: null,
        setSelectedImg,
        multiSelect: multiSelectInactive,
        onOpenModalPreview,
      })
    )

    // Ctrl key pressed
    act(() => {
      r2.current.handleThumbnailClick('img-1.png', 0, {
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
      } as unknown as React.MouseEvent)
    })
    expect(setSelectedImg).not.toHaveBeenCalled()

    // Meta key pressed
    act(() => {
      r2.current.handleThumbnailClick('img-1.png', 0, {
        ctrlKey: false,
        metaKey: true,
        shiftKey: false,
      } as unknown as React.MouseEvent)
    })
    expect(setSelectedImg).not.toHaveBeenCalled()

    // Shift key pressed
    act(() => {
      r2.current.handleThumbnailClick('img-1.png', 0, {
        ctrlKey: false,
        metaKey: false,
        shiftKey: true,
      } as unknown as React.MouseEvent)
    })
    expect(setSelectedImg).not.toHaveBeenCalled()
  })

  it('getThumbnailItemProps returns mapped event handlers from longPressHandlers and onClick', () => {
    const mockLongPress = {
      onMouseDown: vi.fn(),
      onMouseUp: vi.fn(),
      onMouseLeave: vi.fn(),
      onTouchStart: vi.fn(),
      onTouchEnd: vi.fn(),
      onContextMenu: vi.fn(),
    }
    const multiSelect = createMockMultiSelect({
      getLongPressHandlers: vi.fn().mockReturnValue(mockLongPress),
    })
    const setSelectedImg = vi.fn()

    const { result } = renderHook(() =>
      useGalleryInteraction({
        isMobile: false,
        selectedImg: null,
        setSelectedImg,
        multiSelect,
      })
    )

    const props = result.current.getThumbnailItemProps('test-img.png', 1)

    const mouseEvent = { preventDefault: vi.fn() } as unknown as React.MouseEvent
    const touchEvent = {} as unknown as React.TouchEvent

    props.onMouseDown(mouseEvent)
    expect(mockLongPress.onMouseDown).toHaveBeenCalledWith(mouseEvent)

    props.onMouseUp()
    expect(mockLongPress.onMouseUp).toHaveBeenCalled()

    props.onMouseLeave()
    expect(mockLongPress.onMouseLeave).toHaveBeenCalled()

    props.onTouchStart(touchEvent)
    expect(mockLongPress.onTouchStart).toHaveBeenCalledWith(touchEvent)

    props.onTouchEnd()
    expect(mockLongPress.onTouchEnd).toHaveBeenCalled()

    props.onContextMenu(mouseEvent)
    expect(mouseEvent.preventDefault).toHaveBeenCalled()
    expect(mockLongPress.onContextMenu).toHaveBeenCalledWith(mouseEvent)

    // Click handler test
    props.onClick({ ctrlKey: false, metaKey: false, shiftKey: false } as unknown as React.MouseEvent)
    expect(setSelectedImg).toHaveBeenCalledWith('test-img.png')
  })

  it('handleSnapshotClick safely calls onLoadSnapshot if provided and does not throw if undefined', () => {
    const onLoadSnapshot = vi.fn()
    const multiSelect = createMockMultiSelect()

    const { result: withCallback } = renderHook(() =>
      useGalleryInteraction({
        selectedImg: null,
        setSelectedImg: vi.fn(),
        multiSelect,
        onLoadSnapshot,
      })
    )

    act(() => {
      withCallback.current.handleSnapshotClick(42)
    })
    expect(onLoadSnapshot).toHaveBeenCalledWith(42)

    const { result: withoutCallback } = renderHook(() =>
      useGalleryInteraction({
        selectedImg: null,
        setSelectedImg: vi.fn(),
        multiSelect,
      })
    )

    expect(() => {
      act(() => {
        withoutCallback.current.handleSnapshotClick(99)
      })
    }).not.toThrow()
  })

  it('hover preview image state can be updated', () => {
    const multiSelect = createMockMultiSelect()
    const { result } = renderHook(() =>
      useGalleryInteraction({
        selectedImg: null,
        setSelectedImg: vi.fn(),
        multiSelect,
      })
    )

    expect(result.current.hoverPreviewImg).toBeNull()

    act(() => {
      result.current.setHoverPreviewImg('preview.png')
    })
    expect(result.current.hoverPreviewImg).toBe('preview.png')
  })

  it('handleWheelScroll adjusts scrollLeft of scrollContainerRef', () => {
    const multiSelect = createMockMultiSelect()
    const { result } = renderHook(() =>
      useGalleryInteraction({
        selectedImg: null,
        setSelectedImg: vi.fn(),
        multiSelect,
      })
    )

    const mockDiv = { scrollLeft: 10 } as unknown as HTMLDivElement
    // assign ref current
    Object.defineProperty(result.current.scrollContainerRef, 'current', {
      value: mockDiv,
      writable: true,
    })

    act(() => {
      result.current.handleWheelScroll({ deltaY: 50 } as unknown as React.WheelEvent<HTMLDivElement>)
    })

    expect(mockDiv.scrollLeft).toBe(60)
  })
})
