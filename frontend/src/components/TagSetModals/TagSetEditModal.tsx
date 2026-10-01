import type React from 'react'
import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react'
import type { Category } from '../../api/types'
import { ImageCropper } from '../ImageCropper'
import { useThumbnailAspectRatio } from '../../hooks/useThumbnailAspectRatio'
import type { TagSetFormState } from './types'
import { TagSetFormFields } from './TagSetFormFields'

export interface TagSetEditModalProps {
  form: TagSetFormState
  setForm: React.Dispatch<React.SetStateAction<TagSetFormState>>
  categories?: Category[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
  snapshotPaths?: string[]
  onCategoryCreated: (cat: Category) => void
  onUploadImage?: (src: string) => void
}

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
}: TagSetEditModalProps) {
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
