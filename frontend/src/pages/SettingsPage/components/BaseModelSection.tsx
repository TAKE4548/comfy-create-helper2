import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Layers, Plus, Pencil, Trash2, X, RefreshCw } from 'lucide-react'
import { baseModelsApi, checkpointMappingsApi } from '../../../api/client'
import type { BaseModel } from '../../../api/types'

const inputCls = 'w-full min-h-11 min-w-0 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FDD] focus:border-[#7C6FDD]/40'
const iconActionCls = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FDD]'
const modalActionCls = 'min-h-11 rounded-lg px-3.5 py-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FDD]'

export function BaseModelSection() {
  const qc = useQueryClient()
  const [editingModel, setEditingModel] = useState<BaseModel | null>(null)
  const [modelForm, setModelForm] = useState({ name: '', description: '' })
  const [showModelModal, setShowModelModal] = useState(false)

  const [mappingForm, setMappingForm] = useState({ checkpoint_name: '', base_model_id: '' })
  const [showMappingModal, setShowMappingModal] = useState(false)
  const [customCheckpoint, setCustomCheckpoint] = useState(false)

  // Queries
  const { data: baseModels, isLoading: isLoadingModels } = useQuery({
    queryKey: ['base-models'],
    queryFn: () => baseModelsApi.list(),
  })

  const { data: mappings, isLoading: isLoadingMappings } = useQuery({
    queryKey: ['checkpoint-mappings'],
    queryFn: () => checkpointMappingsApi.list(),
  })

  const { data: comfyCheckpoints, refetch: refetchComfy, isFetching: isFetchingComfy } = useQuery({
    queryKey: ['comfy-checkpoints'],
    queryFn: () => checkpointMappingsApi.getComfyCheckpoints(),
  })

  // Mutations
  const createModelMutation = useMutation({
    mutationFn: baseModelsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['base-models'] })
      setShowModelModal(false)
      setModelForm({ name: '', description: '' })
    },
  })

  const updateModelMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => baseModelsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['base-models'] })
      setShowModelModal(false)
      setEditingModel(null)
      setModelForm({ name: '', description: '' })
    },
  })

  const deleteModelMutation = useMutation({
    mutationFn: baseModelsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['base-models'] })
      qc.invalidateQueries({ queryKey: ['checkpoint-mappings'] })
    },
  })

  const createMappingMutation = useMutation({
    mutationFn: checkpointMappingsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkpoint-mappings'] })
      setShowMappingModal(false)
      setMappingForm({ checkpoint_name: '', base_model_id: '' })
    },
  })

  const deleteMappingMutation = useMutation({
    mutationFn: checkpointMappingsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkpoint-mappings'] })
    },
  })

  // Handlers
  const handleModelSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!modelForm.name.trim()) return
    if (editingModel) {
      updateModelMutation.mutate({ id: editingModel.id, data: modelForm })
    } else {
      createModelMutation.mutate(modelForm)
    }
  }

  const handleMappingSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!mappingForm.checkpoint_name.trim() || !mappingForm.base_model_id) return
    createMappingMutation.mutate({
      checkpoint_name: mappingForm.checkpoint_name,
      base_model_id: Number(mappingForm.base_model_id),
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Base Models Management */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Layers size={13} className="text-[#7C6FDD]" />
              ベースモデル一覧
            </h3>
            <button
              onClick={() => {
                setEditingModel(null)
                setModelForm({ name: '', description: '' })
                setShowModelModal(true)
              }}
              className="flex min-h-11 items-center gap-1 rounded-lg bg-[#7C6FDD] px-3 hover:bg-[#6d62cc] text-white text-[10px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Plus size={11} />モデル追加
            </button>
          </div>

          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden">
            <table className="settings-mobile-table w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.06)] text-zinc-400 bg-white/[0.01]">
                  <th className="px-4 py-2.5 font-medium">名前</th>
                  <th className="px-4 py-2.5 font-medium">説明</th>
                  <th className="px-4 py-2.5 font-medium text-right">アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)] text-zinc-300">
                {isLoadingModels ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                      読み込み中...
                    </td>
                  </tr>
                ) : baseModels?.map((bm) => (
                  <tr key={bm.id} className="hover:bg-white/[0.01] transition-colors">
                    <td data-label="名前" className="px-4 py-2.5 font-semibold text-[#3ECF8E]">{bm.name}</td>
                    <td data-label="説明" className="px-4 py-2.5 text-zinc-400">{bm.description || '-'}</td>
                    <td data-label="アクション" className="px-4 py-2.5 text-right space-x-1.5">
                      <button
                        onClick={() => {
                          setEditingModel(bm)
                          setModelForm({ name: bm.name, description: bm.description || '' })
                          setShowModelModal(true)
                        }}
                        className={iconActionCls}
                        title="編集"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`${bm.name} を削除しますか？紐づくマッピングも削除されます。`)) {
                            deleteModelMutation.mutate(bm.id)
                          }
                        }}
                        className={`${iconActionCls} text-red-500/70 hover:text-red-400`}
                        title="削除"
                      >
                        <Trash2 size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!isLoadingModels && (!baseModels || baseModels.length === 0) && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                      ベースモデルが登録されていません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Checkpoint Mappings Management */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Layers size={13} className="text-[#7C6FDD]" />
              チェックポイント・マッピング設定
            </h3>
            <button
              onClick={() => setShowMappingModal(true)}
              className="flex min-h-11 items-center gap-1 rounded-lg bg-[#7C6FDD] px-3 hover:bg-[#6d62cc] text-white text-[10px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Plus size={11} />マッピング追加
            </button>
          </div>

          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden">
            <table className="settings-mobile-table w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.06)] text-zinc-400 bg-white/[0.01]">
                  <th className="px-4 py-2.5 font-medium">チェックポイント名</th>
                  <th className="px-4 py-2.5 font-medium">ベースモデル</th>
                  <th className="px-4 py-2.5 font-medium text-right">アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)] text-zinc-300">
                {isLoadingMappings ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                      読み込み中...
                    </td>
                  </tr>
                ) : mappings?.map((m) => (
                  <tr key={m.id} className="hover:bg-white/[0.01] transition-colors">
                    <td data-label="チェックポイント名" className="min-w-0 break-all px-4 py-2.5 font-mono text-[11px] md:truncate md:max-w-[200px]" title={m.checkpoint_name}>
                      {m.checkpoint_name}
                    </td>
                    <td data-label="ベースモデル" className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#7C6FDD]/15 text-[#7C6FDD] border border-[#7C6FDD]/30">
                        {m.base_model?.name || `ID: ${m.base_model_id}`}
                      </span>
                    </td>
                    <td data-label="アクション" className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`マッピング「${m.checkpoint_name} -> ${m.base_model?.name || m.base_model_id}」を削除しますか？`)) {
                            deleteMappingMutation.mutate(m.id)
                          }
                        }}
                        className={`${iconActionCls} text-red-500/70 hover:text-red-400`}
                        title="削除"
                      >
                        <Trash2 size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!isLoadingMappings && (!mappings || mappings.length === 0) && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                      マッピングが登録されていません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Model Create / Edit Modal */}
      {showModelModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div role="dialog" aria-modal="true" aria-labelledby="base-model-dialog-title" className="w-full min-w-0 max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto break-words bg-surface border border-[rgba(255,255,255,0.08)] rounded-2xl p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-3">
              <h3 id="base-model-dialog-title" className="text-sm font-semibold text-zinc-200">
                {editingModel ? 'ベースモデル編集' : 'ベースモデル作成'}
              </h3>
              <button onClick={() => setShowModelModal(false)} className={iconActionCls} aria-label="閉じる">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleModelSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-400 font-medium">モデル名（例: SDXL, Anima, Noob）</label>
                <input
                  type="text"
                  required
                  value={modelForm.name}
                  onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                  className={inputCls}
                  placeholder="モデル名を入力してください"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-400 font-medium">説明（任意）</label>
                <textarea
                  value={modelForm.description}
                  onChange={(e) => setModelForm({ ...modelForm, description: e.target.value })}
                  className={`${inputCls} min-h-20 resize-none`}
                  placeholder="モデルの説明を入力してください"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModelModal(false)}
                  className={`${modalActionCls} bg-zinc-800 border border-[rgba(255,255,255,0.08)] hover:bg-zinc-700 text-zinc-300`}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={createModelMutation.isPending || updateModelMutation.isPending}
                  className={`${modalActionCls} bg-[#7C6FDD] hover:bg-[#6d62cc] text-white disabled:opacity-50`}
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mapping Create Modal */}
      {showMappingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div role="dialog" aria-modal="true" aria-labelledby="checkpoint-mapping-dialog-title" className="w-full min-w-0 max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto break-words bg-surface border border-[rgba(255,255,255,0.08)] rounded-2xl p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-3">
              <h3 id="checkpoint-mapping-dialog-title" className="text-sm font-semibold text-zinc-200">
                チェックポイントマッピング追加
              </h3>
              <button onClick={() => setShowMappingModal(false)} className={iconActionCls} aria-label="閉じる">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleMappingSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] text-zinc-400 font-medium">チェックポイント名</label>
                  <button
                    type="button"
                    onClick={() => setCustomCheckpoint(!customCheckpoint)}
                    className="min-h-11 px-2 text-[10px] text-[#7C6FDD] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FDD]"
                  >
                    {customCheckpoint ? 'ComfyUIから選択' : '手動テキスト入力'}
                  </button>
                </div>

                {customCheckpoint ? (
                  <input
                    type="text"
                    required
                    value={mappingForm.checkpoint_name}
                    onChange={(e) => setMappingForm({ ...mappingForm, checkpoint_name: e.target.value })}
                    className={inputCls}
                    placeholder="checkpoint_name.safetensors"
                  />
                ) : (
                  <div className="flex gap-2">
                    <select
                      required
                      value={mappingForm.checkpoint_name}
                      onChange={(e) => setMappingForm({ ...mappingForm, checkpoint_name: e.target.value })}
                      className={`${inputCls} flex-1`}
                    >
                      <option value="">チェックポイントを選択...</option>
                      {comfyCheckpoints?.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => refetchComfy()}
                      disabled={isFetchingComfy}
                      className="min-h-11 min-w-11 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-[rgba(255,255,255,0.08)] flex-shrink-0 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FDD]"
                      title="再取得"
                    >
                      <RefreshCw size={12} className={isFetchingComfy ? 'animate-spin' : ''} />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-400 font-medium">紐づけるベースモデル</label>
                <select
                  required
                  value={mappingForm.base_model_id}
                  onChange={(e) => setMappingForm({ ...mappingForm, base_model_id: e.target.value })}
                  className={inputCls}
                >
                  <option value="">ベースモデルを選択してください...</option>
                  {baseModels?.map((bm) => (
                    <option key={bm.id} value={bm.id}>{bm.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMappingModal(false)}
                  className={`${modalActionCls} bg-zinc-800 border border-[rgba(255,255,255,0.08)] hover:bg-zinc-700 text-zinc-300`}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={createMappingMutation.isPending}
                  className={`${modalActionCls} bg-[#7C6FDD] hover:bg-[#6d62cc] text-white disabled:opacity-50`}
                >
                  作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
