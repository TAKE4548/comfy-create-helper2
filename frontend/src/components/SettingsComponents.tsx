/**
 * Settings page sub-components:
 *   - MappingMasterModal (create / edit)
 *   - MappingMasterDeleteModal
 *   - ConnectionStatus
 */

import { useState } from 'react'
import { X, RefreshCw, AlertTriangle, GripVertical, Edit2, Trash2, Copy } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { MappingMaster, MappingMasterCreate } from '../api/types'

const inputCls = 'w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40'

// ─── Shared form state type ─────────────────────────────────────
export interface MappingMasterFormState {
  role: string
  displayName: string
  paramName: string
  inputType: 'textarea' | 'int' | 'float' | 'select' | 'lora_stack' | 'select_sampler' | 'select_scheduler' | 'boolean'
  expectedClassTypes: string
  titlePatterns: string
}

export function emptyMasterForm(): MappingMasterFormState {
  return { role: '', displayName: '', paramName: '', inputType: 'textarea', expectedClassTypes: '', titlePatterns: '' }
}

export function masterFormToCreate(f: MappingMasterFormState): MappingMasterCreate {
  return {
    role: f.role,
    display_name: f.displayName,
    param_name: f.paramName,
    input_type: f.inputType,
    expected_class_types: f.expectedClassTypes.split(',').map((s) => s.trim()).filter(Boolean),
    title_patterns: f.titlePatterns.split(',').map((s) => s.trim()).filter(Boolean),
  }
}

export function masterToForm(mm: MappingMaster): MappingMasterFormState {
  return {
    role: mm.role,
    displayName: mm.display_name,
    paramName: mm.param_name,
    inputType: mm.input_type,
    expectedClassTypes: mm.expected_class_types?.join(', ') ?? '',
    titlePatterns: mm.title_patterns?.join(', ') ?? '',
  }
}

// ─── Create / Edit Modal ────────────────────────────────────────
export function MappingMasterModal({
  mode, form, setForm, isPending, onClose, onSubmit, masters,
}: {
  mode: 'create' | 'edit'
  form: MappingMasterFormState
  setForm: React.Dispatch<React.SetStateAction<MappingMasterFormState>>
  isPending: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  masters?: MappingMaster[]
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-surface border border-[rgba(255,255,255,0.08)] rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-3">
          <h3 className="text-sm font-semibold text-zinc-200">
            {mode === 'create' ? 'Create Mapping Master' : 'Edit Mapping Master'}
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={16} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          {mode === 'create' && masters && masters.length > 0 && (
            <div className="space-y-1.5 bg-white/[0.02] border border-[rgba(255,255,255,0.06)] rounded-xl p-3">
              <label className="text-[11px] text-zinc-400 font-medium">既存レコードからコピー（コピー元選択）</label>
              <select
                onChange={(e) => {
                  const selectedId = Number(e.target.value)
                  if (!selectedId) return
                  const selected = masters.find(m => m.id === selectedId)
                  if (selected) {
                    setForm(masterToForm(selected))
                  }
                }}
                className={inputCls}
                defaultValue=""
              >
                <option value="">コピー元を選択してください...</option>
                {masters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.role} ({m.display_name})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-medium">Role (Unique Key)</label>
              <input type="text" required value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={inputCls} placeholder="e.g., prompt" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-medium">Display Name</label>
              <input type="text" required value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} className={inputCls} placeholder="e.g., ポジティブプロンプト" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-medium">Param Name</label>
              <input type="text" required value={form.paramName} onChange={(e) => setForm((f) => ({ ...f, paramName: e.target.value }))} className={inputCls} placeholder="e.g., text" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-medium">Input Type</label>
              <select value={form.inputType} onChange={(e) => setForm((f) => ({ ...f, inputType: e.target.value as MappingMasterFormState['inputType'] }))} className={inputCls}>
                {(['textarea', 'int', 'float', 'select', 'lora_stack', 'select_sampler', 'select_scheduler', 'boolean'] as const).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-400 font-medium">Expected Class Types (comma separated)</label>
            <input type="text" value={form.expectedClassTypes} onChange={(e) => setForm((f) => ({ ...f, expectedClassTypes: e.target.value }))} className={inputCls} placeholder="e.g., CLIPTextEncode, CLIPTextEncodeSDXL" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-400 font-medium">Title Patterns (comma separated)</label>
            <input type="text" value={form.titlePatterns} onChange={(e) => setForm((f) => ({ ...f, titlePatterns: e.target.value }))} className={inputCls} placeholder="e.g., positive, prompt" />
          </div>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
            <button type="button" onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-2">Cancel</button>
            <button type="submit" disabled={isPending}
              className="bg-[#7C6FDD] text-white hover:bg-[#6d62cc] disabled:opacity-50 text-xs px-4 py-2 rounded-lg font-medium transition-all">Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete Confirmation Modal ──────────────────────────────────
export function MappingMasterDeleteModal({
  master, usages, isLoadingUsages, isPending, onClose, onDelete,
}: {
  master: MappingMaster
  usages?: { workflow_name: string; node_id: string }[]
  isLoadingUsages: boolean
  isPending: boolean
  onClose: () => void
  onDelete: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-md bg-surface border border-[rgba(255,255,255,0.08)] rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-2.5 text-red-400">
          <AlertTriangle size={18} /><h3 className="text-sm font-semibold">Delete Mapping Master?</h3>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Are you sure you want to delete <span className="font-mono text-zinc-200 font-bold">{master.role}</span>? This action cannot be undone.
        </p>
        {isLoadingUsages ? (
          <div className="flex items-center gap-2 text-zinc-600 text-xs py-2"><RefreshCw size={12} className="animate-spin" />Checking usage in workflows…</div>
        ) : usages && usages.length > 0 ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Warning: Currently used in {usages.length} workflow mapping(s):</p>
            <div className="max-h-28 overflow-y-auto custom-scrollbar space-y-1.5">
              {usages.map((u, idx) => (
                <div key={idx} className="text-[11px] text-zinc-300 flex justify-between font-mono bg-white/[0.02] px-2 py-1 rounded">
                  <span className="truncate max-w-[200px]" title={u.workflow_name}>{u.workflow_name}</span>
                  <span className="text-zinc-500 text-right">Node: {u.node_id}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-accent-green bg-accent-green/10 border border-accent-green/20 px-3 py-1.5 rounded-lg">Not currently used in any workflow mappings. Safe to delete.</p>
        )}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-2">Cancel</button>
          <button type="button" onClick={onDelete} disabled={isPending}
            className="bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 text-xs px-4 py-2 rounded-lg font-medium transition-all">Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Connection Status Row ──────────────────────────────────────
export function ConnectionStatus({ label, url }: { label: string; url: string }) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const check = async () => {
    setStatus('checking')
    try { await fetch(url, { signal: AbortSignal.timeout(3000) }); setStatus('ok') }
    catch { setStatus('error') }
  }
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-zinc-300">{label}</p>
        <p className="text-xs text-zinc-600 font-mono">{url}</p>
      </div>
      <div className="flex items-center gap-2">
        {status !== 'idle' && (
          <div className={`w-2 h-2 rounded-full ${status === 'checking' ? 'bg-zinc-500 animate-pulse' : status === 'ok' ? 'bg-accent-green' : 'bg-red-500'}`} />
        )}
        <button id={`check-${label.replace(/\s+/g, '-').toLowerCase()}`} onClick={check}
          className="text-xs px-2 py-1 rounded-md border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all">
          {status === 'checking' ? 'Checking…' : 'Ping'}
        </button>
      </div>
    </div>
  )
}

interface SortableMasterRowProps {
  mm: MappingMaster
  openEditModal: (mm: MappingMaster) => void
  openDeleteModal: (mm: MappingMaster) => void
  openCopyModal: (mm: MappingMaster) => void
  isMultiSelectMode: boolean
  isSelected: boolean
  onClick: (e: React.MouseEvent) => void
  longPressHandlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  }
}

export function SortableMasterRow({
  mm,
  openEditModal,
  openDeleteModal,
  openCopyModal,
  isMultiSelectMode,
  isSelected,
  onClick,
  longPressHandlers
}: SortableMasterRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: mm.id, disabled: false })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      onMouseDown={longPressHandlers.onMouseDown}
      onMouseUp={longPressHandlers.onMouseUp}
      onMouseLeave={longPressHandlers.onMouseLeave}
      onTouchStart={longPressHandlers.onTouchStart}
      onTouchEnd={longPressHandlers.onTouchEnd}
      className={`transition-colors cursor-pointer select-none ${
        isMultiSelectMode && isSelected
          ? 'bg-[#3ECF8E]/10 border-l-2 border-[#3ECF8E] hover:bg-[#3ECF8E]/15'
          : 'hover:bg-white/[0.01]'
      }`}
    >
      <td className="px-3 py-3 text-zinc-600">
        <div className="flex items-center gap-2">
          {isMultiSelectMode && (
            <div className="w-[13px] h-[13px] border border-[rgba(255,255,255,0.15)] rounded flex items-center justify-center bg-zinc-800 flex-shrink-0">
              {isSelected && <div className="w-1.5 h-1.5 rounded-sm bg-[#3ECF8E]" />}
            </div>
          )}
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing p-1 hover:text-zinc-400 transition-colors focus:outline-none flex-shrink-0"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={13} />
          </button>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-zinc-200">{mm.role}</td>
      <td className="px-4 py-3">{mm.display_name}</td>
      <td className="px-4 py-3 font-mono text-zinc-400">{mm.param_name}</td>
      <td className="px-4 py-3">
        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px]">
          {mm.input_type}
        </span>
      </td>
      <td className="px-4 py-3 text-zinc-500 font-mono max-w-[150px] truncate" title={mm.expected_class_types?.join(', ')}>
        {mm.expected_class_types?.join(', ') || '-'}
      </td>
      <td className="px-4 py-3 text-zinc-500 font-mono max-w-[150px] truncate" title={mm.title_patterns?.join(', ')}>
        {mm.title_patterns?.join(', ') || '-'}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {!isMultiSelectMode && (
            <>
              <button onClick={(e) => { e.stopPropagation(); openEditModal(mm) }} className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors" title="Edit">
                <Edit2 size={13} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); openCopyModal(mm) }} className="p-1 text-zinc-400 hover:text-accent-green transition-colors" title="Copy to New">
                <Copy size={13} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); openDeleteModal(mm) }} className="p-1 text-zinc-400 hover:text-red-400 transition-colors" title="Delete">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Workflow Delete Confirm Dialog ───────────────────────────────
export function WorkflowDeleteConfirmDialog({
  workflowName,
  isPending,
  onClose,
  onConfirm,
  mappingsCount,
  presetsCount,
  snapshotsCount,
  isLoadingDetails,
}: {
  workflowName: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
  mappingsCount: number;
  presetsCount: number;
  snapshotsCount: number;
  isLoadingDetails: boolean;
}) {
  const [understood, setUnderstood] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-xl p-6 shadow-2xl space-y-4 relative animate-scale-up" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} disabled={isPending} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
          <X size={16} />
        </button>
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle size={18} />
          <h3 className="text-sm font-semibold text-zinc-200">
            ワークフロー「{workflowName}」を削除しますか？
          </h3>
        </div>
        
        {isLoadingDetails ? (
          <div className="flex items-center gap-2 text-zinc-500 text-xs py-4">
            <RefreshCw size={12} className="animate-spin" />
            関連データを確認中...
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400 leading-relaxed">
              以下のデータがすべて削除されます（取り消し不可）:
            </p>
            <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 space-y-1.5 text-xs text-zinc-350 font-mono">
              <div>・ノードマッピング: {mappingsCount} 件</div>
              <div>・プロファイル: {presetsCount} 件</div>
              <div>・生成履歴（スナップショット）: {snapshotsCount} 件</div>
            </div>
          </div>
        )}

        <div className="pt-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-400 select-none">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              disabled={isPending || isLoadingDetails}
              className="w-4 h-4 text-red-500 accent-red-500 border-zinc-800 rounded focus:ring-red-500/20"
            />
            <span>上記の内容を理解しました</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button 
            type="button" 
            onClick={onClose} 
            disabled={isPending} 
            className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-white/5 transition-all"
          >
            キャンセル
          </button>
          <button 
            type="button" 
            onClick={onConfirm} 
            disabled={isPending || isLoadingDetails || !understood}
            className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs px-4 py-2 rounded-lg font-semibold text-white transition-all shadow-md"
          >
            {isPending && <RefreshCw size={12} className="animate-spin" />}
            削除する
          </button>
        </div>
      </div>
    </div>
  );
}


