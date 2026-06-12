import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Wand2, ChevronDown, Save, RefreshCw, Plus, Edit2, Trash2, X, AlertTriangle } from 'lucide-react'
import { llmPromptsApi, configApi, mappingMastersApi } from '../api/client'
import type { LlmPrompt, MappingMaster, MappingMasterCreate } from '../api/types'
import { resolveComfyUrl } from '../hooks/useComfyWebSocket'

export function SettingsPage() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})

  // Mapping Masters State
  const [showMasterModal, setShowMasterModal] = useState<'create' | 'edit' | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedMaster, setSelectedMaster] = useState<MappingMaster | null>(null)

  const [formRole, setFormRole] = useState('')
  const [formExpectedClassTypes, setFormExpectedClassTypes] = useState('')
  const [formParamName, setFormParamName] = useState('')
  const [formInputType, setFormInputType] = useState<'textarea' | 'int' | 'float' | 'select'>('textarea')
  const [formDisplayName, setFormDisplayName] = useState('')
  const [formTitlePatterns, setFormTitlePatterns] = useState('')

  const { data: masters, isLoading: isLoadingMasters } = useQuery({
    queryKey: ['mapping-masters'],
    queryFn: () => mappingMastersApi.list() as Promise<MappingMaster[]>,
  })

  const { data: usages, isLoading: isLoadingUsages } = useQuery({
    queryKey: ['mapping-master-usages', selectedMaster?.id],
    queryFn: () => mappingMastersApi.getUsages(selectedMaster!.id),
    enabled: !!selectedMaster && showDeleteModal,
  })

  const createMaster = useMutation({
    mutationFn: (data: MappingMasterCreate) => mappingMastersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      closeMasterModal()
    },
  })

  const updateMaster = useMutation({
    mutationFn: ({ id, data }: { id: number; data: MappingMasterCreate }) =>
      mappingMastersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      closeMasterModal()
    },
  })

  const deleteMaster = useMutation({
    mutationFn: (id: number) => mappingMastersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      closeDeleteModal()
    },
  })

  const openCreateModal = () => {
    setFormRole('')
    setFormExpectedClassTypes('')
    setFormParamName('')
    setFormInputType('textarea')
    setFormDisplayName('')
    setFormTitlePatterns('')
    setShowMasterModal('create')
  }

  const openEditModal = (mm: MappingMaster) => {
    setSelectedMaster(mm)
    setFormRole(mm.role)
    setFormExpectedClassTypes(mm.expected_class_types?.join(', ') ?? '')
    setFormParamName(mm.param_name)
    setFormInputType(mm.input_type)
    setFormDisplayName(mm.display_name)
    setFormTitlePatterns(mm.title_patterns?.join(', ') ?? '')
    setShowMasterModal('edit')
  }

  const closeMasterModal = () => {
    setShowMasterModal(null)
    setSelectedMaster(null)
  }

  const openDeleteModal = (mm: MappingMaster) => {
    setSelectedMaster(mm)
    setShowDeleteModal(true)
  }

  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setSelectedMaster(null)
  }

  const handleSaveMaster = (e: React.FormEvent) => {
    e.preventDefault()
    const data: MappingMasterCreate = {
      role: formRole,
      expected_class_types: formExpectedClassTypes.split(',').map((s) => s.trim()).filter(Boolean),
      param_name: formParamName,
      input_type: formInputType,
      display_name: formDisplayName,
      title_patterns: formTitlePatterns.split(',').map((s) => s.trim()).filter(Boolean),
    }

    if (showMasterModal === 'create') {
      createMaster.mutate(data)
    } else if (showMasterModal === 'edit' && selectedMaster) {
      updateMaster.mutate({ id: selectedMaster.id, data })
    }
  }

  const [comfyUrl, setComfyUrl] = useState<string>('http://localhost:8188')

  useEffect(() => {
    configApi.get()
      .then((config) => {
        if (config && config.comfy_url) {
          setComfyUrl(config.comfy_url)
        }
      })
      .catch((e) => {
        console.error('Failed to fetch comfy_url:', e)
      })
  }, [])

  const [saved, setSaved] = useState<string | null>(null)

  const { data: prompts, isLoading } = useQuery({
    queryKey: ['llm-prompts'],
    queryFn: () => llmPromptsApi.list() as Promise<LlmPrompt[]>,
  })

  const updatePrompt = useMutation({
    mutationFn: ({ key, content }: { key: string; content: string }) =>
      llmPromptsApi.update(key, { content }),
    onSuccess: (_, { key }) => {
      qc.invalidateQueries({ queryKey: ['llm-prompts'] })
      setSaved(key)
      setTimeout(() => setSaved(null), 2000)
    },
  })

  const handleEdit = (key: string, value: string) => {
    setEdits((prev) => ({ ...prev, [key]: value }))
  }

  const getContent = (p: LlmPrompt) => edits[p.key] ?? p.content

  const promptLabels: Record<string, string> = {
    audit_interference: '干渉タグ診断（SDXL/汎用）',
    audit_interference_anima: '干渉タグ診断（Anima）',
    audit_vocabulary: '語彙サジェスト（SDXL/汎用）',
    audit_physical: '物理・構図整合性チェック',
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <Settings size={17} className="text-zinc-400" />
        <h1 className="text-base font-semibold text-zinc-200">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        {/* LLM System Prompts Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Wand2 size={15} className="text-[#7C6FDD]" />
            <h2 className="text-sm font-semibold text-zinc-300">LLM System Prompts</h2>
            <span className="text-xs text-zinc-600">— DBに保存（再起動不要）</span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-zinc-600 text-sm py-8">
              <RefreshCw size={14} className="animate-spin" />
              Loading prompts…
            </div>
          ) : (
            <div className="space-y-3">
              {prompts?.map((p) => (
                <div
                  key={p.key}
                  id={`prompt-section-${p.key}`}
                  className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden"
                >
                  <button
                    id={`prompt-expand-${p.key}`}
                    onClick={() => setExpanded(expanded === p.key ? null : p.key)}
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/5 transition-colors"
                  >
                    <div className="text-left">
                      <p className="text-sm font-medium text-zinc-200">
                        {promptLabels[p.key] ?? p.key}
                      </p>
                      {p.description && (
                        <p className="text-xs text-zinc-500 mt-0.5">{p.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <span className="text-xs text-zinc-600">
                        {new Date(p.updated_at).toLocaleDateString('ja-JP')}
                      </span>
                      <ChevronDown
                        size={14}
                        className={`text-zinc-500 transition-transform ${expanded === p.key ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>

                  {expanded === p.key && (
                    <div className="px-4 pb-4 space-y-3 border-t border-[rgba(255,255,255,0.04)] pt-3 animate-fade-in">
                      <textarea
                        id={`prompt-content-${p.key}`}
                        value={getContent(p)}
                        onChange={(e) => handleEdit(p.key, e.target.value)}
                        rows={16}
                        className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 text-xs text-zinc-200 font-mono resize-y focus:outline-none focus:border-[#7C6FDD]/40 custom-scrollbar"
                      />
                      <div className="flex items-center justify-between">
                        <button
                          id={`prompt-reset-${p.key}`}
                          onClick={() => setEdits((prev) => { const n = { ...prev }; delete n[p.key]; return n })}
                          disabled={!edits[p.key]}
                          className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
                        >
                          Reset changes
                        </button>
                        <button
                          id={`prompt-save-${p.key}`}
                          onClick={() => updatePrompt.mutate({ key: p.key, content: getContent(p) })}
                          disabled={updatePrompt.isPending}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                            saved === p.key
                              ? 'bg-accent-green/20 text-accent-green border border-accent-green/40'
                              : 'bg-[#7C6FDD] text-white hover:bg-[#6d62cc]'
                          }`}
                        >
                          <Save size={12} />
                          {saved === p.key ? 'Saved!' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Mapping Masters Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Settings size={15} className="text-[#7C6FDD]" />
              <h2 className="text-sm font-semibold text-zinc-300">Node Mapping Masters</h2>
              <span className="text-xs text-zinc-600">— 編集ノードのマッピングマスタ設定</span>
            </div>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1 text-xs bg-[#7C6FDD] text-white px-3 py-1.5 rounded-lg font-medium hover:bg-[#6d62cc] transition-all"
            >
              <Plus size={12} />
              Add Master
            </button>
          </div>

          {isLoadingMasters ? (
            <div className="flex items-center gap-2 text-zinc-600 text-sm py-8">
              <RefreshCw size={14} className="animate-spin" />
              Loading mapping masters…
            </div>
          ) : (
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.06)] text-zinc-400 bg-white/[0.01]">
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Display Name</th>
                    <th className="px-4 py-3 font-medium">Param Name</th>
                    <th className="px-4 py-3 font-medium">Input Type</th>
                    <th className="px-4 py-3 font-medium">Expected Class Types</th>
                    <th className="px-4 py-3 font-medium">Title Patterns</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.04)] text-zinc-300">
                  {masters?.map((mm) => (
                    <tr key={mm.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="px-4 py-3 font-mono text-zinc-200">{mm.role}</td>
                      <td className="px-4 py-3">{mm.display_name}</td>
                      <td className="px-4 py-3 font-mono text-zinc-400">{mm.param_name}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px]">{mm.input_type}</span></td>
                      <td className="px-4 py-3 text-zinc-500 font-mono max-w-[150px] truncate" title={mm.expected_class_types?.join(', ') || ''}>
                        {mm.expected_class_types?.join(', ') || '-'}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 font-mono max-w-[150px] truncate" title={mm.title_patterns?.join(', ') || ''}>
                        {mm.title_patterns?.join(', ') || '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(mm)}
                            className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => openDeleteModal(mm)}
                            className="p-1 text-zinc-400 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!masters || masters.length === 0) && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                        No mapping masters found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Connections Status */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Settings size={15} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-300">Connections</h2>
          </div>
          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface p-4 space-y-3">
            {[
              { label: 'FastAPI Backend', url: typeof window !== 'undefined' ? `${window.location.origin}/health` : 'http://localhost:8000/health' },
              { label: 'ComfyUI', url: resolveComfyUrl(comfyUrl) },
            ].map(({ label, url }) => (
              <ConnectionStatus key={label} label={label} url={url} />
            ))}
          </div>
        </section>
      </div>

      {/* Create / Edit Modal */}
      {showMasterModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-surface border border-[rgba(255,255,255,0.08)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-3">
              <h3 className="text-sm font-semibold text-zinc-200">
                {showMasterModal === 'create' ? 'Create Mapping Master' : 'Edit Mapping Master'}
              </h3>
              <button onClick={closeMasterModal} className="text-zinc-500 hover:text-zinc-300">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveMaster} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-400 font-medium">Role (Unique Key)</label>
                  <input
                    type="text"
                    required
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40"
                    placeholder="e.g., prompt"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-400 font-medium">Display Name</label>
                  <input
                    type="text"
                    required
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40"
                    placeholder="e.g., ポジティブプロンプト"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-400 font-medium">Param Name</label>
                  <input
                    type="text"
                    required
                    value={formParamName}
                    onChange={(e) => setFormParamName(e.target.value)}
                    className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40"
                    placeholder="e.g., text"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-400 font-medium">Input Type</label>
                  <select
                    value={formInputType}
                    onChange={(e) => setFormInputType(e.target.value as 'textarea' | 'int' | 'float' | 'select')}
                    className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40"
                  >
                    <option value="textarea">textarea</option>
                    <option value="int">int</option>
                    <option value="float">float</option>
                    <option value="select">select</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-400 font-medium">Expected Class Types (comma separated)</label>
                <input
                  type="text"
                  value={formExpectedClassTypes}
                  onChange={(e) => setFormExpectedClassTypes(e.target.value)}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40"
                  placeholder="e.g., CLIPTextEncode, CLIPTextEncodeSDXL"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-400 font-medium">Title Patterns (comma separated)</label>
                <input
                  type="text"
                  value={formTitlePatterns}
                  onChange={(e) => setFormTitlePatterns(e.target.value)}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40"
                  placeholder="e.g., positive, prompt"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
                <button
                  type="button"
                  onClick={closeMasterModal}
                  className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMaster.isPending || updateMaster.isPending}
                  className="bg-[#7C6FDD] text-white hover:bg-[#6d62cc] disabled:opacity-50 text-xs px-4 py-2 rounded-lg font-medium transition-all"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedMaster && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="w-full max-w-md bg-surface border border-[rgba(255,255,255,0.08)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-red-400">
              <AlertTriangle size={18} />
              <h3 className="text-sm font-semibold">Delete Mapping Master?</h3>
            </div>
            
            <p className="text-xs text-zinc-400 leading-relaxed">
              Are you sure you want to delete <span className="font-mono text-zinc-200 font-bold">{selectedMaster.role}</span>? This action cannot be undone.
            </p>

            {isLoadingUsages ? (
              <div className="flex items-center gap-2 text-zinc-600 text-xs py-2">
                <RefreshCw size={12} className="animate-spin" />
                Checking usage in workflows…
              </div>
            ) : usages && usages.length > 0 ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-2">
                <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">
                  Warning: Currently used in {usages.length} workflow mapping(s):
                </p>
                <div className="max-h-28 overflow-y-auto custom-scrollbar space-y-1.5">
                  {usages.map((u, idx) => (
                    <div key={idx} className="text-[11px] text-zinc-300 flex justify-between font-mono bg-white/[0.02] px-2 py-1 rounded">
                      <span className="truncate max-w-[200px]" title={u.workflow_name}>{u.workflow_name}</span>
                      <span className="text-zinc-500 text-right">Node: {u.node_id}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-accent-green bg-accent-green/10 border border-accent-green/20 px-3 py-1.5 rounded-lg">
                Not currently used in any workflow mappings. Safe to delete.
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMaster.mutate(selectedMaster.id)}
                disabled={deleteMaster.isPending}
                className="bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 text-xs px-4 py-2 rounded-lg font-medium transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConnectionStatus({ label, url }: { label: string; url: string }) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')

  const check = async () => {
    setStatus('checking')
    try {
      await fetch(url, { signal: AbortSignal.timeout(3000) })
      setStatus('ok')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-zinc-300">{label}</p>
        <p className="text-xs text-zinc-600 font-mono">{url}</p>
      </div>
      <div className="flex items-center gap-2">
        {status !== 'idle' && (
          <div className={`w-2 h-2 rounded-full ${
            status === 'checking' ? 'bg-zinc-500 animate-pulse' :
            status === 'ok' ? 'bg-accent-green' : 'bg-red-500'
          }`} />
        )}
        <button
          id={`check-${label.replace(/\s+/g, '-').toLowerCase()}`}
          onClick={check}
          className="text-xs px-2 py-1 rounded-md border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all"
        >
          {status === 'checking' ? 'Checking…' : 'Ping'}
        </button>
      </div>
    </div>
  )
}
