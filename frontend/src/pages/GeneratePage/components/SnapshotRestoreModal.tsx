import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, Check, RotateCcw, AlertCircle, ImageOff, Loader2 } from 'lucide-react'
import { Modal } from '../../../components/common/Modal'
import { snapshotsApi } from '../../../api/domains/snapshots'
import type { Snapshot } from '../../../api/types'
import type { SnapshotSummaryWithParams } from '../hooks/useGenerateDisplayState'
import { formatDateTime, getPromptPrefix } from '../../../utils/formatUtils'
import { toThumbnailUrl } from '../../../utils/thumbnailUrl'

export interface SnapshotRestoreModalProps {
  isOpen: boolean
  onClose: () => void
  snapshots: SnapshotSummaryWithParams[]
  initialSnapshotId?: number | null
  onRestore: (snapshotId: number) => Promise<boolean>
}

function extractPromptTexts(params?: Record<string, unknown> | null): {
  positive: string
  negative: string
} {
  if (!params) return { positive: '', negative: '' }
  let positive = ''
  let negative = ''

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue
    const lower = key.toLowerCase()
    if (lower.includes('negative')) {
      if (!negative && typeof value === 'string') {
        negative = value
      }
    } else if (lower.includes('positive') || lower.includes('prompt')) {
      if (!positive && typeof value === 'string') {
        positive = value
      }
    }
  }
  return { positive, negative }
}

function extractParamExcerpt(params?: Record<string, unknown> | null): Array<[string, string]> {
  if (!params) return []
  const entries: Array<[string, string]> = []
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    const lower = key.toLowerCase()
    if (lower.includes('positive') || lower.includes('negative') || lower.includes('prompt')) {
      continue
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      entries.push([key, String(value)])
    }
    if (entries.length >= 8) break
  }
  return entries
}

export const SnapshotRestoreModal: React.FC<SnapshotRestoreModalProps> = ({
  isOpen,
  onClose,
  snapshots,
  initialSnapshotId,
  onRestore,
}) => {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<Snapshot | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const isRestoringRef = useRef(false)
  const detailRequestIdRef = useRef(0)

  // Initialize selection and clear transient error states when opening
  useEffect(() => {
    if (!isOpen) return
    setRestoreError(null)
    setDetailError(null)
    setDetail(null)

    const hasInitial =
      initialSnapshotId != null && snapshots.some((s) => s.id === initialSnapshotId)
    if (hasInitial) {
      setSelectedId(initialSnapshotId!)
    } else if (snapshots.length > 0) {
      setSelectedId(snapshots[0].id)
    } else {
      setSelectedId(null)
    }
  }, [isOpen, initialSnapshotId, snapshots])

  // Fetch full snapshot details on selection change (read-only, never mutates store)
  useEffect(() => {
    if (!isOpen || selectedId == null) {
      setDetail(null)
      setIsLoadingDetail(false)
      return
    }

    const requestId = ++detailRequestIdRef.current
    setIsLoadingDetail(true)
    setDetailError(null)

    snapshotsApi
      .get(selectedId)
      .then((res) => {
        if (detailRequestIdRef.current !== requestId) return
        setDetail(res)
      })
      .catch(() => {
        if (detailRequestIdRef.current !== requestId) return
        setDetail(null)
        setDetailError('スナップショット詳細の取得に失敗しました。')
      })
      .finally(() => {
        if (detailRequestIdRef.current !== requestId) return
        setIsLoadingDetail(false)
      })
  }, [isOpen, selectedId])

  const selectedSummary = useMemo(
    () => snapshots.find((s) => s.id === selectedId) ?? null,
    [snapshots, selectedId]
  )

  const activeParams = useMemo(
    () => (detail && detail.id === selectedId ? detail.params : selectedSummary?.params) ?? null,
    [detail, selectedId, selectedSummary]
  )

  const { positive: positivePrompt, negative: negativePrompt } = useMemo(
    () => extractPromptTexts(activeParams),
    [activeParams]
  )

  const paramExcerpt = useMemo(() => extractParamExcerpt(activeParams), [activeParams])

  if (!isOpen) return null

  const handleSelectSnapshot = (id: number) => {
    setSelectedId(id)
    setRestoreError(null)
  }

  const handleRestoreClick = async () => {
    if (selectedId == null || isRestoringRef.current) return
    isRestoringRef.current = true
    setIsRestoring(true)
    setRestoreError(null)

    try {
      const ok = await onRestore(selectedId)
      if (ok) {
        onClose()
      } else {
        setRestoreError('スナップショットの復元に失敗しました。')
      }
    } catch {
      setRestoreError('スナップショットの復元中にエラーが発生しました。')
    } finally {
      isRestoringRef.current = false
      setIsRestoring(false)
    }
  }

  const previewRawUrl =
    (detail && detail.id === selectedId ? detail.image_path || detail.thumbnail_path : null) ||
    selectedSummary?.image_path ||
    selectedSummary?.thumbnail_path ||
    null
  const previewImageUrl = previewRawUrl ? toThumbnailUrl(previewRawUrl, 512) : ''
  const previewCreatedAt =
    (detail && detail.id === selectedId ? detail.created_at : null) ||
    selectedSummary?.created_at ||
    ''

  const loraCount = detail && detail.id === selectedId ? (detail.loras?.length ?? 0) : null
  const tagSetCount = detail && detail.id === selectedId ? (detail.tag_sets?.length ?? 0) : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      ariaLabel="スナップショットから復元"
      dialogClassName="md:max-w-4xl lg:max-w-5xl md:max-h-[85dvh] overflow-hidden flex flex-col bg-surface"
      sheetMaxHeightClass="max-h-[88dvh]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <RotateCcw size={18} className="text-emerald-400 shrink-0" />
          <h2 className="text-sm font-semibold text-zinc-100 truncate">
            スナップショットから復元
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors touch-manipulation"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* Left: Thumbnail Grid */}
        <div className="md:w-3/5 flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 border-b md:border-b-0 md:border-r border-white/10">
          {snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400 text-xs">
              復元可能なスナップショットがありません。
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {snapshots.map((snapshot) => {
                const isSelected = snapshot.id === selectedId
                const thumbRaw = snapshot.thumbnail_path || snapshot.image_path
                const thumbUrl = thumbRaw ? toThumbnailUrl(thumbRaw, 384) : ''
                const promptSnippet = getPromptPrefix(snapshot.params)

                return (
                  <button
                    key={snapshot.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleSelectSnapshot(snapshot.id)}
                    className={`group relative flex flex-col text-left rounded-xl overflow-hidden border transition-all touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                      isSelected
                        ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-500/10'
                        : 'border-white/10 bg-surface-2 hover:border-white/25'
                    }`}
                  >
                    <div className="relative aspect-[3/4] w-full bg-black/30 overflow-hidden">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={`スナップショット #${snapshot.id}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500">
                          <ImageOff size={24} />
                        </div>
                      )}
                      {isSelected && (
                        <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-600 text-white shadow">
                          <Check size={12} />
                          選択中
                        </span>
                      )}
                    </div>
                    <div className="p-2 flex items-center gap-1.5 min-w-0 w-full">
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">
                        {promptSnippet || formatDateTime(snapshot.created_at)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: Preview Pane */}
        <div className="md:w-2/5 min-h-0 overflow-y-auto overscroll-contain p-4 bg-surface-2/40 flex flex-col gap-3">
          {detailError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
              <span>{detailError}</span>
            </div>
          )}

          {restoreError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
              <span>{restoreError}</span>
            </div>
          )}

          {selectedSummary ? (
            <>
              <div className="relative aspect-square w-full max-h-56 rounded-lg overflow-hidden bg-black/30 border border-white/10 shrink-0">
                {previewImageUrl ? (
                  <img
                    src={previewImageUrl}
                    alt={`選択中のスナップショット #${selectedSummary.id}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">
                    画像なし
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>作成日時: {formatDateTime(previewCreatedAt)}</span>
                {isLoadingDetail && (
                  <span className="inline-flex items-center gap-1 text-zinc-400">
                    <Loader2 size={12} className="animate-spin" />
                    読込中...
                  </span>
                )}
              </div>

              {/* LoRA / TagSet counts */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-zinc-200">
                  LoRA: {loraCount !== null ? `${loraCount}件` : isLoadingDetail ? '読込中...' : '-'}
                </span>
                <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-zinc-200">
                  TagSet: {tagSetCount !== null ? `${tagSetCount}件` : isLoadingDetail ? '読込中...' : '-'}
                </span>
              </div>

              {/* Prompt */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-zinc-400">プロンプト</div>
                <div className="rounded-lg bg-black/25 border border-white/10 p-2.5 text-xs text-zinc-100 whitespace-pre-wrap break-words">
                  {positivePrompt || '（プロンプトなし）'}
                </div>
                {negativePrompt && (
                  <>
                    <div className="text-[11px] font-semibold text-zinc-400">ネガティブプロンプト</div>
                    <div className="rounded-lg bg-black/25 border border-white/10 p-2.5 text-xs text-zinc-300 whitespace-pre-wrap break-words">
                      {negativePrompt}
                    </div>
                  </>
                )}
              </div>

              {/* Parameter Excerpt */}
              {paramExcerpt.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-zinc-400">パラメータ抜粋</div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-black/25 border border-white/10 p-2.5 text-xs">
                    {paramExcerpt.map(([key, val]) => (
                      <div key={key} className="min-w-0 flex items-center gap-1">
                        <dt className="text-zinc-400 truncate">{key}:</dt>
                        <dd className="text-zinc-200 truncate font-mono">{val}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-zinc-400 py-8 text-center">
              スナップショットを選択してください。
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 bg-surface-2 border-t border-white/10 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 px-4 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleRestoreClick}
          disabled={selectedId === null || isRestoring || snapshots.length === 0}
          className="min-h-11 px-4 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors inline-flex items-center gap-1.5 touch-manipulation"
        >
          {isRestoring ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              復元中...
            </>
          ) : (
            'アクティブプリセットに復元'
          )}
        </button>
      </div>
    </Modal>
  )
}