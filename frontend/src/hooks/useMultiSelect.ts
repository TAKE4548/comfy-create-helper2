import { useState, useRef, useCallback } from 'react';

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
        if (event.ctrlKey || event.metaKey) {
          enterMultiSelectMode(id);
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

      const start = (e: React.MouseEvent | React.TouchEvent) => {
        // Prevent trigger on right click
        if ('button' in e && e.button !== 0) return;
        timer = setTimeout(() => {
          enterMultiSelectMode(id);
        }, 500);
      };

      const clear = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      return {
        onMouseDown: start,
        onMouseUp: clear,
        onMouseLeave: clear,
        onTouchStart: start,
        onTouchEnd: clear,
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
