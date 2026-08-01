import React, { useState, useEffect, useMemo } from 'react'
import { X, ChevronDown, ChevronRight, Loader2, Wand2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { ParamTypeMaster, ParamTypeMasterCreate, Workflow } from '../api/types'
import { comfyApi, workflowsApi } from '../api/client'

const inputCls =
  'w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40'
const labelCls = 'block text-[11px] font-medium text-zinc-400 mb-1'

export interface ParamTypeMasterModalProps {
  mode: 'create' | 'edit'
  initial?: ParamTypeMaster
  isPending: boolean
  onClose: () => void
  onSubmit: (data: ParamTypeMasterCreate) => void
}

interface FormState {
  name: string
  widget_type: 'select' | 'int' | 'float' | 'textarea' | 'boolean'
  combo_options_text: string
  min_value: string
  max_value: string
  step: string
}

export function ParamTypeMasterModal({
  mode,
  initial,
  isPending,
  onClose,
  onSubmit,
}: ParamTypeMasterModalProps) {
  const [form, setForm] = useState<FormState>(() => ({
    name: initial?.name ?? '',
    widget_type: initial?.widget_type ?? 'select',
    combo_options_text: initial?.combo_options ? initial.combo_options.join('\n') : '',
    min_value: initial?.min_value !== null && initial?.min_value !== undefined ? String(initial.min_value) : '',
    max_value: initial?.max_value !== null && initial?.max_value !== undefined ? String(initial.max_value) : '',
    step: initial?.step !== null && initial?.step !== undefined ? String(initial.step) : '',
  }))

  const [error, setError] = useState<string | null>(null)

  // ComfyUI Auto-Fill section state
  const [showAutoFill, setShowAutoFill] = useState(false)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string>('')
  const [selectedClassType, setSelectedClassType] = useState<string>('')
  const [selectedParamName, setSelectedParamName] = useState<string>('')
  const [isFetchingObjectInfo, setIsFetchingObjectInfo] = useState(false)

  // Fetch workflow list for Auto-Fill
  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: workflowsApi.list,
    enabled: showAutoFill,
  })

  // Fetch selected workflow detail for node list
  const { data: selectedWorkflow } = useQuery<Workflow>({
    queryKey: ['workflow', selectedWorkflowId],
    queryFn: () => workflowsApi.get(selectedWorkflowId!),
    enabled: showAutoFill && selectedWorkflowId !== null,
  })

  // Nodes in selected workflow
  const nodeList = useMemo(() => {
    if (!selectedWorkflow?.json_body) return []
    return Object.entries(selectedWorkflow.json_body as Record<string, any>)
      .filter(([, v]) => v?.class_type)
      .map(([nodeId, v]) => ({
        nodeId,
        classType: v.class_type as string,
        title: (v._meta?.title as string) || (v.class_type as string),
        inputs: v.inputs as Record<string, unknown> | undefined,
      }))
  }, [selectedWorkflow])

  // Parameters in selected node
  const paramList = useMemo(() => {
    if (!selectedNodeId) return []
    const targetNode = nodeList.find((n) => n.nodeId === selectedNodeId)
    if (!targetNode?.inputs) return []
    return Object.keys(targetNode.inputs)
  }, [nodeList, selectedNodeId])

  // Handle node selection change
  const handleNodeChange = (nodeId: string) => {
    setSelectedNodeId(nodeId)
    const targetNode = nodeList.find((n) => n.nodeId === nodeId)
    if (targetNode) {
      setSelectedClassType(targetNode.classType)
    } else {
      setSelectedClassType('')
    }
    setSelectedParamName('')
  }

  // Handle auto-fill fetch button click
  const handleAutoFill = async () => {
    if (!selectedClassType || !selectedParamName) return
    setIsFetchingObjectInfo(true)
    setError(null)
    try {
      const info = await comfyApi.getObjectInfo(selectedClassType)
      const nodeInfo = info[selectedClassType]
      if (!nodeInfo) {
        setError(`ComfyUI から '${selectedClassType}' の定義を取得できませんでした。`)
        return
      }
      const allInputs = { ...nodeInfo.input?.required, ...nodeInfo.input?.optional }
      const entry = allInputs?.[selectedParamName]
      if (!entry) {
        setError(`パラメータ '${selectedParamName}' の定義が見つかりませんでした。`)
        return
      }

      if (Array.isArray(entry[0])) {
        // Combo type
        setForm((f) => ({
          ...f,
          widget_type: 'select',
          combo_options_text: (entry[0] as string[]).join('\n'),
        }))
      } else {
        const typeName = String(entry[0]).toUpperCase()
        const config = (entry[1] as Record<string, number>) ?? {}
        if (typeName === 'INT') {
          setForm((f) => ({
            ...f,
            widget_type: 'int',
            min_value: config.min !== undefined ? String(config.min) : '',
            max_value: config.max !== undefined ? String(config.max) : '',
            step: config.step !== undefined ? String(config.step) : '1',
          }))
        } else if (typeName === 'FLOAT') {
          setForm((f) => ({
            ...f,
            widget_type: 'float',
            min_value: config.min !== undefined ? String(config.min) : '',
            max_value: config.max !== undefined ? String(config.max) : '',
            step: config.step !== undefined ? String(config.step) : '0.01',
          }))
        } else if (typeName === 'BOOLEAN') {
          setForm((f) => ({ ...f, widget_type: 'boolean' }))
        } else {
          setForm((f) => ({ ...f, widget_type: 'textarea' }))
        }
      }
    } catch (e: any) {
      setError(`ComfyUI データの取得に失敗しました: ${e.message || String(e)}`)
    } finally {
      setIsFetchingObjectInfo(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('マスター型名を入力してください。')
      return
    }

    const payload: ParamTypeMasterCreate = {
      name: form.name.trim(),
      widget_type: form.widget_type,
      combo_options:
        form.widget_type === 'select'
          ? form.combo_options_text
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      min_value: form.min_value !== '' ? Number(form.min_value) : undefined,
      max_value: form.max_value !== '' ? Number(form.max_value) : undefined,
      step: form.step !== '' ? Number(form.step) : undefined,
    }

    onSubmit(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-surface-1 border border-[rgba(255,255,255,0.08)] rounded-xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-100">
            {mode === 'create' ? 'カスタム型マスター作成' : 'カスタム型マスター編集'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>マスター型名 *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例: SamplerType, DenoiseStep"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>UIウィジェット種別 *</label>
              <select
                value={form.widget_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    widget_type: e.target.value as FormState['widget_type'],
                  })
                }
                className={inputCls}
              >
                <option value="select">select (ドロップダウン)</option>
                <option value="int">int (整数数値)</option>
                <option value="float">float (小数数値)</option>
                <option value="textarea">textarea (テキスト)</option>
                <option value="boolean">boolean (スイッチ)</option>
              </select>
            </div>
          </div>

          {/* Combo Options for select */}
          {form.widget_type === 'select' && (
            <div>
              <label className={labelCls}>ドロップダウン選択肢 (1行に1選択肢)</label>
              <textarea
                value={form.combo_options_text}
                onChange={(e) => setForm({ ...form, combo_options_text: e.target.value })}
                placeholder={'euler\neuler_ancestral\ndpmpp_2m\nddim'}
                rows={4}
                className={inputCls}
              />
            </div>
          )}

          {/* Min / Max / Step for int / float */}
          {(form.widget_type === 'int' || form.widget_type === 'float') && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>最小値 (Min)</label>
                <input
                  type="number"
                  step={form.widget_type === 'float' ? 'any' : '1'}
                  value={form.min_value}
                  onChange={(e) => setForm({ ...form, min_value: e.target.value })}
                  placeholder="未設定"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>最大値 (Max)</label>
                <input
                  type="number"
                  step={form.widget_type === 'float' ? 'any' : '1'}
                  value={form.max_value}
                  onChange={(e) => setForm({ ...form, max_value: e.target.value })}
                  placeholder="未設定"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>ステップ (Step)</label>
                <input
                  type="number"
                  step={form.widget_type === 'float' ? 'any' : '1'}
                  value={form.step}
                  onChange={(e) => setForm({ ...form, step: e.target.value })}
                  placeholder="未設定"
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {/* ComfyUI Auto-Fill Accordion */}
          <div className="border border-[rgba(255,255,255,0.06)] rounded-lg overflow-hidden bg-surface-2/40">
            <button
              type="button"
              onClick={() => setShowAutoFill(!showAutoFill)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-surface-2 transition-colors"
            >
              <div className="flex items-center gap-1.5 text-[#7C6FDD]">
                <Wand2 className="w-3.5 h-3.5" />
                <span>ComfyUI から自動取得</span>
              </div>
              {showAutoFill ? (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
              )}
            </button>

            {showAutoFill && (
              <div className="p-3 border-t border-[rgba(255,255,255,0.06)] space-y-3">
                <div>
                  <label className={labelCls}>対象ワークフロー</label>
                  <select
                    value={selectedWorkflowId ?? ''}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : null
                      setSelectedWorkflowId(val)
                      setSelectedNodeId('')
                      setSelectedClassType('')
                      setSelectedParamName('')
                    }}
                    className={inputCls}
                  >
                    <option value="">-- 選択してください --</option>
                    {workflows?.map((wf) => (
                      <option key={wf.id} value={wf.id}>
                        {wf.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedWorkflowId && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>対象ノード</label>
                      <select
                        value={selectedNodeId}
                        onChange={(e) => handleNodeChange(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">-- 選択 --</option>
                        {nodeList.map((n) => (
                          <option key={n.nodeId} value={n.nodeId}>
                            [{n.nodeId}] {n.title} ({n.classType})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>パラメータ名</label>
                      <select
                        value={selectedParamName}
                        onChange={(e) => setSelectedParamName(e.target.value)}
                        className={inputCls}
                        disabled={!selectedNodeId}
                      >
                        <option value="">-- 選択 --</option>
                        {paramList.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleAutoFill}
                  disabled={!selectedClassType || !selectedParamName || isFetchingObjectInfo}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#7C6FDD]/20 hover:bg-[#7C6FDD]/30 text-[#7C6FDD] font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  {isFetchingObjectInfo ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  <span>取得してフォームに適用</span>
                </button>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[rgba(255,255,255,0.06)]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-300 hover:bg-surface-2 transition-colors text-xs"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#7C6FDD] hover:bg-[#6b5ed2] text-white font-medium disabled:opacity-50 transition-colors text-xs"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>保存</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
