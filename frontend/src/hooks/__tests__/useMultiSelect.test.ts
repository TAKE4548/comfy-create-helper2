import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMultiSelect } from '../useMultiSelect';
import { LS_KEYS } from '../../utils/localStorageKeys';

describe('useMultiSelect', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));
    expect(result.current.isMultiSelectMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('should enter multi-select mode and optionally add a first item', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));

    act(() => {
      result.current.enterMultiSelectMode(2);
    });

    expect(result.current.isMultiSelectMode).toBe(true);
    expect(result.current.selectedIds.has(2)).toBe(true);
    expect(result.current.selectedIds.size).toBe(1);
  });

  it('should exit multi-select mode and clear selections', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));

    act(() => {
      result.current.enterMultiSelectMode(2);
    });
    expect(result.current.isMultiSelectMode).toBe(true);

    act(() => {
      result.current.exitMultiSelectMode();
    });

    expect(result.current.isMultiSelectMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('should handle item click in normal mode with Ctrl/Meta key', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));

    // Normal click without Ctrl/Meta should not enter multi-select mode
    act(() => {
      const e = { ctrlKey: false, metaKey: false } as unknown as React.MouseEvent;
      result.current.handleItemClick(2, e);
    });
    expect(result.current.isMultiSelectMode).toBe(false);

    // Click with Ctrl enters mode and selects the item
    act(() => {
      const e = { ctrlKey: true, metaKey: false } as unknown as React.MouseEvent;
      result.current.handleItemClick(2, e);
    });
    expect(result.current.isMultiSelectMode).toBe(true);
    expect(result.current.isSelected(2)).toBe(true);
  });

  it('should toggle item in multi-select mode', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));

    act(() => {
      result.current.enterMultiSelectMode(2);
    });

    // Toggle same item should unselect it
    act(() => {
      const e = { ctrlKey: false, metaKey: false, shiftKey: false } as unknown as React.MouseEvent;
      result.current.handleItemClick(2, e);
    });
    expect(result.current.isSelected(2)).toBe(false);

    // Toggle another item should select it
    act(() => {
      const e = { ctrlKey: false, metaKey: false, shiftKey: false } as unknown as React.MouseEvent;
      result.current.handleItemClick(3, e);
    });
    expect(result.current.isSelected(3)).toBe(true);
  });

  it('should range select items with Shift key in multi-select mode', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));

    act(() => {
      result.current.enterMultiSelectMode(2); // lastSelectedId becomes 2
    });

    act(() => {
      const e = { ctrlKey: false, metaKey: false, shiftKey: true } as unknown as React.MouseEvent;
      result.current.handleItemClick(4, e); // range from 2 to 4 (indexes 1 to 3, items: 2, 3, 4)
    });

    expect(result.current.isSelected(2)).toBe(true);
    expect(result.current.isSelected(3)).toBe(true);
    expect(result.current.isSelected(4)).toBe(true);
    expect(result.current.isSelected(1)).toBe(false);
  });

  it('should support selectAll and clearSelection', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));

    act(() => {
      result.current.selectAll();
    });
    expect(result.current.selectedIds.size).toBe(5);

    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('should enter multi-select mode on 800ms long press (default)', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));
    const handlers = result.current.getLongPressHandlers(3);

    act(() => {
      handlers.onMouseDown({ button: 0 } as unknown as React.MouseEvent);
    });

    // Advance time by 799ms — should NOT trigger
    act(() => {
      vi.advanceTimersByTime(799);
    });
    expect(result.current.isMultiSelectMode).toBe(false);

    // Advance time to 800ms — should trigger
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isMultiSelectMode).toBe(true);
    expect(result.current.isSelected(3)).toBe(true);
  });

  it('should cancel long press if mouse leaves or is released early', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));
    const handlers = result.current.getLongPressHandlers(3);

    act(() => {
      handlers.onMouseDown({ button: 0 } as unknown as React.MouseEvent);
    });

    act(() => {
      vi.advanceTimersByTime(250);
      handlers.onMouseLeave();
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.isMultiSelectMode).toBe(false);
  });

  it('should use custom long press delay from localStorage', () => {
    // Set 0.3 seconds (300ms) in localStorage
    localStorage.setItem(LS_KEYS.LONG_PRESS_DELAY_MULTI_SELECT, '0.3');

    const { result } = renderHook(() => useMultiSelect({ items }));
    const handlers = result.current.getLongPressHandlers(3);

    act(() => {
      handlers.onMouseDown({ button: 0 } as unknown as React.MouseEvent);
    });

    // Advance time by 299ms — should NOT trigger
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current.isMultiSelectMode).toBe(false);

    // Advance time to 300ms — should trigger
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isMultiSelectMode).toBe(true);
    expect(result.current.isSelected(3)).toBe(true);
  });

  it('should fall back to 800ms default when localStorage value is invalid', () => {
    localStorage.setItem(LS_KEYS.LONG_PRESS_DELAY_MULTI_SELECT, 'abc');

    const { result } = renderHook(() => useMultiSelect({ items }));
    const handlers = result.current.getLongPressHandlers(3);

    act(() => {
      handlers.onMouseDown({ button: 0 } as unknown as React.MouseEvent);
    });

    // Should not trigger before 800ms
    act(() => {
      vi.advanceTimersByTime(799);
    });
    expect(result.current.isMultiSelectMode).toBe(false);

    // Should trigger at 800ms
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isMultiSelectMode).toBe(true);
  });

  it('should cancel long press on mouse move over threshold (5px)', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));
    const handlers = result.current.getLongPressHandlers(3);

    act(() => {
      handlers.onMouseDown({ button: 0, clientX: 100, clientY: 100 } as unknown as React.MouseEvent);
    });

    // Move mouse less than threshold (e.g. 3px right = 3px distance) -> should NOT cancel
    act(() => {
      const e = new MouseEvent('mousemove', { clientX: 103, clientY: 100 } as any);
      Object.defineProperties(e, {
        clientX: { value: 103 },
        clientY: { value: 100 }
      });
      document.dispatchEvent(e);
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.isMultiSelectMode).toBe(false);

    // Move mouse over threshold (e.g. 6px right = 6px distance) -> should cancel
    act(() => {
      const e = new MouseEvent('mousemove', { clientX: 106, clientY: 100 } as any);
      Object.defineProperties(e, {
        clientX: { value: 106 },
        clientY: { value: 100 }
      });
      document.dispatchEvent(e);
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.isMultiSelectMode).toBe(false);
  });

  it('should cancel long press on touch move over threshold (5px)', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));
    const handlers = result.current.getLongPressHandlers(3);

    act(() => {
      handlers.onTouchStart({
        touches: [{ clientX: 100, clientY: 100 }]
      } as unknown as React.TouchEvent);
    });

    // Touch move over threshold (e.g. 6px right = 6px distance) -> should cancel
    act(() => {
      const e = new TouchEvent('touchmove', {
        touches: [{ clientX: 106, clientY: 100 } as any]
      } as any);
      document.dispatchEvent(e);
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current.isMultiSelectMode).toBe(false);
  });

  it('should block subsequent long press starts if already dragging (isDraggingRef is true)', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));
    const handlers3 = result.current.getLongPressHandlers(3);
    const handlers4 = result.current.getLongPressHandlers(4);

    // 1. Start press on item 3
    act(() => {
      handlers3.onMouseDown({ button: 0, clientX: 100, clientY: 100 } as unknown as React.MouseEvent);
    });

    // 2. Drag item 3 (move over 5px threshold) -> cancels item 3 timer & enters drag state
    act(() => {
      const e = new MouseEvent('mousemove', { clientX: 106, clientY: 100 } as any);
      Object.defineProperties(e, {
        clientX: { value: 106 },
        clientY: { value: 100 }
      });
      document.dispatchEvent(e);
    });

    // 3. Simulate another mouse down on item 4 while dragging item 3 (due to DOM updates or hover)
    act(() => {
      handlers4.onMouseDown({ button: 0, clientX: 106, clientY: 100 } as unknown as React.MouseEvent);
    });

    // 4. Advance time by 800ms -> both should NOT trigger multi-select mode
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current.isMultiSelectMode).toBe(false);

    // 5. Complete dragging by releasing mouse
    act(() => {
      const e = new MouseEvent('mouseup');
      document.dispatchEvent(e);
    });

    // 6. After releasing mouse, subsequent long press should work normally again
    act(() => {
      handlers4.onMouseDown({ button: 0, clientX: 100, clientY: 100 } as unknown as React.MouseEvent);
    });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current.isMultiSelectMode).toBe(true);
  });

  it('should enter multi-select mode with Ctrl click', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));

    act(() => {
      const e = { ctrlKey: true, metaKey: false, shiftKey: false } as unknown as React.MouseEvent;
      result.current.handleItemClick(2, e);
    });

    expect(result.current.isMultiSelectMode).toBe(true);
    expect(result.current.isSelected(2)).toBe(true);
  });

  it('should enter multi-select mode with Shift click and select range if lastSelectedId is set', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));

    // 1. Regular click on item 2 to set lastSelectedId
    act(() => {
      const e = { ctrlKey: false, metaKey: false, shiftKey: false } as unknown as React.MouseEvent;
      result.current.handleItemClick(2, e);
    });
    expect(result.current.isMultiSelectMode).toBe(false);

    // 2. Shift click on item 4 to enter multi-select mode and select range [2, 3, 4]
    act(() => {
      const e = { ctrlKey: false, metaKey: false, shiftKey: true } as unknown as React.MouseEvent;
      result.current.handleItemClick(4, e);
    });

    expect(result.current.isMultiSelectMode).toBe(true);
    expect(result.current.isSelected(2)).toBe(true);
    expect(result.current.isSelected(3)).toBe(true);
    expect(result.current.isSelected(4)).toBe(true);
    expect(result.current.isSelected(1)).toBe(false);
  });

  it('should update lastSelectedId on normal click and not enter multi-select mode', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));

    act(() => {
      const e = { ctrlKey: false, metaKey: false, shiftKey: false } as unknown as React.MouseEvent;
      result.current.handleItemClick(3, e);
    });

    expect(result.current.isMultiSelectMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);

    // Click with Shift now should trigger range select from 3
    act(() => {
      const e = { ctrlKey: false, metaKey: false, shiftKey: true } as unknown as React.MouseEvent;
      result.current.handleItemClick(5, e);
    });

    expect(result.current.isMultiSelectMode).toBe(true);
    expect(result.current.isSelected(3)).toBe(true);
    expect(result.current.isSelected(4)).toBe(true);
    expect(result.current.isSelected(5)).toBe(true);
  });
});
