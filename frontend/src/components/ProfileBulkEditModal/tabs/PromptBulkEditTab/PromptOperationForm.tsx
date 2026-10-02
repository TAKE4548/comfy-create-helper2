import React from 'react';
import { Plus } from 'lucide-react';
import { TagChipInput } from '../../../TagChipInput';
import type { PromptOpType } from '../../types';
import { PROMPT_OP_LABELS } from '../../types';

export interface PromptOperationFormProps {
  promptOp: PromptOpType;
  setPromptOp: (op: PromptOpType) => void;
  promptFindText: string;
  setPromptFindText: (text: string) => void;
  promptReplaceText: string;
  setPromptReplaceText: (text: string) => void;
  promptValue: string;
  setPromptValue: (text: string) => void;
  onOpenAddAsset: () => void;
}

export const PromptOperationForm: React.FC<PromptOperationFormProps> = ({
  promptOp,
  setPromptOp,
  promptFindText,
  setPromptFindText,
  promptReplaceText,
  setPromptReplaceText,
  promptValue,
  setPromptValue,
  onOpenAddAsset,
}) => {
  return (
    <div className="space-y-4">
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
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">検索する文字列</label>
              <button
                type="button"
                onClick={() => setPromptFindText('')}
                disabled={!promptFindText}
                className="text-[11px] font-medium text-gray-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                クリア
              </button>
            </div>
            <input
              type="text"
              value={promptFindText}
              onChange={e => setPromptFindText(e.target.value)}
              placeholder="例: <lora:characterA:1.0> またはタグ名"
              className="w-full px-3 py-2 text-sm text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-[#3ECF8E] transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">置換後の文字列</label>
                <button
                  type="button"
                  onClick={() => setPromptReplaceText('')}
                  disabled={!promptReplaceText}
                  className="text-[11px] font-medium text-gray-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  クリア
                </button>
              </div>
              <button
                type="button"
                onClick={onOpenAddAsset}
                className="flex items-center gap-1 text-[11px] font-semibold text-[#3ECF8E] hover:underline"
              >
                <Plus size={12} /> アセットを追加
              </button>
            </div>
            <TagChipInput
              value={promptReplaceText}
              onChange={setPromptReplaceText}
              placeholder="置換後タグを入力（空欄で削除、カンマで確定）..."
            />
          </div>
        </div>
      ) : promptOp === 'remove_tags' ? (
        null
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {promptOp === 'overwrite' ? '置換するテキスト' : promptOp === 'prefix' ? '先頭に追加するテキスト' : '末尾に追加するテキスト'}
              </label>
              <button
                type="button"
                onClick={() => setPromptValue('')}
                disabled={!promptValue}
                className="text-[11px] font-medium text-gray-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                クリア
              </button>
            </div>
            <button
              type="button"
              onClick={onOpenAddAsset}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#3ECF8E] hover:underline"
            >
              <Plus size={12} /> アセットを追加
            </button>
          </div>
          <TagChipInput
            value={promptValue}
            onChange={setPromptValue}
            placeholder="タグを入力（カンマまたはEnterで確定）..."
          />
        </div>
      )}
    </div>
  );
};
