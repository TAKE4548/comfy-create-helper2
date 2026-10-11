import React, { useState, useMemo } from 'react'
import { X, Search, Check, Layers } from 'lucide-react'

export interface WorkflowNodePickerProps {
  isOpen: boolean
  onClose: () => void
  workflowJson: Record<string, unknown> | null
  hasExistingValues: boolean
  onSelectNode: (nodeInfo: { classType: string; title: string; paramName: string }) => void
}

interface NodeItem {
  id: string
  title: string
  classType: string
  inputParams: string[]
}

export const WorkflowNodePicker: React.FC<WorkflowNodePickerProps> = ({
  isOpen,
  onClose,
  workflowJson,
  hasExistingValues,
  onSelectNode,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedParam, setSelectedParam] = useState<string>('')

  // Parse nodes from workflow JSON
  const nodeList = useMemo<NodeItem[]>(() => {
    if (!workflowJson) return []

    let nodesObj: Record<string, any> = {}
    if (workflowJson.nodes && Array.isArray(workflowJson.nodes)) {
      for (const n of workflowJson.nodes) {
        if (n && n.id != null) {
          const inputsList: string[] = []
          if (n.widgets_values && Array.isArray(n.widgets_values)) {
            inputsList.push('value')
          }
          if (n.inputs && Array.isArray(n.inputs)) {
            for (const inp of n.inputs) {
              if (inp && inp.name) inputsList.push(String(inp.name))
            }
          }
          nodesObj[String(n.id)] = {
            class_type: n.type || '',
            _meta: { title: n.title || '' },
            inputs: inputsList,
          }
        }
      }
    } else {
      nodesObj = workflowJson as Record<string, any>
    }

    const result: NodeItem[] = []
    for (const [id, data] of Object.entries(nodesObj)) {
      if (!data || typeof data !== 'object') continue
      const classType = String(data.class_type || data.type || '')
      const title = String(data._meta?.title || data.title || classType || `Node ${id}`)
      let inputParams: string[] = []
      if (Array.isArray(data.inputs)) {
        inputParams = data.inputs.map(String)
      } else if (data.inputs && typeof data.inputs === 'object') {
        inputParams = Object.keys(data.inputs)
      }

      result.push({
        id,
        title,
        classType,
        inputParams,
      })
    }
    return result
  }, [workflowJson])

  // Filter nodes
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodeList
    const q = searchQuery.toLowerCase().trim()
    return nodeList.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.classType.toLowerCase().includes(q) ||
        n.id.includes(q) ||
        n.inputParams.some((p) => p.toLowerCase().includes(q))
    )
  }, [nodeList, searchQuery])

  if (!isOpen) return null

  const handleApply = () => {
    if (!selectedNodeId) return
    const node = nodeList.find((n) => n.id === selectedNodeId)
    if (!node) return

    if (hasExistingValues) {
      const confirmed = window.confirm(
        '既存のClassTypeやパラメータ名が上書きされます。適用してよろしいですか？'
      )
      if (!confirmed) return
    }

    onSelectNode({
      classType: node.classType,
      title: node.title,
      paramName: selectedParam || (node.inputParams[0] || ''),
    })
    onClose()
  }

  const activeNode = nodeList.find((n) => n.id === selectedNodeId)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-node-picker-title"
    >
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-[#7C6FDD]" />
            <h3 id="workflow-node-picker-title" className="text-sm font-semibold">
              ワークフローからノードを選択して逆引き登録
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="text-zinc-400 hover:text-white p-1 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-zinc-800 bg-zinc-950/40">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 focus-within:border-[#7C6FDD]">
            <Search size={14} className="text-zinc-500" />
            <input
              type="text"
              placeholder="ノード名・ClassType・引数名で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-zinc-200 outline-none w-full"
            />
          </div>
        </div>

        {/* Node List & Param Selection split */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
          {/* Left: Node List */}
          <div className="overflow-y-auto p-3 space-y-1.5 max-h-[350px]">
            <div className="text-[11px] font-medium text-zinc-400 px-1 mb-1">
              ノード一覧 ({filteredNodes.length} 件)
            </div>
            {filteredNodes.map((n) => {
              const isSelected = n.id === selectedNodeId
              return (
                <div
                  key={n.id}
                  onClick={() => {
                    setSelectedNodeId(n.id)
                    setSelectedParam(n.inputParams[0] || '')
                  }}
                  className={`p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#7C6FDD]/20 border-[#7C6FDD] text-white'
                      : 'bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-800/60 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-200">#{n.id} {n.title}</span>
                    {isSelected && <Check size={14} className="text-[#7C6FDD]" />}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate">
                    {n.classType}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right: Input Parameters */}
          <div className="overflow-y-auto p-3 space-y-2 max-h-[350px] bg-zinc-950/20">
            <div className="text-[11px] font-medium text-zinc-400">
              引数・パラメータ選択
            </div>

            {activeNode ? (
              <div className="space-y-2">
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800 text-xs">
                  <div className="text-zinc-400 text-[10px]">選択中のノード:</div>
                  <div className="font-semibold text-white">#{activeNode.id} {activeNode.title}</div>
                  <div className="text-[10px] text-zinc-400 font-mono">Class: {activeNode.classType}</div>
                </div>

                <div className="text-[11px] text-zinc-400 pt-1">
                  対象パラメータ (param_name に設定):
                </div>

                {activeNode.inputParams.length === 0 ? (
                  <div className="text-xs text-zinc-500 py-2">
                    入力パラメータが見つかりませんでした (手入力可能)
                  </div>
                ) : (
                  <div className="space-y-1">
                    {activeNode.inputParams.map((param) => {
                      const isParamSel = selectedParam === param
                      return (
                        <div
                          key={param}
                          onClick={() => setSelectedParam(param)}
                          className={`p-1.5 rounded border text-xs cursor-pointer flex items-center justify-between ${
                            isParamSel
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200'
                              : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-850 text-zinc-300'
                          }`}
                        >
                          <span className="font-mono text-[11px]">{param}</span>
                          {isParamSel && <Check size={12} className="text-emerald-400" />}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-zinc-500 py-6 text-center">
                左側のノードを選択してください
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 p-3.5 border-t border-zinc-800 bg-zinc-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-white rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!selectedNodeId}
            className="px-4 py-1.5 text-xs bg-[#7C6FDD] text-white font-medium rounded-lg hover:bg-[#6d62cc] disabled:opacity-40 transition-colors"
          >
            設定フォームへ反映
          </button>
        </div>
      </div>
    </div>
  )
}
