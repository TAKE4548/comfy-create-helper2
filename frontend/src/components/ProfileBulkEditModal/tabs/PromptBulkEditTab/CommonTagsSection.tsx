import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { WorkflowPreset } from '../../../../api/types';
import type { CommonTagItem } from '../../types';
import { CommonTagSubmenu } from './CommonTagSubmenu';

export interface CommonTagsSectionProps {
  selectedPresets?: WorkflowPreset[];
  subsetPresetIds?: Set<number>;
  toggleSubsetPresetId?: (id: number) => void;
  selectAllSubsetPresets?: () => void;
  clearAllSubsetPresets?: () => void;
  commonTagItems: CommonTagItem[];
  setCommonTagItems: React.Dispatch<React.SetStateAction<CommonTagItem[]>>;
  tagsToRemove: Set<string>;
  setTagsToRemove: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleTagToRemove: (tag: string) => void;
}

export const CommonTagsSection: React.FC<CommonTagsSectionProps> = ({
  selectedPresets = [],
  subsetPresetIds,
  toggleSubsetPresetId,
  selectAllSubsetPresets,
  clearAllSubsetPresets,
  commonTagItems,
  setCommonTagItems,
  tagsToRemove,
  setTagsToRemove,
  toggleTagToRemove,
}) => {
  const [activeSubmenuTagId, setActiveSubmenuTagId] = useState<string | null>(null);

  const selectedCount = subsetPresetIds ? subsetPresetIds.size : selectedPresets.length;
  const totalPresetsCount = selectedPresets.length;

  return (
    <div className="space-y-4">
      {/* 対象プリセット（サブセット絞り込み）セクション (AC-4) */}
      {selectedPresets.length > 0 && (
        <div className="p-3 bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-300">対象プリセット（絞り込み）</span>
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-white/10 text-gray-300 font-mono">
                選択中: {selectedCount} / {totalPresetsCount} 件
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {selectAllSubsetPresets && (
                <button
                  type="button"
                  onClick={selectAllSubsetPresets}
                  className="text-xs text-[#3ECF8E] hover:underline"
                >
                  全選択
                </button>
              )}
              {selectAllSubsetPresets && clearAllSubsetPresets && (
                <span className="text-gray-600">|</span>
              )}
              {clearAllSubsetPresets && (
                <button
                  type="button"
                  onClick={clearAllSubsetPresets}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  全解除
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
            {selectedPresets.map((preset) => {
              const isChecked = subsetPresetIds ? subsetPresetIds.has(preset.id) : true;
              return (
                <label
                  key={preset.id}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer border transition-colors ${
                    isChecked
                      ? 'bg-zinc-800 border-[#3ECF8E]/50 text-white'
                      : 'bg-zinc-900/60 border-zinc-800 text-zinc-500 hover:text-zinc-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSubsetPresetId && toggleSubsetPresetId(preset.id)}
                    className="w-3.5 h-3.5 rounded accent-[#3ECF8E] cursor-pointer"
                  />
                  <span className="truncate max-w-[140px]" title={preset.name}>
                    {preset.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* 共通タグの編集・強度調整・削除 (AC-7) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            共通タグの編集・強度調整・削除
          </label>
          {tagsToRemove.size > 0 && (
            <button
              type="button"
              onClick={() => setTagsToRemove(new Set())}
              className="text-[11px] text-gray-400 hover:text-white"
            >
              選択解除
            </button>
          )}
        </div>

        {commonTagItems.length === 0 ? (
          <div className="p-3 bg-[#1F1F25] border border-[rgba(255,255,255,0.06)] rounded-lg text-xs text-gray-500 text-center">
            選択されたプリセットの対象フィールドに共通するタグは見つかりませんでした。
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 p-3 bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg max-h-48 overflow-y-auto">
            {commonTagItems.map((item, idx) => {
              const isRemoved = !item.enabled || tagsToRemove.has(item.text) || tagsToRemove.has(item.originalBase);
              const itemId = item.id || `common-tag-${idx}`;
              const isSubmenuOpen = activeSubmenuTagId === itemId;

              return (
                <div
                  key={itemId}
                  className={`group relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all border ${
                    isRemoved
                      ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 line-through opacity-60'
                      : 'bg-zinc-800 border-[rgba(255,255,255,0.08)] text-zinc-200 hover:border-zinc-500'
                  }`}
                >
                  {/* タグ名本体: クリックでサブメニュー開閉 (AC-7) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSubmenuTagId((prev) => (prev === itemId ? null : itemId));
                    }}
                    className="cursor-pointer select-none text-left"
                    title="クリックで詳細編集（強度・文言）"
                  >
                    {item.text}
                  </button>

                  {/* 独立した削除ボタン (AC-7) */}
                  <button
                    type="button"
                    title="タグ削除"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTagToRemove(item.text);
                    }}
                    className="p-0.5 rounded hover:bg-rose-500/30 text-gray-400 hover:text-rose-300 transition-colors"
                  >
                    <X size={12} />
                  </button>

                  {/* サブメニュー (ポップオーバー) */}
                  {isSubmenuOpen && (
                    <CommonTagSubmenu
                      tag={item.text}
                      onUpdateTag={(newText) => {
                        setCommonTagItems((prev) =>
                          prev.map((it) => (it.id === item.id ? { ...it, text: newText } : it))
                        );
                      }}
                      onRemoveTag={() => {
                        toggleTagToRemove(item.text);
                      }}
                      onClose={() => {
                        setActiveSubmenuTagId(null);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {(() => {
          const disabledCount = commonTagItems.filter(
            (it) => !it.enabled || tagsToRemove.has(it.text) || tagsToRemove.has(it.originalBase)
          ).length;
          const totalCount = Math.max(disabledCount, tagsToRemove.size);
          return totalCount > 0 ? (
            <p className="text-[11px] text-rose-400 font-medium">
              ※ {totalCount} 個のタグが対象プリセットから削除されます。
            </p>
          ) : null;
        })()}
      </div>
    </div>
  );
};
