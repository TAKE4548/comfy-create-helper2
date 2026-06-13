/**
 * TagSet create/edit/detail modals extracted from TagsPage.
 */

import { X, Check, Copy } from 'lucide-react'
import type { Category, TagSet } from '../../api/types'

export interface TagSetFormState {
  name: string
  description: string
  category_id: number | undefined
  tags: string
}

const PURPLE_INPUT = 'w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40'

function TagSetFormFields({
  form, setForm, idPrefix, categories,
}: {
  form: TagSetFormState
  setForm: React.Dispatch<React.SetStateAction<TagSetFormState>>
  idPrefix: string
  categories?: Category[]
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
        <select id={`${idPrefix}-category`} value={form.category_id ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value ? Number(e.target.value) : undefined }))}
          className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-[#7C6FDD]/40">
          <option value="">None</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
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
  form, setForm, categories, isPending, onClose, onSubmit,
}: {
  form: TagSetFormState
  setForm: React.Dispatch<React.SetStateAction<TagSetFormState>>
  categories?: Category[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-200">New Tag Set</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <TagSetFormFields form={form} setForm={setForm} idPrefix="tagset" categories={categories} />
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
  form, setForm, categories, isPending, onClose, onSubmit,
}: {
  form: TagSetFormState
  setForm: React.Dispatch<React.SetStateAction<TagSetFormState>>
  categories?: Category[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-200">Edit Tag Set</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <TagSetFormFields form={form} setForm={setForm} idPrefix="edit-tagset" categories={categories} />
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm hover:bg-surface-2 transition-all">Cancel</button>
            <button id="save-edit-tagset-btn" onClick={onSubmit} disabled={!form.name || !form.tags || isPending}
              className="flex-1 py-2.5 rounded-xl bg-[#7C6FDD] text-white font-bold text-sm hover:bg-[#6d62cc] disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {isPending ? 'Saving…' : 'Save Changes'}
            </button>
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
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-200">Tag Set Details</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Name</span>
            <p className="text-sm font-medium text-zinc-200">{tagSet.name}</p>
          </div>
          {tagSet.description && (
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Description</span>
              <p className="text-xs text-zinc-400 leading-relaxed bg-surface-2 p-3 rounded-lg border border-[rgba(255,255,255,0.04)]">{tagSet.description}</p>
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
        </div>
        <div className="px-5 py-4 border-t border-[rgba(255,255,255,0.06)] flex justify-end">
          <button id="close-detail-modal-btn" onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 text-xs font-semibold hover:bg-surface-2 transition-all">Close</button>
        </div>
      </div>
    </div>
  )
}
