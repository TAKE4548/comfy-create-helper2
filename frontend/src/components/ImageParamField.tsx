import { Suspense, lazy, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { ImagePlus, Upload } from 'lucide-react'
import { refImagesApi } from '../api/domains/refImages'
import type { RefImageRead } from '../api/types'
import {
  ACCEPTED_REF_IMAGE_MIME,
  MAX_REF_IMAGE_BYTES,
  isRefImageToken,
  refImageThumbnailUrl,
} from '../utils/refImage'

// ParamPanel is imported by node-environment modules (constants only); the store and picker touch
// localStorage at module load, so both are loaded lazily and only when needed.
const RefImagePickerModal = lazy(() =>
  import('./RefImagePickerModal').then((m) => ({ default: m.RefImagePickerModal })),
)

export interface ImageParamFieldProps {
  label: string
  fieldKey: string
  value: string | undefined
  onChange: (token: string) => void
  mobile?: boolean
  disabled?: boolean
  workflowId?: number
  onPickerOpenChange?: (open: boolean) => void
}

const BTN_CLASS =
  'inline-flex items-center justify-center gap-1 min-h-11 min-w-11 px-3 rounded-lg border border-white/10 bg-surface-2 text-xs text-gray-200 touch-manipulation hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed'

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : ''
  return raw ? `アップロードに失敗しました: ${raw}` : 'アップロードに失敗しました'
}

export function ImageParamField({
  label,
  fieldKey,
  value,
  onChange,
  mobile = false,
  disabled = false,
  onPickerOpenChange,
  workflowId,
}: ImageParamFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [failedValue, setFailedValue] = useState<string | null>(null)
  const requestSeq = useRef(0)
  const mountedRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const changePicker = (open: boolean) => {
    setPickerOpen(open)
    onPickerOpenChange?.(open)
  }

  const reportError = (message: string) => {
    setError(message)
    void import('../store/useGenerationStore').then(({ useGenerationStore }) => {
      useGenerationStore.getState().setErrorToast({ message, type: 'error' })
    })
  }

  const handleFile = async (file: File | null | undefined) => {
    if (disabled || !file) return
    if (!(ACCEPTED_REF_IMAGE_MIME as readonly string[]).includes(file.type)) {
      reportError('画像ファイル（PNG / JPEG / WebP）を指定してください')
      return
    }
    if (file.size > MAX_REF_IMAGE_BYTES) {
      reportError('画像サイズが上限（20MB）を超えています')
      return
    }
    const seq = ++requestSeq.current
    setBusy(true)
    try {
      const res = await refImagesApi.upload(file, file.name)
      if (seq !== requestSeq.current || !mountedRef.current) return
      setError(null)
      setBusy(false)
      onChange(res.token)
    } catch (e) {
      if (seq !== requestSeq.current || !mountedRef.current) return
      setBusy(false)
      reportError(errorMessage(e))
    }
  }

  const handleSelected = (image: RefImageRead) => {
    requestSeq.current += 1
    setBusy(false)
    setError(null)
    onChange(image.token)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
    setDragOver(true)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    void handleFile(e.dataTransfer?.files?.[0])
  }

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const data = e.clipboardData
    let file: File | null | undefined = data?.files?.[0]
    if (!file) {
      const item = Array.from(data?.items ?? []).find(
        (it) => it.kind === 'file' && typeof it.type === 'string' && it.type.startsWith('image/'),
      )
      file = item?.getAsFile()
    }
    if (!file) return
    e.preventDefault()
    void handleFile(file)
  }

  const thumbSize = mobile ? 'w-14 h-14' : 'w-16 h-16'
  const thumbUrl = isRefImageToken(value) ? refImageThumbnailUrl(value) : null
  const previewFailed = thumbUrl !== null && failedValue === value
  const controlsDisabled = disabled || busy

  return (
    <div
      data-testid={`image-param-${fieldKey}`}
      tabIndex={0}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      className={`space-y-1 min-w-0 rounded-lg p-1 outline-none focus-visible:ring-1 focus-visible:ring-accent-green/60 ${
        dragOver ? 'ring-1 ring-accent-green bg-white/5' : ''
      }`}
    >
      <span className="block min-w-0 flex-1 truncate text-xs text-gray-300">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        {thumbUrl && !previewFailed ? (
          <img
            key={value}
            src={thumbUrl}
            alt="選択中の参照画像"
            className={`${thumbSize} shrink-0 object-cover rounded`}
            onError={() => setFailedValue(value ?? null)}
          />
        ) : (
          <div
            className={`${thumbSize} shrink-0 rounded border border-dashed border-white/20 flex items-center justify-center text-center text-[11px] text-gray-400 p-1`}
          >
            {previewFailed ? 'プレビューを表示できません' : '未指定'}
          </div>
        )}
        <div className="flex flex-wrap gap-2 min-w-0">
          <button type="button" className={BTN_CLASS} disabled={controlsDisabled} onClick={() => changePicker(true)}>
            <ImagePlus size={14} />
            履歴/スナップショットから選択
          </button>
          <button
            type="button"
            className={BTN_CLASS}
            disabled={controlsDisabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} />
            アップロード
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            void handleFile(file)
          }}
        />
      </div>
      {busy && <p className="text-xs text-gray-400">処理中…</p>}
      {error && (
        <p role="alert" className="text-xs text-red-400 break-words">
          {error}
        </p>
      )}
      {pickerOpen && (
        <Suspense fallback={null}>
          <RefImagePickerModal
            isOpen={pickerOpen}
            onClose={() => changePicker(false)}
            onSelected={handleSelected}
            workflowId={workflowId}
          />
        </Suspense>
      )}
    </div>
  )
}
