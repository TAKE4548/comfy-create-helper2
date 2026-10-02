import React, { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import type { MappingMaster, ParamTypeMaster, Lora, WorkflowPreset } from '../../../../api/types';
import type { CommonLoraOp, PresetLoraSlot } from '../../types';
import { LoraStackSection } from './LoraStackSection';
import { ParamFieldControl } from './ParamFieldControl';
import { BatchSizeSection } from './BatchSizeSection';

export interface ParamBulkEditTabProps {
  paramRoles: MappingMaster[];
  enabledParams: Set<string>;
  toggleParamEnabled: (role: string) => void;
  selectedPresets: WorkflowPreset[];
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
  paramTypeMasters?: ParamTypeMaster[];
  comfyObjectInfo?: Record<string, any>;
  batchSizeEnabled: boolean;
  setBatchSizeEnabled: (val: boolean) => void;
  batchSizeInput: string;
  setBatchSizeInput: (val: string) => void;
}

export const ParamBulkEditTab: React.FC<ParamBulkEditTabProps> = ({
  paramRoles,
  enabledParams,
  toggleParamEnabled,
  selectedPresets,
  loras,
  comfyModels,
  activeBaseModelId,
  loraStackModes,
  setLoraStackModes,
  paramPatch,
  setParamPatch,
  commonLoraOps,
  setCommonLoraOps,
  addLoraSlots,
  setAddLoraSlots,
  paramTypeMasters,
  comfyObjectInfo,
  batchSizeEnabled,
  setBatchSizeEnabled,
  batchSizeInput,
  setBatchSizeInput,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchQuery.trim().toLowerCase();

  const filteredParamRoles = useMemo(() => {
    if (!query) return paramRoles;
    return paramRoles.filter(
      m =>
        (m.display_name?.toLowerCase().includes(query) ?? false) ||
        (m.role?.toLowerCase().includes(query) ?? false) ||
        (m.param_name?.toLowerCase().includes(query) ?? false)
    );
  }, [paramRoles, query]);

  const showBatchSize =
    !query ||
    'バッチサイズ'.includes(query) ||
    'batch_size'.includes(query) ||
    'batch'.includes(query);

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="パラメータを検索... (名称・キー)"
          className="w-full pl-9 pr-9 py-2 text-sm text-white bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors placeholder-gray-500"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="検索をクリア"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {paramRoles.length === 0 && !query && (
        <p className="text-xs text-gray-500 text-center py-4">パラメータロールが設定されていません</p>
      )}

      {filteredParamRoles.length === 0 && !showBatchSize && (
        <p className="text-xs text-gray-500 text-center py-4">該当するパラメータが見つかりません</p>
      )}

      {filteredParamRoles.map(m => {
        const isEnabled = enabledParams.has(m.role);

        if (m.input_type === 'lora_stack') {
          return (
            <LoraStackSection
              key={m.role}
              mapping={m}
              selectedPresets={selectedPresets}
              isEnabled={isEnabled}
              onToggleEnabled={() => toggleParamEnabled(m.role)}
              loras={loras}
              comfyModels={comfyModels}
              activeBaseModelId={activeBaseModelId}
              loraStackModes={loraStackModes}
              setLoraStackModes={setLoraStackModes}
              paramPatch={paramPatch}
              setParamPatch={setParamPatch}
              commonLoraOps={commonLoraOps}
              setCommonLoraOps={setCommonLoraOps}
              addLoraSlots={addLoraSlots}
              setAddLoraSlots={setAddLoraSlots}
            />
          );
        }

        return (
          <ParamFieldControl
            key={m.role}
            mapping={m}
            isEnabled={isEnabled}
            onToggleEnabled={() => toggleParamEnabled(m.role)}
            paramPatch={paramPatch}
            setParamPatch={setParamPatch}
            paramTypeMasters={paramTypeMasters}
            comfyObjectInfo={comfyObjectInfo}
          />
        );
      })}

      {/* Batch size (dedicated column) */}
      {showBatchSize && (
        <BatchSizeSection
          batchSizeEnabled={batchSizeEnabled}
          setBatchSizeEnabled={setBatchSizeEnabled}
          batchSizeInput={batchSizeInput}
          setBatchSizeInput={setBatchSizeInput}
        />
      )}
    </div>
  );
};
