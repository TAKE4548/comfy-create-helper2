import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Tag, Copy, Trash2, X, Pencil, Check } from 'lucide-react'
import { tagSetsApi, tagsetCategoriesApi } from '../api/client'
import type { TagSet, Category } from '../api/types'

export function TagsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  // New states for Detail & Edit
  const [selectedTagSetForDetail, setSelectedTagSetForDetail] = useState<TagSet | null>(null)
  const [copiedDetailId, setCopiedDetailId] = useState<number | null>(null)
  const [editTagSet, setEditTagSet] = useState<TagSet | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    category_id: undefined as number | undefined,
    tags: '',
  })

  const [form, setForm] = useState({
    name: '',
    description: '',
    category_id: undefined as number | undefined,
    tags: '',
  })

  const { data: categories } = useQuery({
    queryKey: ['tagset-categories'],
    queryFn: () => tagsetCategoriesApi.list() as Promise<Category[]>,
  })

  const { data: tagSets } = useQuery({
    queryKey: ['tag-sets', selectedCat],
    queryFn: () => tagSetsApi.list(selectedCat ?? undefined) as Promise<TagSet[]>,
  })

  const createTagSet = useMutation({
    mutationFn: () => tagSetsApi.create({
      name: form.name,
      description: form.description || undefined,
      category_id: form.category_id,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tag-sets'] })
      setShowModal(false)
      setForm({ name: '', description: '', category_id: undefined, tags: '' })
    },
  })

  const updateTagSet = useMutation({
    mutationFn: () => tagSetsApi.update(editTagSet!.id, {
      name: editForm.name,
      description: editForm.description || undefined,
      category_id: editForm.category_id,
      tags: editForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tag-sets'] })
      setEditTagSet(null)
    },
  })

  const deleteTagSet = useMutation({
    mutationFn: (id: number) => tagSetsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tag-sets'] }),
  })

  const handleCopy = (id: number, tags: string[]) => {
    navigator.clipboard.writeText(tags.join(', '))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1200)
  }

  const filtered = tagSets?.filter(
    (ts) =>
      ts.name.toLowerCase().includes(search.toLowerCase()) ||
      (ts.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
      ts.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  ) ?? []

  // Group by category
  const grouped = new Map<string, TagSet[]>()
  filtered.forEach((ts) => {
    const catName = categories?.find((c) => c.id === ts.category_id)?.name ?? 'Uncategorized'
    if (!grouped.has(catName)) grouped.set(catName, [])
    grouped.get(catName)!.push(ts)
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <h1 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
          <Tag size={17} className="text-accent-purple" />
          Tag Sets
          <span className="text-xs text-zinc-500 font-normal ml-1">({filtered.length})</span>
        </h1>
        <button
          id="create-tagset-btn"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7C6FDD]/10 border border-[#7C6FDD]/30 text-[#7C6FDD] text-xs font-medium hover:bg-[#7C6FDD]/20 transition-all"
        >
          <Plus size={14} />
          New Tag Set
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[rgba(255,255,255,0.06)] bg-surface/50">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            id="tag-search"
            type="text"
            placeholder="Search tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-[#7C6FDD]/40"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
          <button
            id="tag-filter-all"
            onClick={() => setSelectedCat(null)}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${
              selectedCat === null
                ? 'bg-[#7C6FDD]/10 border-[#7C6FDD]/40 text-[#7C6FDD]'
                : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'
            }`}
          >
            All
          </button>
          {categories?.map((cat) => (
            <button
              key={cat.id}
              id={`tag-filter-${cat.id}`}
              onClick={() => setSelectedCat(cat.id === selectedCat ? null : cat.id)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                selectedCat === cat.id
                  ? 'bg-[#7C6FDD]/10 border-[#7C6FDD]/40 text-[#7C6FDD]'
                  : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        {[...grouped.entries()].map(([catName, sets]) => (
          <div key={catName}>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <div className="h-px flex-1 bg-[rgba(255,255,255,0.06)]" />
              {catName}
              <div className="h-px flex-1 bg-[rgba(255,255,255,0.06)]" />
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {sets.map((ts) => (
                <div
                  key={ts.id}
                  id={`tagset-card-${ts.id}`}
                  onClick={() => setSelectedTagSetForDetail(ts)}
                  className="group relative rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface p-3 flex flex-col justify-between gap-3 hover:border-[rgba(255,255,255,0.12)] transition-all animate-fade-in cursor-pointer min-h-[120px]"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-xs font-semibold text-zinc-200 truncate" title={ts.name}>
                        {ts.name}
                      </p>
                      
                      {/* Action buttons on hover */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          id={`tagset-edit-${ts.id}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditTagSet(ts)
                            setEditForm({
                              name: ts.name,
                              description: ts.description ?? '',
                              category_id: ts.category_id ?? undefined,
                              tags: ts.tags.join(', '),
                            })
                          }}
                          className="p-1 rounded bg-surface-2 text-zinc-400 hover:bg-[#7C6FDD]/20 hover:text-[#7C6FDD] transition-all"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          id={`tagset-delete-${ts.id}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('Delete this tag set?')) deleteTagSet.mutate(ts.id)
                          }}
                          className="p-1 rounded bg-surface-2 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-all"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                    
                    {ts.description && (
                      <p className="text-[10px] text-zinc-500 truncate" title={ts.description}>
                        {ts.description}
                      </p>
                    )}
                  </div>

                  {/* Tags Preview */}
                  <div className="flex flex-wrap gap-1 overflow-hidden max-h-[44px]">
                    {ts.tags.slice(0, 5).map((tag, i) => (
                      <span
                        key={i}
                        className="text-[9px] px-1 py-0.5 rounded bg-[rgba(124,111,221,0.06)] border border-[rgba(124,111,221,0.15)] text-[#a99ef7] font-mono truncate max-w-[80px]"
                      >
                        {tag}
                      </span>
                    ))}
                    {ts.tags.length > 5 && (
                      <span className="text-[9px] px-1 py-0.5 text-zinc-600 font-medium">
                        +{ts.tags.length - 5}
                      </span>
                    )}
                  </div>

                  {/* Footer Stats & Copy Option */}
                  <div className="flex items-center justify-between border-t border-[rgba(255,255,255,0.04)] pt-2 mt-1">
                    <span className="text-[9px] text-zinc-600">{ts.tags.length} tags</span>
                    <button
                      id={`copy-tagset-${ts.id}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopy(ts.id, ts.tags)
                      }}
                      className={`text-[9px] px-1.5 py-0.5 rounded transition-all flex items-center gap-1 ${
                        copiedId === ts.id
                          ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                          : 'bg-surface-2 border border-[rgba(255,255,255,0.08)] text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <Copy size={9} />
                      {copiedId === ts.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
            <Tag size={40} strokeWidth={1} />
            <p className="mt-3 text-sm">No tag sets yet.</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
              <h2 className="text-sm font-semibold text-zinc-200">New Tag Set</h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Name *</label>
                <input
                  id="tagset-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40"
                  placeholder="e.g. 水着セット"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Description</label>
                <input
                  id="tagset-description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40"
                  placeholder="Optional description…"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Category</label>
                <select
                  id="tagset-category"
                  value={form.category_id ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value ? Number(e.target.value) : undefined }))}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-[#7C6FDD]/40"
                >
                  <option value="">None</option>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Tags (comma-separated) *</label>
                <textarea
                  id="tagset-tags"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  rows={4}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-[#7C6FDD]/40 resize-none"
                  placeholder="swimsuit, bikini, white bikini, ..."
                />
              </div>
              <button
                id="save-tagset-btn"
                onClick={() => createTagSet.mutate()}
                disabled={!form.name || !form.tags || createTagSet.isPending}
                className="w-full py-2.5 rounded-xl bg-[#7C6FDD] text-white font-bold text-sm hover:bg-[#6d62cc] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {createTagSet.isPending ? 'Saving…' : 'Create Tag Set'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editTagSet && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
              <h2 className="text-sm font-semibold text-zinc-200">Edit Tag Set</h2>
              <button onClick={() => setEditTagSet(null)} className="text-zinc-500 hover:text-zinc-300">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Name *</label>
                <input
                  id="edit-tagset-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Description</label>
                <input
                  id="edit-tagset-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Category</label>
                <select
                  id="edit-tagset-category"
                  value={editForm.category_id ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, category_id: e.target.value ? Number(e.target.value) : undefined }))}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-[#7C6FDD]/40"
                >
                  <option value="">None</option>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Tags (comma-separated) *</label>
                <textarea
                  id="edit-tagset-tags"
                  value={editForm.tags}
                  onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))}
                  rows={4}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-[#7C6FDD]/40 resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditTagSet(null)}
                  className="flex-1 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm hover:bg-surface-2 transition-all"
                >
                  Cancel
                </button>
                <button
                  id="save-edit-tagset-btn"
                  onClick={() => updateTagSet.mutate()}
                  disabled={!editForm.name || !editForm.tags || updateTagSet.isPending}
                  className="flex-1 py-2.5 rounded-xl bg-[#7C6FDD] text-white font-bold text-sm hover:bg-[#6d62cc] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {updateTagSet.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedTagSetForDetail && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setSelectedTagSetForDetail(null)}
        >
          <div
            className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
              <h2 className="text-sm font-semibold text-zinc-200">Tag Set Details</h2>
              <button onClick={() => setSelectedTagSetForDetail(null)} className="text-zinc-500 hover:text-zinc-300">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Name</span>
                <p className="text-sm font-medium text-zinc-200">{selectedTagSetForDetail.name}</p>
              </div>

              {selectedTagSetForDetail.description && (
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Description</span>
                  <p className="text-xs text-zinc-400 leading-relaxed bg-surface-2 p-3 rounded-lg border border-[rgba(255,255,255,0.04)]">
                    {selectedTagSetForDetail.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 border-t border-[rgba(255,255,255,0.06)] pt-4">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Category</span>
                  <span className="text-xs text-zinc-300">
                    {categories?.find((c) => c.id === selectedTagSetForDetail.category_id)?.name || 'None'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Tags Count</span>
                  <span className="text-xs text-zinc-300">{selectedTagSetForDetail.tags.length} tags</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-[rgba(255,255,255,0.06)] pt-4">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Tags</span>
                <div className="p-3 bg-surface-2 rounded-lg border border-[rgba(255,255,255,0.04)] flex items-start justify-between gap-4">
                  <div className="flex flex-wrap gap-1.5 min-w-0 flex-1">
                    {selectedTagSetForDetail.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-0.5 rounded bg-[rgba(124,111,221,0.1)] border border-[rgba(124,111,221,0.2)] text-[#a99ef7] font-mono"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <button
                    id={`detail-copy-btn-${selectedTagSetForDetail.id}`}
                    onClick={() => {
                      navigator.clipboard.writeText(selectedTagSetForDetail.tags.join(', '))
                      setSelectedTagSetForDetail(null) // optionally close or stay
                      // Let's set copied feedback
                      setCopiedDetailId(selectedTagSetForDetail.id)
                      setTimeout(() => setCopiedDetailId(null), 2000)
                    }}
                    className={`p-2 rounded-md border transition-all flex-shrink-0 ${
                      copiedDetailId === selectedTagSetForDetail.id
                        ? 'bg-accent-purple/10 border-[#7C6FDD]/40 text-[#7C6FDD]'
                        : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:bg-surface'
                    }`}
                  >
                    {copiedDetailId === selectedTagSetForDetail.id ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-[rgba(255,255,255,0.06)] flex justify-end">
              <button
                id="close-detail-modal-btn"
                onClick={() => setSelectedTagSetForDetail(null)}
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

