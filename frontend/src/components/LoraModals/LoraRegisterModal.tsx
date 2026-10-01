import React from 'react'
import { X } from 'lucide-react'
import type { Category } from '../../api/types'
import type { LoraFormState } from './types'
import { LoraFormFields } from './LoraFormFields'

export interface LoraRegisterModalProps {
  form: LoraFormState
  setForm: React.Dispatch<React.SetStateAction<LoraFormState>>
  categories?: Category[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
  onCategoryCreated: (cat: Category) => void
  onUploadImage: (src: string) => void
}

export function LoraRegisterModal({
  form,
  setForm,
  categories,
  isPending,
  onClose,
  onSubmit,
  onCategoryCreated,
  onUploadImage,
}: LoraRegisterModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl max-h-full lg:max-h-[85vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-200">Register LoRA Model</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-5">
          <LoraFormFields
            form={form}
            setForm={setForm}
            idPrefix="lora"
            categories={categories}
            onCategoryCreated={onCategoryCreated}
            onUploadImage={onUploadImage}
          />
          <button
            id="save-lora-btn"
            onClick={onSubmit}
            disabled={!form.model_name || isPending}
            className="w-full mt-3 py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isPending ? 'Saving…' : 'Register LoRA'}
          </button>
        </div>
      </div>
    </div>
  )
}

