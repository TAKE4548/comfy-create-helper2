import React, { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, GripVertical } from 'lucide-react';

interface TagChipProps {
  id: string;
  text: string;
  enabled: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onDuplicate: (id: string) => void;
}

export const TagChip: React.FC<TagChipProps> = ({
  id,
  text,
  enabled,
  onToggle,
  onDelete,
  onEdit,
  onDuplicate,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // ドラッグ時のインラインスタイル
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  // 編集モードに入った際にインプットを選択フォーカスする
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // テキストプロップスが更新されたら編集値も同期
  useEffect(() => {
    setEditValue(text);
  }, [text]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditing) return;

    if (e.key === ' ') {
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
        flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-sm font-medium transition-colors select-none outline-none
        ${isEditing ? 'bg-[#18181C] border-[#7C6FDD]' : ''}
        ${!isEditing && enabled ? 'bg-[#1F1F25] border-[rgba(255,255,255,0.08)] text-[#E4E4E7] hover:border-[rgba(255,255,255,0.15)] focus:border-[#7C6FDD]' : ''}
        ${!isEditing && !enabled ? 'bg-zinc-900 border-dashed border-[rgba(255,255,255,0.05)] text-[#A1A1AA] opacity-50 line-through' : ''}
      `}
      title="ダブルクリックで編集 / 左右キーで移動 / Spaceで切替 / Delで削除 / Ctrl+Dで複製"
      aria-roledescription="ドラッグで並び替え可能"
    >
      {/* ドラッグハンドル */}
      {!isEditing && (
        <div
          {...dragProps}
          className="cursor-grab text-zinc-500 hover:text-zinc-300 active:cursor-grabbing p-0.5"
          title="ドラッグで並び替え"
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
          onClick={() => onToggle(id)}
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
    </div>
  );
};
