import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Modal } from './common/Modal'
import { refImagesApi } from '../api/domains/refImages'
import { snapshotsApi } from '../api/domains/snapshots'
import type { RefImageRead } from '../api/types'
import { useGenerationStore } from '../store/useGenerationStore'
import { parseHistoryImageUrl } from '../utils/refImage'
import { toThumbnailUrl } from '../utils/thumbnailUrl'

export interface RefImagePickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelected: (image: RefImageRead) => void
  workflowId?: number
}

type Tab = 'history' | 'snapshot'

const TAB_BASE = 'shrink-0 whitespace-nowrap min-h-11 min-w-11 px-4 text-xs touch-manipulation border-b-2'
const TILE_CLASS =
  'aspect-square min-h-11 min-w-11 overflow-hidden rounded-lg border border-white/10 bg-surface-2 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed'

export function RefImagePickerModal({ isOpen, onClose, onSelected, workflowId }: RefImagePickerModalProps) {
  const historyImages = useGenerationStore((s) => s.comfyHistoryImages)
  const [tab, setTab] = useState<Tab>('history')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const snapshotsQuery = useQuery({
    queryKey: ['snapshots', { workflow_id: workflowId ?? null }],
    queryFn: () => snapshotsApi.list({ workflow_id: workflowId }),
    enabled: isOpen,
  })
  const snapshots = (snapshotsQuery.data ?? []).filter((s) => Boolean(s.image_path))

  const run = async (task: () => Promise<RefImageRead>) => {
    setBusy(true)
    setError(null)
    try {
      const res = await task()
      setBusy(false)
      onSelected(res)
      onClose()
    } catch (e) {
      setBusy(false)
      const raw = e instanceof Error ? e.message : ''
      setError(raw ? `画像の取り込みに失敗しました: ${raw}` : '画像の取り込みに失敗しました')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" ariaLabel="参照画像を選択" sheetMaxHeightClass="max-h-[85dvh]">
      <div className="flex items-center justify-between gap-2 px-4 pt-2 min-w-0">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">参照画像を選択</h2>
        <button
          type="button"
          aria-label="閉じる"
          className="inline-flex items-center justify-center min-h-11 min-w-11 touch-manipulation text-gray-300 hover:text-white"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div role="tablist" className="flex overflow-x-auto px-4 border-b border-white/10">
        {([
          ['history', '生成履歴'],
          ['snapshot', 'スナップショット'],
        ] as const).map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`${TAB_BASE} ${tab === key ? 'border-accent-green text-white' : 'border-transparent text-gray-400'}`}
            onClick={() => setTab(key)}
          >
            {text}
          </button>
        ))}
      </div>
      <div data-testid="ref-picker-scroll" className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-2">
        {error && (
          <p role="alert" className="text-xs text-red-400 break-words">
            {error}
          </p>
        )}
        {tab === 'history' &&
          (historyImages.length === 0 ? (
            <p className="text-xs text-gray-400">生成履歴がありません</p>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {historyImages.map((url, i) => {
                const parsed = parseHistoryImageUrl(url)
                return (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    data-testid={`ref-picker-history-${i}`}
                    className={TILE_CLASS}
                    disabled={busy || parsed === null}
                    onClick={() => parsed && void run(() => refImagesApi.importFromHistory(parsed))}
                  >
                    <img src={toThumbnailUrl(url)} alt="" className="w-full h-full object-cover" />
                  </button>
                )
              })}
            </div>
          ))}
        {tab === 'snapshot' &&
          (snapshotsQuery.isLoading ? (
            <p className="text-xs text-gray-400">読み込み中…</p>
          ) : snapshotsQuery.isError ? (
            <p role="alert" className="text-xs text-red-400 break-words">
              スナップショットの取得に失敗しました
            </p>
          ) : snapshots.length === 0 ? (
            <p className="text-xs text-gray-400">スナップショットがありません</p>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {snapshots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  data-testid={`ref-picker-snapshot-${s.id}`}
                  className={TILE_CLASS}
                  disabled={busy}
                  onClick={() => void run(() => refImagesApi.importFromSnapshot(s.id))}
                >
                  <img src={s.thumbnail_path ?? s.image_path ?? ''} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          ))}
        {busy && <p className="text-xs text-gray-400">処理中…</p>}
      </div>
    </Modal>
  )
}
