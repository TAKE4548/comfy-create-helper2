import { useState, useRef, useCallback } from 'react';
import { LS_KEYS } from '../utils/localStorageKeys';

export interface UseMultiSelectOptions<T extends { id: number }> {
  items: T[];
}

export interface UseMultiSelectReturn {
  isMultiSelectMode: boolean;
  selectedIds: Set<number>;
  enterMultiSelectMode: (firstId?: number) => void;
  exitMultiSelectMode: () => void;
  handleItemClick: (id: number, event: React.MouseEvent) => void;
  toggleItem: (id: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  isSelected: (id: number) => boolean;
  getLongPressHandlers: (id: number) => {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
}

export function useMultiSelect<T extends { id: number }>({
  items,
}: UseMultiSelectOptions<T>): UseMultiSelectReturn {
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const lastSelectedIdRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const enterMultiSelectMode = useCallback((firstId?: number) => {
    setIsMultiSelectMode(true);
    if (firstId !== undefined) {
      setSelectedIds(new Set([firstId]));
      lastSelectedIdRef.current = firstId;
    }
  }, []);

  const exitMultiSelectMode = useCallback(() => {
    setIsMultiSelectMode(false);
    setSelectedIds(new Set());
    lastSelectedIdRef.current = null;
  }, []);

  const toggleItem = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleItemClick = useCallback(
    (id: number, event: React.MouseEvent) => {
      if (!isMultiSelectMode) {
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          const prevLastSelected = lastSelectedIdRef.current;
          enterMultiSelectMode(id);
          if (event.shiftKey && prevLastSelected !== null) {
            const fromIdx = items.findIndex((i) => i.id === prevLastSelected);
            const toIdx = items.findIndex((i) => i.id === id);
            if (fromIdx !== -1 && toIdx !== -1) {
              const start = Math.min(fromIdx, toIdx);
              const end = Math.max(fromIdx, toIdx);
              const rangeIds = items.slice(start, end + 1).map((i) => i.id);
              setSelectedIds(new Set(rangeIds));
            }
          }
        } else {
          lastSelectedIdRef.current = id;
        }
        return;
      }

      if (event.shiftKey && lastSelectedIdRef.current !== null) {
        const fromIdx = items.findIndex((i) => i.id === lastSelectedIdRef.current);
        const toIdx = items.findIndex((i) => i.id === id);
        if (fromIdx !== -1 && toIdx !== -1) {
          const start = Math.min(fromIdx, toIdx);
          const end = Math.max(fromIdx, toIdx);
          const rangeIds = items.slice(start, end + 1).map((i) => i.id);
          setSelectedIds((prev) => new Set([...prev, ...rangeIds]));
        }
      } else {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
      }
      lastSelectedIdRef.current = id;
    },
    [isMultiSelectMode, items, enterMultiSelectMode]
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: number) => {
      return selectedIds.has(id);
    },
    [selectedIds]
  );

  const getLongPressHandlers = useCallback(
    (id: number) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let startX: number | null = null;
      let startY: number | null = null;

      const globalMove = (e: MouseEvent | TouchEvent) => {
        if (startX === null || startY === null) return;

        let currentX = 0;
        let currentY = 0;
        if ('touches' in e) {
          if (e.touches && e.touches.length > 0) {
            currentX = e.touches[0].clientX;
            currentY = e.touches[0].clientY;
          } else {
            return;
          }
        } else {
          currentX = e.clientX;
          currentY = e.clientY;
        }

        const diffX = currentX - startX;
        const diffY = currentY - startY;
        const distance = Math.sqrt(diffX * diffX + diffY * diffY);

        // Cancel long press if moved more than 5px (threshold for drag vs hold)
        // and transition to active dragging state to block any future triggers.
        if (distance >= 5) {
          isDraggingRef.current = true;
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          startX = null;
          startY = null;
          document.removeEventListener('mousemove', globalMove);
          document.removeEventListener('touchmove', globalMove);
        }
      };

      const globalClear = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        startX = null;
        startY = null;
        isDraggingRef.current = false;

        document.removeEventListener('mousemove', globalMove);
        document.removeEventListener('touchmove', globalMove);
        document.removeEventListener('mouseup', globalClear);
        document.removeEventListener('touchend', globalClear);
        document.removeEventListener('touchcancel', globalClear);
      };

      const start = (e: React.MouseEvent | React.TouchEvent) => {
        // If already dragging globally, block long press initiation
        if (isDraggingRef.current) return;

        // Prevent trigger on right click
        if ('button' in e && e.button !== 0) return;

        // Record starting position
        if ('touches' in e) {
          if (e.touches && e.touches.length > 0) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
          }
        } else {
          startX = e.clientX;
          startY = e.clientY;
        }

        // Bind global listeners to document to capture move and end events reliably
        document.addEventListener('mousemove', globalMove);
        document.addEventListener('touchmove', globalMove, { passive: true });
        document.addEventListener('mouseup', globalClear);
        document.addEventListener('touchend', globalClear);
        document.addEventListener('touchcancel', globalClear);

        const stored = localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_MULTI_SELECT);
        const parsed = stored !== null ? parseFloat(stored) : NaN;
        const delay = !isNaN(parsed) ? parsed * 1000 : 800;
        timer = setTimeout(() => {
          enterMultiSelectMode(id);
          globalClear(); // Clean up listeners on successful activation
        }, delay);
      };

      return {
        onMouseDown: start,
        onMouseUp: globalClear,
        onMouseLeave: globalClear,
        onTouchStart: start,
        onTouchEnd: globalClear,
      };
    },
    [enterMultiSelectMode]
  );

  return {
    isMultiSelectMode,
    selectedIds,
    enterMultiSelectMode,
    exitMultiSelectMode,
    handleItemClick,
    toggleItem,
    selectAll,
    clearSelection,
    isSelected,
    getLongPressHandlers,
  };
}
