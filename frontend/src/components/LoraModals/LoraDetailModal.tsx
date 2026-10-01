import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, ImageIcon, Copy, Check } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { baseModelsApi } from '../../api/client'
import type { Lora, Category } from '../../api/types'
import { useThumbnailAspectRatio } from '../../hooks/useThumbnailAspectRatio'
import { ImageCropper } from '../ImageCropper'
import { TagChipViewer } from '../TagChipViewer'
import { LoraFormFields } from './LoraFormFields'
import type { LoraFormState } from './types'

export interface LoraDetailModalProps {
  lora: Lora
  categories?: Category[]
  copiedId: number | null
  onCopy: (id: number, words: string) => void
  onClose: () => void
  onSave: (id: number, form: LoraFormState) => void
  isPending: boolean
  onCategoryCreated: (cat: Category) => void
}

export function LoraDetailModal({
  lora, categories, copiedId, onCopy, onClose, onSave, isPending, onCategoryCreated
}: {
  lora: Lora
  categories?: Category[]
  copiedId: number | null
  onCopy: (id: number, words: string) => void
  onClose: () => void
  onSave: (id: number, form: LoraFormState) => void
  isPending: boolean
  onCategoryCreated: (cat: Category) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<LoraFormState>({
    model_name: '',
    description: '',
    recommended_strength_min: undefined,
    recommended_strength_max: undefined,
    category_id: undefined,
    file_path: '',
    trigger_word_sets: [],
    thumbnail_path: undefined,
    target_base_model_ids: []
  })
  
  const { data: baseModels } = useQuery({
    queryKey: ['base-models'],
    queryFn: baseModelsApi.list,
  })
  
  const { aspectRatioStyle, numericRatio } = useThumbnailAspectRatio()
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)

  const catName = categories?.find((c) => c.id === lora.category_id)?.name || 'None'
  const strengthStr =
    lora.recommended_strength_min != null || lora.recommended_strength_max != null
      ? lora.recommended_strength_min === lora.recommended_strength_max
        ? `×${lora.recommended_strength_min}`
        : `${lora.recommended_strength_min ?? '?'} ~ ${lora.recommended_strength_max ?? '?'}`
      : 'N/A'

  // Snapshots logic
  const currentThumbnail = isEditing ? form.thumbnail_path : lora.thumbnail_path
  const images = Array.from(
    new Set(
      [currentThumbnail, ...(lora.snapshot_paths || [])].filter((p): p is string => Boolean(p))
    )
  )

  const [activeImage, setActiveImage] = useState<string | null>(null)

  useEffect(() => {
    setActiveImage(currentThumbnail || (lora.snapshot_paths && lora.snapshot_paths.length > 0 ? lora.snapshot_paths[0] : null))
  }, [currentThumbnail, lora.snapshot_paths])

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

  const handleStartEdit = () => {
    setForm({
      model_name: lora.model_name,
      description: lora.description ?? '',
      recommended_strength_min: lora.recommended_strength_min ?? undefined,
      recommended_strength_max: lora.recommended_strength_max ?? undefined,
      category_id: lora.category_id ?? undefined,
      file_path: lora.file_path ?? '',
      trigger_word_sets: lora.trigger_word_sets.map((tws) => ({
        name: tws.name,
        words: tws.words.join(', '),
      })),
      thumbnail_path: lora.thumbnail_path ?? undefined,
      target_base_model_ids: lora.target_base_model_ids ?? [],
    })
    setIsEditing(true)
  }

  const handleSave = () => {
    onSave(lora.id, form)
    setIsEditing(false)
  }

  const uploadImage = async (blob: Blob): Promise<string> => {
    const formData = new FormData()
    formData.append('file', blob, 'cropped.jpg')
    const res = await fetch('/api/snapshots/upload', {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      throw new Error('Upload failed')
    }
    const data = await res.json()
    return data.thumbnail_path || data.image_path
  }

  const handleCropComplete = async (blob: Blob) => {
    try {
      const imagePath = await uploadImage(blob)
      setForm((f) => ({ ...f, thumbnail_path: imagePath }))
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
            <h2 className="text-sm font-semibold text-zinc-200">{isEditing ? 'Edit LoRA Model' : 'LoRA Model Details'}</h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[rgba(255,255,255,0.06)] flex-1 overflow-hidden">
            {/* Left Side: Images Preview */}
            <div className="p-6 flex flex-col h-full overflow-hidden">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-2">Preview & Cover Image</span>
              <div className="bg-zinc-950 rounded-xl overflow-hidden relative flex items-center justify-center border border-[rgba(255,255,255,0.08)] flex-shrink-0 group w-full" style={aspectRatioStyle}>
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
                    {activeImage === currentThumbnail && (
                      <div className="absolute top-2 left-2 bg-accent-green text-[9px] text-background px-2 py-0.5 rounded font-bold uppercase tracking-wider shadow">
                        Cover
                      </div>
                    )}

                    {isEditing && (
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
                          id="lora-edit-left-file-input"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                setCropImageSrc(reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById('lora-edit-left-file-input')?.click()}
                          className="px-3 py-1.5 rounded-lg bg-blue-600/95 text-white font-bold text-xs hover:bg-blue-500 transition-colors shadow-lg"
                        >
                          Upload Local
                        </button>
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
                <div className="flex-1 overflow-y-auto custom-scrollbar mt-4">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-2">Related Snapshots ({images.length})</span>
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

            {/* Right Side: Metadata / Form Fields */}
            <div className="p-6 overflow-y-auto h-full flex flex-col justify-between">
              {isEditing ? (
                <div className="flex flex-col justify-between h-full">
                  <div className="space-y-4">
                    <LoraFormFields form={form} setForm={setForm} idPrefix="edit-lora" categories={categories} onCategoryCreated={onCategoryCreated} onUploadImage={(src) => setCropImageSrc(src)} />
                  </div>
                  <div className="flex gap-2 pt-3 border-t border-[rgba(255,255,255,0.06)] mt-4">
                    <button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm hover:bg-surface-2 transition-all">Cancel</button>
                    <button type="button" onClick={handleSave} disabled={!form.model_name || isPending} className="flex-1 py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 transition-all">
                      {isPending ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-between h-full">
                  <div className="space-y-4">
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
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Target Base Models</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {lora.target_base_model_ids && lora.target_base_model_ids.length > 0 ? (
                          baseModels?.filter(bm => lora.target_base_model_ids?.includes(bm.id)).map(bm => (
                            <span key={bm.id} className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#7C6FDD]/15 text-[#7C6FDD] border border-[#7C6FDD]/30">
                              {bm.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-zinc-500 italic">None</span>
                        )}
                      </div>
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
                              <div key={tws.id} className="p-3 bg-surface-2 rounded-lg border border-[rgba(255,255,255,0.04)] flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <span className="text-[10px] text-accent-green font-medium block mb-1">{tws.name || 'Trigger Set'}</span>
                                  <TagChipViewer
                                    tags={tws.words}
                                    accentColor="green"
                                    defaultMode="chips"
                                  />
                                </div>
                                <button id={`modal-copy-trigger-${tws.id}`} onClick={() => onCopy(tws.id, wordsStr)}
                                  className={`p-2 rounded-md border transition-all flex-shrink-0 ${isCopied ? 'bg-accent-green/10 border-accent-green/30 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:bg-surface'}`} title="Copy trigger words">
                                  {isCopied ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      ) : <p className="text-xs text-zinc-500 italic">No trigger word sets registered.</p>}
                    </div>
                  </div>
                  <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 flex justify-end gap-2 mt-4 flex-shrink-0">
                    <button type="button" onClick={handleStartEdit} className="px-4 py-2 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green text-xs font-semibold hover:bg-accent-green/20 transition-all">Edit</button>
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
