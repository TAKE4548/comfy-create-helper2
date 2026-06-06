import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Folder, Copy, Layers, Trash2, ImageOff, X, Pencil, Check } from 'lucide-react'
import { lorasApi, loraCategoriesApi } from '../api/client'
import type { Lora, Category, LoraCreate } from '../api/types'

export function LoRAsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [tooltipLora, setTooltipLora] = useState<number | null>(null)
  const [editLora, setEditLora] = useState<Lora | null>(null)
  const [selectedLoraForDetail, setSelectedLoraForDetail] = useState<Lora | null>(null)
  const [copiedTriggerSetId, setCopiedTriggerSetId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Omit<LoraCreate, 'trigger_word_sets'> & { trigger_word_sets: { name: string; words: string }[] }>({
    model_name: '',
    description: '',
    recommended_strength_min: undefined,
    recommended_strength_max: undefined,
    category_id: undefined,
    file_path: '',
    trigger_word_sets: [],
  })

  // Form state
  const [form, setForm] = useState<Omit<LoraCreate, 'trigger_word_sets'> & { trigger_word_sets: { name: string; words: string }[] }>({
    model_name: '',
    description: '',
    recommended_strength_min: undefined,
    recommended_strength_max: undefined,
    category_id: undefined,
    file_path: '',
    trigger_word_sets: [],
  })

  const { data: categories } = useQuery({
    queryKey: ['lora-categories'],
    queryFn: () => loraCategoriesApi.list() as Promise<Category[]>,
  })

  const { data: loras } = useQuery({
    queryKey: ['loras', selectedCat],
    queryFn: () => lorasApi.list(selectedCat ?? undefined) as Promise<Lora[]>,
  })

  const createLora = useMutation({
    mutationFn: () => lorasApi.create({
      ...form,
      trigger_word_sets: form.trigger_word_sets.map((t) => ({
        name: t.name,
        words: t.words.split(',').map((w) => w.trim()).filter(Boolean),
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loras'] })
      setShowModal(false)
      setForm({ model_name: '', description: '', trigger_word_sets: [], file_path: '' })
    },
  })

  const deleteLora = useMutation({
    mutationFn: (id: number) => lorasApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loras'] }),
  })

  const updateLora = useMutation({
    mutationFn: () => lorasApi.update(editLora!.id, {
      ...editForm,
      trigger_word_sets: editForm.trigger_word_sets.map((t) => ({
        name: t.name,
        words: t.words.split(',').map((w) => w.trim()).filter(Boolean),
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loras'] })
      setEditLora(null)
    },
  })

  const filteredLoras = loras?.filter((l) =>
    l.model_name.toLowerCase().includes(search.toLowerCase()) ||
    (l.description ?? '').toLowerCase().includes(search.toLowerCase())
  ) ?? []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <h1 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
          <Layers size={17} className="text-accent-green" />
          LoRAs
          <span className="text-xs text-zinc-500 font-normal ml-1">({filteredLoras.length})</span>
        </h1>
        <button
          id="register-lora-btn"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green text-xs font-medium hover:bg-accent-green/20 transition-all"
        >
          <Plus size={14} />
          Register Model
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[rgba(255,255,255,0.06)] bg-surface/50">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            id="lora-search"
            type="text"
            placeholder="Search LoRAs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-accent-green/40"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
          <button
            id="lora-filter-all"
            onClick={() => setSelectedCat(null)}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${
              selectedCat === null
                ? 'bg-accent-green/10 border-accent-green/40 text-accent-green'
                : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'
            }`}
          >
            All
          </button>
          {categories?.map((cat) => (
            <button
              key={cat.id}
              id={`lora-filter-${cat.id}`}
              onClick={() => setSelectedCat(cat.id === selectedCat ? null : cat.id)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                selectedCat === cat.id
                  ? 'bg-accent-green/10 border-accent-green/40 text-accent-green'
                  : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredLoras.map((lora) => {
            const catName = categories?.find((c) => c.id === lora.category_id)?.name
            return (
              <div
                key={lora.id}
                id={`lora-card-${lora.id}`}
                onClick={() => setSelectedLoraForDetail(lora)}
                className="group relative rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden hover:border-[rgba(255,255,255,0.12)] transition-all animate-fade-in cursor-pointer"
              >
                {/* Thumbnail */}
                <div className="aspect-square bg-surface-2 flex items-center justify-center relative overflow-hidden">
                  {lora.thumbnail_path ? (
                    <img src={lora.thumbnail_path} alt={lora.model_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-zinc-600">
                      <ImageOff size={28} strokeWidth={1} />
                      <span className="text-xs">No Preview</span>
                    </div>
                  )}

                  {/* Edit / Delete on hover */}
                  <button
                    id={`lora-edit-${lora.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditLora(lora)
                      setEditForm({
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
                      })
                    }}
                    className="absolute top-2 right-8 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-surface/80 text-zinc-400 hover:bg-accent-green/20 hover:text-accent-green"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    id={`lora-delete-${lora.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm('Delete this LoRA?')) deleteLora.mutate(lora.id)
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-surface/80 text-red-400 hover:bg-red-500/20"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Info */}
                <div className="p-3 space-y-2">
                  <div>
                    <p className="text-xs font-medium text-zinc-200 truncate" title={lora.description || lora.model_name}>
                      {lora.description || lora.model_name.split('/').pop()}
                    </p>
                    {lora.description ? (
                      <p className="text-xs text-zinc-500 truncate mt-0.5" title={lora.model_name}>
                        {lora.model_name.split('/').pop()}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {catName && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-accent-green/10 text-accent-green border border-accent-green/20">
                        {catName}
                      </span>
                    )}
                    {(lora.recommended_strength_min != null || lora.recommended_strength_max != null) && (
                      <span className="text-xs text-zinc-500">
                        {lora.recommended_strength_min === lora.recommended_strength_max
                          ? `×${lora.recommended_strength_min}`
                          : `${lora.recommended_strength_min ?? '?'}~${lora.recommended_strength_max ?? '?'}`
                        }
                      </span>
                    )}
                  </div>

                  {/* Trigger words */}
                  {lora.trigger_word_sets.length > 0 && (
                    <div className="space-y-1">
                      {lora.trigger_word_sets.slice(0, 2).map((tws) => (
                        <div key={tws.id} className="flex items-center gap-1.5 group/tws">
                          <p className="text-xs text-zinc-600 truncate flex-1">{tws.words.slice(0, 3).join(', ')}{tws.words.length > 3 ? '…' : ''}</p>
                          <button
                            id={`copy-trigger-${tws.id}`}
                            onClick={() => navigator.clipboard.writeText(tws.words.join(', '))}
                            className="opacity-0 group-hover/tws:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-300"
                          >
                            <Copy size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* File path tooltip */}
                  {lora.file_path && (
                    <div className="relative">
                      <button
                        id={`lora-path-${lora.id}`}
                        onMouseEnter={() => setTooltipLora(lora.id)}
                        onMouseLeave={() => setTooltipLora(null)}
                        className="text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        <Folder size={13} />
                      </button>
                      {tooltipLora === lora.id && (
                        <div className="absolute bottom-full left-0 mb-1 px-2 py-1 rounded bg-zinc-800 border border-[rgba(255,255,255,0.1)] text-xs text-zinc-300 whitespace-nowrap z-10">
                          {lora.file_path}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {filteredLoras.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
            <Layers size={40} strokeWidth={1} />
            <p className="mt-3 text-sm">No LoRAs registered yet.</p>
          </div>
        )}
      </div>

      {/* Register Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
              <h2 className="text-sm font-semibold text-zinc-200">Register LoRA Model</h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Model Name / Path *</label>
                <input
                  id="lora-model-name"
                  value={form.model_name}
                  onChange={(e) => setForm((f) => ({ ...f, model_name: e.target.value }))}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent-green/40"
                  placeholder="category/model_name.safetensors"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Description</label>
                <input
                  id="lora-description"
                  value={form.description ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent-green/40"
                  placeholder="Character name / role…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Strength Min</label>
                  <input
                    id="lora-strength-min"
                    type="number" step="0.1"
                    value={form.recommended_strength_min ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, recommended_strength_min: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent-green/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Strength Max</label>
                  <input
                    id="lora-strength-max"
                    type="number" step="0.1"
                    value={form.recommended_strength_max ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, recommended_strength_max: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent-green/40"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Category</label>
                <select
                  id="lora-category"
                  value={form.category_id ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value ? Number(e.target.value) : undefined }))}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-accent-green/40"
                >
                  <option value="">None</option>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button
                id="save-lora-btn"
                onClick={() => createLora.mutate()}
                disabled={!form.model_name || createLora.isPending}
                className="w-full py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {createLora.isPending ? 'Saving…' : 'Register LoRA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editLora && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
              <h2 className="text-sm font-semibold text-zinc-200">Edit LoRA Model</h2>
              <button onClick={() => setEditLora(null)} className="text-zinc-500 hover:text-zinc-300">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Model Name / Path *</label>
                <input
                  id="edit-lora-model-name"
                  value={editForm.model_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, model_name: e.target.value }))}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent-green/40"
                  placeholder="category/model_name.safetensors"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Description</label>
                <input
                  id="edit-lora-description"
                  value={editForm.description ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent-green/40"
                  placeholder="Character name / role…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Strength Min</label>
                  <input
                    id="edit-lora-strength-min"
                    type="number" step="0.1"
                    value={editForm.recommended_strength_min ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, recommended_strength_min: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent-green/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Strength Max</label>
                  <input
                    id="edit-lora-strength-max"
                    type="number" step="0.1"
                    value={editForm.recommended_strength_max ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, recommended_strength_max: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent-green/40"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Category</label>
                <select
                  id="edit-lora-category"
                  value={editForm.category_id ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, category_id: e.target.value ? Number(e.target.value) : undefined }))}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-accent-green/40"
                >
                  <option value="">None</option>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  id="cancel-edit-lora-btn"
                  onClick={() => setEditLora(null)}
                  className="flex-1 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm hover:bg-surface-2 transition-all"
                >
                  Cancel
                </button>
                <button
                  id="save-edit-lora-btn"
                  onClick={() => updateLora.mutate()}
                  disabled={!editForm.model_name || updateLora.isPending}
                  className="flex-1 py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {updateLora.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedLoraForDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setSelectedLoraForDetail(null)}>
          <div className="w-full max-w-lg bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
              <h2 className="text-sm font-semibold text-zinc-200">LoRA Model Details</h2>
              <button onClick={() => setSelectedLoraForDetail(null)} className="text-zinc-500 hover:text-zinc-300">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* Media & Key Info */}
              <div className="flex gap-4 items-start">
                <div className="w-24 h-24 bg-surface-2 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-[rgba(255,255,255,0.06)]">
                  {selectedLoraForDetail.thumbnail_path ? (
                    <img src={selectedLoraForDetail.thumbnail_path} alt={selectedLoraForDetail.model_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-zinc-600">
                      <ImageOff size={20} strokeWidth={1.5} />
                      <span className="text-[10px] mt-1">No Preview</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2 flex-1 min-w-0">
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Model Name</span>
                    <p className="text-sm font-medium text-zinc-200 break-all select-all">{selectedLoraForDetail.model_name}</p>
                  </div>
                  {selectedLoraForDetail.file_path && (
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">File Path</span>
                      <p className="text-xs text-zinc-400 break-all select-all">{selectedLoraForDetail.file_path}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Extra Meta Grid */}
              <div className="grid grid-cols-2 gap-4 border-t border-[rgba(255,255,255,0.06)] pt-4">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Category</span>
                  <span className="text-xs text-zinc-300">
                    {categories?.find((c) => c.id === selectedLoraForDetail.category_id)?.name || 'None'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Recommended Strength</span>
                  <span className="text-xs text-zinc-300">
                    {(selectedLoraForDetail.recommended_strength_min != null || selectedLoraForDetail.recommended_strength_max != null) ? (
                      selectedLoraForDetail.recommended_strength_min === selectedLoraForDetail.recommended_strength_max
                        ? `×${selectedLoraForDetail.recommended_strength_min}`
                        : `${selectedLoraForDetail.recommended_strength_min ?? '?'} ~ ${selectedLoraForDetail.recommended_strength_max ?? '?'}`
                    ) : (
                      'N/A'
                    )}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 space-y-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Description</span>
                <p className="text-xs text-zinc-300 leading-relaxed bg-surface-2 p-3 rounded-lg border border-[rgba(255,255,255,0.04)] whitespace-pre-wrap">
                  {selectedLoraForDetail.description || 'No description provided.'}
                </p>
              </div>

              {/* Trigger Word Sets */}
              <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 space-y-2">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Trigger Word Sets</span>
                {selectedLoraForDetail.trigger_word_sets.length > 0 ? (
                  <div className="space-y-2">
                    {selectedLoraForDetail.trigger_word_sets.map((tws) => {
                      const wordsStr = tws.words.join(', ');
                      const isCopied = copiedTriggerSetId === tws.id;
                      return (
                        <div key={tws.id} className="p-3 bg-surface-2 rounded-lg border border-[rgba(255,255,255,0.04)] flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] text-accent-green font-medium block mb-0.5">{tws.name || 'Trigger Set'}</span>
                            <p className="text-xs text-zinc-300 break-words select-all leading-normal">{wordsStr}</p>
                          </div>
                          <button
                            id={`modal-copy-trigger-${tws.id}`}
                            onClick={() => {
                              navigator.clipboard.writeText(wordsStr);
                              setCopiedTriggerSetId(tws.id);
                              setTimeout(() => setCopiedTriggerSetId(null), 2000);
                            }}
                            className={`p-2 rounded-md border transition-all ${
                              isCopied 
                                ? 'bg-accent-green/10 border-accent-green/30 text-accent-green' 
                                : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:bg-surface'
                            }`}
                            title="Copy trigger words"
                          >
                            {isCopied ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 italic">No trigger word sets registered.</p>
                )}
              </div>
            </div>
            
            <div className="px-5 py-4 border-t border-[rgba(255,255,255,0.06)] flex justify-end">
              <button
                id="close-detail-modal-btn"
                onClick={() => setSelectedLoraForDetail(null)}
                className="px-4 py-2 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 text-xs font-semibold hover:bg-surface-2 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
