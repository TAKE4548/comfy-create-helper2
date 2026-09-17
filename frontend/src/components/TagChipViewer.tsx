import React, { useState } from 'react';
import { LayoutGrid, FileText } from 'lucide-react';

export interface TagChipViewerProps {
  tags: string[];
  accentColor?: 'purple' | 'green';
  defaultMode?: 'chips' | 'text';
  className?: string;
  emptyPlaceholder?: string;
}

export const TagChipViewer: React.FC<TagChipViewerProps> = ({
  tags,
  accentColor = 'purple',
  defaultMode = 'chips',
  className = '',
  emptyPlaceholder = 'No tags',
}) => {
  const [mode, setMode] = useState<'chips' | 'text'>(defaultMode);

  const toggleMode = () => {
    setMode((prev) => (prev === 'chips' ? 'text' : 'chips'));
  };

  const accentStyles =
    accentColor === 'green'
      ? 'bg-[rgba(74,222,128,0.1)] border border-[rgba(74,222,128,0.2)] text-accent-green'
      : 'bg-[rgba(124,111,221,0.1)] border border-[rgba(124,111,221,0.2)] text-[#a99ef7]';


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
        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto py-1 pr-1 custom-scrollbar">
          {tags.map((tag, idx) => (
            <span
              key={`${tag}-${idx}`}
              data-tag={tag}
              className={`px-2 py-0.5 rounded text-xs leading-normal select-text ${accentStyles}`}
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