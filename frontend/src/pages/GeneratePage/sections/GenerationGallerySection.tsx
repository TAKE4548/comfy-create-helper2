import React, { useEffect, useRef, useState } from 'react'
import { Play, Pause, CheckSquare, Square, ImageOff, X } from 'lucide-react'
import { LazyThumbnail } from '../../../components/LazyThumbnail'
import { toThumbnailUrl } from '../../../utils/thumbnailUrl'
import { getPromptPrefix } from '../../../utils/formatUtils'
import type { useGalleryInteraction } from '../hooks/useGalleryInteraction'
import type { useGeneratePageState } from '../hooks/useGeneratePageState'

type StateProps = ReturnType<typeof useGeneratePageState>

export interface GenerationGallerySectionProps {
  state: StateProps
  gallery: ReturnType<typeof useGalleryInteraction>
  isMobile?: boolean
}

export const GenerationGallerySection: React.FC<GenerationGallerySectionProps> = ({
  state,
  gallery,
  isMobile = false,
}) => {
  const [thumbnailErrors, setThumbnailErrors] = useState<Set<string>>(() => new Set())
  const [retryVersions, setRetryVersions] = useState<Map<string, number>>(() => new Map())
  const ownerRef = useRef<object>({})
  const observedImagesRef = useRef(new Set<string>())
  const [availabilityRevision, setAvailabilityRevision] = useState(0)
  const {
    thumbnailTab,
    setThumbnailTab,
    sortOrder,
    setSortOrder,
    previewAutoFollow,
    handleToggleAutoFollow,
    filterOwnSession,
    setFilterOwnSession,
    sortedDisplayImages,
    otherSessionCount,
    isMultiSelectMode,
    selectedIds,
    selectAll,
    clearSelection,
    setIsSaveModalOpen,
    exitMultiSelectMode,
    isSelected,
    selectedImg,
    getSetNameForImage,
    sortedSnapshots,
    trialAvailability,
    residualHistoryStatus,
    retryResidualHistory,
  } = state

  useEffect(() => trialAvailability.subscribe(() => setAvailabilityRevision((revision) => revision + 1)), [trialAvailability])

  useEffect(() => {
    if (thumbnailTab !== 'history') {
      trialAvailability.releaseOwner(ownerRef.current)
      observedImagesRef.current.clear()
      return
    }
    const visibleImages = new Set(sortedDisplayImages)
    observedImagesRef.current.forEach((image) => { if (!visibleImages.has(image)) observedImagesRef.current.delete(image) })
    trialAvailability.retainOwnerImages(ownerRef.current, [...observedImagesRef.current])
  }, [sortedDisplayImages, thumbnailTab, trialAvailability])

  useEffect(() => () => trialAvailability.releaseOwner(ownerRef.current), [trialAvailability])

  const getImageIdentity = (imageUrl: string) => trialAvailability.getIdentity(imageUrl)
  const getAvailability = (imageUrl: string) => {
    void availabilityRevision
    return trialAvailability.getStatus(imageUrl) ?? 'present'
  }

  const handleThumbnailLoad = (_imageUrl: string) => {
    // REQ-379: ゼロプローブ方針によりサムネイル読込契機の原画availabilityプローブは行わない
  }

  const handleThumbnailError = (imageUrl: string) => {
    const identity = getImageIdentity(imageUrl)
    setThumbnailErrors((old) => new Set(old).add(identity?.key ?? imageUrl))
  }

  const retryThumbnail = (imageUrl: string, event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation()
    const identity = getImageIdentity(imageUrl)
    const key = identity?.key ?? imageUrl
    setThumbnailErrors((old) => new Set([...old].filter((item) => item !== key)))
    setRetryVersions((old) => new Map(old).set(key, (old.get(key) ?? 0) + 1))
  }

  const autoFollowId = isMobile
    ? 'preview-autofollow-toggle-mobile'
    : 'preview-autofollow-toggle-desktop'

  const sessionFilterId = isMobile
    ? 'session-filter-toggle-mobile'
    : 'session-filter-toggle'

  const renderHeader = () => (
    <div
      className={
        isMobile
          ? 'flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-1 flex-wrap gap-2'
          : 'flex-shrink-0 flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-1.5 mb-2'
      }
    >
      <div className={isMobile ? 'flex gap-3' : 'flex gap-4'}>
        {(['history', 'snapshots'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setThumbnailTab(tab)}
            className={
              isMobile
                ? `text-[11px] font-semibold pb-0.5 border-b-2 transition-all ${
                    thumbnailTab === tab
                      ? 'border-accent-green text-zinc-200'
                      : 'border-transparent text-zinc-500'
                  }`
                : `text-xs font-semibold pb-1 border-b-2 transition-all ${
                    thumbnailTab === tab
                      ? 'border-accent-green text-zinc-100'
                      : 'border-transparent text-zinc-500 hover:text-zinc-350'
                  }`
            }
          >
            {tab === 'history'
              ? isMobile
                ? '履歴'
                : '履歴 (History)'
              : isMobile
              ? 'スナップショット'
              : 'スナップショット (Snapshots)'}
          </button>
        ))}
      </div>
      <div className={isMobile ? 'flex items-center gap-2' : 'flex items-center gap-3'}>
        <div className="flex rounded-lg overflow-hidden border border-[rgba(255,255,255,0.08)] bg-zinc-950/20">
          {(['desc', 'asc'] as const).map((order) => (
            <button
              key={order}
              type="button"
              onClick={() => setSortOrder(order)}
              className={`px-2.5 py-1 text-[10px] sm:text-xs font-medium transition-colors ${
                sortOrder === order
                  ? 'bg-surface-2 text-zinc-200'
                  : isMobile
                  ? 'text-zinc-500 hover:text-zinc-300'
                  : 'text-zinc-500 hover:text-zinc-350'
              }`}
            >
              {order === 'desc' ? '新しい順' : '古い順'}
            </button>
          ))}
        </div>
        {handleToggleAutoFollow && (
          <button
            type="button"
            id={autoFollowId}
            onClick={handleToggleAutoFollow}
            className={`${
              isMobile ? 'p-1' : 'p-1.5'
            } rounded-lg transition-colors flex items-center justify-center ${
              previewAutoFollow
                ? 'bg-accent-green/10 border border-accent-green/40 hover:bg-accent-green/20 text-accent-green'
                : 'bg-zinc-800/80 border border-zinc-700 hover:bg-zinc-700/80 text-zinc-400 hover:text-white'
            }`}
            title={
              previewAutoFollow
                ? isMobile
                  ? '最新画像を自動追従中（タップで固定）'
                  : '最新画像を自動追従中（クリックで固定）'
                : isMobile
                ? '現在の画像に固定中（タップで自動追従）'
                : '現在の画像に固定中（クリックで自動追従）'
            }
            aria-label={
              previewAutoFollow
                ? isMobile
                  ? '最新画像を自動追従中（タップで固定）'
                  : '最新画像を自動追従中（クリックで固定）'
                : isMobile
                ? '現在の画像に固定中（タップで自動追従）'
                : '現在の画像に固定中（クリックで自動追従）'
            }
          >
            {previewAutoFollow ? (
              <Play size={isMobile ? 12 : 13} className="fill-accent-green" />
            ) : (
              <Pause size={isMobile ? 12 : 13} />
            )}
          </button>
        )}
        {thumbnailTab === 'history' && (
          <label
            className={
              isMobile
                ? 'flex items-center gap-1.5 cursor-pointer select-none'
                : 'flex items-center gap-2 cursor-pointer select-none'
            }
          >
            <input
              type="checkbox"
              id={sessionFilterId}
              checked={filterOwnSession}
              onChange={(e) => setFilterOwnSession(e.target.checked)}
              className={
                isMobile
                  ? 'w-3.5 h-3.5 rounded accent-accent-green cursor-pointer'
                  : 'w-3.5 h-3.5 rounded border-zinc-800 accent-accent-green cursor-pointer'
              }
            />
            <span className={isMobile ? 'text-[10px] text-zinc-500' : 'text-[11px] text-zinc-400'}>
              {isMobile ? '自セッションのみ' : '自セッションのみ表示'}
            </span>
          </label>
        )}
      </div>
    </div>
  )

  const renderMultiSelectBar = () => {
    if (!isMultiSelectMode) return null

    if (isMobile) {
      return (
        <div className="flex flex-col gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300">
          <div className="flex items-center justify-between">
            <span>{selectedIds.size}枚選択中</span>
            <div className="flex gap-2">
              <button type="button" onClick={selectAll} className="text-purple-400 underline">
                すべて選択
              </button>
              <button type="button" onClick={clearSelection} className="text-purple-400 underline">
                選択解除
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setIsSaveModalOpen(true)}
              disabled={selectedIds.size === 0}
              className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold text-center disabled:opacity-50"
            >
              選択した {selectedIds.size} 枚を保存
            </button>
            <button type="button" onClick={exitMultiSelectMode} aria-label="選択モード終了" className="text-zinc-400">
              <X aria-hidden="true" size={14} /> 閉じる
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 mb-2">
        <div className="flex items-center gap-2">
          <span>{selectedIds.size}枚選択中</span>
          <button
            type="button"
            onClick={selectAll}
            className="text-purple-400 hover:text-purple-200 font-semibold underline"
          >
            すべて選択
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="text-purple-400 hover:text-purple-200 font-semibold underline"
          >
            選択解除
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsSaveModalOpen(true)}
            disabled={selectedIds.size === 0}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            選択した {selectedIds.size} 枚を保存
          </button>
          <button
            type="button"
            onClick={exitMultiSelectMode}
            aria-label="選択モード終了"
            className="text-zinc-400 hover:text-zinc-200 font-semibold"
          >
            <X aria-hidden="true" size={14} /> 選択モード終了
          </button>
        </div>
      </div>
    )
  }

  const renderHistoryList = () => {
    const residualLabel = residualHistoryStatus === 'error' ? '履歴の追加確認に失敗' : residualHistoryStatus === 'partial' ? '一部の履歴を確認済み' : null
    const renderResidualStatus = () => residualLabel ? <p role="status" className="flex items-center gap-2 text-[10px] text-zinc-400">{residualLabel}<button type="button" onClick={(event) => { event.stopPropagation(); retryResidualHistory() }} className="underline underline-offset-2">再試行</button></p> : (residualHistoryStatus === 'waiting' || residualHistoryStatus === 'checking') ? <p role="status" className="text-[10px] text-zinc-500">履歴を確認中…</p> : null

    if (sortedDisplayImages.length > 0) {
      return (
        <div className={isMobile ? 'space-y-2' : 'h-full flex flex-col justify-between'}>
          {renderResidualStatus()}
          {renderMultiSelectBar()}
          <div
            ref={gallery.scrollContainerRef}
            onWheel={gallery.handleWheelScroll}
            className={
              isMobile
                ? 'flex gap-2 overflow-x-auto custom-scrollbar pb-1'
                : 'flex-1 min-h-0 flex gap-2 overflow-x-auto custom-scrollbar pb-1 items-center'
            }
          >
            {sortedDisplayImages.map((img, i) => {
              const isSel = isSelected(img)
              const itemProps = gallery.getThumbnailItemProps(img, i)
              const identity = getImageIdentity(img)
              const key = identity?.key ?? img
              const availability = getAvailability(img)
              const canInteract = availability !== 'missing'
              return (
                <button
                  key={img || i}
                  type="button"
                  id={isMobile ? `thumb-mobile-${i}` : `thumb-${i}`}
                  {...(canInteract ? itemProps : {})}
                  disabled={!canInteract}
                  style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
                  className={
                    isMobile
                      ? `flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all relative select-none ${
                          isMultiSelectMode
                            ? isSel
                              ? 'border-purple-500 ring-2 ring-purple-500/30'
                              : 'border-transparent'
                            : selectedImg === img
                            ? 'border-accent-green'
                            : 'border-transparent hover:border-zinc-600'
                        }`
                      : `flex-shrink-0 h-[85%] aspect-square max-h-[140px] min-h-[48px] rounded-md overflow-hidden border-2 transition-all relative select-none ${
                          isMultiSelectMode
                            ? isSel
                              ? 'border-purple-500 ring-2 ring-purple-500/30'
                              : 'border-transparent'
                            : selectedImg === img
                            ? 'border-accent-green'
                            : 'border-transparent hover:border-zinc-650'
                        }`
                  }
                >
                  <LazyThumbnail
                    key={`${img}:${retryVersions.get(getImageIdentity(img)?.key ?? img) ?? 0}`}
                    src={toThumbnailUrl(img)}
                    alt={`Generated ${i + 1}`}
                    containerRef={isMobile ? undefined : gallery.scrollContainerRef}
                    onLoad={() => handleThumbnailLoad(img)}
                    onError={() => handleThumbnailError(img)}
                    className="w-full h-full object-cover pointer-events-none select-none"
                    style={{ WebkitTouchCallout: 'none' }}
                  />
                  {thumbnailErrors.has(key) && (
                    <div className="absolute inset-0 flex items-end justify-center pb-1 pointer-events-none">
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="サムネイル再試行"
                        onClick={(event) => retryThumbnail(img, event)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') retryThumbnail(img, event)
                        }}
                        className="pointer-events-auto cursor-pointer rounded bg-black/75 px-1.5 py-0.5 text-[9px] text-zinc-100"
                      >
                        サムネイル再試行
                      </span>
                    </div>
                  )}
                  {getSetNameForImage(img) && (
                    <span
                      className={`absolute top-0.5 left-0.5 bg-black/75 text-accent-green ${
                        isMobile ? 'text-[7px]' : 'text-[8px]'
                      } font-bold px-1 rounded select-none truncate max-w-[90%] font-medium`}
                    >
                      {getSetNameForImage(img)}
                    </span>
                  )}
                  {isMultiSelectMode && (
                    <div
                      className={`absolute top-0.5 right-0.5 z-10 p-0.5 rounded bg-black/60 text-purple-400 border border-[rgba(255,255,255,0.08)]`}
                    >
                      {isSel ? (
                        <CheckSquare size={isMobile ? 10 : 12} />
                      ) : (
                        <Square size={isMobile ? 10 : 12} />
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    if (filterOwnSession && otherSessionCount > 0) {
      return (
        <div
          className={
            isMobile
              ? 'flex flex-col items-center justify-center py-3 gap-1.5 text-center'
              : 'flex flex-col items-center justify-center py-4 gap-2 text-center h-full'
          }
        >
          <p className={isMobile ? 'text-[11px] text-zinc-400' : 'text-xs text-zinc-400'}>
            他セッションの履歴（{otherSessionCount}件）があります
          </p>
          <button
            type="button"
            onClick={() => setFilterOwnSession(false)}
            className={
              isMobile
                ? 'px-2.5 py-0.5 bg-surface-2 border border-accent-green/30 text-accent-green hover:bg-accent-green/10 rounded text-[10px] font-semibold transition-all'
                : 'px-3 py-1 bg-surface-2 border border-accent-green/30 text-accent-green hover:bg-accent-green/10 rounded text-xs font-semibold transition-all'
            }
          >
            自セッションのみ表示を解除
          </button>
        </div>
      )
    }

    return <div className="space-y-2">{renderResidualStatus()}<p className={isMobile ? 'text-[10px] text-zinc-500 py-1' : 'text-xs text-zinc-600 py-2'}>No history images found for this session.</p></div>
  }

  const renderSnapshotsList = () => {
    if (sortedSnapshots && sortedSnapshots.length > 0) {
      return (
        <div
          className={
            isMobile
              ? 'flex gap-2 overflow-x-auto custom-scrollbar pb-1'
              : 'flex gap-2 overflow-x-auto custom-scrollbar pb-1 h-full items-center'
          }
        >
          {sortedSnapshots.map((snap) => (
            <button
              key={snap.id}
              type="button"
              onClick={() => gallery.handleSnapshotClick(snap.id)}
              className={
                isMobile
                  ? 'flex-shrink-0 flex flex-col items-center gap-1 p-1 rounded border border-[rgba(255,255,255,0.06)] bg-surface-2/40 hover:bg-surface-2 transition-all w-20 group'
                  : 'flex-shrink-0 flex flex-col items-center gap-1 p-1 rounded-md border border-[rgba(255,255,255,0.06)] hover:border-accent-green/45 bg-surface-2/40 hover:bg-surface-2 transition-all h-[90%] aspect-[4/5] max-h-[140px] min-h-[64px] group'
              }
            >
              <div
                className={
                  isMobile
                    ? 'w-16 h-16 rounded overflow-hidden bg-black/40'
                    : 'flex-1 w-full rounded overflow-hidden bg-black/40 min-h-0'
                }
              >
                {snap.image_path || snap.thumbnail_path ? (
                  <img
                    src={snap.thumbnail_path || snap.image_path!}
                    alt="Snapshot"
                    loading="lazy"
                    decoding="async"
                    className={
                      isMobile
                        ? 'w-full h-full object-cover'
                        : 'w-full h-full object-cover group-hover:scale-105 transition-transform'
                    }
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-650">
                    <ImageOff size={isMobile ? 14 : 16} />
                  </div>
                )}
              </div>
              <span
                className={
                  isMobile
                    ? 'text-[8px] text-zinc-450 text-center truncate w-full font-mono'
                    : 'text-[9px] text-zinc-450 text-center truncate w-full font-mono flex-shrink-0 mt-1'
                }
              >
                {getPromptPrefix(snap.params) || `Snap #${snap.id}`}
              </span>
            </button>
          ))}
        </div>
      )
    }

    return (
      <p
        className={
          isMobile
            ? 'text-[10px] text-zinc-500 py-1 italic'
            : 'text-xs text-zinc-555 py-2 italic'
        }
      >
        {isMobile ? 'No snapshots available.' : 'No snapshots available for this workflow.'}
      </p>
    )
  }

  if (isMobile) {
    return (
      <div className="border-b border-[rgba(255,255,255,0.06)] bg-surface px-4 py-2 space-y-2">
        {renderHeader()}
        {thumbnailTab === 'history' ? renderHistoryList() : renderSnapshotsList()}
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-surface px-4 py-3 flex flex-col overflow-hidden">
      {renderHeader()}
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {thumbnailTab === 'history' ? renderHistoryList() : renderSnapshotsList()}
      </div>
    </div>
  )
}
