import React, { useState, useEffect } from 'react'
import { X, Check, Copy, ChevronLeft, ChevronRight, Image as ImageIcon, Trash2 } from 'lucide-react'
import type { Category, TagSet, BaseModel } from '../api/types'
import { InlineCategorySelect } from './InlineCategorySelect'
import { tagsetCategoriesApi, baseModelsApi } from '../api/client'
import { ImageCropper } from './ImageCropper'
import { useQuery } from '@tanstack/react-query'
import { useThumbnailAspectRatio } from '../hooks/useThumbnailAspectRatio'
import { TagChipEditor } from './TagChipEditor'
import { TagChipViewer } from './TagChipViewer'

export interface TagSetFormState {
  name: string
  description: string
  category_id: number | undefined
  tags: string
  thumbnail_path?: string
  subsets?: { name: string; tags: string }[]
  target_base_model_ids?: number[]
}

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
  const { data: baseModels } = useQuery({
    queryKey: ['base-models'],
    queryFn: () => baseModelsApi.list() as Promise<BaseModel[]>,
  })
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
        <InlineCategorySelect
          id={`${idPrefix}-category`}
          value={form.category_id}
          onChange={(catId) => setForm((f) => ({ ...f, category_id: catId }))}
          categories={categories || []}
          onCategoryCreated={onCategoryCreated}
          apiCreateFn={tagsetCategoriesApi.create}
          accentClass="[#7C6FDD]"
        />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1.5 block">Target Base Models</label>
        <div className="flex flex-wrap gap-3 p-3 bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg">
          {baseModels?.map((bm) => {
            const checked = (form.target_base_model_ids || []).includes(bm.id)
            return (
              <label key={bm.id} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const ids = form.target_base_model_ids || []
                    const nextIds = e.target.checked
                      ? [...ids, bm.id]
                      : ids.filter((id) => id !== bm.id)
                    setForm((f) => ({ ...f, target_base_model_ids: nextIds }))
                  }}
                  className="rounded border-[rgba(255,255,255,0.2)] bg-surface text-[#7C6FDD] focus:ring-0 focus:ring-offset-0 focus:outline-none accent-[#7C6FDD]"
                />
                <span>{bm.name}</span>
              </label>
            )
          })}
          {(!baseModels || baseModels.length === 0) && (
            <span className="text-xs text-zinc-500 italic">No base models configured.</span>
          )}
        </div>
      </div>
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

// ─── Create Modal ──────────────────────────────────────────────
export function TagSetCreateModal({
  form,
  setForm,
  categories,
  isPending,
  onClose,
  onSubmit,
  onCategoryCreated,
  onUploadImage,
}: {
  form: TagSetFormState
  setForm: React.Dispatch<React.SetStateAction<TagSetFormState>>
  categories?: Category[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
  onCategoryCreated: (cat: Category) => void
  onUploadImage?: (src: string) => void
}) {
  return (
    <div className="modal-backdrop">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl max-h-full lg:max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-200">New Tag Set</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <TagSetFormFields
            form={form}
            setForm={setForm}
            idPrefix="tagset"
            categories={categories}
            onCategoryCreated={onCategoryCreated}
            onUploadImage={onUploadImage}
          />
          <button
            id="save-tagset-btn"
            onClick={onSubmit}
            disabled={!form.name || !form.tags || isPending}
            className="w-full py-2.5 rounded-xl bg-[#7C6FDD] text-white font-bold text-sm hover:bg-[#6d62cc] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isPending ? 'Saving…' : 'Create Tag Set'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Modal ────────────────────────────────────────────────
export function TagSetEditModal({
  form,
  setForm,
  categories,
  isPending,
  onClose,
  onSubmit,
  snapshotPaths,
  onCategoryCreated,
  onUploadImage,
}: {
  form: TagSetFormState
  setForm: React.Dispatch<React.SetStateAction<TagSetFormState>>
  categories?: Category[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
  snapshotPaths?: string[]
  onCategoryCreated: (cat: Category) => void
  onUploadImage?: (src: string) => void
}) {
  const { aspectRatioStyle, numericRatio } = useThumbnailAspectRatio()
  const images = Array.from(
    new Set(
      [form.thumbnail_path, ...(snapshotPaths || [])].filter((p): p is string => Boolean(p))
    )
  )

  const [activeImage, setActiveImage] = useState<string | null>(
    form.thumbnail_path || (snapshotPaths && snapshotPaths.length > 0 ? snapshotPaths[0] : null)
  )
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

  useEffect(() => {
    if (activeImage && !images.includes(activeImage)) {
      setActiveImage(images[0] || null)
    } else if (!activeImage && images.length > 0) {
      setActiveImage(images[0])
    }
  }, [form.thumbnail_path, snapshotPaths])

  const handlePrev = () => {
    if (images.length <= 1) return
    const idx = images.indexOf(activeImage || '')
    const prevIdx = idx <= 0 ? images.length - 1 : idx - 1
    setActiveImage(images[prevIdx])
  }

  const handleNext = () => {
    if (images.length <= 1) return
    const idx = images.indexOf(activeImage || '')
    const nextIdx = idx === images.length - 1 || idx === -1 ? 0 : idx + 1
    setActiveImage(images[nextIdx])
  }

  return (
    <>
      <div className="modal-backdrop">
        <div className="w-full max-w-4xl bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden max-h-full lg:max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)] flex-shrink-0">
            <h2 className="text-sm font-semibold text-zinc-200">Edit Tag Set</h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[rgba(255,255,255,0.06)] flex-1 overflow-hidden">
            {/* Left Side: Images Preview (Pinned) & Related Snapshots (Scrollable) */}
            <div className="p-5 md:p-6 flex flex-col h-full overflow-hidden flex-shrink-0">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-2">Preview & Cover Image</span>
              {/* メインプレビュー画像（固定表示: flex-shrink-0、スクロールで流れない） */}
              <div className="bg-zinc-950 rounded-xl overflow-hidden relative flex items-center justify-center border border-[rgba(255,255,255,0.08)] flex-shrink-0 group max-h-[260px] md:max-h-[300px] w-full" style={aspectRatioStyle}>
                {activeImage ? (
                  <>
                    <img src={activeImage} alt="Preview" className="w-full h-full object-cover" />
                    {images.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={handlePrev}
                          className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-zinc-300 hover:text-white transition-colors"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={handleNext}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-zinc-300 hover:text-white transition-colors"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </>
                    )}
                    {activeImage === form.thumbnail_path && (
                      <div className="absolute top-2 left-2 bg-accent-green text-[9px] text-background px-2 py-0.5 rounded font-bold uppercase tracking-wider shadow">
                        Cover
                      </div>
                    )}
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 px-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      {activeImage === form.thumbnail_path ? (
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, thumbnail_path: undefined }))}
                          className="px-3 py-1.5 rounded-lg bg-red-500/95 text-white font-bold text-xs hover:bg-red-600 transition-colors shadow-lg"
                        >
                          Remove Cover
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, thumbnail_path: activeImage }))}
                          className="px-3 py-1.5 rounded-lg bg-accent-green/95 text-background font-bold text-xs hover:brightness-110 transition-colors shadow-lg"
                        >
                          Set as Cover
                        </button>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        id="tagset-edit-left-file-input"
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
                        onClick={() => document.getElementById('tagset-edit-left-file-input')?.click()}
                        className="px-3 py-1.5 rounded-lg bg-blue-600/95 text-white font-bold text-xs hover:bg-blue-500 transition-colors shadow-lg"
                      >
                        Upload Local
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-zinc-600">
                    <ImageIcon size={40} strokeWidth={1} />
                    <span className="text-xs mt-2">No Preview Available</span>
                  </div>
                )}
              </div>

              {/* 候補サムネイル一覧（独立スクロールエリア） */}
              {images.length > 0 && (
                <div className="flex-1 overflow-y-auto custom-scrollbar mt-3 pt-1 border-t border-[rgba(255,255,255,0.04)] min-h-[90px] max-h-[140px] md:max-h-none">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1.5">
                    Related Snapshots ({images.length})
                  </span>
                  <div className="grid grid-cols-5 gap-2 p-1">
                    {images.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveImage(img)}
                        className={`aspect-square rounded-lg overflow-hidden border-2 transition-all relative group ${
                          activeImage === img ? 'border-accent-green bg-accent-green/10' : 'border-[rgba(255,255,255,0.08)] hover:border-zinc-400'
                        }`}
                      >
                        <img src={img} alt={`thumbnail-${idx}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200" />
                        {img === form.thumbnail_path && (
                          <div className="absolute top-0.5 right-0.5 bg-accent-green text-[7px] text-background px-1 rounded font-bold uppercase tracking-wider shadow">
                            Cover
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Side: Form Fields */}
            <div className="p-5 md:p-6 overflow-y-auto h-full flex flex-col justify-between custom-scrollbar">
              <div className="space-y-3">
                <TagSetFormFields
                  form={form}
                  setForm={setForm}
                  idPrefix="edit-tagset"
                  categories={categories}
                  onCategoryCreated={onCategoryCreated}
                  onUploadImage={onUploadImage}
                />
              </div>
              <div className="flex gap-2 pt-3 border-t border-[rgba(255,255,255,0.06)] mt-4 flex-shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm hover:bg-surface-2 transition-all"
                >
                  Cancel
                </button>
                <button
                  id="save-edit-tagset-btn"
                  onClick={onSubmit}
                  disabled={!form.name || !form.tags || isPending}
                  className="flex-1 py-2.5 rounded-xl bg-[#7C6FDD] text-white font-bold text-sm hover:bg-[#6d62cc] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
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
    </>
  )
}

// ─── Detail & Edit Modal ──────────────────────────────────────────────────────
export function TagSetDetailModal({
  tagSet,
  categories,
  copiedId,
  onCopy,
  onClose,
  onSave,
  isPending,
  onCategoryCreated,
}: {
  tagSet: TagSet
  categories?: Category[]
  copiedId: number | null
  onCopy: (id: number, tags: string[]) => void
  onClose: () => void
  onSave: (id: number, form: TagSetFormState) => void
  isPending: boolean
  onCategoryCreated: (cat: Category) => void
}) {
  const catName = categories?.find((c) => c.id === tagSet.category_id)?.name || 'None'
  const { aspectRatioStyle, numericRatio } = useThumbnailAspectRatio()

  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<TagSetFormState>({
    name: '',
    description: '',
    category_id: undefined,
    tags: '',
    thumbnail_path: undefined,
    target_base_model_ids: [],
    subsets: [],
  })

  const { data: baseModels } = useQuery({
    queryKey: ['base-models'],
    queryFn: () => baseModelsApi.list() as Promise<BaseModel[]>,
  })
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)

  const currentThumbnail = isEditing ? form.thumbnail_path : tagSet.thumbnail_path
  const images = Array.from(
    new Set(
      [currentThumbnail, ...(tagSet.snapshot_paths || [])].filter((p): p is string => Boolean(p))
    )
  )

  const [activeImage, setActiveImage] = useState<string | null>(null)

  useEffect(() => {
    setActiveImage(currentThumbnail || (tagSet.snapshot_paths && tagSet.snapshot_paths.length > 0 ? tagSet.snapshot_paths[0] : null))
  }, [currentThumbnail, tagSet.snapshot_paths])

  const handlePrev = () => {
    if (images.length <= 1) return
    const idx = images.indexOf(activeImage || '')
    setActiveImage(images[idx <= 0 ? images.length - 1 : idx - 1])
  }

  const handleNext = () => {
    if (images.length <= 1) return
    const idx = images.indexOf(activeImage || '')
    setActiveImage(images[idx === images.length - 1 || idx === -1 ? 0 : idx + 1])
  }

  const handleStartEdit = () => {
    setForm({
      name: tagSet.name,
      description: tagSet.description ?? '',
      category_id: tagSet.category_id ?? undefined,
      tags: tagSet.tags.join(', '),
      thumbnail_path: tagSet.thumbnail_path ?? undefined,
      target_base_model_ids: tagSet.target_base_model_ids ?? [],
      subsets: tagSet.subsets ? tagSet.subsets.map((s: any) => ({ name: s.name, tags: Array.isArray(s.tags) ? s.tags.join(', ') : s.tags })) : [],
    })
    setIsEditing(true)
  }

  const handleSave = () => {
    onSave(tagSet.id, form)
    setIsEditing(false)
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
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="w-full max-w-4xl bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden max-h-full lg:max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)] flex-shrink-0">
            <h2 className="text-sm font-semibold text-zinc-200">{isEditing ? 'Edit Tag Set' : 'Tag Set Details'}</h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[rgba(255,255,255,0.06)] flex-1 overflow-hidden">
            {/* Left Side: Images Preview (Pinned) & Related Snapshots (Scrollable) */}
            <div className="p-5 md:p-6 flex flex-col h-full overflow-hidden flex-shrink-0">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-2">Preview & Cover Image</span>
              {/* メインプレビュー画像（固定表示: flex-shrink-0、スクロールで流れない） */}
              <div className="bg-zinc-950 rounded-xl overflow-hidden relative flex items-center justify-center border border-[rgba(255,255,255,0.08)] flex-shrink-0 group max-h-[260px] md:max-h-[300px] w-full" style={aspectRatioStyle}>
                {activeImage ? (
                  <>
                    <img src={activeImage} alt="Preview" className="w-full h-full object-cover" />
                    {images.length > 1 && (
                      <>
                        <button type="button" onClick={handlePrev} className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-zinc-300 hover:text-white transition-colors"><ChevronLeft size={20} /></button>
                        <button type="button" onClick={handleNext} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-zinc-300 hover:text-white transition-colors"><ChevronRight size={20} /></button>
                      </>
                    )}
                    {activeImage === currentThumbnail && (
                      <div className="absolute top-2 left-2 bg-accent-green text-[9px] text-background px-2 py-0.5 rounded font-bold uppercase tracking-wider shadow">Cover</div>
                    )}
                    {isEditing && (
                      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 px-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        {activeImage === form.thumbnail_path ? (
                          <button type="button" onClick={() => setForm((f) => ({ ...f, thumbnail_path: undefined }))} className="px-3 py-1.5 rounded-lg bg-red-500/95 text-white font-bold text-xs hover:bg-red-600 transition-colors shadow-lg">Remove Cover</button>
                        ) : (
                          <button type="button" onClick={() => setForm((f) => ({ ...f, thumbnail_path: activeImage }))} className="px-3 py-1.5 rounded-lg bg-accent-green/95 text-background font-bold text-xs hover:brightness-110 transition-colors shadow-lg">Set as Cover</button>
                        )}
                        <input type="file" accept="image/*" className="hidden" id="tagset-detail-edit-left-file-input"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              const reader = new FileReader()
                              reader.onload = () => setCropImageSrc(reader.result as string)
                              reader.readAsDataURL(file)
                            }
                          }}
                        />
                        <button type="button" onClick={() => document.getElementById('tagset-detail-edit-left-file-input')?.click()} className="px-3 py-1.5 rounded-lg bg-blue-600/95 text-white font-bold text-xs hover:bg-blue-500 transition-colors shadow-lg">Upload Local</button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center text-zinc-600">
                    <ImageIcon size={40} strokeWidth={1} />
                    <span className="text-xs mt-2">No Preview Available</span>
                  </div>
                )}
              </div>

              {/* 候補サムネイル一覧（独立スクロールエリア） */}
              {images.length > 0 && (
                <div className="flex-1 overflow-y-auto custom-scrollbar mt-3 pt-1 border-t border-[rgba(255,255,255,0.04)] min-h-[90px] max-h-[140px] md:max-h-none">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1.5">Related Snapshots ({images.length})</span>
                  <div className="grid grid-cols-5 gap-2 p-1">
                    {images.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveImage(img)}
                        className={`aspect-square rounded-lg overflow-hidden border-2 transition-all relative group ${
                          activeImage === img ? 'border-accent-green bg-accent-green/10' : 'border-[rgba(255,255,255,0.08)] hover:border-zinc-400'
                        }`}
                      >
                        <img src={img} alt={`thumbnail-${idx}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200" />
                        {img === currentThumbnail && (
                          <div className="absolute top-0.5 right-0.5 bg-accent-green text-[7px] text-background px-1 rounded font-bold uppercase tracking-wider shadow">Cover</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Side: Metadata / Form Fields */}
            <div className="p-5 md:p-6 overflow-y-auto h-full flex flex-col justify-between custom-scrollbar">
              {isEditing ? (
                <div className="flex flex-col justify-between h-full">
                  <div className="space-y-3">
                    <TagSetFormFields
                      form={form}
                      setForm={setForm}
                      idPrefix="tagset-detail-edit"
                      categories={categories}
                      onCategoryCreated={onCategoryCreated}
                    />
                  </div>
                  <div className="flex gap-2 pt-3 border-t border-[rgba(255,255,255,0.06)] mt-4 flex-shrink-0">
                    <button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm hover:bg-surface-2 transition-all">Cancel</button>
                    <button type="button" onClick={handleSave} disabled={!form.name || !form.tags || isPending} className="flex-1 py-2.5 rounded-xl bg-[#7C6FDD] text-white font-bold text-sm hover:bg-[#6d62cc] disabled:opacity-50 transition-all">
                      {isPending ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-between h-full">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Name</span>
                      <p className="text-sm font-medium text-zinc-200">{tagSet.name}</p>
                    </div>
                    {tagSet.description && (
                      <div className="space-y-1">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Description</span>
                        <p className="text-xs text-zinc-300 leading-relaxed bg-surface-2 p-3 rounded-lg border border-[rgba(255,255,255,0.04)]">{tagSet.description}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4 border-t border-[rgba(255,255,255,0.06)] pt-4">
                      <div><span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Category</span><span className="text-xs text-zinc-300">{catName}</span></div>
                      <div><span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Tags Count</span><span className="text-xs text-zinc-300">{tagSet.tags.length} tags</span></div>
                    </div>
                    <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 space-y-1">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Target Base Models</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {tagSet.target_base_model_ids && tagSet.target_base_model_ids.length > 0 ? (
                          baseModels?.filter(bm => tagSet.target_base_model_ids?.includes(bm.id)).map(bm => (
                            <span key={bm.id} className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#7C6FDD]/15 text-[#7C6FDD] border border-[#7C6FDD]/30">
                              {bm.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-zinc-500 italic">None</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 border-t border-[rgba(255,255,255,0.06)] pt-4">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Tags</span>
                      <div className="p-3 bg-surface-2 rounded-lg border border-[rgba(255,255,255,0.04)] flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <TagChipViewer
                            tags={tagSet.tags}
                            accentColor="purple"
                            defaultMode="chips"
                          />
                        </div>
                        <button id={`detail-copy-btn-${tagSet.id}`} onClick={() => onCopy(tagSet.id, tagSet.tags)}
                          className={`p-2 rounded-md border transition-all flex-shrink-0 ${copiedId === tagSet.id ? 'bg-[#7C6FDD]/10 border-[#7C6FDD]/40 text-[#7C6FDD]' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:bg-surface'}`}>
                          {copiedId === tagSet.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                    {tagSet.subsets && tagSet.subsets.length > 0 && (
                      <div className="space-y-2 border-t border-[rgba(255,255,255,0.06)] pt-4">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Subsets ({tagSet.subsets.length})</span>
                        <div className="space-y-1.5">
                          {tagSet.subsets.map((sub, i) => (
                            <div key={i} className="p-2.5 bg-surface-2 rounded-lg border border-[rgba(255,255,255,0.04)] space-y-1">
                              <span className="text-xs font-semibold text-zinc-300 block">{sub.name}</span>
                              <TagChipViewer
                                tags={Array.isArray(sub.tags) ? sub.tags : (sub.tags as unknown as string).split(',').map((t: string) => t.trim()).filter(Boolean)}
                                accentColor="purple"
                                defaultMode="chips"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 flex justify-end gap-2 mt-4 flex-shrink-0">
                    <button type="button" onClick={handleStartEdit} className="px-4 py-2 rounded-lg bg-[#7C6FDD]/10 border border-[#7C6FDD]/30 text-[#a99ef7] text-xs font-semibold hover:bg-[#7C6FDD]/20 transition-all">Edit</button>
                    <button type="button" id="close-detail-modal-btn" onClick={onClose} className="px-4 py-2 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 text-xs font-semibold hover:bg-surface-2 transition-all">Close</button>
                  </div>
                </div>
              )}
            </div>
          </div>
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
    </>
  )
}



