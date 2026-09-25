import React from 'react';

export interface BatchSizeSectionProps {
  batchSizeEnabled: boolean;
  setBatchSizeEnabled: (val: boolean) => void;
  batchSizeInput: string;
  setBatchSizeInput: (val: string) => void;
}

export const BatchSizeSection: React.FC<BatchSizeSectionProps> = ({
  batchSizeEnabled,
  setBatchSizeEnabled,
  batchSizeInput,
  setBatchSizeInput,
}) => {
  return (
    <div className="p-3 bg-[#1F1F25]/60 border border-[rgba(255,255,255,0.06)] rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={batchSizeEnabled}
            onChange={e => setBatchSizeEnabled(e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-[#3ECF8E]"
          />
          <span className={`text-xs font-semibold uppercase tracking-wider transition-colors ${batchSizeEnabled ? 'text-white' : 'text-gray-400'}`}>
            バッチ数（Batch Size）
          </span>
        </label>
      </div>
      <div className={!batchSizeEnabled ? 'opacity-40 pointer-events-none' : ''}>
        <input
          type="number"
          min="1"
          step="1"
          disabled={!batchSizeEnabled}
          value={batchSizeInput}
          onChange={e => setBatchSizeInput(e.target.value)}
          placeholder="バッチ数を入力"
          className="w-full px-3 py-2 text-sm text-white bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
        />
      </div>
    </div>
  );
};
