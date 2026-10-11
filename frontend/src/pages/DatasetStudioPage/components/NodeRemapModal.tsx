import { useState, useEffect } from 'react'
import { X, Check } from 'lucide-react'
import { workflowsApi, mappingMastersApi } from '../../../api/client'
import type { Workflow, MappingMaster } from '../../../api/types'
import { getNodeLabel } from '../../../utils/workflowNodeUtils'
export { getNodeLabel } from '../../../utils/workflowNodeUtils'

export interface TextCandidateNode {
  id: string
  title: string
  classType: string
}

export function isStudioAllowedRole(mapping: { input_type?: string | null; role?: string | null }): boolean {
  if (mapping.input_type !== 'textarea') return true
  const role = mapping.role || ''
  return (
    role === 'Main_Positive_Prompt' ||
    role === 'Negative_Prompt' ||
    role.toLowerCase().includes('positive') ||
    role.toLowerCase().includes('negative')
  )
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
  const textCandidates = extractTextNodes(workflow.json_body as Record<string, any>)
  const allNodeIds = Object.keys(workflow.json_body || {})

  const [mappingMasters, setMappingMasters] = useState<MappingMaster[]>([])

  useEffect(() => {
    let isMounted = true
    if (mappingMastersApi && typeof mappingMastersApi.list === 'function') {
      mappingMastersApi.list().then((masters: any) => {
        if (isMounted && Array.isArray(masters)) {
          setMappingMasters(masters)
        }
      }).catch((err) => {
        console.warn('Failed to fetch mapping masters:', err)
      })
    }
    return () => {
      isMounted = false
    }
  }, [])

  const existingMappings = workflow.mappings || []

  // Resolve positive and negative mappings or masters
  const positiveMapping = existingMappings.find(
    (m) => m.role === 'Main_Positive_Prompt' || (m.role && m.role.toLowerCase().includes('positive'))
  )
  const negativeMapping = existingMappings.find(
    (m) => m.role === 'Negative_Prompt' || (m.role && m.role.toLowerCase().includes('negative'))
  )

  const positiveMaster = mappingMasters.find((m) => m.role === 'Main_Positive_Prompt') ||
    mappingMasters.find((m) => m.role && m.role.toLowerCase().includes('positive'))
  const negativeMaster = mappingMasters.find((m) => m.role === 'Negative_Prompt') ||
    mappingMasters.find((m) => m.role && m.role.toLowerCase().includes('negative'))

  // State: master_id -> selected node_id
  const [selectedNodeIds, setSelectedNodeIds] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {}
    for (const m of existingMappings) {
      initial[m.master_id] = m.node_id
    }
    if (positiveMapping) {
      initial[positiveMapping.master_id] = positiveMapping.node_id || textCandidates[0]?.id || ''
    } else if (positiveMaster) {
      initial[positiveMaster.id] = textCandidates[0]?.id || ''
    }
    if (negativeMapping) {
      initial[negativeMapping.master_id] = negativeMapping.node_id || textCandidates[1]?.id || textCandidates[0]?.id || ''
    } else if (negativeMaster) {
      initial[negativeMaster.id] = textCandidates[1]?.id || textCandidates[0]?.id || ''
    }
    return initial
  })

  // Separate positive & negative dedicated state for direct compatibility
  const [selectedPositiveNodeId, setSelectedPositiveNodeId] = useState<string>(
    positiveMapping?.node_id || textCandidates[0]?.id || ''
  )
  const [selectedNegativeNodeId, setSelectedNegativeNodeId] = useState<string>(
    negativeMapping?.node_id || textCandidates[1]?.id || textCandidates[0]?.id || ''
  )

  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter allowed mappings according to whitelist rules
  const allowedMappings = existingMappings.filter((m) => isStudioAllowedRole(m))
  const parameterMappings = allowedMappings.filter((m) => m.input_type !== 'textarea')

  const handleNodeChange = (masterId: number, nodeId: string) => {
    setSelectedNodeIds((prev) => ({ ...prev, [masterId]: nodeId }))
  }

  const handleSave = async () => {
    if (!selectedPositiveNodeId || !selectedNegativeNodeId) {
      setError('Positive および Negative のノードを両方選択してください')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
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
        } else if (selectedNodeIds[m.master_id] !== undefined) {
          updatedMappingsList.push({ master_id: m.master_id, node_id: selectedNodeIds[m.master_id] })
        } else {
          updatedMappingsList.push({ master_id: m.master_id, node_id: m.node_id })
        }
      }

      if (!posHandled) {
        const posMasterId = positiveMapping?.master_id ?? positiveMaster?.id
        if (posMasterId !== undefined) {
          updatedMappingsList.push({ master_id: posMasterId, node_id: selectedPositiveNodeId })
        }
      }
      if (!negHandled) {
        const negMasterId = negativeMapping?.master_id ?? negativeMaster?.id
        if (negMasterId !== undefined) {
          updatedMappingsList.push({ master_id: negMasterId, node_id: selectedNegativeNodeId })
        }
      }

      await workflowsApi.update(workflow.id, {
        mappings: updatedMappingsList,
      })

      const freshWorkflow = await workflowsApi.get(workflow.id)
      if (!freshWorkflow) {
        throw new Error('ワークフローの再取得に失敗しました')
      }

      onSaved(freshWorkflow)
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
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">ノードマッピング再割当</h3>
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
        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-xs text-zinc-400">
            Positive/Negative プロンプト注入先ノード、および各種生成パラメータ（Steps, CFG, Sampler 等）が対応する ComfyUI ノードを設定してください。
          </p>

          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Prompt Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              プロンプト注入先ノード
            </h4>

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
                onChange={(e) => {
                  setSelectedPositiveNodeId(e.target.value)
                  if (positiveMapping) handleNodeChange(positiveMapping.master_id, e.target.value)
                }}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
              >
                {textCandidates.length === 0 ? (
                  <option value="">ノードが見つかりません</option>
                ) : (
                  textCandidates.map((c) => (
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
                onChange={(e) => {
                  setSelectedNegativeNodeId(e.target.value)
                  if (negativeMapping) handleNodeChange(negativeMapping.master_id, e.target.value)
                }}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
              >
                {textCandidates.length === 0 ? (
                  <option value="">ノードが見つかりません</option>
                ) : (
                  textCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.id} - {c.title} ({c.classType})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Parameters Section (Non-textarea mappings) */}
          {parameterMappings.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                生成パラメータノードマッピング ({parameterMappings.length} 件)
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {parameterMappings.map((m) => {
                  const currentValue = selectedNodeIds[m.master_id] ?? m.node_id
                  return (
                    <div
                      key={m.id || m.master_id}
                      className="bg-zinc-950/40 border border-zinc-800/60 rounded-lg p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-zinc-300">
                          {m.display_name || m.role}
                        </label>
                        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                          {m.input_type}
                        </span>
                      </div>
                      <select
                        data-testid={`remap-select-${m.role || m.master_id}`}
                        value={currentValue}
                        onChange={(e) => handleNodeChange(m.master_id, e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">ノードを選択…</option>
                        {allNodeIds.map((id) => (
                          <option key={id} value={id}>
                            {getNodeLabel(id, workflow.json_body as Record<string, any>)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-zinc-800 bg-zinc-950/40 flex-shrink-0">
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