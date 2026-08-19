import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Image as ImageIcon, Loader2, ArrowLeft, BookOpen, Layers } from 'lucide-react'

import { snapshotsApi, workflowsApi, lorasApi, tagSetsApi, albumsApi } from '../api/client'
import type { SnapshotSummary, WorkflowSummary, Lora, TagSet, Album } from '../api/types'

export interface BaseImageOption {
  id: number
  image_path?: string | null
  thumbnail_path?: string | null
}

export type CloseCallback = () => void
export type SelectSnapshotCallback = (snapshot: BaseImageOption) => void

export interface BaseImageSelectModalProps {
  workflowId?: number
  currentSnapshotId: number
  onClose: CloseCallback
  onSelect: SelectSnapshotCallback
}

export function BaseImageSelectModal({
  workflowId,
  currentSnapshotId,
  onClose,
  onSelect,
}: BaseImageSelectModalProps) {
  // Tab State
  const [activeTab, setActiveTab] = useState<'snapshots' | 'albums'>('snapshots')

  // Filter Data
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [loras, setLoras] = useState<Lora[]>([])
  const [tagSets, setTagSets] = useState<TagSet[]>([])

  // Snapshots Tab State
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(workflowId ?? null)
  const [selectedLoraId, setSelectedLoraId] = useState<number | null>(null)
  const [selectedTagSetId, setSelectedTagSetId] = useState<number | null>(null)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [snapshotLimit, setSnapshotLimit] = useState<number>(24)
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([])
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false)
  const snapshotSentinelRef = useRef<HTMLDivElement | null>(null)

  // Albums Tab State
  const [albums, setAlbums] = useState<Album[]>([])
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null)
  const [currentAlbum, setCurrentAlbum] = useState<Album | null>(null)
  const [albumSortBy, setAlbumSortBy] = useState<'custom' | 'date-asc' | 'date-desc'>('custom')
  const [albumItemLimit, setAlbumItemLimit] = useState<number>(24)
  const [isLoadingAlbums, setIsLoadingAlbums] = useState<boolean>(false)
  const [isLoadingAlbumDetail, setIsLoadingAlbumDetail] = useState<boolean>(false)
  const albumItemSentinelRef = useRef<HTMLDivElement | null>(null)

  // Load filter options on mount
  useEffect(() => {
    workflowsApi.list().then(setWorkflows).catch((e) => console.error('Failed to load workflows', e))
    lorasApi.list().then(setLoras).catch((e) => console.error('Failed to load loras', e))
    tagSetsApi.list().then(setTagSets).catch((e) => console.error('Failed to load tagSets', e))
  }, [])

  // Fetch snapshots when filters change
  useEffect(() => {
    setIsLoadingSnapshots(true)
    setSnapshotLimit(24)
    snapshotsApi.list({
      workflow_id: selectedWorkflowId ?? undefined,
      lora_id: selectedLoraId ?? undefined,
      tag_set_id: selectedTagSetId ?? undefined,
    })
      .then((data) => {
        setSnapshots(data || [])
      })
      .catch((err) => {
        console.error('Failed to list snapshots:', err)
      })
      .finally(() => {
        setIsLoadingSnapshots(false)
      })
  }, [selectedWorkflowId, selectedLoraId, selectedTagSetId])

  // Load albums when tab switches to 'albums'
  useEffect(() => {
    if (activeTab === 'albums' && albums.length === 0) {
      setIsLoadingAlbums(true)
      albumsApi.list()
        .then((data) => {
          setAlbums(data || [])
        })
        .catch((err) => {
          console.error('Failed to list albums:', err)
        })
        .finally(() => {
          setIsLoadingAlbums(false)
        })
    }
  }, [activeTab, albums.length])

  // Load album detail when selectedAlbumId changes
  useEffect(() => {
    if (selectedAlbumId != null) {
      setIsLoadingAlbumDetail(true)
      setAlbumItemLimit(24)
      albumsApi.get(selectedAlbumId)
        .then((data) => {
          setCurrentAlbum(data)
        })
        .catch((err) => {
          console.error('Failed to get album detail:', err)
        })
        .finally(() => {
          setIsLoadingAlbumDetail(false)
        })
    } else {
      setCurrentAlbum(null)
    }
  }, [selectedAlbumId])

  // Sort snapshots
  const sortedSnapshots = useMemo(() => {
    return [...snapshots].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : a.id
      const dateB = b.created_at ? new Date(b.created_at).getTime() : b.id
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
    })
  }, [snapshots, sortOrder])

  const visibleSnapshots = useMemo(() => {
    return sortedSnapshots.slice(0, snapshotLimit)
  }, [sortedSnapshots, snapshotLimit])

  // Sentinel observer for snapshots
  useEffect(() => {
    const sentinel = snapshotSentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setSnapshotLimit((prev) => prev + 24)
      }
    }, { rootMargin: '200px' })

    observer.observe(sentinel)
    return () => observer.unobserve(sentinel)
  }, [sortedSnapshots.length, snapshotLimit])

  // Sort album items
  const sortedAlbumItems = useMemo(() => {
    if (!currentAlbum?.items) return []
    const items = [...currentAlbum.items]
    if (albumSortBy === 'custom') {
      return items.sort((a, b) => a.sequence_order - b.sequence_order)
    } else if (albumSortBy === 'date-desc') {
      return items.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : a.snapshot_id
        const dateB = b.created_at ? new Date(b.created_at).getTime() : b.snapshot_id
        return dateB - dateA
      })
    } else {
      return items.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : a.snapshot_id
        const dateB = b.created_at ? new Date(b.created_at).getTime() : b.snapshot_id
        return dateA - dateB
      })
    }
  }, [currentAlbum, albumSortBy])

  const visibleAlbumItems = useMemo(() => {
    return sortedAlbumItems.slice(0, albumItemLimit)
  }, [sortedAlbumItems, albumItemLimit])

  // Sentinel observer for album items
  useEffect(() => {
    const sentinel = albumItemSentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setAlbumItemLimit((prev) => prev + 24)
      }
    }, { rootMargin: '200px' })

    observer.observe(sentinel)
    return () => observer.unobserve(sentinel)
  }, [sortedAlbumItems.length, albumItemLimit])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-2">
            <ImageIcon size={18} className="text-accent-green" />
            <h3 className="text-base font-semibold text-white">ベース画像を差し替え</h3>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center bg-zinc-900 rounded-lg p-1 border border-white/10 text-xs">
            <button
              id="tab-snapshots"
              type="button"
              onClick={() => setActiveTab('snapshots')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === 'snapshots'
                  ? 'bg-accent-green text-black font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Layers size={14} />
              <span>全履歴・フィルタ</span>
            </button>
            <button
              id="tab-albums"
              type="button"
              onClick={() => setActiveTab('albums')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === 'albums'
                  ? 'bg-accent-green text-black font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <BookOpen size={14} />
              <span>アルバム</span>
            </button>
          </div>

          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        {activeTab === 'snapshots' ? (
          <div className="flex flex-col flex-1 min-h-[350px] overflow-hidden">
            {/* Filter Bar */}
            <div className="p-3 border-b border-white/5 bg-zinc-900/50 flex flex-wrap items-center gap-2 text-xs">
              <select
                id="base-image-workflow-filter"
                aria-label="Workflow Filter"
                value={selectedWorkflowId ?? ''}
                onChange={(e) => setSelectedWorkflowId(e.target.value ? Number(e.target.value) : null)}
                className="bg-zinc-800 border border-white/10 text-zinc-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-accent-green/50 max-w-[160px] truncate"
              >
                <option value="">All Workflows</option>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>

              <select
                id="base-image-lora-filter"
                aria-label="LoRA Filter"
                value={selectedLoraId ?? ''}
                onChange={(e) => setSelectedLoraId(e.target.value ? Number(e.target.value) : null)}
                className="bg-zinc-800 border border-white/10 text-zinc-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-accent-green/50 max-w-[160px] truncate"
              >
                <option value="">All LoRAs</option>
                {loras.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.model_name}
                  </option>
                ))}
              </select>

              <select
                id="base-image-tagset-filter"
                aria-label="Tag Set Filter"
                value={selectedTagSetId ?? ''}
                onChange={(e) => setSelectedTagSetId(e.target.value ? Number(e.target.value) : null)}
                className="bg-zinc-800 border border-white/10 text-zinc-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-accent-green/50 max-w-[160px] truncate"
              >
                <option value="">All Tag Sets</option>
                {tagSets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center ml-auto gap-2">
                <div className="flex items-center bg-zinc-800 rounded border border-white/10 p-0.5">
                  <button
                    id="sort-desc"
                    type="button"
                    onClick={() => setSortOrder('desc')}
                    className={`px-2 py-1 rounded transition-colors ${
                      sortOrder === 'desc' ? 'bg-zinc-700 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    新しい順
                  </button>
                  <button
                    id="sort-asc"
                    type="button"
                    onClick={() => setSortOrder('asc')}
                    className={`px-2 py-1 rounded transition-colors ${
                      sortOrder === 'asc' ? 'bg-zinc-700 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    古い順
                  </button>
                </div>
                <span className="text-zinc-400 text-xs">{sortedSnapshots.length} 枚</span>
              </div>
            </div>

            {/* Grid */}
            <div className="p-4 overflow-y-auto flex-1">
              {isLoadingSnapshots ? (
                <div className="flex items-center justify-center h-48 text-zinc-400 gap-2">
                  <Loader2 className="animate-spin" size={24} />
                  <span>履歴を読み込み中...</span>
                </div>
              ) : visibleSnapshots.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-xs">
                  利用可能なスナップショットが見つかりませんでした
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {visibleSnapshots.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onSelect(s)}
                        className={`group relative rounded-lg overflow-hidden border transition-all text-left aspect-square bg-zinc-900 flex flex-col ${
                          s.id === currentSnapshotId
                            ? 'border-accent-green ring-2 ring-accent-green/30'
                            : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <img
                          src={s.thumbnail_path || s.image_path || ''}
                          alt={`Snapshot ${s.id}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        {s.id === currentSnapshotId && (
                          <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-accent-green text-black font-bold text-[9px]">
                            現在
                          </span>
                        )}
                        <span className="absolute bottom-0 inset-x-0 bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-300 truncate">
                          #{s.id}
                        </span>
                      </button>
                    ))}
                  </div>
                  {visibleSnapshots.length < sortedSnapshots.length && (
                    <div ref={snapshotSentinelRef} className="h-8 flex items-center justify-center text-zinc-500 text-xs py-2">
                      さらに読み込み中...
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-[350px] overflow-hidden">
            {selectedAlbumId == null ? (
              /* Album List View */
              <div className="p-4 overflow-y-auto flex-1">
                {isLoadingAlbums ? (
                  <div className="flex items-center justify-center h-48 text-zinc-400 gap-2">
                    <Loader2 className="animate-spin" size={24} />
                    <span>アルバムを読み込み中...</span>
                  </div>
                ) : albums.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 text-xs">
                    アルバムが存在しません
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {albums.map((album) => {
                      const coverPath = album.items?.[0]?.thumbnail_path || album.items?.[0]?.image_path
                      return (
                        <button
                          key={album.id}
                          type="button"
                          onClick={() => setSelectedAlbumId(album.id)}
                          className="group bg-zinc-900 border border-white/10 hover:border-accent-green/50 rounded-lg overflow-hidden flex flex-col text-left transition-all hover:shadow-lg"
                        >
                          <div className="aspect-[4/3] w-full bg-zinc-950 flex items-center justify-center overflow-hidden">
                            {coverPath ? (
                              <img
                                src={coverPath}
                                alt={album.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                            ) : (
                              <BookOpen size={32} className="text-zinc-600" />
                            )}
                          </div>
                          <div className="p-2.5">
                            <div className="text-sm font-semibold text-white truncate">{album.name}</div>
                            <div className="text-xs text-zinc-400 mt-0.5">
                              {album.items?.length || 0} 枚
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Album Item View */
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* Album Sub-Header */}
                <div className="p-3 border-b border-white/5 bg-zinc-900/50 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      id="album-back-btn"
                      type="button"
                      onClick={() => setSelectedAlbumId(null)}
                      className="flex items-center gap-1 text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors"
                    >
                      <ArrowLeft size={14} />
                      <span>アルバム一覧へ</span>
                    </button>
                    <span className="text-zinc-600">|</span>
                    <span className="font-semibold text-white">{currentAlbum?.name || 'アルバム詳細'}</span>
                    <span className="text-zinc-400">({sortedAlbumItems.length} 枚)</span>
                  </div>

                  <div className="flex items-center bg-zinc-800 rounded border border-white/10 p-0.5">
                    <button
                      id="album-sort-custom"
                      type="button"
                      onClick={() => setAlbumSortBy('custom')}
                      className={`px-2 py-1 rounded transition-colors ${
                        albumSortBy === 'custom' ? 'bg-zinc-700 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      並び順
                    </button>
                    <button
                      id="album-sort-date-desc"
                      type="button"
                      onClick={() => setAlbumSortBy('date-desc')}
                      className={`px-2 py-1 rounded transition-colors ${
                        albumSortBy === 'date-desc' ? 'bg-zinc-700 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      新しい順
                    </button>
                    <button
                      id="album-sort-date-asc"
                      type="button"
                      onClick={() => setAlbumSortBy('date-asc')}
                      className={`px-2 py-1 rounded transition-colors ${
                        albumSortBy === 'date-asc' ? 'bg-zinc-700 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      古い順
                    </button>
                  </div>
                </div>

                {/* Album Items Grid */}
                <div className="p-4 overflow-y-auto flex-1">
                  {isLoadingAlbumDetail ? (
                    <div className="flex items-center justify-center h-48 text-zinc-400 gap-2">
                      <Loader2 className="animate-spin" size={24} />
                      <span>アルバム画像を読み込み中...</span>
                    </div>
                  ) : visibleAlbumItems.length === 0 ? (
                    <div className="text-center py-12 text-zinc-500 text-xs">
                      アルバム内に画像がありません
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                        {visibleAlbumItems.map((item) => (
                          <button
                            key={item.snapshot_id}
                            type="button"
                            onClick={() =>
                              onSelect({
                                id: item.snapshot_id,
                                image_path: item.image_path,
                                thumbnail_path: item.thumbnail_path,
                              })
                            }
                            className={`group relative rounded-lg overflow-hidden border transition-all text-left aspect-square bg-zinc-900 flex flex-col ${
                              item.snapshot_id === currentSnapshotId
                                ? 'border-accent-green ring-2 ring-accent-green/30'
                                : 'border-white/10 hover:border-white/30'
                            }`}
                          >
                            <img
                              src={item.thumbnail_path || item.image_path || ''}
                              alt={`Snapshot ${item.snapshot_id}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            {item.snapshot_id === currentSnapshotId && (
                              <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-accent-green text-black font-bold text-[9px]">
                                現在
                              </span>
                            )}
                            <span className="absolute bottom-0 inset-x-0 bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-300 truncate">
                              #{item.snapshot_id}
                            </span>
                          </button>
                        ))}
                      </div>
                      {visibleAlbumItems.length < sortedAlbumItems.length && (
                        <div ref={albumItemSentinelRef} className="h-8 flex items-center justify-center text-zinc-500 text-xs py-2">
                          さらに読み込み中...
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

