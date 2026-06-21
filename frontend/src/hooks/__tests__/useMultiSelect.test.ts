import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMultiSelect } from '../useMultiSelect';

describe('useMultiSelect', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('should enter multi-select mode on 500ms long press', () => {
    const { result } = renderHook(() => useMultiSelect({ items }));
    const handlers = result.current.getLongPressHandlers(3);

    act(() => {
      handlers.onMouseDown({ button: 0 } as unknown as React.MouseEvent);
    });

    // Advance time by 499ms
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current.isMultiSelectMode).toBe(false);

    // Advance time to 500ms
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
      vi.advanceTimersByTime(300);
    });
    expect(result.current.isMultiSelectMode).toBe(false);
  });
});
