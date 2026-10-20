import React, { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2, X, Plus } from 'lucide-react'
import type { Category } from '../../api/types'
import { tagsetCategoriesApi } from '../../api/client'
import { CategorySelect } from '../common/CategorySelect'
import { BaseModelSelect } from '../common/BaseModelSelect'
import { ImageCropper } from '../ImageCropper'
import { useThumbnailAspectRatio } from '../../hooks/useThumbnailAspectRatio'
import { TagChipEditor } from '../TagChipEditor'
import { TAGSET_SUBSET_CLIENT_ID, type TagSetFormState } from './types'

const FORM_INPUT = 'w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent-green/60'

export function parseTagSetTokens(text: string): string[] {
  const tokens: string[] = []
  const stack: string[] = []
  let current = ''
  for (const char of text) {
    if ((char === ',' || char === '\n' || char === '\r') && stack.length === 0) {
      tokens.push(current)
      current = ''
      continue
    }
    if (char === '(') stack.push(')')
    else if (char === '[') stack.push(']')
    else if ((char === ')' || char === ']') && stack[stack.length - 1] === char) stack.pop()
    current += char
  }
  tokens.push(current)
  const unique = new Set<string>()
  return tokens.map((token) => token.trim().replace(/_/g, ' ')).filter((token) => {
    if (!token || unique.has(token)) return false
    unique.add(token)
    return true
  })
}

function appendTagSetPaste(current: string, pasted: string): string {
  const existing = new Set(parseTagSetTokens(current))
  const additions = parseTagSetTokens(pasted).filter((token) => {
    if (existing.has(token)) return false
    existing.add(token)
    return true
  })
  return [current.trim(), ...additions].filter(Boolean).join(', ')
}

export function TagSetFormFields({
  form,
  setForm,
  idPrefix,
  categories,
  onCategoryCreated,
  onUploadImage,
}: {
  form: TagSetFormState
  setForm: React.Dispatch<React.SetStateAction<TagSetFormState>>
  idPrefix: string
  categories?: Category[]
  onCategoryCreated: (cat: Category) => void
  onUploadImage?: (src: string) => void
}) {
  const { numericRatio } = useThumbnailAspectRatio()
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [subsetCrop, setSubsetCrop] = useState<{ targetId: string; src: string; requestId: number } | null>(null)
  const [subsetUploadErrors, setSubsetUploadErrors] = useState<Record<string, string>>({})
  const [uploadingSubsetIds, setUploadingSubsetIds] = useState<Set<string>>(new Set())
  const subsetIdCounter = useRef(0)
  const uploadRequestCounter = useRef(0)
  const formRef = useRef(form)
  formRef.current = form

  const createSubsetId = () => `${idPrefix}-subset-${++subsetIdCounter.current}`

  useEffect(() => {
    setForm((current) => {
      const subsets = current.subsets || []
      if (subsets.every((subset) => subset[TAGSET_SUBSET_CLIENT_ID])) return current
      return {
        ...current,
        subsets: subsets.map((subset) => subset[TAGSET_SUBSET_CLIENT_ID]
          ? subset
          : { ...subset, [TAGSET_SUBSET_CLIENT_ID]: createSubsetId() }),
      }
    })
  }, [form.subsets, setForm])

  const subsetExists = (targetId: string) => (formRef.current.subsets || [])
    .some((subset) => subset[TAGSET_SUBSET_CLIENT_ID] === targetId)

  const handleSubsetCropComplete = async (targetId: string, requestId: number, blob: Blob) => {
    if (!subsetExists(targetId)) return
    setUploadingSubsetIds((current) => new Set(current).add(targetId))
    setSubsetUploadErrors((current) => {
      const next = { ...current }
      delete next[targetId]
      return next
    })
    try {
      const formData = new FormData()
      formData.append('file', blob, 'cropped.jpg')
      const response = await fetch('/api/snapshots/upload', { method: 'POST', body: formData })
      if (!response.ok) throw new Error('Upload failed')
      const data = await response.json()
      const imagePath = data.thumbnail_path || data.image_path
      if (typeof imagePath !== 'string' || !imagePath) throw new Error('Upload response missing image path')
      if (!subsetExists(targetId)) return
      setForm((current) => ({
        ...current,
        subsets: (current.subsets || []).map((subset) => subset[TAGSET_SUBSET_CLIENT_ID] === targetId
          ? { ...subset, thumbnail_path: imagePath }
          : subset),
      }))
      setSubsetCrop((current) => current?.requestId === requestId ? null : current)
    } catch (error) {
      console.error(error)
      if (subsetExists(targetId)) {
        setSubsetUploadErrors((current) => ({ ...current, [targetId]: '画像のアップロードに失敗しました' }))
      }
    } finally {
      setUploadingSubsetIds((current) => {
        const next = new Set(current)
        next.delete(targetId)
        return next
      })
    }
  }

  const handleCropComplete = async (blob: Blob) => {
    try {
      const formData = new FormData()
      formData.append('file', blob, 'cropped.jpg')
      const res = await fetch('/api/snapshots/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      setForm((f) => ({ ...f, thumbnail_path: data.thumbnail_path || data.image_path }))
    } catch (err) {
      console.error(err)
      alert('画像のアップロードに失敗しました')
    } finally {
      setCropImageSrc(null)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Name *</label>
        <input
          id={`${idPrefix}-name`}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className={FORM_INPUT}
          placeholder="e.g. 水着セット"
        />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Description</label>
        <input
          id={`${idPrefix}-description`}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className={FORM_INPUT}
          placeholder="Optional description…"
        />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Category</label>
        <CategorySelect
          id={`${idPrefix}-category`}
          value={form.category_id}
          onChange={(catId) => setForm((f) => ({ ...f, category_id: catId }))}
          categories={categories || []}
          onCategoryCreated={onCategoryCreated}
          apiCreateFn={tagsetCategoriesApi.create}
          accentClass="accent-green"
        />
      </div>
      <BaseModelSelect
        idPrefix={idPrefix}
        selectedIds={form.target_base_model_ids}
        onChange={(ids) => setForm((f) => ({ ...f, target_base_model_ids: ids }))}
        accentClass='green'
      />
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Tags *</label>
        <div onPasteCapture={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const pasted = event.clipboardData.getData('text')
          setForm((f) => ({ ...f, tags: appendTagSetPaste(f.tags, pasted) }))
        }}>
          <TagChipEditor
            id={`${idPrefix}-tags`}
            value={form.tags}
            onChange={(val) => setForm((f) => ({ ...f, tags: val }))}
            placeholder="swimsuit, bikini, white bikini, ..."
            defaultTextMode={false}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Cover Thumbnail Image</label>
        <div className="flex items-center gap-3">
          {form.thumbnail_path ? (
            <img
              src={form.thumbnail_path}
              alt="Cover Preview"
              className="w-12 h-12 rounded object-cover bg-zinc-800 border border-[rgba(255,255,255,0.1)]"
            />
          ) : (
            <div className="w-12 h-12 rounded bg-zinc-950 flex items-center justify-center text-zinc-500 border border-dashed border-[rgba(255,255,255,0.15)] text-[10px]">
              No Cover
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            id={`${idPrefix}-file-input`}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                const reader = new FileReader()
                reader.onload = () => {
                  if (onUploadImage) {
                    onUploadImage(reader.result as string)
                  } else {
                    setCropImageSrc(reader.result as string)
                  }
                }
                reader.readAsDataURL(file)
              }
            }}
          />
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-300 text-xs font-medium hover:text-zinc-100 hover:bg-surface-3 transition-all"
            onClick={() => document.getElementById(`${idPrefix}-file-input`)?.click()}
          >
            画像をアップロード
          </button>
          {form.thumbnail_path && (
            <button
              type="button"
              onClick={() => {
                if (onUploadImage) {
                  onUploadImage(form.thumbnail_path!)
                } else {
                  setCropImageSrc(form.thumbnail_path!)
                }
              }}
              className="px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-300 text-xs font-medium hover:text-zinc-100 hover:bg-surface-3 transition-all"
            >
              クロップ調整
            </button>
          )}
        </div>
      </div>

      {/* Subsets Section */}
      <div className="border-t border-[rgba(255,255,255,0.06)] pt-3 mt-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-zinc-400 font-semibold">Subsets (バリエーション)</label>
          <button
            type="button"
            onClick={() => {
              setForm((f) => ({
                ...f,
                subsets: [...(f.subsets || []), { name: '', tags: '', [TAGSET_SUBSET_CLIENT_ID]: createSubsetId() }],
              }))
            }}
            className="text-[10px] px-2 py-1 rounded bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/20 transition-all"
          >
            <><Plus aria-hidden="true" size={12} /> Add Subset</>
          </button>
        </div>
        <div className="space-y-2">
          {(form.subsets || []).map((sub, idx) => {
            const subsetId = sub[TAGSET_SUBSET_CLIENT_ID] || `${idPrefix}-pending-${idx}`
            const fileInputId = `${idPrefix}-subset-image-${subsetId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
            return (
            <div key={subsetId} className="flex gap-2 items-start bg-zinc-950/40 p-2 rounded-lg border border-[rgba(255,255,255,0.04)]">
              <div className="flex-1 space-y-1.5">
                <input
                  type="text"
                  placeholder="Subset Name (e.g. 日中)"
                  value={sub.name}
                  onChange={(e) => {
                    const next = [...(form.subsets || [])]
                    next[idx] = { ...next[idx], name: e.target.value }
                    setForm((f) => ({ ...f, subsets: next }))
                  }}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/60"
                />
                <div onPasteCapture={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  const pasted = event.clipboardData.getData('text')
                  setForm((f) => {
                    const next = [...(f.subsets || [])]
                    next[idx] = { ...next[idx], tags: appendTagSetPaste(next[idx].tags, pasted) }
                    return { ...f, subsets: next }
                  })
                }}>
                  <TagChipEditor
                    value={sub.tags}
                    onChange={(val) => {
                      const next = [...(form.subsets || [])]
                      next[idx] = { ...next[idx], tags: val }
                      setForm((f) => ({ ...f, subsets: next }))
                    }}
                    placeholder="Tags (comma-separated)..."
                    defaultTextMode={false}
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {sub.thumbnail_path ? (
                    <img src={sub.thumbnail_path} alt={`${sub.name || `Subset ${idx + 1}`} preview`} className="h-12 w-12 rounded object-cover bg-zinc-800 border border-[rgba(255,255,255,0.1)]" />
                  ) : (
                    <div className="h-12 w-12 rounded bg-zinc-950 flex items-center justify-center text-zinc-500 border border-dashed border-[rgba(255,255,255,0.15)]" aria-label="サブセット画像なし">
                      <ImagePlus aria-hidden="true" size={16} />
                    </div>
                  )}
                  <input
                    id={fileInputId}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (!file || !subsetExists(subsetId)) return
                      const reader = new FileReader()
                      reader.onload = () => {
                        if (typeof reader.result === 'string' && subsetExists(subsetId)) {
                          setSubsetCrop({ targetId: subsetId, src: reader.result, requestId: ++uploadRequestCounter.current })
                        }
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                  <button type="button" aria-label={`${sub.name || `Subset ${idx + 1}`} の画像をアップロード`} disabled={uploadingSubsetIds.has(subsetId)} onClick={() => document.getElementById(fileInputId)?.click()} className="px-2 py-1 rounded border border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-300 text-xs disabled:opacity-50">画像をアップロード</button>
                  {sub.thumbnail_path && <>
                    <button type="button" aria-label={`${sub.name || `Subset ${idx + 1}`} の画像をクロップ調整`} disabled={uploadingSubsetIds.has(subsetId)} onClick={() => setSubsetCrop({ targetId: subsetId, src: sub.thumbnail_path!, requestId: ++uploadRequestCounter.current })} className="px-2 py-1 rounded border border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-300 text-xs disabled:opacity-50">クロップ調整</button>
                    <button type="button" aria-label={`${sub.name || `Subset ${idx + 1}`} の画像をクリア`} disabled={uploadingSubsetIds.has(subsetId)} onClick={() => setForm((current) => ({ ...current, subsets: (current.subsets || []).map((item) => item[TAGSET_SUBSET_CLIENT_ID] === subsetId ? { ...item, thumbnail_path: null } : item) }))} className="p-1 rounded text-zinc-400 hover:text-red-400 disabled:opacity-50"><X aria-hidden="true" size={14} /></button>
                  </>}
                  {uploadingSubsetIds.has(subsetId) && <span role="status" className="text-[11px] text-zinc-400">アップロード中…</span>}
                </div>
                {subsetUploadErrors[subsetId] && <p role="alert" className="text-xs text-red-400">{subsetUploadErrors[subsetId]}</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = (form.subsets || []).filter((item) => item[TAGSET_SUBSET_CLIENT_ID] !== subsetId)
                  setForm((f) => ({ ...f, subsets: next }))
                  setSubsetUploadErrors((current) => {
                    const errors = { ...current }
                    delete errors[subsetId]
                    return errors
                  })
                  setSubsetCrop((current) => current?.targetId === subsetId ? null : current)
                }}
                aria-label={`${sub.name || `Subset ${idx + 1}`} を削除`}
                className="p-1 rounded text-red-400 hover:bg-red-500/10 self-center"
              >
                <Trash2 aria-hidden="true" size={13} />
              </button>
            </div>
          )})}
          {(form.subsets || []).length === 0 && (
            <p className="text-[10px] text-zinc-600 text-center py-2">No subsets defined.</p>
          )}
        </div>
      </div>

      {cropImageSrc && (
        <ImageCropper
          imageSrc={cropImageSrc}
          aspectRatio={numericRatio}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropImageSrc(null)}
        />
      )}
      {subsetCrop && (
        <ImageCropper
          imageSrc={subsetCrop.src}
          aspectRatio={numericRatio}
          onCropComplete={(blob) => handleSubsetCropComplete(subsetCrop.targetId, subsetCrop.requestId, blob)}
          onCancel={() => setSubsetCrop((current) => current?.requestId === subsetCrop.requestId ? null : current)}
        />
      )}
    </div>
  )
}
