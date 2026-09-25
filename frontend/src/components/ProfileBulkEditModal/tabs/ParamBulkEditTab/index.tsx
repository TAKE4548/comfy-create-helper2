import React from 'react';
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
  return (
    <div className="space-y-4">
      {paramRoles.length === 0 && (
        <p className="text-xs text-gray-500 text-center py-4">パラメータロールが設定されていません</p>
      )}

      {paramRoles.map(m => {
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
      <BatchSizeSection
        batchSizeEnabled={batchSizeEnabled}
        setBatchSizeEnabled={setBatchSizeEnabled}
        batchSizeInput={batchSizeInput}
        setBatchSizeInput={setBatchSizeInput}
      />
    </div>
  );
};
