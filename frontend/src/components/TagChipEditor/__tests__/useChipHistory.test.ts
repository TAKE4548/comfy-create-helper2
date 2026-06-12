import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChipHistory } from '../useChipHistory';
import { TagChip } from '../useChipParser';

describe('useChipHistory', () => {
  const initialChips: TagChip[] = [
    { id: '1', text: 'apple', enabled: true },
  ];

  it('should initialize with initial state', () => {
    const { result } = renderHook(() => useChipHistory(initialChips));
    
    expect(result.current.state).toEqual(initialChips);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('should update state and push to history when setChips is called with pushToHistory = true', () => {
    const { result } = renderHook(() => useChipHistory(initialChips));
    const nextChips: TagChip[] = [
      { id: '1', text: 'apple', enabled: true },
      { id: '2', text: 'banana', enabled: true },
    ];

    act(() => {
      result.current.setChips(nextChips, true);
    });

    expect(result.current.state).toEqual(nextChips);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('should update state but not push to history when setChips is called with pushToHistory = false', () => {
    const { result } = renderHook(() => useChipHistory(initialChips));
    const nextChips: TagChip[] = [
      { id: '1', text: 'apple', enabled: true },
      { id: '2', text: 'banana', enabled: true },
    ];

    act(() => {
      result.current.setChips(nextChips, false);
    });

    expect(result.current.state).toEqual(nextChips);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('should handle undo and redo correctly', () => {
    const { result } = renderHook(() => useChipHistory(initialChips));
    const step1: TagChip[] = [{ id: '1', text: 'apple', enabled: true }, { id: '2', text: 'banana', enabled: true }];
    const step2: TagChip[] = [{ id: '1', text: 'apple', enabled: true }, { id: '2', text: 'banana', enabled: true }, { id: '3', text: 'cherry', enabled: true }];

    // 1st change (push)
    act(() => {
      result.current.setChips(step1, true);
    });
    // 2nd change (push)
    act(() => {
      result.current.setChips(step2, true);
    });

    expect(result.current.state).toEqual(step2);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    // Undo 1
    act(() => {
      result.current.undo();
    });
    expect(result.current.state).toEqual(step1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);

    // Undo 2
    act(() => {
      result.current.undo();
    });
    expect(result.current.state).toEqual(initialChips);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    // Redo 1
    act(() => {
      result.current.redo();
    });
    expect(result.current.state).toEqual(step1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);
  });

  it('should enforce history limit of 50 states', () => {
    const { result } = renderHook(() => useChipHistory(initialChips));
    
    // Perform 51 updates with pushToHistory = true
    for (let i = 1; i <= 51; i++) {
      act(() => {
        result.current.setChips([
          { id: `${i}`, text: `chip-${i}`, enabled: true }
        ], true);
      });
    }

    // Now, we try to undo as many times as possible.
    // If the limit is 50, we should only be able to undo exactly 50 times.
    // The 51st undo should not be possible (canUndo is false).
    let undoCount = 0;
    while (result.current.canUndo) {
      act(() => {
        result.current.undo();
      });
      undoCount++;
    }

    expect(undoCount).toBe(50);
  });
});
