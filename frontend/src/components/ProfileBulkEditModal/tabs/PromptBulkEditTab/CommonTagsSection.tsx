import React from 'react';
import { X } from 'lucide-react';
import type { CommonTagItem } from '../../types';
import { parseTagWeight, formatTagWithWeight } from '../../utils';

export interface CommonTagsSectionProps {
  commonTagItems: CommonTagItem[];
  setCommonTagItems: React.Dispatch<React.SetStateAction<CommonTagItem[]>>;
  tagsToRemove: Set<string>;
  setTagsToRemove: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleTagToRemove: (tag: string) => void;
}

export const CommonTagsSection: React.FC<CommonTagsSectionProps> = ({
  commonTagItems,
  setCommonTagItems,
  tagsToRemove,
  setTagsToRemove,
  toggleTagToRemove,
}) => {
  return (
    <div className="space-y-3">
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
              return (
                <div
                  key={item.id || idx}
                  className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all border ${
                    isRemoved
                      ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 line-through opacity-60'
                      : 'bg-zinc-800 border-[rgba(255,255,255,0.08)] text-zinc-200 hover:border-zinc-500'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (tagsToRemove.has(item.text) || tagsToRemove.has(item.originalBase)) {
                        setTagsToRemove(prev => {
                          const next = new Set(prev);
                          next.delete(item.text);
                          next.delete(item.originalBase);
                          return next;
                        });
                      }
                      setCommonTagItems(prev =>
                        prev.map(it => it.id === item.id ? { ...it, enabled: !it.enabled } : it)
                      );
                    }}
                    className="cursor-pointer select-none text-left"
                    title="クリックで有効/削除切替"
                  >
                    {item.text}
                  </button>
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                    <button
                      type="button"
                      title="強度変更 (-0.1)"
                      onClick={(e) => {
                        e.stopPropagation();
                        const parsed = parseTagWeight(item.text);
                        const currentWeight = parsed.weight ?? 1.0;
                        const newWeight = Math.max(0.1, Math.round((currentWeight - 0.1) * 10) / 10);
                        const newText = formatTagWithWeight(parsed.base, newWeight);
                        setCommonTagItems(prev =>
                          prev.map(it => it.id === item.id ? { ...it, text: newText } : it)
                        );
                      }}
                      className="w-4 h-4 flex items-center justify-center rounded bg-black/40 hover:bg-black/80 text-[10px] text-gray-300 hover:text-white"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      title="強度変更 (+0.1)"
                      onClick={(e) => {
                        e.stopPropagation();
                        const parsed = parseTagWeight(item.text);
                        const currentWeight = parsed.weight ?? 1.0;
                        const newWeight = Math.round((currentWeight + 0.1) * 10) / 10;
                        const newText = formatTagWithWeight(parsed.base, newWeight);
                        setCommonTagItems(prev =>
                          prev.map(it => it.id === item.id ? { ...it, text: newText } : it)
                        );
                      }}
                      className="w-4 h-4 flex items-center justify-center rounded bg-black/40 hover:bg-black/80 text-[10px] text-gray-300 hover:text-white"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      title="タグ削除"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTagToRemove(item.text);
                      }}
                      className="p-0.5 rounded hover:bg-rose-500/30 text-gray-400 hover:text-rose-300"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {(() => {
          const disabledCount = commonTagItems.filter(
            it => !it.enabled || tagsToRemove.has(it.text) || tagsToRemove.has(it.originalBase)
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
