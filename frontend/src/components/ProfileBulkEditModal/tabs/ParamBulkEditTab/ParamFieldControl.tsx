import React from 'react';
import type { MappingMaster, ParamTypeMaster } from '../../../../api/types';
import { getSamplerOptions, getSchedulerOptions } from '../../utils';

export interface ParamFieldControlProps {
  mapping: MappingMaster;
  isEnabled: boolean;
  onToggleEnabled: () => void;
  paramPatch: Record<string, string>;
  setParamPatch: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  paramTypeMasters?: ParamTypeMaster[];
  comfyObjectInfo?: Record<string, any>;
}

export const ParamFieldControl: React.FC<ParamFieldControlProps> = ({
  mapping: m,
  isEnabled,
  onToggleEnabled,
  paramPatch,
  setParamPatch,
  paramTypeMasters,
  comfyObjectInfo,
}) => {
  const customType = paramTypeMasters?.find(ptm => ptm.name === m.input_type);
  const samplerOpts = m.input_type === 'select_sampler' ? getSamplerOptions(comfyObjectInfo) : [];
  const schedulerOpts = m.input_type === 'select_scheduler' ? getSchedulerOptions(comfyObjectInfo) : [];

  return (
    <div className="p-3 bg-[#1F1F25]/60 border border-[rgba(255,255,255,0.06)] rounded-lg space-y-2">
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

      <div className={!isEnabled ? 'opacity-40 pointer-events-none' : ''}>
        {m.input_type === 'select_sampler' ? (
          <select
            disabled={!isEnabled}
            value={paramPatch[m.role] ?? ''}
            onChange={e => setParamPatch(prev => ({ ...prev, [m.role]: e.target.value }))}
            className="w-full px-3 py-2 text-sm text-white bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
          >
            <option value="">サンプラーを選択…</option>
            {samplerOpts.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : m.input_type === 'select_scheduler' ? (
          <select
            disabled={!isEnabled}
            value={paramPatch[m.role] ?? ''}
            onChange={e => setParamPatch(prev => ({ ...prev, [m.role]: e.target.value }))}
            className="w-full px-3 py-2 text-sm text-white bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
          >
            <option value="">スケジューラーを選択…</option>
            {schedulerOpts.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : m.input_type === 'boolean' ? (
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={!isEnabled}
              onClick={() => {
                const currentVal = paramPatch[m.role] === 'true';
                setParamPatch(prev => ({ ...prev, [m.role]: currentVal ? 'false' : 'true' }));
              }}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                paramPatch[m.role] === 'true' ? 'bg-[#3ECF8E]' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  paramPatch[m.role] === 'true' ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-xs text-gray-300">
              {paramPatch[m.role] === 'true' ? 'True (有効)' : 'False (無効)'}
            </span>
          </div>
        ) : customType ? (
          customType.widget_type === 'select' && customType.combo_options ? (
            <select
              disabled={!isEnabled}
              value={paramPatch[m.role] ?? ''}
              onChange={e => setParamPatch(prev => ({ ...prev, [m.role]: e.target.value }))}
              className="w-full px-3 py-2 text-sm text-white bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
            >
              <option value="">選択してください…</option>
              {customType.combo_options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : customType.widget_type === 'boolean' ? (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={!isEnabled}
                onClick={() => {
                  const currentVal = paramPatch[m.role] === 'true';
                  setParamPatch(prev => ({ ...prev, [m.role]: currentVal ? 'false' : 'true' }));
                }}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  paramPatch[m.role] === 'true' ? 'bg-[#3ECF8E]' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    paramPatch[m.role] === 'true' ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-xs text-gray-300">
                {paramPatch[m.role] === 'true' ? 'True (有効)' : 'False (無効)'}
              </span>
            </div>
          ) : (
            <input
              type={customType.widget_type === 'textarea' ? 'text' : 'number'}
              disabled={!isEnabled}
              value={paramPatch[m.role] ?? ''}
              onChange={e => setParamPatch(prev => ({ ...prev, [m.role]: e.target.value }))}
              min={customType.min_value ?? undefined}
              max={customType.max_value ?? undefined}
              step={customType.step ?? (customType.widget_type === 'float' ? 0.01 : 1)}
              placeholder="値を入力"
              className="w-full px-3 py-2 text-sm text-white bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
            />
          )
        ) : (
          <input
            type={m.input_type === 'int' || m.input_type === 'float' ? 'number' : 'text'}
            disabled={!isEnabled}
            step={m.input_type === 'float' ? '0.1' : '1'}
            value={paramPatch[m.role] ?? ''}
            onChange={e => setParamPatch(prev => ({ ...prev, [m.role]: e.target.value }))}
            placeholder="値を入力"
            className="w-full px-3 py-2 text-sm text-white bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
          />
        )}
      </div>
    </div>
  );
};
