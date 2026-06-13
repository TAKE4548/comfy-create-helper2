import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Folder, Copy, Layers, Trash2, ImageOff, Pencil } from 'lucide-react'
import { lorasApi, loraCategoriesApi } from '../api/client'
import type { Lora, Category } from '../api/types'
import {
  LoraRegisterModal,
  LoraEditModal,
  LoraDetailModal,
  type LoraFormState,
} from '../components/LoraModals'

const EMPTY_FORM: LoraFormState = {
  model_name: '',
  description: '',
  recommended_strength_min: undefined,
  recommended_strength_max: undefined,
  category_id: undefined,
  file_path: '',
  trigger_word_sets: [],
}

export function LoRAsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [tooltipLora, setTooltipLora] = useState<number | null>(null)
  const [editLora, setEditLora] = useState<Lora | null>(null)
  const [selectedLoraForDetail, setSelectedLoraForDetail] = useState<Lora | null>(null)
  const [copiedTriggerSetId, setCopiedTriggerSetId] = useState<number | null>(null)
  const [form, setForm] = useState<LoraFormState>(EMPTY_FORM)
  const [editForm, setEditForm] = useState<LoraFormState>(EMPTY_FORM)

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loras'] }); setShowModal(false); setForm(EMPTY_FORM) },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loras'] }); setEditLora(null) },
  })

  const filteredLoras = loras?.filter((l) =>
    l.model_name.toLowerCase().includes(search.toLowerCase()) ||
    (l.description ?? '').toLowerCase().includes(search.toLowerCase())
  ) ?? []

  const openEdit = (lora: Lora) => {
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
  }

  const handleCopy = (id: number, words: string) => {
    navigator.clipboard.writeText(words)
    setCopiedTriggerSetId(id)
    setTimeout(() => setCopiedTriggerSetId(null), 2000)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <h1 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
          <Layers size={17} className="text-accent-green" />LoRAs
          <span className="text-xs text-zinc-500 font-normal ml-1">({filteredLoras.length})</span>
        </h1>
        <button id="register-lora-btn" onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green text-xs font-medium hover:bg-accent-green/20 transition-all">
          <Plus size={14} />Register Model
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[rgba(255,255,255,0.06)] bg-surface/50">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input id="lora-search" type="text" placeholder="Search LoRAs…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-accent-green/40" />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
          <button id="lora-filter-all" onClick={() => setSelectedCat(null)}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${selectedCat === null ? 'bg-accent-green/10 border-accent-green/40 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'}`}>
            All
          </button>
          {categories?.map((cat) => (
            <button key={cat.id} id={`lora-filter-${cat.id}`}
              onClick={() => setSelectedCat(cat.id === selectedCat ? null : cat.id)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${selectedCat === cat.id ? 'bg-accent-green/10 border-accent-green/40 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'}`}>
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
              <div key={lora.id} id={`lora-card-${lora.id}`} onClick={() => setSelectedLoraForDetail(lora)}
                className="group relative rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden hover:border-[rgba(255,255,255,0.12)] transition-all animate-fade-in cursor-pointer">
                <div className="aspect-square bg-surface-2 flex items-center justify-center relative overflow-hidden">
                  {lora.thumbnail_path
                    ? <img src={lora.thumbnail_path} alt={lora.model_name} className="w-full h-full object-cover" />
                    : <div className="flex flex-col items-center gap-2 text-zinc-600"><ImageOff size={28} strokeWidth={1} /><span className="text-xs">No Preview</span></div>}
                  <button id={`lora-edit-${lora.id}`} onClick={(e) => { e.stopPropagation(); openEdit(lora) }}
                    className="absolute top-2 right-8 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-surface/80 text-zinc-400 hover:bg-accent-green/20 hover:text-accent-green">
                    <Pencil size={13} />
                  </button>
                  <button id={`lora-delete-${lora.id}`}
                    onClick={(e) => { e.stopPropagation(); if (confirm('Delete this LoRA?')) deleteLora.mutate(lora.id) }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-surface/80 text-red-400 hover:bg-red-500/20">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="p-3 space-y-2">
                  <div>
                    <p className="text-xs font-medium text-zinc-200 truncate" title={lora.description || lora.model_name}>
                      {lora.description || lora.model_name.split('/').pop()}
                    </p>
                    {lora.description && <p className="text-xs text-zinc-500 truncate mt-0.5" title={lora.model_name}>{lora.model_name.split('/').pop()}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {catName && <span className="text-xs px-1.5 py-0.5 rounded bg-accent-green/10 text-accent-green border border-accent-green/20">{catName}</span>}
                    {(lora.recommended_strength_min != null || lora.recommended_strength_max != null) && (
                      <span className="text-xs text-zinc-500">
                        {lora.recommended_strength_min === lora.recommended_strength_max
                          ? `×${lora.recommended_strength_min}`
                          : `${lora.recommended_strength_min ?? '?'}~${lora.recommended_strength_max ?? '?'}`}
                      </span>
                    )}
                  </div>
                  {lora.trigger_word_sets.length > 0 && (
                    <div className="space-y-1">
                      {lora.trigger_word_sets.slice(0, 2).map((tws) => (
                        <div key={tws.id} className="flex items-center gap-1.5 group/tws">
                          <p className="text-xs text-zinc-600 truncate flex-1">{tws.words.slice(0, 3).join(', ')}{tws.words.length > 3 ? '…' : ''}</p>
                          <button id={`copy-trigger-${tws.id}`}
                            onClick={() => navigator.clipboard.writeText(tws.words.join(', '))}
                            className="opacity-0 group-hover/tws:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-300">
                            <Copy size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {lora.file_path && (
                    <div className="relative">
                      <button id={`lora-path-${lora.id}`}
                        onMouseEnter={() => setTooltipLora(lora.id)}
                        onMouseLeave={() => setTooltipLora(null)}
                        className="text-zinc-600 hover:text-zinc-400 transition-colors">
                        <Folder size={13} />
                      </button>
                      {tooltipLora === lora.id && (
                        <div className="absolute bottom-full left-0 mb-1 px-2 py-1 rounded bg-zinc-800 border border-[rgba(255,255,255,0.1)] text-xs text-zinc-300 whitespace-nowrap z-10">{lora.file_path}</div>
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

      {/* Modals */}
      {showModal && (
        <LoraRegisterModal form={form} setForm={setForm} categories={categories}
          isPending={createLora.isPending}
          onClose={() => setShowModal(false)}
          onSubmit={() => createLora.mutate()} />
      )}
      {editLora && (
        <LoraEditModal form={editForm} setForm={setEditForm} categories={categories}
          isPending={updateLora.isPending}
          onClose={() => setEditLora(null)}
          onSubmit={() => updateLora.mutate()} />
      )}
      {selectedLoraForDetail && (
        <LoraDetailModal lora={selectedLoraForDetail} categories={categories}
          copiedId={copiedTriggerSetId}
          onCopy={handleCopy}
          onClose={() => setSelectedLoraForDetail(null)} />
      )}
    </div>
  )
}
