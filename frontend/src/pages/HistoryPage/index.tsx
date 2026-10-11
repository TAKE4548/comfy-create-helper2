import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  Trash2,
  Download,
  BookOpen,
  Sparkles,
} from 'lucide-react'
import { snapshotsApi, workflowsApi, lorasApi, tagSetsApi, speechBatchApi, albumsApi } from '../../api/client'
import type { SnapshotSummary, Lora, TagSet } from '../../api/types'
import { HistoryModalPreview } from '../../components/HistoryModalPreview'
import { AddSnapshotToAlbumModal } from '../../components/AddSnapshotToAlbumModal'
import { SpeechBubbleEditorModal } from '../../components/SpeechBubbleEditorModal'
import { BatchSpeechTransformModal } from '../../components/BatchSpeechTransformModal'
import { useCollectionSelection } from '../../hooks/useCollectionSelection'
import { MultiSelectToolbar } from '../../components/MultiSelectToolbar'
import { useThumbnailAspectRatio } from '../../hooks/useThumbnailAspectRatio'
import { useBulkDownload } from './hooks/useBulkDownload'
import { useAlbumOperations } from './hooks/useAlbumOperations'
import { useAlbumDndOrder } from './hooks/useAlbumDndOrder'
import { AlbumListView } from './components/AlbumListView'
import { AlbumDetailView } from './views/AlbumDetailView'
import { SnapshotGalleryView } from './views/SnapshotGalleryView'
import { PageHeader } from '../../components/common/PageHeader'
import { Modal } from '../../components/common/Modal'

/**
 * サムネイル URL または元画像 URL を安全に解決する。
 * ComfyUI の直接 URL (ポート 8188 への /view? 等) が含まれている場合、
 * 外部端末から直接アクセスできないため、プロキシエンドポイントへ変換する。
 */
export function toSafeImageUrl(url: string | null | undefined): string {
  if (!url) return ''
  // 既に相対パスまたはプロキシパスの場合
  if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }
  try {
    const parsed = new URL(url, window.location.origin)
    // ComfyUI の direct view URL (e.g. :8188/view?...)
    if (parsed.pathname === '/view' || parsed.pathname.endsWith('/view')) {
      return `/api/comfy/view${parsed.search}`
    }
    return url
  } catch {
    return url
  }
}

export function toThumbnailUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.pathname === '/view' || parsed.pathname.endsWith('/view')) {
      return `/api/comfy/thumbnail${parsed.search}`
    }
    return url
  } catch {
    return url
  }
}

export function HistoryPage() {
  const qc = useQueryClient()
  const { aspectRatioStyle } = useThumbnailAspectRatio()
  const [view, setView] = useState<'snapshots' | 'albums'>('snapshots')

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [selectedLoraId, setSelectedLoraId] = useState<number | null>(null)
  const [selectedTagSetId, setSelectedTagSetId] = useState<number | null>(null)
  const [isAddToAlbumModalOpen, setIsAddToAlbumModalOpen] = useState(false)
  const [isModalPreviewOpen, setIsModalPreviewOpen] = useState(false)
  const [modalPreviewIndex, setModalPreviewIndex] = useState(0)
  const [selectedForSpeech, setSelectedForSpeech] = useState<SnapshotSummary | null>(null)
  const [isBatchSpeechModalOpen, setIsBatchSpeechModalOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [snapshotLimit, setSnapshotLimit] = useState(24)

  const [isDeleteSnapshotsModalOpen, setIsDeleteSnapshotsModalOpen] = useState(false)
  const [albumDeleteTarget, setAlbumDeleteTarget] = useState<{ isOpen: boolean; snapshotIds: number[] }>({
    isOpen: false,
    snapshotIds: [],
  })

  const albumItemSentinelRef = useRef<HTMLDivElement | null>(null)

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list() as Promise<{ id: number; name: string }[]>,
  })

  const { data: loras } = useQuery({
    queryKey: ['loras'],
    queryFn: () => lorasApi.list() as Promise<Lora[]>,
  })

  const { data: tagSets } = useQuery({
    queryKey: ['tag-sets'],
    queryFn: () => tagSetsApi.list() as Promise<TagSet[]>,
  })

  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', selectedWorkflowId, selectedLoraId, selectedTagSetId],
    queryFn: () =>
      snapshotsApi.list({
        workflow_id: selectedWorkflowId ?? undefined,
        lora_id: selectedLoraId ?? undefined,
        tag_set_id: selectedTagSetId ?? undefined,
      }) as Promise<SnapshotSummary[]>,
  })

  const { data: allSnapshots } = useQuery({
    queryKey: ['snapshots', null, null, null],
    queryFn: () => snapshotsApi.list({}) as Promise<SnapshotSummary[]>,
  })

  const { data: activeBatchJob } = useQuery({
    queryKey: ['speech-batch-active-job'],
    queryFn: () => speechBatchApi.getActiveJob(),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'processing' || status === 'pending' ? 1500 : 5000
    },
  })

  // Album operations hook
  const {
    albums,
    isLoadingAlbums,
    currentAlbum,
    selectedAlbumId,
    setSelectedAlbumId,
    albumSortCriterion,
    setAlbumSortCriterion,
    albumSortDirection,
    setAlbumSortDirection,
    sortedAlbumItems,
    visibleAlbumItems,
    setAlbumItemLimit,
    deleteAlbum,
    updateAlbum,
    updateAlbumOrder,
    deleteAlbumItems,
    addToAlbumMutation,
    handleAlbumReorder,
    handleBackToAlbums,
  } = useAlbumOperations()

  // Reset snapshot limit on filter/sort changes
  useEffect(() => {
    setSnapshotLimit(24)
  }, [selectedWorkflowId, selectedLoraId, selectedTagSetId, sortOrder])

  // Reset album item limit when selected album changes
  useEffect(() => {
    setAlbumItemLimit(24)
  }, [selectedAlbumId, setAlbumItemLimit])

  // Bulk download hook
  const { isDownloading, handleBulkDownload } = useBulkDownload({
    snapshots,
    currentAlbum,
    sortedAlbumItems,
  })

  const sortedSnapshots = useMemo(() => {
    if (!snapshots) return []
    const copy = [...snapshots]
    return sortOrder === 'desc'
      ? copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      : copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [snapshots, sortOrder])

  const snapshotMultiSelect = useCollectionSelection<number, (typeof sortedSnapshots)[number]>({ items: sortedSnapshots })
  const albumItemMultiSelect = useCollectionSelection<number, { id: number }>({
    items: sortedAlbumItems.map((i) => ({ id: i.snapshot_id })),
  })

  const deleteSnapshot = useMutation({
    mutationFn: (id: number) => snapshotsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snapshots'] }),
  })

  // IntersectionObserver for album items infinite scroll
  useEffect(() => {
    const sentinel = albumItemSentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setAlbumItemLimit((prev) => prev + 24)
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(sentinel)
    return () => observer.unobserve(sentinel)
  }, [currentAlbum, setAlbumItemLimit])

  // useAlbumDndOrder hook
  const { handleAlbumItemDragEnd } = useAlbumDndOrder({
    albumId: currentAlbum?.id ?? selectedAlbumId,
    sortedAlbumItems,
    sortDirection: albumSortDirection,
    multiSelect: albumItemMultiSelect,
    onUpdateOrder: updateAlbumOrder.mutate,
  })

  const handleAlbumItemClick = (snapshotId: number, event: React.MouseEvent) => {
    if (albumItemMultiSelect.isMultiSelectMode || event.ctrlKey || event.metaKey) {
      albumItemMultiSelect.handleItemClick(snapshotId, event)
    } else {
      const idx = sortedAlbumItems.findIndex((item) => item.snapshot_id === snapshotId)
      if (idx !== -1) {
        setModalPreviewIndex(idx)
        setIsModalPreviewOpen(true)
      }
    }
  }

  const lightboxImages =
    selectedAlbumId !== null
      ? sortedAlbumItems.map((item) => toSafeImageUrl(item.image_path))
      : sortedSnapshots.map((s) => toSafeImageUrl(s.image_path)) ?? []

  const lightboxSnapshotIds =
    selectedAlbumId !== null
      ? sortedAlbumItems.map((item) => item.snapshot_id)
      : sortedSnapshots.map((s) => s.id) ?? []

  const generateSceneDraft = async (payload: {
    snapshot_id: number;
    target_tag_set_id?: number | null;
    explicit_preset_id?: number | null;
  }) => {
    const res = await fetch('/api/speech/scene-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {selectedAlbumId !== null ? (
        <AlbumDetailView
          album={currentAlbum}
          sortedItems={sortedAlbumItems}
          visibleItems={visibleAlbumItems}
          sortCriterion={albumSortCriterion}
          sortDirection={albumSortDirection}
          onSortCriterionChange={setAlbumSortCriterion}
          onSortDirectionChange={setAlbumSortDirection}
          onBack={handleBackToAlbums}
          onRename={(newName) => {
            const targetId = currentAlbum?.id ?? selectedAlbumId
            if (targetId) updateAlbum.mutate({ id: targetId, name: newName })
          }}
          isRenaming={updateAlbum.isPending}
          onItemDragEnd={handleAlbumItemDragEnd}
          onOpenSpeechModal={setSelectedForSpeech}
          onOpenDeleteScopeModal={(snapshotIds) =>
            setAlbumDeleteTarget({ isOpen: true, snapshotIds })
          }
          onBulkDownload={(snapshotIds, zipName) =>
            handleBulkDownload(snapshotIds, zipName, true)
          }
          isDownloading={isDownloading}
          isDeletingItems={deleteAlbumItems.isPending}
          aspectRatioStyle={aspectRatioStyle}
          sentinelRef={albumItemSentinelRef as any}
          onItemClick={handleAlbumItemClick}
          isMultiSelectMode={albumItemMultiSelect.isMultiSelectMode}
          selectedIds={albumItemMultiSelect.selectedIds}
          onSelectAll={albumItemMultiSelect.selectAll}
          onClearSelection={albumItemMultiSelect.clearSelection}
          onEnterMultiSelectMode={albumItemMultiSelect.enterMultiSelectMode}
          onExitMultiSelectMode={albumItemMultiSelect.exitMultiSelectMode}
          isSelected={albumItemMultiSelect.isSelected}
          getLongPressHandlers={albumItemMultiSelect.getLongPressHandlers}
        />
      ) : (
        <>
          {/* Header */}
          <PageHeader
            title="History"
            icon={Clock}
            badge={<span className="text-xs text-zinc-500 font-normal">({view === 'snapshots' ? (allSnapshots?.length ?? snapshots?.length ?? 0) : (albums?.length ?? 0)})</span>}
            actions={
              <div className="flex items-center gap-2">
                {/* View Toggle */}
                <div className="flex rounded-lg overflow-hidden border border-[rgba(255,255,255,0.08)] flex-shrink-0">
                  {(['snapshots', 'albums'] as const).map((v) => (
                    <button
                      key={v}
                      id={`view-${v}`}
                      onClick={() => setView(v)}
                      className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors ${
                        view === v
                          ? 'bg-surface-2 text-zinc-200'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {v === 'snapshots'
                        ? `Snapshots (${allSnapshots?.length ?? snapshots?.length ?? 0})`
                        : `Albums (${albums?.length ?? 0})`}
                    </button>
                  ))}
                </div>

                <button
                  id="open-batch-speech-modal-btn"
                  onClick={() => setIsBatchSpeechModalOpen(true)}
                  className="flex items-center gap-1.5 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-[#7C6FDD] hover:text-[#9084e6] hover:bg-[#7C6FDD]/10 transition-all font-medium whitespace-nowrap"
                >
                  <Sparkles size={13} />
                  <span>セリフ一括変換</span>
                  {activeBatchJob &&
                    (activeBatchJob.status === 'processing' || activeBatchJob.status === 'pending') && (
                      <span className="ml-1 w-2 h-2 rounded-full bg-[#7C6FDD] animate-ping" />
                    )}
                </button>

                {!snapshotMultiSelect.isMultiSelectMode && view === 'snapshots' && (
                  <button
                    id="start-create-album"
                    onClick={() => snapshotMultiSelect.enterMultiSelectMode()}
                    className="flex items-center gap-1.5 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all whitespace-nowrap"
                  >
                    <BookOpen size={13} />
                    <span>Add to Album</span>
                  </button>
                )}
              </div>
            }
          />

          {/* MultiSelectToolbar for Snapshot List */}
          {snapshotMultiSelect.isMultiSelectMode && (
            <MultiSelectToolbar
              selectedCount={snapshotMultiSelect.selectedIds.size}
              totalCount={sortedSnapshots.length}
              onSelectAll={snapshotMultiSelect.selectAll}
              onClearSelection={snapshotMultiSelect.clearSelection}
              onExitMode={snapshotMultiSelect.exitMultiSelectMode}
              actions={
                <div className="flex gap-2">
                  <button
                    id="bulk-download-btn"
                    onClick={() => {
                      const now = new Date()
                      const pad = (n: number) => n.toString().padStart(2, '0')
                      const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
                        now.getDate()
                      )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
                      handleBulkDownload(
                        [...snapshotMultiSelect.selectedIds],
                        `${dateStr}.zip`,
                        false
                      )
                    }}
                    disabled={snapshotMultiSelect.selectedIds.size === 0 || isDownloading}
                    className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface border border-[rgba(255,255,255,0.08)] text-zinc-300 font-medium disabled:opacity-50 transition-all flex items-center gap-1"
                  >
                    <Download size={12} />
                    {isDownloading ? 'ダウンロード中...' : '一括ダウンロード'}
                  </button>
                  <button
                    id="save-album-btn"
                    onClick={() => setIsAddToAlbumModalOpen(true)}
                    disabled={snapshotMultiSelect.selectedIds.size === 0 || isDownloading}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[#7C6FDD] text-white font-medium disabled:opacity-50 hover:bg-[#6b5ec7] transition-all"
                  >
                    アルバムへ追加
                  </button>
                  <button
                    id="bulk-delete-snapshots-btn"
                    onClick={() => setIsDeleteSnapshotsModalOpen(true)}
                    disabled={snapshotMultiSelect.selectedIds.size === 0 || isDownloading}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 transition-all flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    一括削除
                  </button>
                </div>
              }
            />
          )}

          {view === 'snapshots' ? (
            <>
            <div className="px-5 py-2 text-xs text-zinc-400" data-testid="history-snapshot-count">
              表示中: {Math.min(snapshotLimit, sortedSnapshots.length)} / {allSnapshots?.length ?? snapshots?.length ?? 0}件
            </div>
            <SnapshotGalleryView
              snapshots={snapshots ?? []}
              workflows={workflows}
              loras={loras}
              tagSets={tagSets}
              selectedWorkflowId={selectedWorkflowId}
              setSelectedWorkflowId={setSelectedWorkflowId}
              selectedLoraId={selectedLoraId}
              setSelectedLoraId={setSelectedLoraId}
              selectedTagSetId={selectedTagSetId}
              setSelectedTagSetId={setSelectedTagSetId}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              snapshotLimit={snapshotLimit}
              setSnapshotLimit={setSnapshotLimit}
              aspectRatioStyle={aspectRatioStyle}
              multiSelect={snapshotMultiSelect}
              onOpenPreview={(idx) => {
                setModalPreviewIndex(idx)
                setIsModalPreviewOpen(true)
              }}
              onOpenSpeechModal={setSelectedForSpeech}
              onDeleteSnapshot={(id) => {
                if (confirm('Delete snapshot?')) deleteSnapshot.mutate(id)
              }}
            />
            </>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
              <AlbumListView
                albums={albums}
                isLoading={isLoadingAlbums}
                onSelectAlbum={setSelectedAlbumId}
                onDeleteAlbum={(id) => deleteAlbum.mutate(id)}
                onRenameAlbum={(id, name) => updateAlbum.mutate({ id, name })}
                onReorderAlbums={handleAlbumReorder}
                isRenaming={updateAlbum.isPending}
              />
            </div>
          )}
        </>
      )}

      <HistoryModalPreview
        isOpen={isModalPreviewOpen}
        onClose={() => setIsModalPreviewOpen(false)}
        images={lightboxImages}
        currentIndex={modalPreviewIndex}
        onChangeIndex={setModalPreviewIndex}
        snapshotIds={lightboxSnapshotIds}
      />

      <AddSnapshotToAlbumModal
        isOpen={isAddToAlbumModalOpen}
        onClose={() => setIsAddToAlbumModalOpen(false)}
        onConfirm={async ({ albumId, newAlbumName }) => {
          const snapshotIds = [...snapshotMultiSelect.selectedIds]
          await addToAlbumMutation.mutateAsync({
            albumId,
            newAlbumName,
            snapshotIds,
          })
          setIsAddToAlbumModalOpen(false)
          snapshotMultiSelect.exitMultiSelectMode()
        }}
        isPending={addToAlbumMutation.isPending}
        title="選択した画像をアルバムに追加"
        confirmText="追加"
        allowNone={false}
      />

      {selectedForSpeech && (
        <SpeechBubbleEditorModal
          snapshot={selectedForSpeech}
          initialAlbumId={selectedAlbumId ?? undefined}
          generateDraftApi={generateSceneDraft}
          onClose={() => setSelectedForSpeech(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['snapshots'] })
            if (selectedAlbumId !== null) {
              qc.invalidateQueries({ queryKey: ['album', selectedAlbumId] })
            }
            qc.invalidateQueries({ queryKey: ['albums'] })
          }}
        />
      )}

      <BatchSpeechTransformModal
        isOpen={isBatchSpeechModalOpen}
        onClose={() => setIsBatchSpeechModalOpen(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['snapshots'] })
          if (selectedAlbumId !== null) {
            qc.invalidateQueries({ queryKey: ['album', selectedAlbumId] })
          }
          qc.invalidateQueries({ queryKey: ['albums'] })
        }}
      />

      {/* 履歴スナップショット一括削除確認モーダル */}
      {isDeleteSnapshotsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-surface border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-scale-in">
            <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
              <Trash2 size={16} />
              スナップショットの一括削除
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              選択した{' '}
              <span className="font-bold text-white">
                {snapshotMultiSelect.selectedIds.size}
              </span>{' '}
              件のスナップショットおよび画像ファイルを完全に削除します。<br />
              この操作は取り消せません。本当によろしいですか？
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteSnapshotsModalOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-white/5 transition-all"
              >
                キャンセル
              </button>
              <button
                type="button"
                id="confirm-bulk-delete-btn"
                onClick={async () => {
                  const ids = [...snapshotMultiSelect.selectedIds]
                  await Promise.all(ids.map((id) => snapshotsApi.delete(id)))
                  qc.invalidateQueries({ queryKey: ['snapshots'] })
                  qc.invalidateQueries({ queryKey: ['albums'] })
                  setIsDeleteSnapshotsModalOpen(false)
                  snapshotMultiSelect.exitMultiSelectMode()
                }}
                className="px-3.5 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* アルバム削除スコープ選択モーダル */}
      {albumDeleteTarget.isOpen && (
        <Modal
          isOpen
          onClose={() => setAlbumDeleteTarget({ isOpen: false, snapshotIds: [] })}
          size="sm"
          ariaLabel={`アルバム「${currentAlbum?.name ?? ''}」の${albumDeleteTarget.snapshotIds.length}件の削除方法を選択`}
          dialogClassName="p-5 space-y-4 animate-scale-in"
        >
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Trash2 size={16} className="text-red-400" />
              アルバムからアイテムを削除
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {albumDeleteTarget.snapshotIds.length} 件のアイテムの削除方法を選択してください。
            </p>
            <div className="space-y-2 pt-2">
              <button
                type="button"
                id="album-remove-only-btn"
                onClick={async () => {
                  await albumsApi.deleteItems(selectedAlbumId!, albumDeleteTarget.snapshotIds)
                  qc.invalidateQueries({ queryKey: ['albums'] })
                  qc.invalidateQueries({ queryKey: ['album', selectedAlbumId] })
                  setAlbumDeleteTarget({ isOpen: false, snapshotIds: [] })
                  albumItemMultiSelect.exitMultiSelectMode()
                }}
                className="w-full text-left p-3 rounded-lg border border-[rgba(255,255,255,0.08)] bg-surface-2 hover:bg-white/5 transition-all group"
              >
                <div className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                  アルバムから削除
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  アルバムの登録のみ解除し、履歴（元画像）には残します。
                </div>
              </button>
              <button
                type="button"
                id="album-delete-all-btn"
                onClick={async () => {
                  await albumsApi.deleteItems(selectedAlbumId!, albumDeleteTarget.snapshotIds)
                  await Promise.all(
                    albumDeleteTarget.snapshotIds.map((id) => snapshotsApi.delete(id))
                  )
                  qc.invalidateQueries({ queryKey: ['snapshots'] })
                  qc.invalidateQueries({ queryKey: ['albums'] })
                  qc.invalidateQueries({ queryKey: ['album', selectedAlbumId] })
                  setAlbumDeleteTarget({ isOpen: false, snapshotIds: [] })
                  albumItemMultiSelect.exitMultiSelectMode()
                }}
                className="w-full text-left p-3 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 transition-all group"
              >
                <div className="text-xs font-semibold text-red-300 group-hover:text-red-200">
                  元画像ごと完全に削除
                </div>
                <div className="text-[11px] text-red-400/70 mt-0.5">
                  アルバムから解除し、履歴および元画像データも完全に削除します。
                </div>
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setAlbumDeleteTarget({ isOpen: false, snapshotIds: [] })}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-white/5 transition-all"
              >
                キャンセル
              </button>
            </div>
        </Modal>
      )}
    </div>
  )
}
