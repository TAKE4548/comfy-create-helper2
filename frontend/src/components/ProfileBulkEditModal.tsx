import { useState } from 'react';
import { X, Loader2, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import type { WorkflowPreset, MappingMaster, Lora, TagSet } from '../api/types';
import type { AppliedAsset } from '../store/useGenerationStore';
import { SearchableLoraSelect } from './SearchableLoraSelect';
import { LoraStackEditor } from './LoraStackEditor';
import { AddAssetModal } from '../pages/GeneratePage/components/AddAssetModal';

// ─── Types ──────────────────────────────────────────────────────

export type PromptOpType = 'search_replace' | 'overwrite' | 'prefix' | 'suffix';

export interface PromptOp {
  op: PromptOpType;
  /** null = all textarea fields */
  fields: string[] | null;
  find?: string;
  replace?: string;
  value?: string;
}

export interface LoraOp {
  mode: 'append' | 'replace';
  role: string;
  asset: AppliedAsset;
}

export interface AppliedAssetOp {
  mode: 'append' | 'replace';
  role: string;
  assets: AppliedAsset[];
}

export interface BulkEditPayload {
  promptOps?: PromptOp[];
  paramPatch?: Record<string, string>;
  batchSize?: number;
  loraOps?: LoraOp[];
  assetOps?: AppliedAssetOp[];
}

export interface ProfileBulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPresets: WorkflowPreset[];
  mappingMasters: MappingMaster[];
  loras: Lora[];
  tagSets?: TagSet[];
  comfyObjectInfo?: Record<string, any>;
  onApply: (payload: BulkEditPayload) => void;
  isApplying?: boolean;
}

type Tab = 'prompt' | 'params' | 'lora';

// ─── Helpers ────────────────────────────────────────────────────

const PROMPT_OP_LABELS: Record<PromptOpType, string> = {
  search_replace: '検索・置換',
  overwrite: '全置換（上書き）',
  prefix: '先頭に追加',
  suffix: '末尾に追加',
};

// ─── Component ──────────────────────────────────────────────────

export function ProfileBulkEditModal({
  isOpen,
  onClose,
  selectedPresets,
  mappingMasters,
  loras,
  tagSets = [],
  comfyObjectInfo,
  onApply,
  isApplying = false,
}: ProfileBulkEditModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('prompt');

  // Prompt tab state
  const [promptOp, setPromptOp] = useState<PromptOpType>('search_replace');
  const [promptFindText, setPromptFindText] = useState('');
  const [promptReplaceText, setPromptReplaceText] = useState('');
  const [promptValue, setPromptValue] = useState('');
  const [promptTargetAll, setPromptTargetAll] = useState(true);
  const [promptTargetFields, setPromptTargetFields] = useState<Set<string>>(new Set());

  // Params tab state
  const [paramPatch, setParamPatch] = useState<Record<string, string>>({});
  const [batchSizeInput, setBatchSizeInput] = useState('');

  // LoRA / Asset tab state
  const [loraFilename, setLoraFilename] = useState('');
  const [loraRole, setLoraRole] = useState('');
  const [loraMode, setLoraMode] = useState<'append' | 'replace'>('append');
  const [loraStrength, setLoraStrength] = useState('1.0');

  // AddAssetModal & AssetOps state
  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [targetAssetRole, setTargetAssetRole] = useState<string>('');
  const [assetOps, setAssetOps] = useState<AppliedAssetOp[]>([]);

  // Confirmation state
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<BulkEditPayload | null>(null);

  // ── Sampler/Scheduler options from comfyObjectInfo ──
  const getSamplerOptions = (): string[] => {
    return comfyObjectInfo?.KSampler?.input?.required?.sampler_name?.[0] ?? 
           comfyObjectInfo?.KSamplerAdvanced?.input?.required?.sampler_name?.[0] ?? [];
  };
  const getSchedulerOptions = (): string[] => {
    return comfyObjectInfo?.KSampler?.input?.required?.scheduler?.[0] ?? 
           comfyObjectInfo?.KSamplerAdvanced?.input?.required?.scheduler?.[0] ?? [];
  };

  if (!isOpen) return null;

  const count = selectedPresets.length;
  const textareaRoles = mappingMasters.filter(m => m.input_type === 'textarea');
  const paramRoles = mappingMasters.filter(m =>
    !['textarea'].includes(m.input_type)
  );
  const loraRoles = mappingMasters.filter(m => m.input_type === 'lora_stack');
  const allAssetTargetRoles = mappingMasters.filter(m => m.input_type === 'textarea' || m.input_type === 'lora_stack');

  const handleAddAppliedAsset = (role: string, assetData: Omit<AppliedAsset, 'id' | 'enabled'>) => {
    const asset: AppliedAsset = {
      ...assetData,
      id: `${assetData.type}-${assetData.assetId}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      enabled: true,
    };

    // Determine target roles (if in prompt tab, apply to all selected target fields or default to role)
    const targetRoles = activeTab === 'prompt'
      ? (promptTargetAll ? textareaRoles.map(m => m.role) : Array.from(promptTargetFields))
      : [role];
    const rolesToApply = targetRoles.length > 0 ? targetRoles : [role];

    // Determine asset operation mode (if promptOp is overwrite, treat assetOp mode as replace)
    const effectiveMode = promptOp === 'overwrite' ? 'replace' : loraMode;

    // 1. Queue for asset registration in applied_assets for each target role
    setAssetOps(prev => {
      let updated = [...prev];
      for (const r of rolesToApply) {
        const existingOpIndex = updated.findIndex(op => op.role === r);
        if (existingOpIndex >= 0) {
          updated[existingOpIndex] = {
            ...updated[existingOpIndex],
            mode: effectiveMode,
            assets: effectiveMode === 'replace' ? [asset] : [...updated[existingOpIndex].assets, asset],
          };
        } else {
          updated.push({ mode: effectiveMode, role: r, assets: [asset] });
        }
      }
      return updated;
    });

    // 2. Append text (LoRA syntax / tags) directly into active prompt tab input field
    const textToAdd = asset.loraPromptString ?? (asset.tags ? asset.tags.join(', ') : '');
    if (textToAdd) {
      if (promptOp === 'search_replace') {
        setPromptReplaceText(prev => (prev ? `${prev}, ${textToAdd}` : textToAdd));
      } else {
        setPromptValue(prev => (prev ? `${prev}, ${textToAdd}` : textToAdd));
      }
    }
  };

  const handleRemoveQueuedAsset = (role: string, assetId: string) => {
    setAssetOps(prev => {
      return prev
        .map(op => {
          if (op.role !== role) return op;
          return {
            ...op,
            assets: op.assets.filter(a => a.id !== assetId),
          };
        })
        .filter(op => op.assets.length > 0);
    });
  };

  // ── Build payload ──
  const buildPayload = (): BulkEditPayload | null => {
    const payload: BulkEditPayload = {};

    // 1. Prompt ops (if configured)
    const targetFields = promptTargetAll ? null : Array.from(promptTargetFields);
    if (promptOp === 'search_replace') {
      if (promptFindText) {
        payload.promptOps = [{ op: 'search_replace', fields: targetFields, find: promptFindText, replace: promptReplaceText }];
      }
    } else {
      if (promptValue) {
        payload.promptOps = [{ op: promptOp, fields: targetFields ?? textareaRoles.map(m => m.role), value: promptValue }];
      }
    }

    // 2. Asset ops (LoRA & TagSet queue from AddAssetModal)
    if (assetOps.length > 0) {
      payload.assetOps = assetOps;
    }

    // 3. Param patch
    const filteredParams: Record<string, string> = {};
    Object.entries(paramPatch).forEach(([k, v]) => { if (v !== '') filteredParams[k] = v; });
    if (Object.keys(filteredParams).length > 0) payload.paramPatch = filteredParams;
    if (batchSizeInput !== '') {
      const n = parseInt(batchSizeInput, 10);
      if (!isNaN(n) && n > 0) payload.batchSize = n;
    }

    // 4. Legacy LoRA op
    if (loraFilename) {
      const targetRole = loraRole || (loraRoles.length > 0 ? loraRoles[0].role : 'lora');
      const loraData = loras.find(l => l.model_name === loraFilename || l.file_path === loraFilename);
      if (loraData && targetRole) {
        const path = loraData.file_path || loraData.model_name || '';
        const filename = path.split('/').pop()?.split('\\').pop()?.replace(/\.[^/.]+$/, '') || 'lora';
        const strength = parseFloat(loraStrength) || 1.0;
        const asset: AppliedAsset = {
          id: `lora-${loraData.id}-${Date.now()}`,
          type: 'lora',
          assetId: loraData.id,
          name: loraData.description || filename,
          enabled: true,
          tags: loraData.trigger_word_sets?.[0]?.words ?? [],
          loraPromptString: `<lora:${filename}:${strength.toFixed(1)}>`,
        };
        payload.loraOps = [{ mode: loraMode, role: targetRole, asset }];
      }
    }

    return Object.keys(payload).length > 0 ? payload : null;
  };

  const handleApplyClick = () => {
    const payload = buildPayload();
    if (!payload) return;
    setPendingPayload(payload);
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    if (pendingPayload) {
      onApply(pendingPayload);
      setShowConfirm(false);
      setPendingPayload(null);
    }
  };

  const togglePromptField = (role: string) => {
    setPromptTargetFields(prev => {
      const next = new Set(prev);
      next.has(role) ? next.delete(role) : next.add(role);
      return next;
    });
  };

  // ─── Confirm Dialog ───────────────────────────────────────────
  if (showConfirm) {
    return (
      <div className="modal-backdrop">
        <div
          className="relative w-full max-w-sm bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-2xl p-6 space-y-4"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-400 flex-shrink-0" />
            <h3 className="text-base font-semibold text-white">一括編集の確認</h3>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed">
            選択した <span className="text-white font-semibold">{count} 件</span>
            のプリセットに変更を適用します。<br />
            <span className="text-amber-400 font-medium">この操作は取り消せません。</span>
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setShowConfirm(false); setPendingPayload(null); }}
              className="flex-1 py-2 text-sm text-gray-400 hover:text-white border border-[rgba(255,255,255,0.1)] rounded-lg hover:bg-white/5 transition-all"
            >
              キャンセル
            </button>
            <button
              onClick={handleConfirm}
              disabled={isApplying}
              className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold text-[#18181C] bg-[#3ECF8E] hover:bg-[#34b279] rounded-lg transition-all disabled:opacity-50"
            >
              {isApplying && <Loader2 size={14} className="animate-spin" />}
              適用する
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Modal ───────────────────────────────────────────────
  return (
    <div className="modal-backdrop">
      <div
        className="relative w-full max-w-lg bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
          <div>
            <h3 className="text-lg font-semibold text-white">プロファイル一括編集</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="text-[#3ECF8E] font-bold">{count} 件</span> のプリセットに適用
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-[rgba(255,255,255,0.08)]">
          {([
            { id: 'prompt', label: 'プロンプト' },
            { id: 'params', label: 'パラメータ' },
            { id: 'lora', label: 'LoRA' },
          ] as { id: Tab; label: string }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-[#3ECF8E] border-[#3ECF8E]'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── Prompt Tab ── */}
          {activeTab === 'prompt' && (
            <div className="space-y-5">
              {/* Operation Type */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">操作タイプ</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(PROMPT_OP_LABELS) as PromptOpType[]).map(op => (
                    <button
                      key={op}
                      onClick={() => setPromptOp(op)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
                        promptOp === op
                          ? 'bg-[#3ECF8E]/15 border-[#3ECF8E]/50 text-[#3ECF8E]'
                          : 'bg-[#1F1F25] border-[rgba(255,255,255,0.06)] text-gray-400 hover:text-white'
                      }`}
                    >
                      {PROMPT_OP_LABELS[op]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inputs per op type */}
              {promptOp === 'search_replace' ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">検索する文字列</label>
                    <input
                      type="text"
                      value={promptFindText}
                      onChange={e => setPromptFindText(e.target.value)}
                      placeholder="例: <lora:characterA:1.0>"
                      className="w-full px-3 py-2 text-sm text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">置換後の文字列</label>
                      <button
                        type="button"
                        onClick={() => {
                          const defaultRole = textareaRoles[0]?.role || 'positive';
                          setTargetAssetRole(defaultRole);
                          setIsAddAssetOpen(true);
                        }}
                        className="flex items-center gap-1 text-[11px] font-semibold text-[#3ECF8E] hover:underline"
                      >
                        <Plus size={12} /> アセットを追加
                      </button>
                    </div>
                    <input
                      type="text"
                      value={promptReplaceText}
                      onChange={e => setPromptReplaceText(e.target.value)}
                      placeholder="例: <lora:characterB:1.0>（空欄で削除）"
                      className="w-full px-3 py-2 text-sm text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      {promptOp === 'overwrite' ? '置換するテキスト' : promptOp === 'prefix' ? '先頭に追加するテキスト' : '末尾に追加するテキスト'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const defaultRole = textareaRoles[0]?.role || 'positive';
                        setTargetAssetRole(defaultRole);
                        setIsAddAssetOpen(true);
                      }}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#3ECF8E] hover:underline"
                    >
                      <Plus size={12} /> アセットを追加
                    </button>
                  </div>
                  <textarea
                    value={promptValue}
                    onChange={e => setPromptValue(e.target.value)}
                    rows={3}
                    placeholder="テキストを入力..."
                    className="w-full px-3 py-2 text-sm text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors resize-none"
                  />
                </div>
              )}

              {/* Queued assets badge in prompt tab */}
              {assetOps.length > 0 && (
                <div className="p-2.5 bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-300">適用・登録予定のアセット ({assetOps.reduce((sum, op) => sum + op.assets.length, 0)}件)</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {assetOps.map(op =>
                      op.assets.map(asset => (
                        <span key={asset.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] text-gray-200">
                          <span className="font-medium">{asset.name}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveQueuedAsset(op.role, asset.id)}
                            className="text-gray-400 hover:text-red-400 ml-1 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Target fields */}
              {textareaRoles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">対象フィールド</label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={promptTargetAll}
                        onChange={e => setPromptTargetAll(e.target.checked)}
                        className="w-3.5 h-3.5 rounded accent-accent-green"
                      />
                      すべて対象
                    </label>
                  </div>
                  {!promptTargetAll && (
                    <div className="flex flex-wrap gap-2">
                      {textareaRoles.map(m => (
                        <label
                          key={m.role}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer border transition-all ${
                            promptTargetFields.has(m.role)
                              ? 'bg-[#3ECF8E]/15 border-[#3ECF8E]/50 text-[#3ECF8E]'
                              : 'bg-[#1F1F25] border-[rgba(255,255,255,0.06)] text-gray-400 hover:text-white'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={promptTargetFields.has(m.role)}
                            onChange={() => togglePromptField(m.role)}
                            className="sr-only"
                          />
                          {m.display_name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Params Tab ── */}
          {activeTab === 'params' && (
            <div className="space-y-4">
              {paramRoles.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-4">パラメータロールが設定されていません</p>
              )}
              {paramRoles.map(m => {
                if (m.input_type === 'lora_stack') {
                  return (
                    <LoraStackEditor
                      key={m.role}
                      role={m.role}
                      paramValues={paramPatch}
                      setParamValues={setParamPatch}
                      loras={loras}
                      title={m.display_name || undefined}
                    />
                  );
                }

                const samplerOpts = m.input_type === 'select_sampler' ? getSamplerOptions() : [];
                const schedulerOpts = m.input_type === 'select_scheduler' ? getSchedulerOptions() : [];
                const selectOpts = m.input_type === 'select' ? [] : samplerOpts.length > 0 ? samplerOpts : schedulerOpts;

                return (
                  <div key={m.role} className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{m.display_name}</label>
                    {selectOpts.length > 0 ? (
                      <select
                        value={paramPatch[m.role] ?? ''}
                        onChange={e => setParamPatch(prev => ({ ...prev, [m.role]: e.target.value }))}
                        className="w-full px-3 py-2 text-sm text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
                      >
                        <option value="">（変更しない）</option>
                        {selectOpts.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={m.input_type === 'int' || m.input_type === 'float' ? 'number' : 'text'}
                        step={m.input_type === 'float' ? '0.1' : '1'}
                        value={paramPatch[m.role] ?? ''}
                        onChange={e => setParamPatch(prev => ({ ...prev, [m.role]: e.target.value }))}
                        placeholder="変更しない"
                        className="w-full px-3 py-2 text-sm text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
                      />
                    )}
                  </div>
                );
              })}

              {/* Batch size (dedicated column) */}
              <div className="space-y-1.5 pt-2 border-t border-[rgba(255,255,255,0.06)]">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">バッチ数（Batch Size）</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={batchSizeInput}
                  onChange={e => setBatchSizeInput(e.target.value)}
                  placeholder="変更しない"
                  className="w-full px-3 py-2 text-sm text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
                />
              </div>
            </div>
          )}

          {/* ── LoRA / Asset Tab ── */}
          {activeTab === 'lora' && (
            <div className="space-y-4">
              {/* Asset Modal Opener */}
              <div className="p-3 bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#3ECF8E] uppercase tracking-wider">アセット一括追加（LoRA・タグセット）</label>
                  <button
                    type="button"
                    onClick={() => {
                      const defaultRole = allAssetTargetRoles[0]?.role || loraRoles[0]?.role || textareaRoles[0]?.role || 'lora';
                      setTargetAssetRole(defaultRole);
                      setIsAddAssetOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3ECF8E]/20 text-[#3ECF8E] border border-[#3ECF8E]/40 text-xs font-semibold hover:bg-[#3ECF8E]/30 transition-all"
                  >
                    <Plus size={14} />
                    アセットを追加
                  </button>
                </div>

                {assetOps.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
                    <span className="text-[11px] font-medium text-gray-400">適用予定のアセット:</span>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {assetOps.map(op => (
                        <div key={op.role} className="p-2 bg-[#18181C] border border-[rgba(255,255,255,0.06)] rounded-lg space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-gray-300">ロール: <span className="text-[#3ECF8E]">{op.role}</span></span>
                            <span className="text-[10px] text-gray-500 font-mono">({op.mode === 'replace' ? '置換' : '追記'})</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {op.assets.map(asset => (
                              <span key={asset.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] text-gray-200">
                                <span className="font-medium">{asset.name}</span>
                                {asset.type === 'lora' && asset.loraPromptString && (
                                  <span className="text-[10px] text-amber-300 font-mono">{asset.loraPromptString}</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveQueuedAsset(op.role, asset.id)}
                                  className="text-gray-400 hover:text-red-400 ml-1 transition-colors"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Legacy LoRA selection fallback */}
              <div className="space-y-1.5 pt-2 border-t border-[rgba(255,255,255,0.06)]">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">単一 LoRA 指定（従来機能）</label>
                <SearchableLoraSelect
                  loras={loras}
                  value={loraFilename}
                  onChange={setLoraFilename}
                  placeholder="LoRAを検索..."
                />
              </div>

              {/* Strength */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">強度（Strength）</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="2"
                  value={loraStrength}
                  onChange={e => setLoraStrength(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
                />
              </div>

              {/* Target role */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">適用ロール</label>
                <select
                  value={loraRole}
                  onChange={e => setLoraRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
                >
                  <option value="">ロールを選択...</option>
                  {loraRoles.map(m => (
                    <option key={m.role} value={m.role}>{m.display_name}</option>
                  ))}
                  {loraRoles.length === 0 && (
                    <option value="lora" >lora（デフォルト）</option>
                  )}
                </select>
              </div>

              {/* Mode */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider font-semibold">操作モード</label>
                <div className="grid grid-cols-2 gap-2">
                  {([['append', '追加（既存を保持）'], ['replace', '置換（既存を削除）']] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setLoraMode(mode)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
                        loraMode === mode
                          ? 'bg-[#3ECF8E]/15 border-[#3ECF8E]/50 text-[#3ECF8E]'
                          : 'bg-[#1F1F25] border-[rgba(255,255,255,0.06)] text-gray-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {loraMode === 'replace' && (
                  <p className="text-xs text-amber-400 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    置換モードは選択ロールの既存 アセット/LoRA をすべて削除します
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-[#1F1F25] border-t border-[rgba(255,255,255,0.08)] rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
          >
            キャンセル
          </button>
          <button
            onClick={handleApplyClick}
            disabled={isApplying}
            className="flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-[#18181C] bg-[#3ECF8E] hover:bg-[#34b279] rounded-lg shadow-lg transition-all disabled:opacity-50"
          >
            {isApplying && <Loader2 size={16} className="animate-spin" />}
            {count} 件に適用...
          </button>
        </div>
      </div>

      {isAddAssetOpen && targetAssetRole && (
        <AddAssetModal
          role={targetAssetRole}
          loras={loras}
          tagSets={tagSets}
          onClose={() => setIsAddAssetOpen(false)}
          addAppliedAsset={handleAddAppliedAsset}
          setRoleCollapsed={() => {}}
        />
      )}
    </div>
  );
}
