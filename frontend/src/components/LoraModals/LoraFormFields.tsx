import React, { useState, useEffect, useRef } from 'react'
import { ArrowDown, ArrowUp, ImagePlus, Minus, Plus, Trash2, X } from 'lucide-react'
import type { Category, ComfyLoraModel } from '../../api/types'
import { useQuery } from '@tanstack/react-query'
import { lorasApi, loraCategoriesApi } from '../../api/client'
import { CategorySelect } from '../common/CategorySelect'
import { BaseModelSelect } from '../common/BaseModelSelect'
import TagChipEditor from '../TagChipEditor'
import { ImageCropper } from '../ImageCropper'
import { validateLoraStrengthRange, type LoraFormState } from './types'

const fieldCls = 'w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent-green/40'

const findDuplicateWords = (sets: LoraFormState['trigger_word_sets'], index: number): string[] => {
  const allWords = sets.flatMap((set) => set.words.split(/[\n,]/).map((word) => word.trim()).filter(Boolean))
  const duplicateKeys = new Set(allWords.filter((word, wordIndex) =>
    allWords.findIndex((candidate) => candidate.toLowerCase() === word.toLowerCase()) !== wordIndex
  ).map((word) => word.toLowerCase()))
  return [...new Set(sets[index].words.split(/[\n,]/).map((word) => word.trim()).filter(Boolean))]
    .filter((word) => duplicateKeys.has(word.toLowerCase()))
}

export interface LoraFormFieldsProps {
  form: LoraFormState
  setForm: React.Dispatch<React.SetStateAction<LoraFormState>>
  idPrefix: string
  categories?: Category[]
  onCategoryCreated: (cat: Category) => void
  onUploadImage: (src: string) => void
}

export function LoraFormFields({
  form,
  setForm,
  idPrefix,
  categories,
  onCategoryCreated,
  onUploadImage,
}: LoraFormFieldsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mobileSection, setMobileSection] = useState<'basic' | 'triggers'>('basic')
  const [exampleCropImage, setExampleCropImage] = useState<string | null>(null)
  const [exampleAspectRatio, setExampleAspectRatio] = useState(1)
  const [exampleUploadError, setExampleUploadError] = useState<string | null>(null)
  const [isUploadingExample, setIsUploadingExample] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const strengthRangeError = validateLoraStrengthRange(form)

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

  const handleMoveTriggerSet = (index: number, direction: -1 | 1) => {
    setForm((f) => {
      const sets = [...f.trigger_word_sets]
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= sets.length) return f
      ;[sets[index], sets[nextIndex]] = [sets[nextIndex], sets[index]]
      return { ...f, trigger_word_sets: sets }
    })
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

  const changeRecommendedStrength = (key: 'recommended_strength_min' | 'recommended_strength_max', direction: -1 | 1) => {
    setForm((f) => {
      const current = f[key] ?? 0
      return { ...f, [key]: Number((current + direction * 0.05).toFixed(2)) }
    })
  }

  const selectExampleFile = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setExampleUploadError('画像ファイルを選択してください')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setExampleUploadError(null)
        setExampleCropImage(reader.result)
      }
    }
    reader.onerror = () => setExampleUploadError('画像ファイルを読み込めませんでした')
    reader.readAsDataURL(file)
  }

  const uploadExampleCrop = async (blob: Blob) => {
    setIsUploadingExample(true)
    setExampleUploadError(null)
    try {
      const body = new FormData()
      body.append('file', blob, 'lora-example.png')
      const response = await fetch('/api/snapshots/upload', { method: 'POST', body })
      let result: { image_path?: string; detail?: string; message?: string } = {}
      try {
        result = await response.json() as typeof result
      } catch {
        // An HTTP error without a JSON body still gets a useful status message below.
      }
      if (!response.ok) {
        throw new Error(result.detail || result.message || `アップロードに失敗しました (${response.status})`)
      }
      if (!result.image_path) throw new Error('アップロード結果に画像パスがありません')
      const imagePath = result.image_path
      setForm((current) => {
        const paths = current.example_paths ?? []
        return paths.includes(imagePath) ? current : { ...current, example_paths: [...paths, imagePath] }
      })
      setExampleCropImage(null)
    } catch (error) {
      setExampleUploadError(error instanceof Error ? error.message : '画像をアップロードできませんでした')
    } finally {
      setIsUploadingExample(false)
    }
  }

  const removeExampleImage = (imagePath: string) => {
    setForm((current) => ({
      ...current,
      example_paths: (current.example_paths ?? []).filter((path) => path !== imagePath),
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
      <div role="tablist" aria-label="LoRA設定セクション" className="grid grid-cols-2 gap-1 md:hidden">
        <button type="button" role="tab" aria-selected={mobileSection === 'basic'} aria-controls={`${idPrefix}-basic-panel`}
          tabIndex={mobileSection === 'basic' ? 0 : -1} onClick={() => setMobileSection('basic')}
          className="rounded-lg px-3 py-2 text-sm aria-selected:bg-surface-2 aria-selected:text-zinc-100 text-zinc-400">基本情報</button>
        <button type="button" role="tab" aria-selected={mobileSection === 'triggers'} aria-controls={`${idPrefix}-triggers-panel`}
          tabIndex={mobileSection === 'triggers' ? 0 : -1} onClick={() => setMobileSection('triggers')}
          className="rounded-lg px-3 py-2 text-sm aria-selected:bg-surface-2 aria-selected:text-zinc-100 text-zinc-400">トリガー・画像</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
      <section id={`${idPrefix}-basic-panel`} role="tabpanel" className={mobileSection === 'basic' ? 'space-y-3 md:block' : 'hidden md:block space-y-3'}>
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
          <div className="flex items-center gap-1">
          <input id={`${idPrefix}-strength-min`} type="number" step="0.05" aria-invalid={Boolean(strengthRangeError)}
            aria-describedby={strengthRangeError ? `${idPrefix}-strength-error` : undefined}
            value={form.recommended_strength_min ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, recommended_strength_min: e.target.value ? Number(e.target.value) : undefined }))}
            className={`${fieldCls} min-w-0 flex-1`} />
          <button type="button" aria-label="Decrease Strength Min" onClick={() => changeRecommendedStrength('recommended_strength_min', -1)} className="rounded px-2 py-1 text-zinc-300 hover:bg-surface-3"><Minus size={16} aria-hidden="true" /></button>
          <button type="button" aria-label="Increase Strength Min" onClick={() => changeRecommendedStrength('recommended_strength_min', 1)} className="rounded px-2 py-1 text-zinc-300 hover:bg-surface-3"><Plus size={16} aria-hidden="true" /></button>
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Strength Max</label>
          <div className="flex items-center gap-1">
          <input id={`${idPrefix}-strength-max`} type="number" step="0.05" aria-invalid={Boolean(strengthRangeError)}
            aria-describedby={strengthRangeError ? `${idPrefix}-strength-error` : undefined}
            value={form.recommended_strength_max ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, recommended_strength_max: e.target.value ? Number(e.target.value) : undefined }))}
            className={`${fieldCls} min-w-0 flex-1`} />
          <button type="button" aria-label="Decrease Strength Max" onClick={() => changeRecommendedStrength('recommended_strength_max', -1)} className="rounded px-2 py-1 text-zinc-300 hover:bg-surface-3"><Minus size={16} aria-hidden="true" /></button>
          <button type="button" aria-label="Increase Strength Max" onClick={() => changeRecommendedStrength('recommended_strength_max', 1)} className="rounded px-2 py-1 text-zinc-300 hover:bg-surface-3"><Plus size={16} aria-hidden="true" /></button>
          </div>
        </div>
      </div>
      {strengthRangeError && <p id={`${idPrefix}-strength-error`} role="alert" className="text-xs text-red-400">{strengthRangeError}</p>}
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Category</label>
        <CategorySelect
          id={`${idPrefix}-category`}
          value={form.category_id}
          onChange={(catId) => setForm((f) => ({ ...f, category_id: catId }))}
          categories={categories || []}
          onCategoryCreated={onCategoryCreated}
          apiCreateFn={loraCategoriesApi.create}
          accentClass="accent-green"
        />
      </div>
      <div>
        <BaseModelSelect
          idPrefix={`${idPrefix}-base-model`}
          selectedIds={form.target_base_model_ids || []}
          onChange={(nextIds) => setForm((f) => ({ ...f, target_base_model_ids: nextIds }))}
          accentClass="green"
        />
      </div>
      </section>
      <section id={`${idPrefix}-triggers-panel`} role="tabpanel" className={mobileSection === 'triggers' ? 'space-y-3 md:block' : 'hidden md:block space-y-3'}>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Cover Thumbnail Image</label>
        <div className="flex items-center gap-3">
          {form.thumbnail_path ? (
            <img src={form.thumbnail_path} alt="Cover Preview" className="w-12 h-12 rounded object-cover bg-zinc-800 border border-[rgba(255,255,255,0.1)]" />
          ) : (
            <div className="w-12 h-12 rounded bg-zinc-950 flex items-center justify-center text-zinc-500 border border-dashed border-[rgba(255,255,255,0.15)] text-[10px]">No Cover</div>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            id={`${idPrefix}-file-input`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = () => {
                  onUploadImage(reader.result as string);
                };
                reader.readAsDataURL(file);
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
              onClick={() => onUploadImage(form.thumbnail_path!)}
              className="px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-300 text-xs font-medium hover:text-zinc-100 hover:bg-surface-3 transition-all"
            >
              クロップ調整
            </button>
          )}
        </div>
      </div>
      <div className="space-y-3 border-t border-[rgba(255,255,255,0.06)] pt-4">
        <h3 className="text-xs font-semibold text-zinc-300">Example Images</h3>
        <label
          htmlFor={`${idPrefix}-example-file-input`}
          className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-700 bg-surface-2/40 p-3 text-xs text-zinc-400 hover:border-accent-green/50"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            selectExampleFile(event.dataTransfer.files[0])
          }}
        >
          <ImagePlus size={18} aria-hidden="true" />
          <span>Drop an example image here or choose a file</span>
          <input
            id={`${idPrefix}-example-file-input`}
            aria-label="LoRA example image file"
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => selectExampleFile(event.target.files?.[0])}
          />
        </label>
        {(form.example_paths ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(form.example_paths ?? []).map((imagePath, index) => (
              <div key={`${imagePath}-${index}`} className="relative">
                <img src={imagePath} alt={`LoRA example ${index + 1}`} className="h-16 w-16 rounded object-cover" />
                <button type="button" aria-label={`Remove LoRA example ${index + 1}`} onClick={() => removeExampleImage(imagePath)} className="absolute -right-2 -top-2 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/80 text-white">
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
        {exampleUploadError && <p role="alert" className="text-xs text-red-400">{exampleUploadError}</p>}
        {exampleCropImage && (
          <div className="space-y-2 rounded-lg border border-white/10 p-3">
            <div className="flex gap-2">
              <button type="button" aria-pressed={exampleAspectRatio === 1} onClick={() => setExampleAspectRatio(1)} className="min-h-11 rounded border border-white/10 px-3 text-xs">1:1</button>
              <button type="button" aria-pressed={exampleAspectRatio === 2 / 3} onClick={() => setExampleAspectRatio(2 / 3)} className="min-h-11 rounded border border-white/10 px-3 text-xs">2:3</button>
            </div>
            <ImageCropper imageSrc={exampleCropImage} aspectRatio={exampleAspectRatio} onCropComplete={uploadExampleCrop} onCancel={() => setExampleCropImage(null)} />
            {isUploadingExample && <p role="status" className="text-xs text-zinc-400">Uploading example image…</p>}
          </div>
        )}
      </div>
      <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Trigger Word Sets</label>
          <button
            type="button"
            onClick={handleAddTriggerSet}
            className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-accent-green hover:underline"
          >
            <Plus size={14} aria-hidden="true" />
            Add Set
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
                  aria-label={`Remove ${tws.name || `Set ${index + 1}`}`}
                  className="p-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-red-400 hover:bg-surface-2 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" aria-label={`Move ${tws.name || `Set ${index + 1}`} up`} disabled={index === 0}
                  onClick={() => handleMoveTriggerSet(index, -1)} className="inline-flex min-h-11 min-w-11 items-center justify-center text-xs text-zinc-400 disabled:opacity-40"><ArrowUp size={14} aria-hidden="true" /></button>
                <button type="button" aria-label={`Move ${tws.name || `Set ${index + 1}`} down`} disabled={index === form.trigger_word_sets.length - 1}
                  onClick={() => handleMoveTriggerSet(index, 1)} className="inline-flex min-h-11 min-w-11 items-center justify-center text-xs text-zinc-400 disabled:opacity-40"><ArrowDown size={14} aria-hidden="true" /></button>
              </div>
              <div>
                <TagChipEditor
                  value={tws.words}
                  onChange={(val) => handleUpdateTriggerWords(index, val)}
                  placeholder="Enter trigger words..."
                />
                {findDuplicateWords(form.trigger_word_sets, index).length > 0 && (
                  <p role="status" className="mt-1 text-xs text-amber-400">重複ワード: {findDuplicateWords(form.trigger_word_sets, index).join(', ')}</p>
                )}
              </div>
            </div>
          ))}
          {(!form.trigger_word_sets || form.trigger_word_sets.length === 0) && (
            <p className="text-xs text-zinc-500 italic">No trigger word sets. Click "+ Add Set" to create one.</p>
          )}
        </div>
      </div>
      </section>
      </div>
    </div>
  )
}
