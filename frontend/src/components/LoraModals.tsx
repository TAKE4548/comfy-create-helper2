/**
 * LoRA register/edit/detail modals extracted from LoRAsPage.
 */

import React, { useState, useEffect, useRef } from 'react'
import { X, Check, Copy, Trash2, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react'
import type { Category, Lora, LoraCreate, ComfyLoraModel } from '../api/types'
import { useQuery } from '@tanstack/react-query'
import { lorasApi } from '../api/client'
import TagChipEditor from './TagChipEditor'

// ─── Form type shared between register and edit ────────────────
export type LoraFormState = Omit<LoraCreate, 'trigger_word_sets'> & {
  trigger_word_sets: { name: string; words: string }[]
}

const fieldCls = 'w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent-green/40'

// ─── Shared form fields (register & edit share the same layout) ─
function LoraFormFields({
  form,
  setForm,
  idPrefix,
  categories,
}: {
  form: LoraFormState
  setForm: React.Dispatch<React.SetStateAction<LoraFormState>>
  idPrefix: string
  categories?: Category[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: comfyModels } = useQuery({
    queryKey: ['comfy-lora-models'],
    queryFn: lorasApi.getComfyModels,
  })

  const handleAddTriggerSet = () => {
    setForm((f) => ({
      ...f,
      trigger_word_sets: [...(f.trigger_word_sets || []), { name: '', words: '' }],
    }))
  }

  const handleRemoveTriggerSet = (index: number) => {
    setForm((f) => ({
      ...f,
      trigger_word_sets: f.trigger_word_sets.filter((_, i) => i !== index),
    }))
  }

  const handleUpdateTriggerSetName = (index: number, name: string) => {
    setForm((f) => ({
      ...f,
      trigger_word_sets: f.trigger_word_sets.map((tws, i) =>
        i === index ? { ...tws, name } : tws
      ),
    }))
  }

  const handleUpdateTriggerWords = (index: number, words: string) => {
    setForm((f) => ({
      ...f,
      trigger_word_sets: f.trigger_word_sets.map((tws, i) =>
        i === index ? { ...tws, words } : tws
      ),
    }))
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const getBasename = (path: string): string => {
    return path.split('/').pop() || path
  }

  const handleSelect = (model: ComfyLoraModel) => {
    if (model.is_registered) return
    setForm((f) => {
      const nextModelName = f.model_name ? f.model_name : getBasename(model.file_path)
      return {
        ...f,
        file_path: model.file_path,
        model_name: nextModelName,
      }
    })
    setIsOpen(false)
  }

  const filterText = form.file_path || ''
  const filteredModels = comfyModels?.filter((m) =>
    m.file_path.toLowerCase().includes(filterText.toLowerCase())
  ) || []

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Model Name *</label>
        <input id={`${idPrefix}-model-name`} value={form.model_name}
          onChange={(e) => setForm((f) => ({ ...f, model_name: e.target.value }))}
          className={fieldCls} placeholder="my_awesome_lora" />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">File Path</label>
        <div className="relative" ref={containerRef}>
          <input
            id={`${idPrefix}-file-path`}
            value={form.file_path || ''}
            onChange={(e) => {
              const val = e.target.value
              setForm((f) => ({ ...f, file_path: val }))
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            className={fieldCls}
            placeholder="Select or enter path (e.g. folder/model.safetensors)"
            autoComplete="off"
          />
          {isOpen && comfyModels && comfyModels.length > 0 && (
            <ul className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-zinc-900 border border-[rgba(255,255,255,0.12)] rounded-lg shadow-xl py-1 text-xs custom-scrollbar">
              {filteredModels.length > 0 ? (
                filteredModels.map((m) => (
                  <li
                    key={m.file_path}
                    onClick={() => handleSelect(m)}
                    className={`px-3 py-2 flex justify-between items-center ${
                      m.is_registered
                        ? 'text-zinc-500 cursor-not-allowed opacity-50 select-none'
                        : 'text-zinc-300 hover:bg-zinc-800 cursor-pointer'
                    }`}
                  >
                    <span className="truncate mr-2">{m.file_path}</span>
                    {m.is_registered && (
                      <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded flex-shrink-0 font-medium">
                        登録済み
                      </span>
                    )}
                  </li>
                ))
              ) : (
                <li className="px-3 py-2 text-zinc-500 italic">No matching models</li>
              )}
            </ul>
          )}
        </div>
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Description</label>
        <input id={`${idPrefix}-description`} value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className={fieldCls} placeholder="Character name / role…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Strength Min</label>
          <input id={`${idPrefix}-strength-min`} type="number" step="0.1"
            value={form.recommended_strength_min ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, recommended_strength_min: e.target.value ? Number(e.target.value) : undefined }))}
            className={fieldCls} />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Strength Max</label>
          <input id={`${idPrefix}-strength-max`} type="number" step="0.1"
            value={form.recommended_strength_max ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, recommended_strength_max: e.target.value ? Number(e.target.value) : undefined }))}
            className={fieldCls} />
        </div>
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Category</label>
        <select id={`${idPrefix}-category`} value={form.category_id ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value ? Number(e.target.value) : undefined }))}
          className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-accent-green/40">
          <option value="">None</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Trigger Word Sets</label>
          <button
            type="button"
            onClick={handleAddTriggerSet}
            className="text-xs font-bold text-accent-green hover:underline flex items-center gap-1"
          >
            + Add Set
          </button>
        </div>

        <div className="space-y-3">
          {(form.trigger_word_sets || []).map((tws, index) => (
            <div key={index} className="p-3 bg-surface border border-[rgba(255,255,255,0.06)] rounded-lg space-y-2 relative">
              <div className="flex justify-between items-center gap-2">
                <input
                  type="text"
                  value={tws.name}
                  onChange={(e) => handleUpdateTriggerSetName(index, e.target.value)}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40"
                  placeholder="Set Name (e.g. Costume, Hair)"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveTriggerSet(index)}
                  className="p-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-red-400 hover:bg-surface-2 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div>
                <TagChipEditor
                  value={tws.words}
                  onChange={(val) => handleUpdateTriggerWords(index, val)}
                  placeholder="Enter trigger words..."
                />
              </div>
            </div>
          ))}
          {(!form.trigger_word_sets || form.trigger_word_sets.length === 0) && (
            <p className="text-xs text-zinc-500 italic">No trigger word sets. Click "+ Add Set" to create one.</p>
          )}
        </div>
      </div>
    </div>
  )
}


// ─── Register Modal ────────────────────────────────────────────
export function LoraRegisterModal({
  form, setForm, categories, isPending, onClose, onSubmit,
}: {
  form: LoraFormState
  setForm: React.Dispatch<React.SetStateAction<LoraFormState>>
  categories?: Category[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl max-h-[80vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-200">Register LoRA Model</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-5">
          <LoraFormFields form={form} setForm={setForm} idPrefix="lora" categories={categories} />
          <button id="save-lora-btn" onClick={onSubmit} disabled={!form.model_name || isPending}
            className="w-full mt-3 py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {isPending ? 'Saving…' : 'Register LoRA'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Modal ────────────────────────────────────────────────
export function LoraEditModal({
  form, setForm, categories, isPending, onClose, onSubmit, snapshotPaths,
}: {
  form: LoraFormState
  setForm: React.Dispatch<React.SetStateAction<LoraFormState>>
  categories?: Category[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
  snapshotPaths?: string[]
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
    // If activeImage is no longer valid, fallback
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
          <h2 className="text-sm font-semibold text-zinc-200">Edit LoRA Model</h2>
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
            <LoraFormFields form={form} setForm={setForm} idPrefix="edit-lora" categories={categories} />
            <div className="flex gap-2 pt-1 border-t border-[rgba(255,255,255,0.06)] mt-4">
              <button id="cancel-edit-lora-btn" onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm hover:bg-surface-2 transition-all">Cancel</button>
              <button id="save-edit-lora-btn" onClick={onSubmit} disabled={!form.model_name || isPending}
                className="flex-1 py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
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
export function LoraDetailModal({
  lora, categories, copiedId, onCopy, onClose,
}: {
  lora: Lora
  categories?: Category[]
  copiedId: number | null
  onCopy: (id: number, words: string) => void
  onClose: () => void
}) {
  const catName = categories?.find((c) => c.id === lora.category_id)?.name || 'None'
  const strengthStr =
    lora.recommended_strength_min != null || lora.recommended_strength_max != null
      ? lora.recommended_strength_min === lora.recommended_strength_max
        ? `×${lora.recommended_strength_min}`
        : `${lora.recommended_strength_min ?? '?'} ~ ${lora.recommended_strength_max ?? '?'}`
      : 'N/A'

  const images = Array.from(
    new Set(
      [lora.thumbnail_path, ...(lora.snapshot_paths || [])].filter((p): p is string => Boolean(p))
    )
  )

  const [activeImage, setActiveImage] = useState<string | null>(
    lora.thumbnail_path || (lora.snapshot_paths && lora.snapshot_paths.length > 0 ? lora.snapshot_paths[0] : null)
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
          <h2 className="text-sm font-semibold text-zinc-200">LoRA Model Details</h2>
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
                  {activeImage === lora.thumbnail_path && (
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
                      {img === lora.thumbnail_path && (
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
            <div className="space-y-2">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Model Name</span>
                <p className="text-sm font-medium text-zinc-200 break-all select-all">{lora.model_name}</p>
              </div>
              {lora.file_path && (
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">File Path</span>
                  <p className="text-xs text-zinc-400 break-all select-all">{lora.file_path}</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-[rgba(255,255,255,0.06)] pt-4">
              <div><span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Category</span><span className="text-xs text-zinc-300">{catName}</span></div>
              <div><span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Recommended Strength</span><span className="text-xs text-zinc-300">{strengthStr}</span></div>
            </div>
            <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Description</span>
              <p className="text-xs text-zinc-300 leading-relaxed bg-surface-2 p-3 rounded-lg border border-[rgba(255,255,255,0.04)] whitespace-pre-wrap">
                {lora.description || 'No description provided.'}
              </p>
            </div>
            <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 space-y-2">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Trigger Word Sets</span>
              {lora.trigger_word_sets.length > 0 ? (
                <div className="space-y-2">
                  {lora.trigger_word_sets.map((tws) => {
                    const wordsStr = tws.words.join(', ')
                    const isCopied = copiedId === tws.id
                    return (
                      <div key={tws.id} className="p-3 bg-surface-2 rounded-lg border border-[rgba(255,255,255,0.04)] flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] text-accent-green font-medium block mb-0.5">{tws.name || 'Trigger Set'}</span>
                          <p className="text-xs text-zinc-300 break-words select-all leading-normal">{wordsStr}</p>
                        </div>
                        <button id={`modal-copy-trigger-${tws.id}`} onClick={() => onCopy(tws.id, wordsStr)}
                          className={`p-2 rounded-md border transition-all ${isCopied ? 'bg-accent-green/10 border-accent-green/30 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:bg-surface'}`} title="Copy trigger words">
                          {isCopied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : <p className="text-xs text-zinc-500 italic">No trigger word sets registered.</p>}
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
