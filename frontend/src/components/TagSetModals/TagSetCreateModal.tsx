import React from 'react'
import { X } from 'lucide-react'
import type { Category } from '../../api/types'
import type { TagSetFormState } from './types'
import { TagSetFormFields } from './TagSetFormFields'

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
            className="w-full py-2.5 rounded-xl bg-accent-green text-zinc-950 font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isPending ? 'Saving…' : 'Create Tag Set'}
          </button>
        </div>
      </div>
    </div>
  )
}
