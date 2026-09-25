import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { MappingMaster, Lora, WorkflowPreset } from '../../../../api/types';
import type { CommonLoraOp, PresetLoraSlot } from '../../types';
import { computeCommonLoras } from '../../utils';
import { LoraStackEditor } from '../../../LoraStackEditor';
import { SearchableLoraSelect } from '../../../SearchableLoraSelect';

export interface LoraStackSectionProps {
  mapping: MappingMaster;
  selectedPresets: WorkflowPreset[];
  isEnabled: boolean;
  onToggleEnabled: () => void;
  loras: Lora[];
  comfyModels?: any[];
  activeBaseModelId?: number | null;
  loraStackModes: Record<string, 'differential' | 'overwrite'>;
  setLoraStackModes: React.Dispatch<React.SetStateAction<Record<string, 'differential' | 'overwrite'>>>;
  paramPatch: Record<string, string>;
  setParamPatch: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  commonLoraOps: Record<string, CommonLoraOp[]>;
  setCommonLoraOps: React.Dispatch<React.SetStateAction<Record<string, CommonLoraOp[]>>>;
  addLoraSlots: Record<string, PresetLoraSlot[]>;
  setAddLoraSlots: React.Dispatch<React.SetStateAction<Record<string, PresetLoraSlot[]>>>;
}

export const LoraStackSection: React.FC<LoraStackSectionProps> = ({
  mapping: m, selectedPresets, isEnabled, onToggleEnabled, loras, comfyModels,
  activeBaseModelId, loraStackModes, setLoraStackModes, paramPatch, setParamPatch,
  commonLoraOps, setCommonLoraOps, addLoraSlots, setAddLoraSlots,
}) => {
  const currentMode = loraStackModes[m.role] || 'differential';
  const commonList = computeCommonLoras(selectedPresets, m.role);

  // Initialize commonLoraOps for this role if not present
  const roleOps = commonLoraOps[m.role] ?? commonList.map(item => ({
    name: item.name,
    action: 'update' as const,
    weight: item.weight,
    modelStrength: item.modelStrength,
    clipStrength: item.clipStrength,
  }));

  const roleAddSlots = addLoraSlots[m.role] ?? [];

  return (
    <div className="p-3 bg-[#1F1F25]/60 border border-[rgba(255,255,255,0.06)] rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={onToggleEnabled}
            className="w-3.5 h-3.5 rounded accent-[#3ECF8E]"
          />
          <span className={`text-xs font-semibold uppercase tracking-wider transition-colors ${isEnabled ? 'text-white' : 'text-gray-400'}`}>
            {m.display_name}
          </span>
        </label>
        <span className="text-[10px] text-gray-500 font-mono">{m.input_type}</span>
      </div>

      <div className={!isEnabled ? 'opacity-40 pointer-events-none' : 'space-y-3'}>
        {/* Mode Selector */}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!isEnabled}
            onClick={() => setLoraStackModes(prev => ({ ...prev, [m.role]: 'differential' }))}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-all ${
              currentMode === 'differential'
                ? 'bg-[#3ECF8E]/15 border-[#3ECF8E]/50 text-[#3ECF8E]'
                : 'bg-[#18181C] border-[rgba(255,255,255,0.06)] text-gray-400 hover:text-white'
            }`}
          >
            差分編集（共通確認・追加・削除）
          </button>
          <button
            type="button"
            disabled={!isEnabled}
            onClick={() => setLoraStackModes(prev => ({ ...prev, [m.role]: 'overwrite' }))}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-all ${
              currentMode === 'overwrite'
                ? 'bg-[#3ECF8E]/15 border-[#3ECF8E]/50 text-[#3ECF8E]'
                : 'bg-[#18181C] border-[rgba(255,255,255,0.06)] text-gray-400 hover:text-white'
            }`}
          >
            完全上書き
          </button>
        </div>

        {currentMode === 'overwrite' ? (
          <div className="pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <LoraStackEditor
              role={m.role}
              paramValues={paramPatch}
              setParamValues={setParamPatch}
              loras={loras}
              title=""
              activeBaseModelId={activeBaseModelId}
            />
          </div>
        ) : (
          <div className="space-y-3 pt-2 border-t border-[rgba(255,255,255,0.06)]">
            {/* Common LoRAs Section */}
            <div>
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                共通LoRA ({commonList.length}件)
              </div>
              {commonList.length === 0 ? (
                <p className="text-xs text-gray-500 py-1">全プリセットで共通のLoRAはありません</p>
              ) : (
                <div className="space-y-1.5">
                  {commonList.map((item) => {
                    const currentOp = roleOps.find(o => o.name === item.name);
                    const isRemoved = currentOp?.action === 'remove';
                    const currentWeight = currentOp?.weight ?? item.weight;

                    return (
                      <div
                        key={item.name}
                        className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-all ${
                          isRemoved
                            ? 'bg-red-500/10 border-red-500/20 text-gray-500'
                            : 'bg-[#18181C] border-[rgba(255,255,255,0.06)] text-gray-200'
                        }`}
                      >
                        <span className={`font-medium truncate flex-1 mr-2 ${isRemoved ? 'line-through text-gray-500' : ''}`}>
                          {item.name}
                        </span>
                        <div className="flex items-center gap-2">
                          {!isRemoved && (
                            <input
                              type="number"
                              step="0.05"
                              value={currentWeight}
                              onChange={e => {
                                const val = e.target.value;
                                const nextOps = roleOps.some(o => o.name === item.name)
                                  ? roleOps.map(o => o.name === item.name ? { ...o, weight: val, modelStrength: val, clipStrength: val } : o)
                                  : [...roleOps, { name: item.name, action: 'update' as const, weight: val, modelStrength: val, clipStrength: val }];
                                setCommonLoraOps(prev => ({ ...prev, [m.role]: nextOps }));
                              }}
                              className="w-16 px-1.5 py-0.5 text-xs text-right bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded focus:outline-none focus:border-[#3ECF8E]"
                            />
                          )}
                          <button
                            type="button"
                            title={isRemoved ? '削除を取り消す' : '削除'}
                            onClick={() => {
                              const nextAction: 'update' | 'remove' = isRemoved ? 'update' : 'remove';
                              const nextOps = roleOps.some(o => o.name === item.name)
                                ? roleOps.map(o => o.name === item.name ? { ...o, action: nextAction } : o)
                                : [...roleOps, { ...item, action: nextAction }];
                              setCommonLoraOps(prev => ({ ...prev, [m.role]: nextOps }));
                            }}
                            className={`p-1 rounded transition-colors ${isRemoved ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-red-400'}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Additional LoRAs Section */}
            <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  新規追加LoRA
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAddLoraSlots(prev => ({
                      ...prev,
                      [m.role]: [
                        ...(prev[m.role] || []),
                        { name: '', weight: '1.0', modelStrength: '1.0', clipStrength: '1.0' },
                      ],
                    }));
                  }}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#3ECF8E] hover:underline"
                >
                  <Plus size={12} /> LoRAを追加
                </button>
              </div>

              {roleAddSlots.map((slot, sIdx) => (
                <div key={sIdx} className="p-2 bg-[#18181C] border border-[rgba(255,255,255,0.06)] rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <SearchableLoraSelect
                        loras={loras}
                        comfyModels={comfyModels}
                        activeBaseModelId={activeBaseModelId}
                        value={slot.name}
                        onChange={val => {
                          setAddLoraSlots(prev => {
                            const updated = [...(prev[m.role] || [])];
                            updated[sIdx] = { ...updated[sIdx], name: val };
                            return { ...prev, [m.role]: updated };
                          });
                        }}
                        placeholder="LoRAを選択..."
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAddLoraSlots(prev => {
                          const updated = [...(prev[m.role] || [])];
                          updated.splice(sIdx, 1);
                          return { ...prev, [m.role]: updated };
                        });
                      }}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">強度:</span>
                    <input
                      type="number"
                      step="0.05"
                      value={slot.weight}
                      onChange={e => {
                        const val = e.target.value;
                        setAddLoraSlots(prev => {
                          const updated = [...(prev[m.role] || [])];
                          updated[sIdx] = { ...updated[sIdx], weight: val, modelStrength: val, clipStrength: val };
                          return { ...prev, [m.role]: updated };
                        });
                      }}
                      className="w-20 px-2 py-1 text-xs text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded focus:outline-none focus:border-[#3ECF8E]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
