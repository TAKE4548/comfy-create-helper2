import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react'

interface CollectionItem<ID extends number | string> {
  id: ID
}

interface UseCollectionSelectionOptions<ID extends number | string, T extends CollectionItem<ID>> {
  items: T[]
}

interface LongPressHandlers {
  onMouseDown: () => void
  onMouseUp: () => void
  onMouseLeave: () => void
  onTouchStart: (event: ReactTouchEvent<Element>) => void
  onTouchEnd: () => void
  onTouchCancel: () => void
  onContextMenu: (event: ReactMouseEvent<Element>) => void
}

const LONG_PRESS_MS = 500
const TOUCH_MOVE_THRESHOLD = 15
const CLICK_SUPPRESSION_MS = 800

export function useCollectionSelection<ID extends number | string, T extends CollectionItem<ID>>({
  items,
}: UseCollectionSelectionOptions<ID, T>) {
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<ID>>(() => new Set())
  const anchorIdRef = useRef<ID | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activePressRef = useRef<{ id: ID; x: number; y: number } | null>(null)
  const removeTouchMoveRef = useRef<(() => void) | null>(null)
  const suppressedClickRef = useRef<{ id: ID; until: number } | null>(null)

  const toggleItem = useCallback((id: ID) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const enterMultiSelectMode = useCallback((firstId?: ID) => {
    setIsMultiSelectMode(true)
    if (firstId !== undefined) {
      anchorIdRef.current = firstId
      setSelectedIds((current) => new Set(current).add(firstId))
    }
  }, [])

  const exitMultiSelectMode = useCallback(() => {
    setIsMultiSelectMode(false)
    setSelectedIds(new Set())
    anchorIdRef.current = null
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    anchorIdRef.current = null
  }, [])

  const selectAll = useCallback(() => {
    setIsMultiSelectMode(true)
    setSelectedIds(new Set(items.map((item) => item.id)))
    anchorIdRef.current = items[0]?.id ?? null
  }, [items])

  const isSelected = useCallback((id: ID) => selectedIds.has(id), [selectedIds])

  useEffect(() => {
    const availableIds = new Set(items.map((item) => item.id))
    setSelectedIds((current) => {
      const pruned = new Set([...current].filter((id) => availableIds.has(id)))
      return pruned.size === current.size ? current : pruned
    })
    if (anchorIdRef.current !== null && !availableIds.has(anchorIdRef.current)) {
      anchorIdRef.current = null
    }
  }, [items])

  const handleItemClick = useCallback((id: ID, event: ReactMouseEvent) => {
    const suppressed = suppressedClickRef.current
    if (suppressed?.id === id && suppressed.until >= Date.now()) {
      suppressedClickRef.current = null
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      if (isMultiSelectMode) {
        toggleItem(id)
        anchorIdRef.current = id
      } else {
        enterMultiSelectMode(id)
      }
      return
    }

    if (event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      const ids = items.map((item) => item.id)
      const targetIndex = ids.indexOf(id)
      const anchorIndex = anchorIdRef.current === null ? targetIndex : ids.indexOf(anchorIdRef.current)
      if (targetIndex >= 0) {
        const start = anchorIndex < 0 ? targetIndex : Math.min(anchorIndex, targetIndex)
        const end = anchorIndex < 0 ? targetIndex : Math.max(anchorIndex, targetIndex)
        setIsMultiSelectMode(true)
        setSelectedIds((current) => new Set([...current, ...ids.slice(start, end + 1)]))
        if (anchorIdRef.current === null) anchorIdRef.current = id
      }
      return
    }

    if (isMultiSelectMode) {
      event.preventDefault()
      event.stopPropagation()
      toggleItem(id)
      anchorIdRef.current = id
    }
  }, [enterMultiSelectMode, isMultiSelectMode, items, toggleItem])

  const cancelLongPress = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    removeTouchMoveRef.current?.()
    removeTouchMoveRef.current = null
    activePressRef.current = null
  }, [])

  const getLongPressHandlers = useCallback((id: ID): LongPressHandlers => {
    const begin = (x = 0, y = 0) => {
      cancelLongPress()
      activePressRef.current = { id, x, y }
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        suppressedClickRef.current = { id, until: Date.now() + CLICK_SUPPRESSION_MS }
        enterMultiSelectMode(id)
      }, LONG_PRESS_MS)
    }

    const onTouchStart = (event: ReactTouchEvent<Element>) => {
      const touch = event.touches[0]
      if (!touch) return
      begin(touch.clientX, touch.clientY)

      const onTouchMove = (moveEvent: TouchEvent) => {
        const current = activePressRef.current
        const movedTouch = moveEvent.touches[0]
        if (!current || !movedTouch) return
        if (Math.hypot(movedTouch.clientX - current.x, movedTouch.clientY - current.y) >= TOUCH_MOVE_THRESHOLD) {
          cancelLongPress()
        }
      }
      window.addEventListener('touchmove', onTouchMove, { passive: true })
      removeTouchMoveRef.current = () => window.removeEventListener('touchmove', onTouchMove)
    }

    const onContextMenu = (event: ReactMouseEvent<Element>) => {
      if (suppressedClickRef.current?.id === id) event.preventDefault()
    }

    return {
      onMouseDown: () => begin(),
      onMouseUp: cancelLongPress,
      onMouseLeave: cancelLongPress,
      onTouchStart,
      onTouchEnd: cancelLongPress,
      onTouchCancel: cancelLongPress,
      onContextMenu,
    }
  }, [cancelLongPress, enterMultiSelectMode])

  useEffect(() => cancelLongPress, [cancelLongPress])

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
  }
}
