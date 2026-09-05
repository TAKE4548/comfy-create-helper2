import React, { useState, useRef, useEffect } from 'react';
import { Copy, Check, Clipboard, History, BookmarkPlus, ChevronDown, Trash2 } from 'lucide-react';
import { appendToPrompt } from '../../../utils/promptUtils';
import { usePromptClipboardStore } from '../../../store/usePromptClipboardStore';

export interface PromptSectionClipboardMenuProps {
  role: string;
  currentValue: string;
  onChangeValue: (newValue: string) => void;
  onOpenSaveAsTagSet?: () => void;
}

export const PromptSectionClipboardMenu: React.FC<PromptSectionClipboardMenuProps> = ({
  role,
  currentValue,
  onChangeValue,
  onOpenSaveAsTagSet,
}) => {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const history = usePromptClipboardStore((s) => s.history);
  const pasteMode = usePromptClipboardStore((s) => s.pasteMode);
  const copyText = usePromptClipboardStore((s) => s.copyText);
  const setPasteMode = usePromptClipboardStore((s) => s.setPasteMode);
  const clearHistory = usePromptClipboardStore((s) => s.clearHistory);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const handleCopySection = async () => {
    if (!currentValue.trim()) return;
    await copyText(currentValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleApplyPaste = (textToPaste: string) => {
    const cleanToPaste = textToPaste.trim();
    if (!cleanToPaste) return;
    if (pasteMode === 'overwrite') {
      onChangeValue(cleanToPaste);
    } else {
      onChangeValue(appendToPrompt(currentValue, cleanToPaste));
    }
  };

  const handlePasteFromOSClipboard = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        handleApplyPaste(text);
        setIsOpen(false);
      }
    } catch (e) {
      console.warn('Clipboard read failed', e);
    }
  };

  const handleHistoryItemClick = (item: string) => {
    handleApplyPaste(item);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-flex items-center gap-1" ref={menuRef}>
      <button
        type="button"
        onClick={handleCopySection}
        disabled={!currentValue.trim()}
        className="p-1.5 rounded bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] text-zinc-300 hover:text-white hover:border-[#7C6FDD] disabled:opacity-40 disabled:hover:border-[rgba(255,255,255,0.08)] disabled:hover:text-zinc-300 transition-colors shrink-0"
        title="プロンプトをコピー"
        aria-label={`プロンプトをコピー (${role})`}
      >
        {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
      </button>

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-0.5 px-1.5 py-1 rounded bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] text-zinc-300 hover:text-white hover:border-[#7C6FDD] transition-colors shrink-0 text-xs"
        title="クリップボード・履歴操作"
        aria-label={`クリップボード・履歴メニュー (${role})`}
        aria-expanded={isOpen}
      >
        <Clipboard size={13} />
        <ChevronDown size={11} className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 w-72 p-2.5 bg-[#18181C] border border-[rgba(255,255,255,0.15)] rounded-lg shadow-2xl flex flex-col gap-2.5 text-xs select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-1 border-b border-[rgba(255,255,255,0.08)] pb-2">
            <span className="text-[11px] font-medium text-zinc-400">ペーストモード</span>
            <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#1F1F25] rounded border border-[rgba(255,255,255,0.06)]">
              <button
                type="button"
                onClick={() => setPasteMode('append')}
                className={`py-1 text-center rounded transition-colors text-[11px] font-medium ${
                  pasteMode === 'append' ? 'bg-[#7C6FDD] text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                末尾に追加
              </button>
              <button
                type="button"
                onClick={() => setPasteMode('overwrite')}
                className={`py-1 text-center rounded transition-colors text-[11px] font-medium ${
                  pasteMode === 'overwrite' ? 'bg-[#7C6FDD] text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                上書き
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePasteFromOSClipboard}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] text-zinc-200 hover:text-white hover:border-[#7C6FDD] transition-colors font-medium text-left"
          >
            <Clipboard size={13} className="text-[#7C6FDD] shrink-0" />
            <span>クリップボードから貼り付け</span>
          </button>

          {onOpenSaveAsTagSet && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenSaveAsTagSet();
              }}
              disabled={!currentValue.trim()}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] text-zinc-200 hover:text-white hover:border-[#7C6FDD] disabled:opacity-40 disabled:hover:border-[rgba(255,255,255,0.08)] disabled:hover:text-zinc-200 transition-colors font-medium text-left"
            >
              <BookmarkPlus size={13} className="text-amber-400 shrink-0" />
              <span>タグセットとして保存</span>
            </button>
          )}

          <div className="flex flex-col gap-1.5 pt-1 border-t border-[rgba(255,255,255,0.08)]">
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span className="flex items-center gap-1 font-medium">
                <History size={12} /> コピー履歴 ({history.length})
              </span>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={clearHistory}
                  className="hover:text-red-400 flex items-center gap-0.5 transition-colors"
                  title="履歴を全削除"
                >
                  <Trash2 size={11} /> クリア
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="py-2 text-center text-zinc-500 text-[11px]">履歴はありません</div>
            ) : (
              <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-0.5">
                {history.map((item, index) => (
                  <button
                    key={`${index}-${item.slice(0, 15)}`}
                    type="button"
                    onClick={() => handleHistoryItemClick(item)}
                    className="w-full px-2 py-1.5 rounded bg-[#27272F] hover:bg-[#32323D] text-left text-[11px] text-zinc-300 hover:text-white truncate transition-colors border border-transparent hover:border-[rgba(255,255,255,0.1)]"
                    title={item}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};