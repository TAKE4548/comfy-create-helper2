import React from 'react';
import type { MappingMaster } from '../../../../api/types';
import { ImageParamField } from '../../../ImageParamField';

export interface ImageParamSectionProps {
  mapping: MappingMaster;
  isEnabled: boolean;
  onToggleEnabled: () => void;
  paramPatch: Record<string, string>;
  setParamPatch: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onPickerOpenChange?: (open: boolean) => void;
}

export const ImageParamSection: React.FC<ImageParamSectionProps> = ({
  mapping: m,
  isEnabled,
  onToggleEnabled,
  paramPatch,
  setParamPatch,
  onPickerOpenChange,
}) => {
  return (
    <div className="p-3 bg-[#1F1F25]/60 border border-[rgba(255,255,255,0.06)] rounded-lg space-y-2">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <label className="relative flex min-h-11 min-w-0 flex-1 items-center gap-2 cursor-pointer touch-manipulation before:absolute before:-inset-2 before:content-['']">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={onToggleEnabled}
            className="w-3.5 h-3.5 shrink-0 rounded accent-[#3ECF8E]"
          />
          <span
            className={`min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider transition-colors ${isEnabled ? 'text-white' : 'text-gray-400'}`}
          >
            {m.display_name}
          </span>
        </label>
        <span className="shrink-0 text-[11px] text-gray-500 font-mono">{m.input_type}</span>
      </div>

      <ImageParamField
        label={m.display_name ?? m.role}
        fieldKey={`bulk-${m.role}`}
        value={paramPatch[m.role]}
        onChange={(token) => setParamPatch((prev) => ({ ...prev, [m.role]: token }))}
        disabled={!isEnabled}
        onPickerOpenChange={onPickerOpenChange}
      />
      <p className="text-[11px] text-gray-400">
        チェック ON かつ画像選択済みのとき、選択中の全プリセットへ同じ画像を適用します。未選択の場合は変更しません。
      </p>
    </div>
  );
};
