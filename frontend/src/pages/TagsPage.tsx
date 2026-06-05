import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Tag, Copy, Trash2, X, ChevronDown } from 'lucide-react'
import { tagSetsApi, tagsetCategoriesApi } from '../api/client'
import type { TagSet, Category } from '../api/types'

export function TagsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

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

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        {[...grouped.entries()].map(([catName, sets]) => (
          <div key={catName}>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <div className="h-px flex-1 bg-[rgba(255,255,255,0.06)]" />
              {catName}
              <div className="h-px flex-1 bg-[rgba(255,255,255,0.06)]" />
            </h2>
            <div className="space-y-2">
              {sets.map((ts) => (
                <div
                  key={ts.id}
                  id={`tagset-card-${ts.id}`}
                  className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden hover:border-[rgba(255,255,255,0.1)] transition-all group"
                >
                  {/* Header Row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      id={`tagset-expand-${ts.id}`}
                      onClick={() => setExpanded(expanded === ts.id ? null : ts.id)}
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                    >
                      <ChevronDown
                        size={14}
                        className={`text-zinc-500 flex-shrink-0 transition-transform ${expanded === ts.id ? 'rotate-180' : ''}`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">{ts.name}</p>
                        {ts.description && (
                          <p className="text-xs text-zinc-500 truncate">{ts.description}</p>
                        )}
                      </div>
                      <span className="flex-shrink-0 text-xs text-zinc-600">{ts.tags.length} tags</span>
                    </button>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        id={`copy-tagset-${ts.id}`}
                        onClick={() => handleCopy(ts.id, ts.tags)}
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all ${
                          copiedId === ts.id
                            ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                            : 'bg-surface-2 border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Copy size={11} />
                        {copiedId === ts.id ? 'Copied!' : 'Copy'}
                      </button>
                      <button
                        id={`delete-tagset-${ts.id}`}
                        onClick={() => { if (confirm('Delete this tag set?')) deleteTagSet.mutate(ts.id) }}
                        className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Tags */}
                  {expanded === ts.id && (
                    <div className="px-4 pb-4 border-t border-[rgba(255,255,255,0.04)] pt-3 animate-fade-in">
                      <div className="flex flex-wrap gap-1.5">
                        {ts.tags.map((tag, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-0.5 rounded-md bg-[rgba(124,111,221,0.1)] border border-[rgba(124,111,221,0.2)] text-[#a99ef7] font-mono"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
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
    </div>
  )
}
