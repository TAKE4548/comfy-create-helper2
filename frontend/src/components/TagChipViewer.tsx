import React, { useState, useRef } from 'react';
import { LayoutGrid, FileText } from 'lucide-react';

export interface TagChipViewerProps {
  tags: string[];
  accentColor?: 'purple' | 'green';
  defaultMode?: 'chips' | 'text';
  className?: string;
  emptyPlaceholder?: string;
  onTagClick?: (tag: string) => void;
}

export const TagChipViewer: React.FC<TagChipViewerProps> = ({
  tags,
  accentColor = 'purple',
  defaultMode = 'chips',
  className = '',
  emptyPlaceholder = 'No tags',
  onTagClick,
}) => {
  const [mode, setMode] = useState<'chips' | 'text'>(defaultMode);
  const lastTouchTimeRef = useRef<number>(0);

  const toggleMode = () => {
    setMode((prev) => (prev === 'chips' ? 'text' : 'chips'));
  };

  const accentStyles =
    accentColor === 'green'
      ? 'bg-[rgba(74,222,128,0.1)] border border-[rgba(74,222,128,0.2)] text-accent-green'
      : 'bg-[rgba(124,111,221,0.1)] border border-[rgba(124,111,221,0.2)] text-[#a99ef7]';

  /* タッチ座標から最も近いチップを特定して吸着イベントを発火 (Proximity Hit Snap) */
  const handleContainerTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0];
    const target =
      typeof document !== 'undefined' && document.elementFromPoint
        ? document.elementFromPoint(touch.clientX, touch.clientY)
        : null;
    let chip = target?.closest<HTMLElement>('[data-ux-tag-chip="true"]');

    if (!chip && e.currentTarget) {
      const chips = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-ux-tag-chip="true"]'));
      let minDistance = Infinity;
      let nearestChip: HTMLElement | null = null;
      for (const el of chips) {
        const rect = el.getBoundingClientRect();
        const dx = Math.max(rect.left - touch.clientX, 0, touch.clientX - rect.right);
        const dy = Math.max(rect.top - touch.clientY, 0, touch.clientY - rect.bottom);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistance) {
          minDistance = dist;
          nearestChip = el;
        }
      }
      if (nearestChip && minDistance <= 24) {
        chip = nearestChip;
      }
    }

    if (chip) {
      lastTouchTimeRef.current = Date.now();
      const tag = chip.getAttribute('data-tag');
      if (tag && onTagClick) {
        onTagClick(tag);
      }
    }
  };

  const handleChipClick = (tag: string) => {
    if (Date.now() - lastTouchTimeRef.current < 500) {
      return;
    }
    onTagClick?.(tag);
  };

  return (
    <div className={`my-1.5 ${className}`}>
      <div className="flex items-center justify-end mb-1.5">
        <button
          type="button"
          onClick={toggleMode}
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          title={mode === 'chips' ? 'Switch to text view' : 'Switch to chips view'}
          aria-label={mode === 'chips' ? 'Switch to text view' : 'Switch to chips view'}
        >
          {mode === 'chips' ? (
            <FileText className="w-3.5 h-3.5" />
          ) : (
            <LayoutGrid className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {tags.length === 0 ? (
        <div className="text-xs text-zinc-500 italic py-1">
          {emptyPlaceholder}
        </div>
      ) : mode === 'chips' ? (
        <div
          className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto py-1 pr-1 custom-scrollbar"
          onTouchEnd={handleContainerTouchEnd}
        >
          {tags.map((tag, idx) => (
            <span
              key={`${tag}-${idx}`}
              data-tag={tag}
              data-ux-tag-chip="true"
              onClick={() => handleChipClick(tag)}
              className={`relative px-2 py-0.5 rounded text-xs leading-normal select-none touch-manipulation active:scale-[0.97] transition-transform before:content-[''] before:absolute before:-inset-0.5 ${onTagClick ? 'cursor-pointer' : ''} ${accentStyles}`}
            >
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <p className="font-mono text-xs text-zinc-300 break-words select-all leading-relaxed p-2 bg-zinc-900/60 border border-zinc-800/80 rounded max-h-48 overflow-y-auto custom-scrollbar">
          {tags.join(', ')}
        </p>
      )}
    </div>
  );
};
