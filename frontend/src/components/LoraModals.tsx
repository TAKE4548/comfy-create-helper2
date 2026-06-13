/**
 * LoRA register/edit/detail modals extracted from LoRAsPage.
 */

import { X, Check, Copy } from 'lucide-react'
import type { Category, Lora, LoraCreate } from '../../api/types'

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
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Model Name / Path *</label>
        <input id={`${idPrefix}-model-name`} value={form.model_name}
          onChange={(e) => setForm((f) => ({ ...f, model_name: e.target.value }))}
          className={fieldCls} placeholder="category/model_name.safetensors" />
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
      <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl">
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
      <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-200">Edit LoRA Model</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <LoraFormFields form={form} setForm={setForm} idPrefix="edit-lora" categories={categories} />
          <div className="flex gap-2 pt-1">
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-lg bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-200">LoRA Model Details</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="flex gap-4 items-start">
            <div className="w-24 h-24 bg-surface-2 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-[rgba(255,255,255,0.06)]">
              {lora.thumbnail_path
                ? <img src={lora.thumbnail_path} alt={lora.model_name} className="w-full h-full object-cover" />
                : <div className="flex flex-col items-center text-zinc-600"><span className="text-[10px] mt-1">No Preview</span></div>}
            </div>
            <div className="space-y-2 flex-1 min-w-0">
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
        </div>
        <div className="px-5 py-4 border-t border-[rgba(255,255,255,0.06)] flex justify-end">
          <button id="close-detail-modal-btn" onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 text-xs font-semibold hover:bg-surface-2 transition-all">Close</button>
        </div>
      </div>
    </div>
  )
}
