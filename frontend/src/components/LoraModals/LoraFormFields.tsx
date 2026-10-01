import React, { useState, useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import type { Category, ComfyLoraModel } from '../../api/types'
import { useQuery } from '@tanstack/react-query'
import { lorasApi, loraCategoriesApi } from '../../api/client'
import { CategorySelect } from '../common/CategorySelect'
import { BaseModelSelect } from '../common/BaseModelSelect'
import TagChipEditor from '../TagChipEditor'
import type { LoraFormState } from './types'

const fieldCls = 'w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent-green/40'

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

