import React, { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Category } from '../../api/types'
import { tagsetCategoriesApi } from '../../api/client'
import { CategorySelect } from '../common/CategorySelect'
import { BaseModelSelect } from '../common/BaseModelSelect'
import { ImageCropper } from '../ImageCropper'
import { useThumbnailAspectRatio } from '../../hooks/useThumbnailAspectRatio'
import { TagChipEditor } from '../TagChipEditor'
import type { TagSetFormState } from './types'

const PURPLE_INPUT = 'w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40'

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
          className={PURPLE_INPUT}
          placeholder="e.g. 水着セット"
        />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Description</label>
        <input
          id={`${idPrefix}-description`}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className={PURPLE_INPUT}
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
          accentClass="[#7C6FDD]"
        />
      </div>
      <BaseModelSelect
        idPrefix={idPrefix}
        selectedIds={form.target_base_model_ids}
        onChange={(ids) => setForm((f) => ({ ...f, target_base_model_ids: ids }))}
        accentClass='purple'
      />
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Tags *</label>
        <TagChipEditor
          id={`${idPrefix}-tags`}
          value={form.tags}
          onChange={(val) => setForm((f) => ({ ...f, tags: val }))}
          placeholder="swimsuit, bikini, white bikini, ..."
          defaultTextMode={false}
        />
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
                subsets: [...(f.subsets || []), { name: '', tags: '' }],
              }))
            }}
            className="text-[10px] px-2 py-1 rounded bg-[#7C6FDD]/10 border border-[#7C6FDD]/30 text-[#7C6FDD] hover:bg-[#7C6FDD]/20 transition-all"
          >
            + Add Subset
          </button>
        </div>
        <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
          {(form.subsets || []).map((sub, idx) => (
            <div key={idx} className="flex gap-2 items-start bg-zinc-950/40 p-2 rounded-lg border border-[rgba(255,255,255,0.04)]">
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
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40"
                />
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
              <button
                type="button"
                onClick={() => {
                  const next = (form.subsets || []).filter((_, i) => i !== idx)
                  setForm((f) => ({ ...f, subsets: next }))
                }}
                className="p-1 rounded text-red-400 hover:bg-red-500/10 self-center"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
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
    </div>
  )
}
