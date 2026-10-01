import { useCallback } from 'react'
import type { Album } from '../../../api/types'

export interface UseAlbumDndOrderProps {
  albumId: number | null
  sortedAlbumItems: Album['items']
  sortDirection: 'asc' | 'desc'
  multiSelect: {
    isMultiSelectMode: boolean
    selectedIds: Set<number>
  }
  onUpdateOrder: (params: { id: number; snapshotIds: number[] }) => void
}

export function useAlbumDndOrder({
  albumId,
  sortedAlbumItems,
  sortDirection,
  multiSelect,
  onUpdateOrder,
}: UseAlbumDndOrderProps) {
  const handleAlbumItemDragEnd = useCallback(
    (activeId: number, overId: number) => {
      if (!albumId) return

      if (
        multiSelect.isMultiSelectMode &&
        multiSelect.selectedIds.has(activeId) &&
        multiSelect.selectedIds.size > 1
      ) {
        // グループ移動
        const selected = sortedAlbumItems.filter((item) =>
          multiSelect.selectedIds.has(item.snapshot_id)
        )
        const nonSelected = sortedAlbumItems.filter(
          (item) => !multiSelect.selectedIds.has(item.snapshot_id)
        )

        const overIndexInNonSelected = nonSelected.findIndex((item) => item.snapshot_id === overId)
        if (overIndexInNonSelected === -1) return

        const activeIndexInSorted = sortedAlbumItems.findIndex((item) => item.snapshot_id === activeId)
        const overIndexInSorted = sortedAlbumItems.findIndex((item) => item.snapshot_id === overId)

        const insertAt =
          activeIndexInSorted < overIndexInSorted
            ? overIndexInNonSelected + 1
            : overIndexInNonSelected

        const newItems = [
          ...nonSelected.slice(0, insertAt),
          ...selected,
          ...nonSelected.slice(insertAt),
        ]

        const newSnapshotIds = newItems.map((item) => item.snapshot_id)
        const updatedSnapshotIds =
          sortDirection === 'desc' ? [...newSnapshotIds].reverse() : newSnapshotIds
        onUpdateOrder({
          id: albumId,
          snapshotIds: updatedSnapshotIds,
        })
      } else {
        const oldIndex = sortedAlbumItems.findIndex((item) => item.snapshot_id === activeId)
        const newIndex = sortedAlbumItems.findIndex((item) => item.snapshot_id === overId)

        if (oldIndex !== -1 && newIndex !== -1) {
          const newItems = [...sortedAlbumItems]
          const [movedItem] = newItems.splice(oldIndex, 1)
          newItems.splice(newIndex, 0, movedItem)

          const newSnapshotIds = newItems.map((item) => item.snapshot_id)
          const updatedSnapshotIds =
            sortDirection === 'desc' ? [...newSnapshotIds].reverse() : newSnapshotIds
          onUpdateOrder({
            id: albumId,
            snapshotIds: updatedSnapshotIds,
          })
        }
      }
    },
    [albumId, sortedAlbumItems, sortDirection, multiSelect, onUpdateOrder]
  )

  return {
    handleAlbumItemDragEnd,
  }
}
