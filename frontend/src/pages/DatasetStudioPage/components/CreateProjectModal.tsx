import React, { useState, useEffect } from 'react'
import type { DatasetProject, DatasetProjectCreate, Workflow } from '../../../api/types'
import { datasetApi } from '../../../api/client'
import { X, Loader2, FolderPlus, AlertCircle } from 'lucide-react'

export interface CreateProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (project: DatasetProject) => void
  workflows: Workflow[]
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  workflows,
}) => {
  const [name, setName] = useState('My New Chara LoRA')
  const [characterTrigger, setCharacterTrigger] = useState('mychara')
  const [outfitTrigger, setOutfitTrigger] = useState('mychara_outfit')
  const [workflowId, setWorkflowId] = useState<number>(() => workflows[0]?.id || 1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (workflows.length > 0 && !workflows.some((w) => w.id === workflowId)) {
      setWorkflowId(workflows[0].id)
    }
  }, [workflows, workflowId])

  if (!isOpen) return null

  const effectiveWorkflowId = workflowId || workflows[0]?.id || 1

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const payload: DatasetProjectCreate = {
        name: name.trim() || 'My New Chara LoRA',
        character_trigger: characterTrigger.trim(),
        outfit_trigger: outfitTrigger.trim(),
        workflow_id: effectiveWorkflowId,
        prompt_meta: '1girl, solo, anime style, masterpiece, best quality',
        prompt_physical: 'long silver hair, red eyes, ahoge, cat ears',
        prompt_exclusive_outfit: 'black gothic dress, lace collar, gold trim, ribbon',
        prompt_negative: '',
        selected_alt_outfits: '[]',
      }

      const created = await datasetApi.createProject(payload)
      onCreated(created)
      onClose()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'プロジェクトの作成に失敗しました'
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      data-testid="create-project-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        data-testid="create-project-modal"
        className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">新規プロジェクト作成</h2>
              <p className="text-xs text-zinc-400">Dataset Studio プロジェクトを初期化します</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-create-project-modal"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div
              data-testid="create-project-error"
              className="p-3 bg-red-950/50 border border-red-500/50 rounded-lg text-red-200 text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              プロジェクト名 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              data-testid="create-project-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="例: My New Chara LoRA"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                キャラトリガー名 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                data-testid="create-character-trigger-input"
                value={characterTrigger}
                onChange={(e) => setCharacterTrigger(e.target.value)}
                required
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                placeholder="例: mychara"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                本命衣装トリガー名 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                data-testid="create-outfit-trigger-input"
                value={outfitTrigger}
                onChange={(e) => setOutfitTrigger(e.target.value)}
                required
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                placeholder="例: mychara_outfit"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              ComfyUI ワークフロー
            </label>
            <select
              data-testid="create-workflow-select"
              value={effectiveWorkflowId}
              onChange={(e) => setWorkflowId(Number(e.target.value))}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            >
              {workflows.length === 0 ? (
                <option value={1}>デフォルト ワークフロー</option>
              ) : (
                workflows.map((wf) => (
                  <option key={wf.id} value={wf.id}>
                    {wf.name} (ID: {wf.id})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-zinc-800">
            <button
              type="button"
              data-testid="cancel-create-project-btn"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              data-testid="submit-create-project-btn"
              disabled={isSubmitting || !name.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-500/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>作成中...</span>
                </>
              ) : (
                <span>作成して開始</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
