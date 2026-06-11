import { useState, useCallback } from 'react';
import { TagChip } from './useChipParser';

export type ChipHistoryState = {
  past: TagChip[][];
  present: TagChip[];
  future: TagChip[][];
};

/**
 * 最大50件のチップ状態履歴を管理するカスタムフック。
 * Undo/Redo機能を提供します。
 */
export const useChipHistory = (initialChips: TagChip[] = []) => {
  const [history, setHistory] = useState<ChipHistoryState>(() => ({
    past: [],
    present: initialChips,
    future: [],
  }));

  const setChips = useCallback((newChips: TagChip[], pushToHistory: boolean = false) => {
    setHistory((prev) => {
      if (pushToHistory) {
        const newPast = [...prev.past, prev.present];
        // 履歴件数が50件を超えた場合、最も古い履歴（先頭）を削除
        if (newPast.length > 50) {
          newPast.shift();
        }
        return {
          past: newPast,
          present: newChips,
          future: [],
        };
      } else {
        return {
          ...prev,
          present: newChips,
        };
      }
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, prev.past.length - 1);
      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      const newFuture = prev.future.slice(1);
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  return {
    state: history.present,
    setChips,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
};
