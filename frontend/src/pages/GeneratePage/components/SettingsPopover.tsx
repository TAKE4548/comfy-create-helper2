import { Settings, X } from 'lucide-react'

export interface SettingsPopoverProps {
  setIsSettingsOpen: (open: boolean) => void
  localComfyUrl: string
  setLocalComfyUrl: (url: string) => void
  setComfyUrl: (url: string) => void
  selectedWorkflowId: number | null
  workflow: any
  handleSaveDefaultParams: () => void
  isSavePending: boolean
  handleResetDefaultParams: () => void
  mobile?: boolean
  baseModels?: { id: number; name: string }[]
  updateWorkflowBaseModelMutation?: { mutate: (args: { id: number; target_base_model_id: number | null }) => void }
  setWorkflowManageMode?: (mode: 'rename' | 'copy') => void
  setRescanOpen?: (open: boolean) => void
}

export const SettingsPopover = ({
  setIsSettingsOpen,
  localComfyUrl,
  setLocalComfyUrl,
  setComfyUrl,
  selectedWorkflowId,
  workflow,
  handleSaveDefaultParams,
  isSavePending,
  handleResetDefaultParams,
  mobile = false,
  baseModels,
  updateWorkflowBaseModelMutation,
  setWorkflowManageMode,
  setRescanOpen,
}: SettingsPopoverProps) => (
  <div className={`absolute ${mobile ? 'left-[-120px]' : 'right-0'} top-full mt-2 w-72 bg-surface-2 border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl p-4 z-50 space-y-4 animate-fade-in`}>
    <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-2">
      <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
        <Settings size={12} className="text-accent-green" />ComfyUI設定
      </span>
      <button type="button" onClick={() => setIsSettingsOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
        <X size={14} />
      </button>
    </div>
    <div className="space-y-1.5">
      <label className="text-[10px] text-zinc-400 font-medium">ComfyUI URL</label>
      <input
        type="text"
        value={localComfyUrl}
        onChange={(e) => { setLocalComfyUrl(e.target.value); setComfyUrl(e.target.value) }}
        placeholder="http://localhost:8188"
        className="w-full bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40"
      />
    </div>
    {selectedWorkflowId && workflow && (
      <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-400 font-medium">ワークフロー設定</span>
          <span className="text-[9px] text-zinc-500 font-mono">ID: {selectedWorkflowId}</span>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-zinc-400 font-medium">ベースモデル</label>
          <select
            id="workflow-base-model-select-popover"
            value={workflow.target_base_model_id ?? ''}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : null
              updateWorkflowBaseModelMutation?.mutate({ id: workflow.id, target_base_model_id: val })
            }}
            className="w-full bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 bg-zinc-900"
          >
            <option value="">Base Model: Auto</option>
            {baseModels?.map((bm) => (
              <option key={bm.id} value={bm.id}>
                {bm.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { handleSaveDefaultParams(); setIsSettingsOpen(false) }}
            disabled={isSavePending}
            className="flex-1 py-1.5 rounded bg-accent-green/10 hover:bg-accent-green/20 border border-accent-green/30 text-accent-green text-[10px] font-semibold disabled:opacity-40"
          >デフォルト保存</button>
          <button
            type="button"
            onClick={() => { handleResetDefaultParams(); setIsSettingsOpen(false) }}
            className="flex-1 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.06)] text-zinc-350 text-[10px] font-semibold"
          >リセット</button>
        </div>
        <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)] flex flex-col">
          <div className="flex gap-2">
            <button
              type="button"
              id="popover-rename-btn"
              onClick={() => {
                setWorkflowManageMode?.('rename')
                setIsSettingsOpen(false)
              }}
              className="flex-1 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.06)] text-zinc-300 text-[10px] font-semibold"
            >
              名前を変更
            </button>
            <button
              type="button"
              id="popover-copy-btn"
              onClick={() => {
                setWorkflowManageMode?.('copy')
                setIsSettingsOpen(false)
              }}
              className="flex-1 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.06)] text-zinc-300 text-[10px] font-semibold"
            >
              コピー
            </button>
          </div>
          <button
            type="button"
            id="popover-rescan-btn"
            onClick={() => {
              setRescanOpen?.(true)
              setIsSettingsOpen(false)
            }}
            className="w-full py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.06)] text-zinc-300 text-[10px] font-semibold"
          >
            ノードリマッピング
          </button>
        </div>
      </div>
    )}
  </div>
)
