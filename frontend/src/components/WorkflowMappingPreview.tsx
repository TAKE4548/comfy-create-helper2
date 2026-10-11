import React, { useState, useEffect, useMemo } from 'react'
import { Sparkles, Upload, FileText, CheckCircle2, AlertCircle, ListPlus } from 'lucide-react'
import { workflowsApi } from '../api/domains/workflows'
import type { WorkflowSummary } from '../api/types'

export interface WorkflowMappingPreviewProps {
  expectedClassTypes: string[]
  titlePatterns: string[]
  primaryParamName: string
  fallbackParams: string[]
  onOpenNodePicker: (workflowJson: Record<string, unknown>) => void
}

interface MatchCandidate {
  nodeId: string
  title: string
  classType: string
  matchedParam: string
  isFallback: boolean
  matchedBy: string
}

export const WorkflowMappingPreview: React.FC<WorkflowMappingPreviewProps> = ({
  expectedClassTypes,
  titlePatterns,
  primaryParamName,
  fallbackParams,
  onOpenNodePicker,
}) => {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('')
  const [workflowJson, setWorkflowJson] = useState<Record<string, unknown> | null>(null)
  const [workflowName, setWorkflowName] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  // Fetch registered workflows on mount
  useEffect(() => {
    let mounted = true
    workflowsApi.list()
      .then((data) => {
        if (mounted && data) {
          setWorkflows(data)
        }
      })
      .catch((err: unknown) => {
        console.warn('Failed to load registered workflows for preview', err)
      })
    return () => {
      mounted = false
    }
  }, [])

  // Load selected workflow details
  const handleSelectWorkflow = async (idStr: string) => {
    setSelectedWorkflowId(idStr)
    setErrorMessage(null)
    if (!idStr) {
      setWorkflowJson(null)
      setWorkflowName('')
      return
    }

    const id = parseInt(idStr, 10)
    setIsLoading(true)
    try {
      const detail = await workflowsApi.get(id)
      if (detail && detail.json_body && typeof detail.json_body === 'object') {
        setWorkflowJson(detail.json_body as Record<string, unknown>)
        setWorkflowName(detail.name)
      } else {
        setErrorMessage('ワークフローデータの形式が不正です')
        setWorkflowJson(null)
      }
    } catch (err) {
      console.error('Failed to get workflow detail', err)
      setErrorMessage('ワークフローの取得に失敗しました')
      setWorkflowJson(null)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle file drop / upload
  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErrorMessage(null)

    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage('ファイルサイズが上限（10MB）を超えています')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const parsed = JSON.parse(text)
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid JSON structure')
        }
        setWorkflowJson(parsed)
        setWorkflowName(file.name)
        setSelectedWorkflowId('')
      } catch {
        setErrorMessage('ワークフローJSONの構文または構造が無効です')
        setWorkflowJson(null)
      }
    }
    reader.readAsText(file)
  }

  // Evaluate matching against workflow nodes
  const evaluation = useMemo(() => {
    if (!workflowJson) return null

    // Extract nodes from ComfyUI API format or UI graph format
    let nodesObj: Record<string, any> = {}
    if (workflowJson.nodes && Array.isArray(workflowJson.nodes)) {
      // ComfyUI Web GUI Graph format
      for (const n of workflowJson.nodes) {
        if (n && n.id != null) {
          nodesObj[String(n.id)] = {
            class_type: n.type,
            _meta: { title: n.title },
            inputs: n.widgets_values != null ? { value: n.widgets_values } : {},
          }
        }
      }
    } else {
      // ComfyUI API format (standard prompt workflow)
      nodesObj = workflowJson as Record<string, any>
    }

    const matchedNodes: MatchCandidate[] = []
    const cleanExpectedClasses = expectedClassTypes.map((c) => c.trim().toLowerCase()).filter(Boolean)
    const cleanPatterns = titlePatterns.map((p) => p.trim().toLowerCase()).filter(Boolean)
    const primaryClean = primaryParamName.trim().toLowerCase()
    const fallbackCleans = fallbackParams.map((p) => p.trim().toLowerCase()).filter(Boolean)

    for (const [nodeId, nodeData] of Object.entries(nodesObj)) {
      if (!nodeData || typeof nodeData !== 'object') continue
      const classType: string = String(nodeData.class_type || nodeData.type || '')
      const title: string = String(
        nodeData._meta?.title || nodeData.title || classType || `Node ${nodeId}`
      )
      const inputs = (nodeData.inputs && typeof nodeData.inputs === 'object') ? nodeData.inputs : {}

      // 1. Class match
      let classMatched = false
      if (cleanExpectedClasses.length === 0) {
        classMatched = true
      } else {
        classMatched = cleanExpectedClasses.includes(classType.toLowerCase().trim())
      }

      // 2. Title pattern match
      let titleMatched = false
      if (cleanPatterns.length === 0) {
        titleMatched = true
      } else {
        titleMatched = cleanPatterns.some(
          (pat) =>
            title.toLowerCase().includes(pat) || classType.toLowerCase().includes(pat)
        )
      }

      // 3. Parameter match (primary first, then fallback in order)
      const inputKeys = Object.keys(inputs).map((k) => k.toLowerCase().trim())
      let matchedParam = ''
      let isFallback = false

      if (primaryClean && inputKeys.includes(primaryClean)) {
        matchedParam = primaryParamName.trim()
        isFallback = false
      } else if (fallbackCleans.length > 0) {
        for (let i = 0; i < fallbackCleans.length; i++) {
          if (inputKeys.includes(fallbackCleans[i])) {
            matchedParam = fallbackParams[i]
            isFallback = true
            break
          }
        }
      }

      if (classMatched && titleMatched) {
        matchedNodes.push({
          nodeId,
          title,
          classType,
          matchedParam: matchedParam || (primaryClean ? '(引数未合致)' : '(引数未指定)'),
          isFallback,
          matchedBy: titleMatched && classMatched ? 'クラス＆タイトル合致' : 'クラス合致',
        })
      }
    }

    return matchedNodes
  }, [workflowJson, expectedClassTypes, titlePatterns, primaryParamName, fallbackParams])

  return (
    <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#7C6FDD]">
          <Sparkles size={14} />
          <span>ワークフロー指定リアルタイム合致プレビュー</span>
        </div>
        {workflowJson && (
          <button
            type="button"
            onClick={() => onOpenNodePicker(workflowJson)}
            className="flex items-center gap-1 text-[11px] text-[#7C6FDD] hover:text-[#9387ee] bg-[#7C6FDD]/10 hover:bg-[#7C6FDD]/20 px-2 py-0.5 rounded border border-[#7C6FDD]/30 transition-colors"
          >
            <ListPlus size={12} />
            <span>ワークフローからノード選択 (逆引き)</span>
          </button>
        )}
      </div>

      {/* Workflow Selector Bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={selectedWorkflowId}
          onChange={(e) => handleSelectWorkflow(e.target.value)}
          aria-label="登録済みワークフロー選択"
          className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-zinc-200 outline-none focus:border-[#7C6FDD] text-xs max-w-[220px]"
        >
          <option value="">-- 登録済ワークフローを選択 --</option>
          {workflows.map((wf) => (
            <option key={wf.id} value={wf.id}>
              {wf.name}
            </option>
          ))}
        </select>

        <span className="text-zinc-500 text-[11px]">または</span>

        <label className="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded px-2.5 py-1 cursor-pointer text-zinc-300 hover:text-white transition-colors text-xs">
          <Upload size={12} />
          <span>JSONアップロード</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {workflowName && (
          <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
            <FileText size={12} className="text-[#7C6FDD]" />
            <span className="truncate max-w-[180px]">{workflowName}</span>
          </div>
        )}
      </div>

      {/* Error or Loading Feedback */}
      {errorMessage && (
        <div className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-2.5 py-1.5">
          <AlertCircle size={14} />
          <span>{errorMessage}</span>
        </div>
      )}

      {isLoading && (
        <div className="text-xs text-zinc-400 py-1">ワークフロー読込中...</div>
      )}

      {/* Evaluation Results */}
      {evaluation && (
        <div className="pt-2 border-t border-zinc-800/60 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>合致ノード数: <strong className="text-white">{evaluation.length} 件</strong></span>
          </div>

          {evaluation.length === 0 ? (
            <div className="text-xs text-zinc-500 py-2 text-center bg-zinc-900/40 rounded border border-zinc-800/40">
              このワークフロー内に現在のマッピング条件に一致するノードは見つかりませんでした
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {evaluation.map((cand) => (
                <div
                  key={cand.nodeId}
                  className="flex items-center justify-between p-2 rounded bg-zinc-900/80 border border-zinc-800 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                    <div>
                      <div className="flex items-center gap-1.5 font-medium text-zinc-200">
                        <span>#{cand.nodeId}</span>
                        <span>{cand.title}</span>
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        Class: {cand.classType}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-[10px] text-zinc-500">バインド引数:</span>
                      <span
                        className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                          cand.isFallback
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {cand.matchedParam}
                        {cand.isFallback && ' (フォールバック)'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
