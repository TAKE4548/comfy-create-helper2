import { useState, useEffect, useCallback } from 'react'
import type { HistoryState } from './presetStateUtils'

export interface UsePresetHistoryProps {
  activeSetId: string | number | null
  currentState: HistoryState
  onApplyState: (state: HistoryState) => void
}

export interface UsePresetHistoryReturn {
  canUndo: boolean
  canRedo: boolean
  undo: (presetId: string | number) => void
  redo: (presetId: string | number) => void
  recordHistory: (presetId: string | number, previousState: HistoryState) => void
}

export function usePresetHistory({
  activeSetId,
  currentState,
  onApplyState,
}: UsePresetHistoryProps): UsePresetHistoryReturn {
  const [, setHistoryVersion] = useState(0)
  const triggerHistoryChange = () => setHistoryVersion((v) => v + 1)

  const getHistory = (id: string | number): { past: HistoryState[]; future: HistoryState[] } => {
    try {
      const stored = sessionStorage.getItem(`prompt-surgeon-history-${id}`)
      if (stored) return JSON.parse(stored)
    } catch {}
    return { past: [], future: [] }
  }

  const saveHistory = (id: string | number, hist: { past: HistoryState[]; future: HistoryState[] }) => {
    try {
      sessionStorage.setItem(`prompt-surgeon-history-${id}`, JSON.stringify(hist))
    } catch {}
    triggerHistoryChange()
  }

  const canUndo = activeSetId !== null && getHistory(activeSetId).past.length > 0
  const canRedo = activeSetId !== null && getHistory(activeSetId).future.length > 0

  const undo = useCallback((presetId: string | number) => {
    const hist = getHistory(presetId)
    if (hist.past.length === 0) return
    hist.future.push(currentState)
    const prevState = hist.past.pop()!
    saveHistory(presetId, hist)
    onApplyState(prevState)
  }, [currentState, onApplyState])

  const redo = useCallback((presetId: string | number) => {
    const hist = getHistory(presetId)
    if (hist.future.length === 0) return
    hist.past.push(currentState)
    const nextState = hist.future.pop()!
    saveHistory(presetId, hist)
    onApplyState(nextState)
  }, [currentState, onApplyState])

  const recordHistory = useCallback((presetId: string | number, previousState: HistoryState) => {
    const hist = getHistory(presetId)
    hist.past.push(previousState)
    hist.future = []
    saveHistory(presetId, hist)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.getAttribute('contenteditable') === 'true'
      ) return

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault()
          if (activeSetId !== null) undo(activeSetId)
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault()
          if (activeSetId !== null) redo(activeSetId)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeSetId, undo, redo])

  return { canUndo, canRedo, undo, redo, recordHistory }
}
