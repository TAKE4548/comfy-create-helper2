import React, { useState, useEffect } from 'react'
import { X, Check, Copy, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react'
import type { Category, TagSet } from '../api/types'
import { InlineCategorySelect } from './InlineCategorySelect'
import { tagsetCategoriesApi } from '../api/client'

export interface TagSetFormState {
  name: string
  description: string
  category_id: number | undefined
  tags: string
  thumbnail_path?: string
}

const PURPLE_INPUT = 'w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40'

function TagSetFormFields({
  form, setForm, idPrefix, categories, onCategoryCreated,
}: {
  form: TagSetFormState
  setForm: React.Dispatch<React.SetStateAction<TagSetFormState>>
  idPrefix: string
  categories?: Category[]
  onCategoryCreated: (cat: Category) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Name *</label>
        <input id={`${idPrefix}-name`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={PURPLE_INPUT} placeholder="e.g. 水着セット" />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Description</label>
        <input id={`${idPrefix}-description`} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={PURPLE_INPUT} placeholder="Optional description…" />
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
        <label className="text-xs text-zinc-400 mb-1 block">Tags (comma-separated) *</label>
        <textarea id={`${idPrefix}-tags`} value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} rows={4}
          className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-[#7C6FDD]/40 resize-none"
          placeholder="swimsuit, bikini, white bikini, ..." />
      </div>
    </div>
  )
}

// ─── Create Modal ──────────────────────────────────────────────
export function TagSetCreateModal({
  form, setForm, categories, isPending, onClose, onSubmit, onCategoryCreated,
}: {
  form: TagSetFormState
  setForm: React.Dispatch<React.SetStateAction<TagSetFormState>>
  categories?: Category[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
  onCategoryCreated: (cat: Category) => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-200">New Tag Set</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <TagSetFormFields form={form} setForm={setForm} idPrefix="tagset" categories={categories} onCategoryCreated={onCategoryCreated} />
          <button id="save-tagset-btn" onClick={onSubmit} disabled={!form.name || !form.tags || isPending}
            className="w-full py-2.5 rounded-xl bg-[#7C6FDD] text-white font-bold text-sm hover:bg-[#6d62cc] disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {isPending ? 'Saving…' : 'Create Tag Set'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Modal ────────────────────────────────────────────────
export function TagSetEditModal({
  form, setForm, categories, isPending, onClose, onSubmit, snapshotPaths, onCategoryCreated,
}: {
  form: TagSetFormState
  setForm: React.Dispatch<React.SetStateAction<TagSetFormState>>
  categories?: Category[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
  snapshotPaths?: string[]
  onCategoryCreated: (cat: Category) => void
}) {
  const images = Array.from(
    new Set(
      [form.thumbnail_path, ...(snapshotPaths || [])].filter((p): p is string => Boolean(p))
    )
  )

  const [activeImage, setActiveImage] = useState<string | null>(
    form.thumbnail_path || (snapshotPaths && snapshotPaths.length > 0 ? snapshotPaths[0] : null)
  )

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-4xl bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-200">Edit Tag Set</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[rgba(255,255,255,0.06)] max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Left Side: Images Preview & Cover Selection */}
          <div className="p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Preview & Cover Image</span>
              <div className="aspect-square bg-zinc-950 rounded-xl overflow-hidden relative flex items-center justify-center border border-[rgba(255,255,255,0.08)] group">
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
                    {/* Cover Setter overlay */}
                    {activeImage === form.thumbnail_path ? (
                      <div className="absolute top-2 left-2 bg-accent-green text-[9px] text-background px-2 py-0.5 rounded font-bold uppercase tracking-wider shadow">
                        Current Cover
                      </div>
                    ) : null}

                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 px-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      {activeImage === form.thumbnail_path ? (
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, thumbnail_path: undefined }))}
                          className="px-3 py-1.5 rounded-lg bg-red-500/95 text-white font-bold text-xs hover:bg-red-600 transition-colors shadow-lg"
                        >
                          Remove Cover
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, thumbnail_path: activeImage }))}
                          className="px-3 py-1.5 rounded-lg bg-accent-green/95 text-background font-bold text-xs hover:brightness-110 transition-colors shadow-lg"
                        >
                          Set as Cover
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-zinc-600">
                    <ImageIcon size={40} strokeWidth={1} />
                    <span className="text-xs mt-2">No Images Available</span>
                  </div>
                )}
              </div>

              {images.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Related Snapshots ({images.length})</span>
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
          </div>

          {/* Right Side: Form Fields */}
          <div className="p-5 space-y-3">
            <TagSetFormFields form={form} setForm={setForm} idPrefix="edit-tagset" categories={categories} onCategoryCreated={onCategoryCreated} />
            <div className="flex gap-2 pt-1 border-t border-[rgba(255,255,255,0.06)] mt-4">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm hover:bg-surface-2 transition-all">Cancel</button>
              <button id="save-edit-tagset-btn" onClick={onSubmit} disabled={!form.name || !form.tags || isPending}
                className="flex-1 py-2.5 rounded-xl bg-[#7C6FDD] text-white font-bold text-sm hover:bg-[#6d62cc] disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                {isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Detail Modal ──────────────────────────────────────────────
export function TagSetDetailModal({
  tagSet, categories, copiedId, onCopy, onClose,
}: {
  tagSet: TagSet
  categories?: Category[]
  copiedId: number | null
  onCopy: (id: number, tags: string[]) => void
  onClose: () => void
}) {
  const catName = categories?.find((c) => c.id === tagSet.category_id)?.name || 'None'

  const images = Array.from(
    new Set(
      [tagSet.thumbnail_path, ...(tagSet.snapshot_paths || [])].filter((p): p is string => Boolean(p))
    )
  )

  const [activeImage, setActiveImage] = useState<string | null>(
    tagSet.thumbnail_path || (tagSet.snapshot_paths && tagSet.snapshot_paths.length > 0 ? tagSet.snapshot_paths[0] : null)
  )

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-4xl bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-200">Tag Set Details</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[rgba(255,255,255,0.06)] max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Left Side: Images Preview */}
          <div className="p-6 space-y-4">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Preview</span>
            <div className="aspect-square bg-zinc-950 rounded-xl overflow-hidden relative flex items-center justify-center border border-[rgba(255,255,255,0.08)]">
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
                  {activeImage === tagSet.thumbnail_path && (
                    <div className="absolute top-2 left-2 bg-accent-green text-[9px] text-background px-2 py-0.5 rounded font-bold uppercase tracking-wider shadow">
                      Cover
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

            {images.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Related Snapshots ({images.length})</span>
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
                      {img === tagSet.thumbnail_path && (
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

          {/* Right Side: Metadata details */}
          <div className="p-6 space-y-4">
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
            <div className="space-y-2 border-t border-[rgba(255,255,255,0.06)] pt-4">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Tags</span>
              <div className="p-3 bg-surface-2 rounded-lg border border-[rgba(255,255,255,0.04)] flex items-start justify-between gap-4">
                <div className="flex flex-wrap gap-1.5 min-w-0 flex-1">
                  {tagSet.tags.map((tag, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-[rgba(124,111,221,0.1)] border border-[rgba(124,111,221,0.2)] text-[#a99ef7] font-mono">{tag}</span>
                  ))}
                </div>
                <button id={`detail-copy-btn-${tagSet.id}`} onClick={() => onCopy(tagSet.id, tagSet.tags)}
                  className={`p-2 rounded-md border transition-all flex-shrink-0 ${copiedId === tagSet.id ? 'bg-[#7C6FDD]/10 border-[#7C6FDD]/40 text-[#7C6FDD]' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:bg-surface'}`}>
                  {copiedId === tagSet.id ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 flex justify-end">
              <button id="close-detail-modal-btn" onClick={onClose}
                className="px-4 py-2 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 text-xs font-semibold hover:bg-surface-2 transition-all">Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
