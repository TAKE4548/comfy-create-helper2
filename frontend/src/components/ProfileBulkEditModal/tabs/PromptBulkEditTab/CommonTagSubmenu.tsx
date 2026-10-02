import React, { useState, useEffect, useRef } from 'react';
import { Trash2, X } from 'lucide-react';
import { parseTagWeight, formatTagWithWeight } from '../../utils';

export interface CommonTagSubmenuProps {
  tag: string;
  onUpdateTag: (newText: string) => void;
  onRemoveTag: () => void;
  onClose: () => void;
  anchorRect?: DOMRect;
}

export const CommonTagSubmenu: React.FC<CommonTagSubmenuProps> = ({
  tag,
  onUpdateTag,
  onRemoveTag,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const parsed = parseTagWeight(tag);
  const [baseText, setBaseText] = useState(parsed.base);
  const [weightInput, setWeightInput] = useState(
    parsed.weight !== null ? parsed.weight.toString() : '1.0'
  );

  useEffect(() => {
    const p = parseTagWeight(tag);
    setBaseText(p.base);
    setWeightInput(p.weight !== null ? p.weight.toString() : '1.0');
  }, [tag]);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
    };
  }, [onClose]);

  const handleBaseTextSubmit = () => {
    const trimmed = baseText.trim();
    if (!trimmed) {
      setBaseText(parsed.base);
      return;
    }
    const currentWeight = parseFloat(weightInput);
    const validWeight = isNaN(currentWeight) ? parsed.weight : currentWeight;
    const newText = formatTagWithWeight(trimmed, validWeight);
    if (newText !== tag) {
      onUpdateTag(newText);
    }
  };

  const handleBaseKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBaseTextSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleWeightSubmit = () => {
    const val = parseFloat(weightInput);
    if (isNaN(val) || val <= 0) {
      setWeightInput(parsed.weight !== null ? parsed.weight.toString() : '1.0');
      return;
    }
    const rounded = Math.round(val * 100) / 100;
    setWeightInput(rounded.toString());
    const newText = formatTagWithWeight(baseText.trim() || parsed.base, rounded);
    if (newText !== tag) {
      onUpdateTag(newText);
    }
  };

  const handleWeightKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      handleWeightSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleStepDelta = (delta: number) => {
    const current = parseFloat(weightInput) || (parsed.weight ?? 1.0);
    const newWeight = Math.max(0.1, Math.round((current + delta) * 10) / 10);
    setWeightInput(newWeight.toString());
    const newText = formatTagWithWeight(baseText.trim() || parsed.base, newWeight);
    onUpdateTag(newText);
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="共通タグ設定"
      className="absolute top-full left-0 mt-1.5 z-50 w-72 p-3 bg-[#18181C] border border-[rgba(255,255,255,0.15)] rounded-lg shadow-2xl flex flex-col gap-2.5 text-xs select-none"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {/* Header: Tag base text edit & close button */}
      <div className="flex items-center gap-1.5 border-b border-[rgba(255,255,255,0.08)] pb-2">
        <input
          type="text"
          value={baseText}
          onChange={(e) => setBaseText(e.target.value)}
          onBlur={handleBaseTextSubmit}
          onKeyDown={handleBaseKeyDown}
          placeholder="タグ名"
          aria-label="タグ名編集"
          className="flex-1 min-w-0 px-2 py-1 bg-[#1F1F25] border border-[rgba(255,255,255,0.12)] rounded text-[#E4E4E7] text-xs font-mono focus:outline-none focus:border-[#7C6FDD]"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          title="閉じる"
          aria-label="閉じる"
        >
          <X size={14} />
        </button>
      </div>

      {/* Weight section */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[#A1A1AA]">
          <span>強度 (Weight)</span>
          <input
            type="number"
            step="0.1"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            onBlur={handleWeightSubmit}
            onKeyDown={handleWeightKeyDown}
            aria-label="強度編集"
            className="w-16 px-1.5 py-0.5 bg-[#1F1F25] border border-[rgba(255,255,255,0.1)] rounded text-right text-[#E4E4E7] font-mono focus:outline-none focus:border-[#7C6FDD]"
          />
        </div>

        {/* Step buttons */}
        <div className="grid grid-cols-4 gap-1">
          {[
            { delta: -0.3, label: '-0.3' },
            { delta: -0.1, label: '-0.1' },
            { delta: 0.1, label: '+0.1' },
            { delta: 0.3, label: '+0.3' },
          ].map(({ delta, label }) => (
            <button
              key={label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepDelta(delta);
              }}
              className="px-1.5 py-1 bg-[#1F1F25] hover:bg-zinc-700 text-[#E4E4E7] rounded border border-[rgba(255,255,255,0.05)] text-center transition-colors font-mono"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Delete tag button */}
      <div className="border-t border-[rgba(255,255,255,0.08)] pt-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveTag();
            onClose();
          }}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 text-xs transition-colors"
        >
          <Trash2 size={12} />
          <span>このタグを削除</span>
        </button>
      </div>
    </div>
  );
};