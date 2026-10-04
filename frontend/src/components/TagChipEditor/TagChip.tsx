import React, { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, GripVertical, Copy, Check } from 'lucide-react';
import { parseTagWeight, formatTagWeight, adjustWeight } from './useChipParser';
import { usePromptClipboardStore } from '../../store/usePromptClipboardStore';
import { TagChipTranslationCard } from './TagChipTranslationCard';

export interface TagChipProps {
  id: string;
  text: string;
  enabled: boolean;
  isAnimaMode?: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onDuplicate: (id: string) => void;
}

export const TagChip: React.FC<TagChipProps> = ({
  id,
  text,
  enabled,
  isAnimaMode = false,
  onToggle,
  onDelete,
  onEdit,
  onDuplicate,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(text);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTranslationOpen, setIsTranslationOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyText = usePromptClipboardStore((s) => s.copyText);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCopyTag = async () => {
    await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // タグ文字列からベース名と現在の強度を取得
  const { baseText, weight } = parseTagWeight(text);
  // UI表示用の強度文字列（未設定時は 1.0）
  const [weightInput, setWeightInput] = useState(weight !== null ? weight.toString() : '1.0');
  // サブメニュー内タグ単語編集用
  const [wordInput, setWordInput] = useState(baseText);

  useEffect(() => {
    const { baseText: currentBase, weight: currentWeight } = parseTagWeight(text);
    setWeightInput(currentWeight !== null ? currentWeight.toString() : '1.0');
    setWordInput(currentBase);
    setEditValue(text);
  }, [text]);

  // 親サブメニューが閉じた際、和訳カード状態を確実にリセット（AC-8）
  useEffect(() => {
    if (!isMenuOpen) {
      setIsTranslationOpen(false);
    }
  }, [isMenuOpen]);

  // サブメニュー外クリック・タップ検知
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isMenuOpen]);

  // ドラッグ時のインラインスタイル
  const style: React.CSSProperties = {
    transform: isDragging
      ? transform
        ? `${CSS.Transform.toString(transform)} scale(1.05)`
        : 'scale(1.05)'
      : CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : undefined,
    boxShadow: isDragging ? '0 10px 15px -3px rgba(0, 0, 0, 0.3)' : undefined,
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    setIsEditing(true);
  };

  const handleChipClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditing) return;
    const next = !isMenuOpen;
    setIsMenuOpen(next);
    setIsTranslationOpen(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditing) return;

    if (e.key === 'Escape' && isMenuOpen) {
      e.preventDefault();
      setIsMenuOpen(false);
    } else if (e.key === ' ') {
      e.preventDefault();
      onToggle(id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDelete(id);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      onDuplicate(id);
    }
  };

  const handleStepWeight = (delta: number) => {
    const { baseText: currentBase, weight: currentWeight } = parseTagWeight(text);
    const newWeight = adjustWeight(currentWeight, delta);
    setWeightInput(newWeight.toString());
    const newFormatted = formatTagWeight(currentBase, newWeight, isAnimaMode);
    onEdit(id, newFormatted);
  };

  const handleDirectWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWeightInput(e.target.value);
  };

  const handleWeightSubmit = () => {
    const parsed = parseFloat(weightInput);
    const { baseText: currentBase } = parseTagWeight(text);
    if (!isNaN(parsed)) {
      const clamped = Math.max(0, parseFloat(parsed.toFixed(2)));
      setWeightInput(clamped.toString());
      const newFormatted = formatTagWeight(currentBase, clamped, isAnimaMode);
      onEdit(id, newFormatted);
    } else {
      const { weight: currentWeight } = parseTagWeight(text);
      setWeightInput(currentWeight !== null ? currentWeight.toString() : '1.0');
    }
  };

  const handleWeightKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      handleWeightSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsMenuOpen(false);
    }
  };

  const handleWordSubmit = () => {
    const trimmed = wordInput.trim();
    if (!trimmed) {
      setWordInput(baseText);
      return;
    }
    if (trimmed !== baseText) {
      const { weight: currentWeight } = parseTagWeight(text);
      const newFormatted = formatTagWeight(trimmed, currentWeight, isAnimaMode);
      onEdit(id, newFormatted);
    }
  };

  const handleWordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      handleWordSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setWordInput(baseText);
      setIsMenuOpen(false);
    }
  };

  const handleEditSubmit = () => {
    const trimmed = editValue.trim();
    if (trimmed === '') {
      onDelete(id);
    } else {
      onEdit(id, trimmed);
    }
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditValue(text);
    setIsEditing(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleEditCancel();
    }
  };

  const dragProps = isEditing ? {} : { ...attributes, ...listeners };

  return (
    <div
      ref={setNodeRef}
      style={style}
      tabIndex={isEditing ? -1 : 0}
      onKeyDown={handleKeyDown}
      className={`
        relative flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-sm font-medium transition-colors select-none outline-none
        ${isEditing ? 'bg-[#18181C] border-[#7C6FDD]' : ''}
        ${!isEditing && enabled ? 'bg-[#1F1F25] border-[rgba(255,255,255,0.08)] text-[#E4E4E7] hover:border-[rgba(255,255,255,0.15)] focus:border-[#7C6FDD]' : ''}
        ${!isEditing && !enabled ? 'bg-zinc-900 border-dashed border-[rgba(255,255,255,0.05)] text-[#A1A1AA] opacity-50 line-through' : ''}
      `}
      title="クリックでメニュー / ダブルクリックで編集 / Spaceで切替 / Delで削除 / Ctrl+Dで複製"
      aria-roledescription="ドラッグで並び替え可能"
    >
      {/* ドラッグハンドル */}
      {!isEditing && (
        <div
          {...dragProps}
          className="cursor-grab text-zinc-500 hover:text-zinc-300 active:cursor-grabbing p-0.5 touch-none select-none"
          style={{ touchAction: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
          onContextMenu={(e: React.MouseEvent<HTMLDivElement>) => e.preventDefault()}
          title="ドラッグして並び替え"
          aria-label="並び替えハンドル"
        >
          <GripVertical size={14} />
        </div>
      )}

      {/* テキスト/編集インプット */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleEditSubmit}
          onKeyDown={handleInputKeyDown}
          className="bg-transparent border-none text-[#E4E4E7] text-sm focus:outline-none w-20 min-w-[60px]"
        />
      ) : (
        <span
          onDoubleClick={handleDoubleClick}
          onClick={handleChipClick}
          className="cursor-pointer flex-grow"
        >
          {text}
        </span>
      )}

      {/* 削除ボタン */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(id);
        }}
        className="text-zinc-500 hover:text-zinc-300 rounded p-0.5 transition-colors focus:outline-none focus:ring-1 focus:ring-zinc-400"
        aria-label={`タグ ${text} を削除`}
      >
        <X size={13} />
      </button>

      {/* サブメニュー (ポップオーバー) */}
      {isMenuOpen && !isEditing && (
        <div
          ref={menuRef}
          className="absolute top-full left-0 mt-1.5 z-50 w-[360px] max-w-[calc(100vw-24px)] p-2.5 bg-[#18181C] border border-[rgba(255,255,255,0.15)] rounded-lg shadow-2xl flex flex-col gap-2.5 text-xs select-none"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              e.preventDefault();
              setIsMenuOpen(false);
            }
          }}
        >
          {/* ヘッダー: タグ名入力 + コピーボタン + 翻訳ボタン + 有効/無効トグル */}
          <div className="flex items-center gap-1.5 border-b border-[rgba(255,255,255,0.08)] pb-2">
            <input
              type="text"
              value={wordInput}
              onChange={(e) => setWordInput(e.target.value)}
              onBlur={handleWordSubmit}
              onKeyDown={handleWordKeyDown}
              placeholder="タグ名"
              className="flex-1 min-w-0 px-2 py-1 bg-[#1F1F25] border border-[rgba(255,255,255,0.12)] rounded text-[#E4E4E7] text-xs font-medium focus:outline-none focus:border-[#7C6FDD]"
              aria-label="タグ名編集"
            />
            <button
              type="button"
              onClick={handleCopyTag}
              className="p-1 rounded bg-[#1F1F25] border border-[rgba(255,255,255,0.12)] text-zinc-300 hover:text-white hover:border-[#7C6FDD] transition-colors shrink-0"
              title="タグをコピー"
              aria-label="タグをコピー"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
            <button
              type="button"
              onClick={() => setIsTranslationOpen((prev) => !prev)}
              className="px-2 py-1 rounded bg-[#1F1F25] border border-[rgba(255,255,255,0.12)] text-zinc-300 hover:text-white hover:border-[#7C6FDD] text-[11px] font-medium transition-colors shrink-0"
              title="和訳プレビュー"
              aria-label={isTranslationOpen ? 'タグの和訳を閉じる' : 'タグの和訳を表示'}
            >
              翻訳
            </button>
            <button
              type="button"
              onClick={() => onToggle(id)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors shrink-0 ${
                enabled
                  ? 'bg-[#3ecf8e] text-zinc-950 font-bold hover:bg-[#3ecf8e]/90'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
              }`}
            >
              {enabled ? '有効' : '無効'}
            </button>
          </div>

          {/* 強度調整エリア */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[#A1A1AA]">
              <span>強度 (Weight)</span>
              <input
                type="number"
                step={isAnimaMode ? '0.5' : '0.1'}
                value={weightInput}
                onChange={handleDirectWeightChange}
                onBlur={handleWeightSubmit}
                onKeyDown={handleWeightKeyDown}
                className="w-16 px-1.5 py-0.5 bg-[#1F1F25] border border-[rgba(255,255,255,0.1)] rounded text-right text-[#E4E4E7] focus:outline-none focus:border-[#7C6FDD]"
              />
            </div>

            {/* ステップ増減ボタン */}
            <div className="grid grid-cols-4 gap-1">
              {(isAnimaMode
                ? [
                    { delta: -1.0, label: '-1.0' },
                    { delta: -0.5, label: '-0.5' },
                    { delta: 0.5, label: '+0.5' },
                    { delta: 1.0, label: '+1.0' },
                  ]
                : [
                    { delta: -0.3, label: '-0.3' },
                    { delta: -0.1, label: '-0.1' },
                    { delta: 0.1, label: '+0.1' },
                    { delta: 0.3, label: '+0.3' },
                  ]
              ).map(({ delta, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleStepWeight(delta)}
                  className="px-1.5 py-1 bg-[#1F1F25] hover:bg-zinc-700 text-[#E4E4E7] rounded border border-[rgba(255,255,255,0.05)] text-center transition-colors font-mono"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isTranslationOpen && (
            <TagChipTranslationCard
              text={baseText}
              onClose={() => setIsTranslationOpen(false)}
              anchorRect={menuRef.current?.getBoundingClientRect()}
              menuRef={menuRef}
            />
          )}
        </div>
      )}
    </div>
  );
};
