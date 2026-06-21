import React from 'react';
import { X, CheckSquare, Square } from 'lucide-react';

export interface MultiSelectToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onExitMode: () => void;
  actions?: React.ReactNode;
}

export function MultiSelectToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onExitMode,
  actions,
}: MultiSelectToolbarProps) {
  return (
    <div className="w-full bg-[#3ECF8E]/10 border-b border-[#3ECF8E]/30 px-6 py-3 flex items-center justify-between animate-slide-down shadow-md z-40">
      {/* Left section: Counts and toggle buttons */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#3ECF8E] animate-pulse"></span>
          <span className="text-sm font-semibold text-[#3ECF8E] uppercase tracking-wider">
            複数選択モード
          </span>
          <span className="text-sm font-medium text-gray-300 ml-2">
            {selectedCount} / <span className="text-gray-500">{totalCount}</span> 件選択中
          </span>
        </div>

        <div className="h-4 w-px bg-[rgba(255,255,255,0.15)]"></div>

        <div className="flex items-center gap-3">
          <button
            onClick={onSelectAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white rounded-md hover:bg-white/5 transition-all"
          >
            <CheckSquare size={14} className="text-[#3ECF8E]" />
            すべて選択
          </button>
          <button
            onClick={onClearSelection}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white rounded-md hover:bg-white/5 transition-all disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Square size={14} />
            選択解除
          </button>
        </div>
      </div>

      {/* Right section: Context actions and exit */}
      <div className="flex items-center gap-4">
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}

        <div className="h-4 w-px bg-[rgba(255,255,255,0.15)]"></div>

        <button
          onClick={onExitMode}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:text-white border border-[rgba(255,255,255,0.1)] rounded-md hover:bg-white/5 transition-all"
          title="選択モード終了"
        >
          <X size={14} />
          選択モード終了
        </button>
      </div>
    </div>
  );
}
