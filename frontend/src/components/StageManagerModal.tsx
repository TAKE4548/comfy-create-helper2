import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  Layers,
  ArrowRight,
} from 'lucide-react'
import { stageMastersApi } from '../api/domains/stageMasters'
import type { StageMaster, CascadePreviewResult } from '../api/types'

export interface StageManagerModalProps {
  isOpen: boolean
  onClose: () => void
}

export function StageManagerModal({ isOpen, onClose }: StageManagerModalProps) {
  const qc = useQueryClient()
  const [editingStage, setEditingStage] = useState<StageMaster | null>(null)
  const [editName, setEditName] = useState('')
  const [editSuffix, setEditSuffix] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)

  // New stage form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newName, setNewName] = useState('')
  const [newSuffix, setNewSuffix] = useState('')

  // Cascade preview state
  const [cascadePreview, setCascadePreview] = useState<CascadePreviewResult | null>(null)
  const [pendingCascadeSuffix, setPendingCascadeSuffix] = useState<string | null>(null)

  // Delete guard state
  const [deleteGuardMessage, setDeleteGuardMessage] = useState<string | null>(null)
  const [deletingStage, setDeletingStage] = useState<StageMaster | null>(null)

  const { data: stages = [], isLoading } = useQuery({
    queryKey: ['stage-masters'],
    queryFn: () => stageMastersApi.list(true),
    enabled: isOpen,
  })

  const createMutation = useMutation({
    mutationFn: (data: { key: string; name: string; suffix?: string }) =>
      stageMastersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stage-masters'] })
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      setShowAddForm(false)
      setNewKey('')
      setNewName('')
      setNewSuffix('')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<StageMaster> }) =>
      stageMastersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stage-masters'] })
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      setEditingStage(null)
    },
  })

  const cascadeRenameMutation = useMutation({
    mutationFn: ({ id, new_suffix }: { id: number; new_suffix: string }) =>
      stageMastersApi.cascadeRename(id, { new_suffix }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stage-masters'] })
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      setCascadePreview(null)
      setPendingCascadeSuffix(null)
      setEditingStage(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => stageMastersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stage-masters'] })
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      setDeletingStage(null)
      setDeleteGuardMessage(null)
    },
  })

  if (!isOpen) return null

  const handleStartEdit = (stage: StageMaster) => {
    setEditingStage(stage)
    setEditName(stage.name)
    setEditSuffix(stage.suffix || '')
    setEditIsActive(stage.is_active)
    setDeleteGuardMessage(null)
    setCascadePreview(null)
  }

  const handleSaveEdit = async () => {
    if (!editingStage) return
    const trimmedSuffix = editSuffix.trim()
    const originalSuffix = editingStage.suffix || ''

    if (trimmedSuffix !== originalSuffix) {
      try {
        const preview = await stageMastersApi.cascadePreview(editingStage.id, trimmedSuffix)
        setCascadePreview(preview)
        setPendingCascadeSuffix(trimmedSuffix)
      } catch (err: any) {
        setDeleteGuardMessage(err.message || 'カスケードプレビューの取得に失敗しました')
      }
      return
    }

    updateMutation.mutate({
      id: editingStage.id,
      data: {
        name: editName.trim(),
        is_active: editIsActive,
      },
    })
  }

  const handleExecuteCascade = () => {
    if (!editingStage || pendingCascadeSuffix === null) return
    cascadeRenameMutation.mutate({
      id: editingStage.id,
      new_suffix: pendingCascadeSuffix,
    })
  }

  const handleDeleteClick = async (stage: StageMaster) => {
    setDeleteGuardMessage(null)
    setDeletingStage(stage)

    // Guard 1: is_builtin check
    if (stage.is_builtin) {
      setDeleteGuardMessage('組み込みステージ (Built-in) は削除できません。')
      return
    }

    // Guard 2: usage check
    try {
      const usages = await stageMastersApi.getUsages(stage.id)
      if (usages && usages.length > 0) {
        setDeleteGuardMessage(
          `このステージは ${usages.length} 件のワークフローまたはバリアントで使用されているため削除できません。無効化（非アクティブ化）を推奨します。`
        )
        return
      }
    } catch {
      // Continue to confirm if check fails
    }
  }

  const handleConfirmDelete = () => {
    if (!deletingStage || deletingStage.is_builtin) return
    deleteMutation.mutate(deletingStage.id)
  }

  const handleToggleActiveInstead = (stage: StageMaster) => {
    updateMutation.mutate({
      id: stage.id,
      data: { is_active: !stage.is_active },
    })
    setDeletingStage(null)
    setDeleteGuardMessage(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stage-manager-title"
    >
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Layers className="text-[#7C6FDD]" size={20} />
            <h2 id="stage-manager-title" className="text-base font-semibold">
              ステージ管理 (Stage Manager)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="text-zinc-400 hover:text-white p-1 rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              ワークフローの生成段階（Rough/Detail等）を定義・管理します。
            </span>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(!showAddForm)
                setEditingStage(null)
                setDeleteGuardMessage(null)
              }}
              className="flex items-center gap-1 text-xs bg-[#7C6FDD] text-white px-3 py-1.5 rounded-lg hover:bg-[#6d62cc] transition-colors"
            >
              <Plus size={14} /> 新規ステージ追加
            </button>
          </div>

          {/* Add Form */}
          {showAddForm && (
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
              <h3 className="text-xs font-semibold text-zinc-300">新規ステージ登録</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">キー (ID)</label>
                  <input
                    type="text"
                    placeholder="例: upscale"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-[#7C6FDD]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">ステージ名</label>
                  <input
                    type="text"
                    placeholder="例: 高解像度化"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-[#7C6FDD]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">接尾辞 (Suffix)</label>
                  <input
                    type="text"
                    placeholder="例: _upscale"
                    value={newSuffix}
                    onChange={(e) => setNewSuffix(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-[#7C6FDD]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1 text-xs text-zinc-400 hover:text-white"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={!newKey.trim() || !newName.trim() || createMutation.isPending}
                  onClick={() =>
                    createMutation.mutate({
                      key: newKey.trim(),
                      name: newName.trim(),
                      suffix: newSuffix.trim(),
                    })
                  }
                  className="px-3 py-1 text-xs bg-[#7C6FDD] text-white rounded hover:bg-[#6d62cc] disabled:opacity-50"
                >
                  {createMutation.isPending ? '追加中...' : '追加'}
                </button>
              </div>
            </div>
          )}

          {/* Delete Guard Alert */}
          {deleteGuardMessage && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg flex items-start gap-2.5 text-xs text-red-200">
              <ShieldAlert className="text-red-400 shrink-0 mt-0.5" size={16} />
              <div className="flex-1 space-y-1.5">
                <p className="font-medium">{deleteGuardMessage}</p>
                {deletingStage && !deletingStage.is_builtin && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleActiveInstead(deletingStage)}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-200 font-medium transition-colors"
                    >
                      {deletingStage.is_active ? 'このステージを無効化する' : 'このステージを有効化する'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteGuardMessage(null)
                        setDeletingStage(null)
                      }}
                      className="px-2 py-1 text-xs text-zinc-400 hover:text-white"
                    >
                      閉じる
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Delete Confirmation without blockers */}
          {deletingStage && !deleteGuardMessage && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg flex items-start gap-2.5 text-xs text-amber-200">
              <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={16} />
              <div className="flex-1">
                <p className="font-medium">ステージ「{deletingStage.name}」を完全に削除しますか？</p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={deleteMutation.isPending}
                    className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-medium"
                  >
                    {deleteMutation.isPending ? '削除中...' : '削除を実行'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingStage(null)}
                    className="px-2 py-1 text-xs text-zinc-400 hover:text-white"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cascade Rename Preview Modal / Box */}
          {cascadePreview && editingStage && (
            <div className="p-4 bg-purple-950/40 border border-[#7C6FDD]/60 rounded-lg space-y-3 text-xs">
              <div className="flex items-center gap-2 text-[#7C6FDD] font-semibold">
                <AlertTriangle size={16} />
                <span>接尾辞変更のカスケード置換プレビュー</span>
              </div>
              <p className="text-zinc-300">
                接尾辞「<span className="font-mono text-zinc-100">{cascadePreview.old_suffix || '(なし)'}</span>」から「
                <span className="font-mono text-[#7C6FDD]">{cascadePreview.new_suffix}</span>」への変更に伴い、
                以下の関連データ内のRoleキーが一括置換されます。
              </p>
              <div className="grid grid-cols-3 gap-2 py-1 text-center">
                <div className="bg-zinc-900/80 p-2 rounded border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 block">バリアント</span>
                  <span className="text-sm font-bold text-zinc-100">{cascadePreview.affected_variants_count} 件</span>
                </div>
                <div className="bg-zinc-900/80 p-2 rounded border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 block">プリセット</span>
                  <span className="text-sm font-bold text-zinc-100">{cascadePreview.affected_presets_count} 件</span>
                </div>
                <div className="bg-zinc-900/80 p-2 rounded border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 block">スナップショット</span>
                  <span className="text-sm font-bold text-zinc-100">{cascadePreview.affected_snapshots_count} 件</span>
                </div>
              </div>

              {cascadePreview.preview_items && cascadePreview.preview_items.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1 border border-zinc-800 rounded p-2 bg-zinc-950/60 font-mono text-[11px]">
                  {cascadePreview.preview_items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-zinc-300">
                      <span className="text-zinc-500">[{item.target_type}]</span>
                      <span className="text-red-400">{item.old_role}</span>
                      <ArrowRight size={10} className="text-zinc-500" />
                      <span className="text-green-400 font-bold">{item.new_role}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCascadePreview(null)
                    setPendingCascadeSuffix(null)
                  }}
                  className="px-3 py-1 text-xs text-zinc-400 hover:text-white"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleExecuteCascade}
                  disabled={cascadeRenameMutation.isPending}
                  className="px-3 py-1 text-xs bg-[#7C6FDD] text-white rounded font-medium hover:bg-[#6d62cc] disabled:opacity-50"
                >
                  {cascadeRenameMutation.isPending ? '置換実行中...' : '一括置換を実行'}
                </button>
              </div>
            </div>
          )}

          {/* Edit Inline Form */}
          {editingStage && !cascadePreview && (
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
              <h3 className="text-xs font-semibold text-zinc-300">
                ステージ編集: {editingStage.name} ({editingStage.key})
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">ステージ名</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-[#7C6FDD]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">接尾辞 (Suffix)</label>
                  <input
                    type="text"
                    value={editSuffix}
                    onChange={(e) => setEditSuffix(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-[#7C6FDD]"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none">
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      className="rounded border-zinc-700 text-[#7C6FDD] focus:ring-0"
                    />
                    <span>有効 (Active)</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingStage(null)}
                  className="px-3 py-1 text-xs text-zinc-400 hover:text-white"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={!editName.trim() || updateMutation.isPending}
                  className="px-3 py-1 text-xs bg-[#7C6FDD] text-white rounded hover:bg-[#6d62cc] disabled:opacity-50"
                >
                  {updateMutation.isPending ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          )}

          {/* Stages List */}
          <div className="border border-zinc-800 rounded-lg overflow-hidden divide-y divide-zinc-800">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-zinc-500">ロード中...</div>
            ) : stages.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-500">ステージが登録されていません。</div>
            ) : (
              stages.map((stage) => (
                <div
                  key={stage.id}
                  className={`flex items-center justify-between p-3 transition-colors ${
                    !stage.is_active ? 'bg-zinc-950/40 opacity-70' : 'hover:bg-zinc-800/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-sm text-zinc-200">{stage.name}</span>
                    <span className="text-xs text-zinc-400 font-mono">({stage.key})</span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {stage.suffix || '(接尾辞なし)'}
                    </span>
                    {stage.is_builtin && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-blue-900/30 text-blue-300 border border-blue-800/50">
                        Built-in
                      </span>
                    )}
                    {!stage.is_active && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-800 text-zinc-400">
                        無効
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(stage)}
                      aria-label={`${stage.name} を編集`}
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                      title="編集"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(stage)}
                      aria-label={`${stage.name} を削除`}
                      className={`p-1.5 rounded transition-colors ${
                        stage.is_builtin
                          ? 'text-zinc-600 cursor-not-allowed'
                          : 'text-zinc-400 hover:text-red-400 hover:bg-zinc-800'
                      }`}
                      title={stage.is_builtin ? '組み込みステージは削除できません' : '削除'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors font-medium"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
