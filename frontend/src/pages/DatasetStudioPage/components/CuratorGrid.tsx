import React, { useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { DatasetItem } from '../../../api/types'
import { datasetApi } from '../../../api/client'
import { Modal } from '../../../components/common/Modal'
import { useStudioStore } from '../useStudioStore'
import { CaptionEditorCard } from './CaptionEditorCard'

export interface CuratorGridProps {
  onRerollPrompt?: (prompt: string, seed: number) => Promise<{ image_path: string }>
}

export const CuratorGrid: React.FC<CuratorGridProps> = ({ onRerollPrompt }) => {
  const {
    items,
    activeProject,
    updateItemStatus,
    updateItemCaption,
    updateItemImage,
  } = useStudioStore()

  const [isExporting, setIsExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<DatasetItem | null>(null)
  const cardRefs = useRef(new Map<number, HTMLDivElement>())

  const handleToggleStatus = (item: DatasetItem) => {
    const nextStatus = item.status === 'APPROVED' ? 'REJECTED' : 'APPROVED'
    updateItemStatus(item.id, nextStatus as 'APPROVED' | 'REJECTED')
  }

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, item: DatasetItem, index: number) => {
    const target = event.target as HTMLElement
    if (target.closest('button, input, textarea, select, [contenteditable="true"]')) return

    switch (event.key.toLowerCase()) {
      case 'x':
      case 'arrowdown':
        event.preventDefault()
        handleToggleStatus(item)
        break
      case 'a':
      case 'arrowup':
        if (item.status === 'REJECTED') {
          event.preventDefault()
          updateItemStatus(item.id, 'APPROVED')
        }
        break
      case 'arrowleft':
        event.preventDefault()
        cardRefs.current.get(index - 1)?.focus()
        break
      case 'arrowright':
        event.preventDefault()
        cardRefs.current.get(index + 1)?.focus()
        break
      case ' ':
        event.preventDefault()
        setPreviewItem(item)
        break
    }
  }

  const handleSingleReroll = async (item: DatasetItem) => {
    const newSeed = Math.floor(Math.random() * 1000000000)
    updateItemStatus(item.id, 'REROLLING' as any)
    try {
      if (onRerollPrompt) {
        const res = await onRerollPrompt(item.raw_prompt, newSeed)
        updateItemImage(item.slot_index, res.image_path)
      } else {
        // Fallback / mock reroll update
        const fakeImagePath = `/outputs/reroll_${item.slot_index}_${newSeed}.png`
        updateItemImage(item.slot_index, fakeImagePath)
      }
      updateItemStatus(item.id, 'APPROVED')
    } catch {
      updateItemStatus(item.id, 'REJECTED')
    }
  }

  const handleExport = async () => {
    if (!activeProject) return
    setIsExporting(true)
    setExportMessage(null)
    try {
      const res = await datasetApi.exportDataset(activeProject.id)
      setExportMessage(`エクスポート完了: ${res.item_count ?? 0}件 (${res.export_dir})`)
    } catch (err: any) {
      setExportMessage(`エクスポート失敗: ${err.message || 'Error'}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between bg-slate-800/80 p-3 rounded-lg border border-slate-700">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">
            Step 2: キュレーション & キャプション ({items.length}件)
          </h2>
          <p className="text-xs text-slate-400">
            採用/除外の判定、単発リロール、キャプションの編集を行います
          </p>
        </div>
        <div className="flex items-center gap-3">
          {exportMessage && (
            <span data-testid="export-message" className="text-xs text-blue-400">
              {exportMessage}
            </span>
          )}
          <button
            type="button"
            data-testid="export-dataset-button"
            disabled={isExporting || !activeProject}
            onClick={handleExport}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded text-xs font-medium transition-colors"
          >
            {isExporting ? '出力中...' : '学習用フォルダ一括出力'}
          </button>
        </div>
      </div>

      <div data-testid="curator-grid" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((item, index) => {
          const isApproved = item.status === 'APPROVED'
          const isRejected = item.status === 'REJECTED'
          const isRerolling = item.status === 'REROLLING'

          return (
            <div
              key={item.id}
              data-testid={`curator-item-${item.id}`}
              ref={(element) => {
                if (element) cardRefs.current.set(index, element)
                else cardRefs.current.delete(index)
              }}
              tabIndex={0}
              role="group"
              aria-label={`Slot ${item.slot_index + 1} ${item.status}`}
              onKeyDown={(event) => handleCardKeyDown(event, item, index)}
              className={`flex flex-col bg-slate-800 rounded-lg border p-3 gap-2 transition-all ${
                isApproved
                  ? 'border-emerald-500/30'
                  : isRejected
                  ? 'border-amber-500/70 ring-1 ring-amber-500/20'
                  : 'border-slate-700'
              }`}
            >
              {/* Header: Slot number & Status Badge & Reroll Button */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-slate-300">
                  #{item.slot_index + 1}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid={`reroll-button-${item.id}`}
                    aria-label="単発リロール"
                    disabled={isRerolling}
                    onClick={() => handleSingleReroll(item)}
                    title="単発リロール"
                    className="min-h-11 min-w-11 p-1 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-testid={`status-badge-${item.id}`}
                    onClick={() => handleToggleStatus(item)}
                    className={`min-h-11 px-2 rounded text-[10px] font-bold tracking-wide uppercase transition-colors ${
                      isRerolling
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : isApproved
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                    }`}
                  >
                    {item.status}
                  </button>
                </div>
              </div>

              {/* Thumbnail Image */}
              <div className="relative aspect-square w-full bg-slate-900 rounded overflow-hidden flex items-center justify-center border border-slate-700/50">
                {item.image_path ? (
                  <img
                    src={item.image_path}
                    alt={`Slot ${item.slot_index + 1}`}
                    className="w-full h-full object-cover"
                    data-testid={`item-image-${item.id}`}
                  />
                ) : (
                  <span className="text-xs text-slate-500 font-mono">No Image</span>
                )}
                {isRerolling && (
                  <div className="absolute inset-0 bg-slate-950/70 flex items-center justify-center text-xs text-amber-300 font-medium">
                    生成中...
                  </div>
                )}
              </div>

              {/* Caption Editor */}
              <CaptionEditorCard
                itemId={item.id}
                slotIndex={item.slot_index}
                caption={item.caption_text}
                onChange={(val) => updateItemCaption(item.id, val)}
              />
            </div>
          )
        })}
      </div>
      <Modal
        isOpen={previewItem !== null}
        onClose={() => setPreviewItem(null)}
        size="7xl"
        ariaLabel="画像プレビュー"
      >
        {previewItem?.image_path && (
          <img
            src={previewItem.image_path}
            alt={`Slot ${previewItem.slot_index + 1} preview`}
            className="max-h-[85vh] max-w-full object-contain mx-auto"
          />
        )}
      </Modal>
    </div>
  )
}
