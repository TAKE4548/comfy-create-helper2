import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import type { Category } from '../../api/types'
import { validateLoraStrengthRange, type LoraFormState } from './types'
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
  const strengthRangeError = validateLoraStrengthRange(form)

  useEffect(() => {
    if (form.recommended_strength_min !== undefined && form.recommended_strength_max === undefined) {
      setForm((current) => current.recommended_strength_max === undefined
        ? { ...current, recommended_strength_max: current.recommended_strength_min }
        : current)
    } else if (form.recommended_strength_max !== undefined && form.recommended_strength_min === undefined) {
      setForm((current) => current.recommended_strength_min === undefined
        ? { ...current, recommended_strength_min: current.recommended_strength_max }
        : current)
    }
  }, [form.recommended_strength_min, form.recommended_strength_max, setForm])

  const setNormalizedForm: React.Dispatch<React.SetStateAction<LoraFormState>> = (action) => {
    setForm((current) => {
      const next = typeof action === 'function' ? action(current) : action
      if (next.recommended_strength_min !== undefined && next.recommended_strength_max === undefined) {
        return { ...next, recommended_strength_max: next.recommended_strength_min }
      }
      if (next.recommended_strength_max !== undefined && next.recommended_strength_min === undefined) {
        return { ...next, recommended_strength_min: next.recommended_strength_max }
      }
      return next
    })
  }

  const handleSubmit = () => {
    if (validateLoraStrengthRange(form)) return
    onSubmit()
  }

  return (
    <div className="modal-backdrop items-end md:items-center p-0 md:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="lora-register-title" data-testid="lora-register-sheet" className="relative mt-auto md:my-auto w-full max-w-full bg-surface rounded-t-2xl rounded-b-none border border-[rgba(255,255,255,0.08)] shadow-2xl max-h-[90dvh] overflow-y-auto custom-scrollbar md:max-w-[min(90vw,42.5rem)] md:rounded-2xl md:max-h-[85vh] lg:max-w-[42.5rem]">
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-600 md:hidden" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 id="lora-register-title" className="text-sm font-semibold text-zinc-200">Register LoRA Model</h2>
          <button type="button" aria-label="Close registration dialog" onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-5">
          <LoraFormFields
            form={form}
            setForm={setNormalizedForm}
            idPrefix="lora"
            categories={categories}
            onCategoryCreated={onCategoryCreated}
            onUploadImage={onUploadImage}
          />
          <button
            id="save-lora-btn"
            onClick={handleSubmit}
            aria-describedby={strengthRangeError ? 'lora-strength-error' : undefined}
            disabled={!form.model_name || isPending || Boolean(strengthRangeError)}
            className="w-full mt-3 py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isPending ? 'Saving…' : 'Register LoRA'}
          </button>
        </div>
      </div>
    </div>
  )
}
