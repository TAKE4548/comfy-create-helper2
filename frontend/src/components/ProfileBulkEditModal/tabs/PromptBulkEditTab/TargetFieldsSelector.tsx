import React from 'react';
import type { MappingMaster } from '../../../../api/types';

export interface TargetFieldsSelectorProps {
  textareaRoles: MappingMaster[];
  promptTargetAll: boolean;
  setPromptTargetAll: (val: boolean) => void;
  promptTargetFields: Set<string>;
  togglePromptField: (role: string) => void;
}

export const TargetFieldsSelector: React.FC<TargetFieldsSelectorProps> = ({
  textareaRoles,
  promptTargetAll,
  setPromptTargetAll,
  promptTargetFields,
  togglePromptField,
}) => {
  if (textareaRoles.length === 0) return null;

  return (
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
  );
};
