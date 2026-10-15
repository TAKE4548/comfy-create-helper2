import { useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import type { ParamTypeMaster } from '../api/types'
import { Modal } from './common/Modal'

export interface ParamTypeMasterManagerModalProps {
  isOpen: boolean
  items: ParamTypeMaster[]
  onClose: () => void
  onCreate: () => void
  onEdit: (item: ParamTypeMaster) => void
  onDelete: (item: ParamTypeMaster) => void
}

const ICON_BUTTON_CLASS =
  "relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800 touch-manipulation before:absolute before:-inset-2 before:content-['']"
const TEXT_BUTTON_CLASS =
  "relative inline-flex min-h-11 items-center justify-center rounded px-3 text-xs touch-manipulation before:absolute before:-inset-2 before:content-['']"

export function ParamTypeMasterManagerModal({
  isOpen,
  items,
  onClose,
  onCreate,
  onEdit,
  onDelete,
}: ParamTypeMasterManagerModalProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const handleClose = () => {
    setPendingDeleteId(null)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      ariaLabel="カスタム型マスタ管理"
      sheetMaxHeightClass="max-h-[85dvh]"
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">
          カスタム型マスタ管理 ({items.length})
        </h2>
        <button
          type="button"
          onClick={onCreate}
          className={`${TEXT_BUTTON_CLASS} shrink-0 whitespace-nowrap bg-indigo-600 text-white hover:bg-indigo-500`}
        >
          <Plus size={13} className="mr-1" />
          新規型を作成
        </button>
        <button type="button" aria-label="閉じる" onClick={handleClose} className={ICON_BUTTON_CLASS}>
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 py-2">
        {items.length === 0 ? (
          <p className="py-4 text-xs text-zinc-400">カスタム型マスターはまだ登録されていません。</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 py-1">
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-200" title={item.name}>
                  {item.name}
                </span>
                <span className="shrink-0 whitespace-nowrap rounded bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                  {item.widget_type}
                </span>
                {pendingDeleteId === item.id ? (
                  <div className="flex w-full items-center justify-end gap-2" data-testid={`delete-confirm-${item.id}`}>
                    <span className="min-w-0 flex-1 text-[11px] text-red-300">この型を削除しますか？</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingDeleteId(null)
                        onDelete(item)
                      }}
                      className={`${TEXT_BUTTON_CLASS} shrink-0 bg-red-600 text-white hover:bg-red-500`}
                    >
                      削除する
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                      className={`${TEXT_BUTTON_CLASS} shrink-0 bg-zinc-800 text-zinc-200 hover:bg-zinc-700`}
                    >
                      キャンセル
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={`${item.name} を編集`}
                      onClick={() => onEdit(item)}
                      className={ICON_BUTTON_CLASS}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${item.name} を削除`}
                      onClick={() => setPendingDeleteId(item.id)}
                      className={`${ICON_BUTTON_CLASS} text-red-300`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
