import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Wand2, ChevronDown, Save, RefreshCw, Plus } from 'lucide-react'
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { llmPromptsApi, configApi, mappingMastersApi } from '../api/client'
import type { LlmPrompt, MappingMaster } from '../api/types'
import { resolveComfyUrl } from '../hooks/useComfyWebSocket'
import {
  MappingMasterModal,
  MappingMasterDeleteModal,
  ConnectionStatus,
  SortableMasterRow,
  emptyMasterForm,
  masterFormToCreate,
  masterToForm,
  type MappingMasterFormState,
} from '../components/SettingsComponents'

const PROMPT_LABELS: Record<string, string> = {
  audit_interference: '干渉タグ診断（SDXL/汎用）',
  audit_interference_anima: '干渉タグ診断（Anima）',
  audit_vocabulary: '語彙サジェスト（SDXL/汎用）',
  audit_physical: '物理・構図整合性チェック',
}

export function SettingsPage() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [showMasterModal, setShowMasterModal] = useState<'create' | 'edit' | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedMaster, setSelectedMaster] = useState<MappingMaster | null>(null)
  const [masterForm, setMasterForm] = useState<MappingMasterFormState>(emptyMasterForm())
  const [comfyUrl, setComfyUrl] = useState('http://localhost:8188')
  const [saved, setSaved] = useState<string | null>(null)
  const [sortedMasters, setSortedMasters] = useState<MappingMaster[]>([])

  useEffect(() => {
    configApi.get()
      .then((cfg: any) => { if (cfg?.comfy_url) setComfyUrl(cfg.comfy_url) })
      .catch((e: any) => console.error('Failed to fetch comfy_url:', e))
  }, [])

  const { data: masters, isLoading: isLoadingMasters } = useQuery({
    queryKey: ['mapping-masters'],
    queryFn: () => mappingMastersApi.list() as Promise<MappingMaster[]>,
  })

  useEffect(() => {
    if (masters) {
      setSortedMasters(masters)
    }
  }, [masters])

  const { data: usages, isLoading: isLoadingUsages } = useQuery({
    queryKey: ['mapping-master-usages', selectedMaster?.id],
    queryFn: () => mappingMastersApi.getUsages(selectedMaster!.id),
    enabled: !!selectedMaster && showDeleteModal,
  })

  const reorderMaster = useMutation({
    mutationFn: (ordered_ids: number[]) => mappingMastersApi.reorder(ordered_ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
    },
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = sortedMasters.findIndex((m) => m.id === active.id)
      const newIndex = sortedMasters.findIndex((m) => m.id === over.id)
      const reordered = arrayMove(sortedMasters, oldIndex, newIndex)
      setSortedMasters(reordered)
      reorderMaster.mutate(reordered.map((m) => m.id))
    }
  }

  const createMaster = useMutation({
    mutationFn: (data: Parameters<typeof mappingMastersApi.create>[0]) => mappingMastersApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mapping-masters'] }); closeMasterModal() },
  })
  const updateMaster = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof mappingMastersApi.update>[1] }) => mappingMastersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mapping-masters'] }); closeMasterModal() },
  })
  const deleteMaster = useMutation({
    mutationFn: (id: number) => mappingMastersApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mapping-masters'] }); closeDeleteModal() },
  })

  const { data: prompts, isLoading } = useQuery({
    queryKey: ['llm-prompts'],
    queryFn: () => llmPromptsApi.list() as Promise<LlmPrompt[]>,
  })
  const updatePrompt = useMutation({
    mutationFn: ({ key, content }: { key: string; content: string }) => llmPromptsApi.update(key, { content }),
    onSuccess: (_, { key }) => { qc.invalidateQueries({ queryKey: ['llm-prompts'] }); setSaved(key); setTimeout(() => setSaved(null), 2000) },
  })

  const openCreateModal = () => { setMasterForm(emptyMasterForm()); setShowMasterModal('create') }
  const openEditModal = (mm: MappingMaster) => { setSelectedMaster(mm); setMasterForm(masterToForm(mm)); setShowMasterModal('edit') }
  const closeMasterModal = () => { setShowMasterModal(null); setSelectedMaster(null) }
  const openDeleteModal = (mm: MappingMaster) => { setSelectedMaster(mm); setShowDeleteModal(true) }
  const closeDeleteModal = () => { setShowDeleteModal(false); setSelectedMaster(null) }

  const handleSaveMaster = (e: React.FormEvent) => {
    e.preventDefault()
    const data = masterFormToCreate(masterForm)
    if (showMasterModal === 'create') createMaster.mutate(data)
    else if (showMasterModal === 'edit' && selectedMaster) updateMaster.mutate({ id: selectedMaster.id, data })
  }

  const getContent = (p: LlmPrompt) => edits[p.key] ?? p.content

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <Settings size={17} className="text-zinc-400" />
        <h1 className="text-base font-semibold text-zinc-200">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        {/* LLM System Prompts */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Wand2 size={15} className="text-[#7C6FDD]" />
            <h2 className="text-sm font-semibold text-zinc-300">LLM System Prompts</h2>
            <span className="text-xs text-zinc-600">— DBに保存（再起動不要）</span>
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 text-zinc-600 text-sm py-8"><RefreshCw size={14} className="animate-spin" />Loading prompts…</div>
          ) : (
            <div className="space-y-3">
              {prompts?.map((p) => (
                <div key={p.key} id={`prompt-section-${p.key}`} className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden">
                  <button id={`prompt-expand-${p.key}`} onClick={() => setExpanded(expanded === p.key ? null : p.key)}
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/5 transition-colors">
                    <div className="text-left">
                      <p className="text-sm font-medium text-zinc-200">{PROMPT_LABELS[p.key] ?? p.key}</p>
                      {p.description && <p className="text-xs text-zinc-500 mt-0.5">{p.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <span className="text-xs text-zinc-600">{new Date(p.updated_at).toLocaleDateString('ja-JP')}</span>
                      <ChevronDown size={14} className={`text-zinc-500 transition-transform ${expanded === p.key ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {expanded === p.key && (
                    <div className="px-4 pb-4 space-y-3 border-t border-[rgba(255,255,255,0.04)] pt-3 animate-fade-in">
                      <textarea id={`prompt-content-${p.key}`} value={getContent(p)}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [p.key]: e.target.value }))} rows={16}
                        className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 text-xs text-zinc-200 font-mono resize-y focus:outline-none focus:border-[#7C6FDD]/40 custom-scrollbar" />
                      <div className="flex items-center justify-between">
                        <button id={`prompt-reset-${p.key}`}
                          onClick={() => setEdits((prev) => { const n = { ...prev }; delete n[p.key]; return n })}
                          disabled={!edits[p.key]} className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors">Reset changes</button>
                        <button id={`prompt-save-${p.key}`}
                          onClick={() => updatePrompt.mutate({ key: p.key, content: getContent(p) })} disabled={updatePrompt.isPending}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${saved === p.key ? 'bg-accent-green/20 text-accent-green border border-accent-green/40' : 'bg-[#7C6FDD] text-white hover:bg-[#6d62cc]'}`}>
                          <Save size={12} />{saved === p.key ? 'Saved!' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Mapping Masters */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Settings size={15} className="text-[#7C6FDD]" />
              <h2 className="text-sm font-semibold text-zinc-300">Node Mapping Masters</h2>
              <span className="text-xs text-zinc-600">— 編集ノードのマッピングマスタ設定</span>
            </div>
            <button onClick={openCreateModal}
              className="flex items-center gap-1 text-xs bg-[#7C6FDD] text-white px-3 py-1.5 rounded-lg font-medium hover:bg-[#6d62cc] transition-all">
              <Plus size={12} />Add Master
            </button>
          </div>
          {isLoadingMasters ? (
            <div className="flex items-center gap-2 text-zinc-600 text-sm py-8"><RefreshCw size={14} className="animate-spin" />Loading mapping masters…</div>
          ) : (
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.06)] text-zinc-400 bg-white/[0.01]">
                    {['', 'Role', 'Display Name', 'Param Name', 'Input Type', 'Expected Class Types', 'Title Patterns', ''].map((h, i) => (
                      <th key={i} className={`px-4 py-3 font-medium${h === '' && i === 7 ? ' text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={sortedMasters.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                    <tbody className="divide-y divide-[rgba(255,255,255,0.04)] text-zinc-300">
                      {sortedMasters.map((mm) => (
                        <SortableMasterRow
                          key={mm.id}
                          mm={mm}
                          openEditModal={openEditModal}
                          openDeleteModal={openDeleteModal}
                        />
                      ))}
                      {(!sortedMasters || sortedMasters.length === 0) && (
                        <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-500">No mapping masters found.</td></tr>
                      )}
                    </tbody>
                  </SortableContext>
                </DndContext>
              </table>
            </div>
          )}
        </section>

        {/* Connections */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Settings size={15} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-300">Connections</h2>
          </div>
          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface p-4 space-y-3">
            {[
              { label: 'FastAPI Backend', url: `${window.location.origin}/health` },
              { label: 'ComfyUI', url: resolveComfyUrl(comfyUrl) },
            ].map(({ label, url }) => (
              <ConnectionStatus key={label} label={label} url={url} />
            ))}
          </div>
        </section>
      </div>

      {/* Modals */}
      {showMasterModal && (
        <MappingMasterModal mode={showMasterModal} form={masterForm} setForm={setMasterForm}
          isPending={createMaster.isPending || updateMaster.isPending}
          onClose={closeMasterModal} onSubmit={handleSaveMaster} />
      )}
      {showDeleteModal && selectedMaster && (
        <MappingMasterDeleteModal master={selectedMaster} usages={usages as any} isLoadingUsages={isLoadingUsages}
          isPending={deleteMaster.isPending}
          onClose={closeDeleteModal} onDelete={() => deleteMaster.mutate(selectedMaster.id)} />
      )}
    </div>
  )
}
