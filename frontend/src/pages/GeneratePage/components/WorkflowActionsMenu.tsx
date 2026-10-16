import { useState, useRef } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { Workflow, BaseModel } from '../../../api/types'
import { HeaderDropdown } from '../../../components/common/header/HeaderDropdown'

export interface WorkflowActionsMenuProps {
  workflowId: number | null
  workflow: Workflow | null | undefined
  baseModels?: BaseModel[]
  onSaveDefaults: () => void
  isSavePending?: boolean
  onResetDefaults: () => void
  onUpdateBaseModel: (baseModelId: number | null) => void
  onRenameWorkflow: () => void
  onDuplicateWorkflow: () => void
  onRescanNodes: () => void
}

export function WorkflowActionsMenu({
  workflowId,
  workflow,
  baseModels,
  onSaveDefaults,
  isSavePending = false,
  onResetDefaults,
  onUpdateBaseModel,
  onRenameWorkflow,
  onDuplicateWorkflow,
  onRescanNodes,
}: WorkflowActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  if (!workflowId || !workflow) {
    return null
  }

  return (
    <div className="relative inline-flex items-center" ref={menuRef}>
      <button
        type="button"
        id="workflow-actions-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-[26px] h-[28px] rounded-md border flex items-center justify-center transition-all ${
          isOpen
            ? 'border-accent-green bg-accent-green/10 text-accent-green'
            : 'border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
        }`}
        title="ワークフロー設定"
        aria-label="ワークフロー設定"
        aria-expanded={isOpen}
      >
        <MoreHorizontal size={14} />
      </button>

      <HeaderDropdown
          open={isOpen}
          onClose={() => setIsOpen(false)}
          anchorRef={menuRef}
          align="start"
          role="menu"
          className="w-[240px] bg-surface-2 border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl p-3 space-y-3 animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-1.5">
            <span className="text-[11px] font-semibold text-zinc-300">ワークフロー個別設定</span>
            <span className="text-[9px] text-zinc-500 font-mono">ID: {workflowId}</span>
          </div>

          {/* ベースモデル紐付け */}
          <div className="space-y-1">
            <label htmlFor="workflow-actions-base-model" className="text-[10px] text-zinc-400 font-medium block">
              ベースモデル
            </label>
            <select
              id="workflow-actions-base-model"
              value={workflow.target_base_model_id ?? ''}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null
                onUpdateBaseModel(val)
              }}
              className="w-full bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40"
            >
              <option value="">Base Model: Auto</option>
              {baseModels?.map((bm) => (
                <option key={bm.id} value={bm.id}>
                  {bm.name}
                </option>
              ))}
            </select>
          </div>

          {/* デフォルト保存 & リセット */}
          <div className="flex gap-1.5">
            <button
              type="button"
              id="workflow-actions-save-defaults"
              onClick={() => {
                onSaveDefaults()
                setIsOpen(false)
              }}
              disabled={isSavePending}
              className="flex-1 py-1 rounded bg-accent-green/10 hover:bg-accent-green/20 border border-accent-green/30 text-accent-green text-[10px] font-semibold disabled:opacity-40 transition-colors"
            >
              デフォルト保存
            </button>
            <button
              type="button"
              id="workflow-actions-reset-defaults"
              onClick={() => {
                onResetDefaults()
                setIsOpen(false)
              }}
              className="flex-1 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.06)] text-zinc-300 text-[10px] font-semibold transition-colors"
            >
              リセット
            </button>
          </div>

          {/* 管理アクション */}
          <div className="space-y-1.5 pt-2 border-t border-[rgba(255,255,255,0.06)] flex flex-col">
            <div className="flex gap-1.5">
              <button
                type="button"
                id="workflow-actions-rename"
                onClick={() => {
                  onRenameWorkflow()
                  setIsOpen(false)
                }}
                className="flex-1 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.06)] text-zinc-300 text-[10px] font-semibold transition-colors"
              >
                名前を変更
              </button>
              <button
                type="button"
                id="workflow-actions-duplicate"
                onClick={() => {
                  onDuplicateWorkflow()
                  setIsOpen(false)
                }}
                className="flex-1 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.06)] text-zinc-300 text-[10px] font-semibold transition-colors"
              >
                複製
              </button>
            </div>
            <button
              type="button"
              id="workflow-actions-rescan"
              onClick={() => {
                onRescanNodes()
                setIsOpen(false)
              }}
              className="w-full py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.06)] text-zinc-300 text-[10px] font-semibold transition-colors"
            >
              ノード再スキャン
            </button>
          </div>
      </HeaderDropdown>
    </div>
  )
}
