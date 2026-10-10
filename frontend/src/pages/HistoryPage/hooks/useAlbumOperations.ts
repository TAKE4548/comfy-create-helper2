import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { albumsApi } from '../../../api/client'
import type { Album } from '../../../api/types'
import { arrayMove } from '@dnd-kit/sortable'

export interface UseAlbumOperationsProps {
  initialSelectedAlbumId?: number | null
}

export function useAlbumOperations({ initialSelectedAlbumId = null }: UseAlbumOperationsProps = {}) {
  const qc = useQueryClient()
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(initialSelectedAlbumId)
  const [albumSortCriterion, setAlbumSortCriterion] = useState<'custom' | 'date'>('custom')
  const [albumSortDirection, setAlbumSortDirection] = useState<'asc' | 'desc'>('asc')
  const [editingAlbumId, setEditingAlbumId] = useState<number | null>(null)
  const [editingAlbumName, setEditingAlbumName] = useState('')
  const [isEditingDetailName, setIsEditingDetailName] = useState(false)
  const [detailAlbumName, setDetailAlbumName] = useState('')
  const [activeAlbumId, setActiveAlbumId] = useState<number | null>(null)
  const [albumItemLimit, setAlbumItemLimit] = useState(24)

  const { data: albums, isLoading: isLoadingAlbums } = useQuery({
    queryKey: ['albums'],
    queryFn: () => albumsApi.list() as Promise<Album[]>,
  })

  const { data: currentAlbum, isLoading: isLoadingCurrentAlbum } = useQuery({
    queryKey: ['album', selectedAlbumId],
    queryFn: () => albumsApi.get(selectedAlbumId!) as Promise<Album>,
    enabled: selectedAlbumId !== null,
  })

  const sortedAlbumItems = useMemo(() => {
    if (!currentAlbum) return []
    return [...currentAlbum.items].sort((a, b) => {
      if (albumSortCriterion === 'date') {
        const parsedDateA = a.created_at ? new Date(a.created_at).getTime() : 0
        const parsedDateB = b.created_at ? new Date(b.created_at).getTime() : 0
        const dateA = Number.isFinite(parsedDateA) ? parsedDateA : 0
        const dateB = Number.isFinite(parsedDateB) ? parsedDateB : 0
        if (dateA !== dateB) {
          return albumSortDirection === 'asc' ? dateA - dateB : dateB - dateA
        }
        return a.sequence_order - b.sequence_order
      } else {
        return albumSortDirection === 'asc'
          ? a.sequence_order - b.sequence_order
          : b.sequence_order - a.sequence_order
      }
    })
  }, [currentAlbum, albumSortCriterion, albumSortDirection])

  const visibleAlbumItems = useMemo(() => {
    return sortedAlbumItems.slice(0, albumItemLimit)
  }, [sortedAlbumItems, albumItemLimit])

  const deleteAlbum = useMutation({
    mutationFn: (id: number) => albumsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['albums'] }),
  })

  const reorderAlbums = useMutation({
    mutationFn: (orderedIds: number[]) => albumsApi.reorder(orderedIds),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: ['albums'] })
      const prev = qc.getQueryData<Album[]>(['albums'])
      if (prev) {
        const map = new Map(prev.map((a) => [a.id, a]))
        const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as Album[]
        qc.setQueryData(['albums'], reordered)
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['albums'], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['albums'] })
    },
  })

  const updateAlbum = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => albumsApi.update(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['albums'] })
      if (selectedAlbumId !== null) {
        qc.invalidateQueries({ queryKey: ['album', selectedAlbumId] })
      }
      setEditingAlbumId(null)
      setIsEditingDetailName(false)
    },
    onError: (err: any) => {
      alert('Failed to update album: ' + (err.message || err))
    },
  })

  const updateAlbumOrder = useMutation({
    mutationFn: ({ id, snapshotIds }: { id: number; snapshotIds: number[] }) =>
      albumsApi.updateOrder(id, snapshotIds),
    onMutate: async ({ id, snapshotIds }) => {
      await qc.cancelQueries({ queryKey: ['album', id] })
      const previousAlbum = qc.getQueryData<Album>(['album', id])
      if (previousAlbum) {
        const sortedItems = [...previousAlbum.items].sort((a, b) => {
          const idxA = snapshotIds.indexOf(a.snapshot_id)
          const idxB = snapshotIds.indexOf(b.snapshot_id)
          return idxA - idxB
        })
        qc.setQueryData<Album>(['album', id], {
          ...previousAlbum,
          items: sortedItems.map((item, idx) => ({ ...item, sequence_order: idx })),
        })
      }
      return { previousAlbum }
    },
    onError: (err: any, variables, context) => {
      if (context?.previousAlbum) {
        qc.setQueryData(['album', variables.id], context.previousAlbum)
      }
      alert('Failed to update order: ' + err.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['albums'] })
      qc.invalidateQueries({ queryKey: ['album', selectedAlbumId] })
    },
  })

  const deleteAlbumItems = useMutation({
    mutationFn: ({ id, snapshotIds }: { id: number; snapshotIds: number[] }) =>
      albumsApi.deleteItems(id, snapshotIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['albums'] })
      qc.invalidateQueries({ queryKey: ['album', selectedAlbumId] })
    },
    onError: (err: any) => {
      alert('Failed to delete items: ' + err.message)
    },
  })

  const addToAlbumMutation = useMutation({
    mutationFn: async ({
      albumId,
      newAlbumName,
      snapshotIds,
    }: {
      albumId: number | null
      newAlbumName?: string
      snapshotIds: number[]
    }) => {
      if (albumId !== null) {
        await albumsApi.addItems(albumId, snapshotIds)
      } else if (newAlbumName) {
        await albumsApi.create({
          name: newAlbumName,
          snapshot_ids: snapshotIds,
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['albums'] })
      qc.invalidateQueries({ queryKey: ['snapshots'] })
    },
  })

  const handleAlbumReorder = (oldIndex: number, newIndex: number) => {
    if (!albums || oldIndex === newIndex || oldIndex < 0 || newIndex < 0) return
    const newItems = arrayMove(albums, oldIndex, newIndex)
    reorderAlbums.mutate(newItems.map((a) => a.id))
  }

  const handleBackToAlbums = () => {
    setSelectedAlbumId(null)
    setAlbumSortCriterion('custom')
    setAlbumSortDirection('asc')
  }

  return {
    albums,
    isLoadingAlbums,
    currentAlbum,
    isLoadingCurrentAlbum,
    selectedAlbumId,
    setSelectedAlbumId,
    albumSortCriterion,
    setAlbumSortCriterion,
    albumSortDirection,
    setAlbumSortDirection,
    sortedAlbumItems,
    visibleAlbumItems,
    albumItemLimit,
    setAlbumItemLimit,
    editingAlbumId,
    setEditingAlbumId,
    editingAlbumName,
    setEditingAlbumName,
    isEditingDetailName,
    setIsEditingDetailName,
    detailAlbumName,
    setDetailAlbumName,
    activeAlbumId,
    setActiveAlbumId,
    deleteAlbum,
    reorderAlbums,
    updateAlbum,
    updateAlbumOrder,
    deleteAlbumItems,
    addToAlbumMutation,
    handleAlbumReorder,
    handleBackToAlbums,
  }
}
