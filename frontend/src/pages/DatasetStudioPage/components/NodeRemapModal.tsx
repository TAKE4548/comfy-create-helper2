import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { workflowsApi } from '../../../api/client'
import type { Workflow } from '../../../api/types'

export interface TextCandidateNode {
  id: string
  title: string
  classType: string
}

export function extractTextNodes(jsonBody: Record<string, any> | undefined): TextCandidateNode[] {
  if (!jsonBody || typeof jsonBody !== 'object') return []
  const candidates: TextCandidateNode[] = []
  for (const [id, node] of Object.entries(jsonBody)) {
    if (!node || typeof node !== 'object') continue
    const classType = (node as any).class_type || ''
    const hasTextInputs = (node as any).inputs && ('text' in (node as any).inputs || 'string' in (node as any).inputs || 'prompt' in (node as any).inputs)
    const isTextClass = classType.includes('CLIPText') || classType.includes('Text') || classType.includes('Primitive')
    if (hasTextInputs || isTextClass) {
      const title = (node as any)._meta?.title || (node as any).title || `${classType} (#${id})`
      candidates.push({ id, title, classType })
    }
  }
  return candidates
}

export interface NodeRemapModalProps {
  workflow: Workflow
  onClose: () => void
  onSaved: (updatedWorkflow: Workflow) => void
}

export function NodeRemapModal({ workflow, onClose, onSaved }: NodeRemapModalProps) {
  const candidates = extractTextNodes(workflow.json_body as Record<string, any>)

  const positiveMapping = workflow.mappings?.find(
    (m) => m.role === 'Main_Positive_Prompt' || (m.role && m.role.toLowerCase().includes('positive'))
  )
  const negativeMapping = workflow.mappings?.find(
    (m) => m.role === 'Negative_Prompt' || (m.role && m.role.toLowerCase().includes('negative'))
  )

  const [selectedPositiveNodeId, setSelectedPositiveNodeId] = useState<string>(
    positiveMapping?.node_id || candidates[0]?.id || ''
  )
  const [selectedNegativeNodeId, setSelectedNegativeNodeId] = useState<string>(
    negativeMapping?.node_id || candidates[1]?.id || candidates[0]?.id || ''
  )
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const existingMappings = workflow.mappings || []
      const updatedMappingsList: { master_id: number; node_id: string }[] = []
      let posHandled = false
      let negHandled = false

      for (const m of existingMappings) {
        if (positiveMapping && m.master_id === positiveMapping.master_id) {
          updatedMappingsList.push({ master_id: m.master_id, node_id: selectedPositiveNodeId })
          posHandled = true
        } else if (negativeMapping && m.master_id === negativeMapping.master_id) {
          updatedMappingsList.push({ master_id: m.master_id, node_id: selectedNegativeNodeId })
          negHandled = true
        } else {
          updatedMappingsList.push({ master_id: m.master_id, node_id: m.node_id })
        }
      }

      if (!posHandled && positiveMapping) {
        updatedMappingsList.push({ master_id: positiveMapping.master_id, node_id: selectedPositiveNodeId })
      }
      if (!negHandled && negativeMapping) {
        updatedMappingsList.push({ master_id: negativeMapping.master_id, node_id: selectedNegativeNodeId })
      }

      await workflowsApi.update(workflow.id, {
        mappings: updatedMappingsList,
      })

      const updatedWf: Workflow = {
        ...workflow,
        mappings: existingMappings.map((m) => {
          if (positiveMapping && m.master_id === positiveMapping.master_id) {
            return { ...m, node_id: selectedPositiveNodeId }
          }
          if (negativeMapping && m.master_id === negativeMapping.master_id) {
            return { ...m, node_id: selectedNegativeNodeId }
          }
          return m
        }),
      }

      onSaved(updatedWf)
      onClose()
    } catch (err: any) {
      setError(err.message || 'マッピングの保存に失敗しました')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      data-testid="node-remap-modal"
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">プロンプト注入先ノード再割当</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              ワークフロー: {workflow.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition-colors"
            data-testid="close-remap-modal-button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-zinc-400">
            LoRA Studio で生成される Positive プロンプト（直交マトリクス）および Negative プロンプトを注入する ComfyUI ノードを選択してください。
          </p>

          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Positive Node */}
          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-indigo-400">
                Main Positive Prompt ノード
              </label>
              <span className="text-[10px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-900">
                Positive Role
              </span>
            </div>
            <select
              data-testid="remap-positive-select"
              value={selectedPositiveNodeId}
              onChange={(e) => setSelectedPositiveNodeId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
            >
              {candidates.length === 0 ? (
                <option value="">ノードが見つかりません</option>
              ) : (
                candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.id} - {c.title} ({c.classType})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Negative Node */}
          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-rose-400">
                Negative Prompt ノード
              </label>
              <span className="text-[10px] bg-rose-950 text-rose-300 px-2 py-0.5 rounded border border-rose-900">
                Negative Role
              </span>
            </div>
            <select
              data-testid="remap-negative-select"
              value={selectedNegativeNodeId}
              onChange={(e) => setSelectedNegativeNodeId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
            >
              {candidates.length === 0 ? (
                <option value="">ノードが見つかりません</option>
              ) : (
                candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.id} - {c.title} ({c.classType})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-zinc-800 bg-zinc-950/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            data-testid="save-remap-button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            {isSaving ? '保存中...' : 'マッピングを保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
