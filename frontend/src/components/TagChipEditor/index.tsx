import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { parseToChips, chipsToString, TagChip as TagChipType } from './useChipParser';
import { useChipHistory } from './useChipHistory';
import { generateChipId } from './idGenerator';
import { TagChip } from './TagChip';
import { TagInput } from './TagInput';
import { FileText, LayoutGrid } from 'lucide-react';
import './tagChipEditor.css';

interface TagChipEditorProps {
  id?: string;
  value?: string;
  onChange?: (val: string) => void;
  chips?: TagChipType[];
  onChipsChange?: (chips: TagChipType[]) => void;
  placeholder?: string;
  variant?: string;
  defaultTextMode?: boolean;
  isAnimaMode?: boolean;
  onTextModeToggle?: (isTextMode: boolean) => void;
}

export const TagChipEditor: React.FC<TagChipEditorProps> = ({
  id,
  value = '',
  onChange,
  chips: chipsProp,
  onChipsChange,
  placeholder = 'Add tag...',
  defaultTextMode = false,
  isAnimaMode = false,
  onTextModeToggle,
}) => {
  const initialChips = useMemo(() => {
    return chipsProp && chipsProp.length > 0 ? chipsProp : parseToChips(value);
  }, []);
  const { state, setChips, undo, redo, canUndo, canRedo } = useChipHistory(initialChips);
  const [isTextMode, setIsTextMode] = useState(defaultTextMode);
  const [textValue, setTextValue] = useState('');
  const [inputValue, setInputValue] = useState('');

  const isExternalUpdateRef = useRef(false);
  const prevChipsString = useRef(value);
  const prevChipsProp = useRef(chipsProp);

  // `@dnd-kit` センサーの設定
  // 入力エリアなどの干渉を防ぐため、ドラッグ判定の最小距離(8px)を設定
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 外部からの同期
  useEffect(() => {
    if (chipsProp !== undefined) {
      if (chipsProp !== prevChipsProp.current) {
        prevChipsProp.current = chipsProp;
        prevChipsString.current = chipsToString(chipsProp);
        isExternalUpdateRef.current = true;
        setChips(chipsProp, false);
        if (isTextMode) {
          setTextValue(chipsToString(chipsProp));
        }
      } else if (
        value &&
        value !== prevChipsString.current &&
        value !== chipsToString(state)
      ) {
        // chipsProp の参照変化はないが、value (文字列) が外部から変更された場合 (セクションコピペ等)
        isExternalUpdateRef.current = true;
        const newChips = parseToChips(value);
        setChips(newChips, false);
        prevChipsString.current = value;
        if (isTextMode) {
          setTextValue(value);
        }
      }
    } else {
      if (value !== prevChipsString.current) {
        isExternalUpdateRef.current = true;
        const newChips = parseToChips(value);
        setChips(newChips, false);
        prevChipsString.current = value;
        if (isTextMode) {
          setTextValue(value);
        }
      }
    }
  }, [chipsProp, value, setChips, isTextMode]);

  // 外部から defaultTextMode プロップスが更新されたら同期する
  useEffect(() => {
    setIsTextMode(defaultTextMode);
    if (defaultTextMode) {
      setTextValue(chipsProp ? chipsToString(chipsProp) : value);
    }
  }, [defaultTextMode]);

  // 内部のチップステートが変わったら外部へ通知
  useEffect(() => {
    if (isExternalUpdateRef.current) {
      isExternalUpdateRef.current = false;
      return;
    }
    onChipsChange?.(state);
    const newStr = chipsToString(state);
    if (newStr !== value) {
      prevChipsString.current = newStr;
      onChange?.(newStr);
    }
  }, [state, onChipsChange, onChange, value]);

  // イベントリスナー用に最新の state を保持
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 外部カスタムイベントハンドリング
  useEffect(() => {
    const handleDisableTag = (e: Event) => {
      const customEvent = e as CustomEvent<{ tag: string }>;
      const tagToDisable = customEvent.detail?.tag;
      if (!tagToDisable) return;

      const current = stateRef.current;
      const next = current.map((chip) =>
        chip.text.toLowerCase() === tagToDisable.toLowerCase()
          ? { ...chip, enabled: false }
          : chip
      );
      setChips(next, true);
    };

    const handleAddTag = (e: Event) => {
      const customEvent = e as CustomEvent<{ tag: string }>;
      const tagToAdd = customEvent.detail?.tag;
      if (!tagToAdd) return;

      const current = stateRef.current;
      const exists = current.some(
        (chip) => chip.text.toLowerCase() === tagToAdd.toLowerCase()
      );
      if (!exists) {
        const newChip: TagChipType = {
          id: generateChipId(),
          text: tagToAdd,
          enabled: true,
        };
        setChips([...current, newChip], true);
      }
    };

    window.addEventListener('tag-chip-editor:disable-tag', handleDisableTag);
    window.addEventListener('tag-chip-editor:add-tag', handleAddTag);
    return () => {
      window.removeEventListener('tag-chip-editor:disable-tag', handleDisableTag);
      window.removeEventListener('tag-chip-editor:add-tag', handleAddTag);
    };
  }, [setChips]);

  // ドラッグ完了時の処理
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = state.findIndex((chip) => chip.id === active.id);
    const newIndex = state.findIndex((chip) => chip.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newChips = arrayMove(state, oldIndex, newIndex);
      setChips(newChips, true); // 順序入れ替えを履歴に積む
    }
  };

  // テキストモードトグル処理
  const handleSwitchToTextMode = () => {
    setTextValue(chipsToString(state));
    setIsTextMode(true);
    onTextModeToggle?.(true);
    if (id) {
      window.dispatchEvent(
        new CustomEvent('tag-chip-editor:text-mode-toggle', {
          detail: { id }
        })
      );
    }
  };

  const handleSwitchToChipMode = () => {
    const newChips = parseToChips(textValue);
    setChips(newChips, true); // 編集確定したテキストを履歴に積む
    setIsTextMode(false);
    onTextModeToggle?.(false);
    if (id) {
      window.dispatchEvent(
        new CustomEvent('tag-chip-editor:text-mode-toggle', {
          detail: { id }
        })
      );
    }
  };

  // Ctrl+Z / Ctrl+Y による Undo/Redo ショートカット
  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      if (canUndo) undo();
    } else if (
      ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')
    ) {
      e.preventDefault();
      if (canRedo) redo();
    }
  };

  // チップのアクションハンドラ
  const handleToggle = (id: string) => {
    const next = state.map((chip) =>
      chip.id === id ? { ...chip, enabled: !chip.enabled } : chip
    );
    setChips(next, true);
  };

  const handleDelete = (id: string) => {
    const next = state.filter((chip) => chip.id !== id);
    setChips(next, true);
  };

  const handleEdit = (id: string, newText: string) => {
    const next = state.map((chip) =>
      chip.id === id ? { ...chip, text: newText } : chip
    );
    setChips(next, true);
  };

  const handleDuplicate = (id: string) => {
    const index = state.findIndex((chip) => chip.id === id);
    if (index === -1) return;
    const chipToDuplicate = state[index];
    const newChip: TagChipType = {
      id: generateChipId(),
      text: chipToDuplicate.text,
      enabled: chipToDuplicate.enabled,
    };
    const next = [...state];
    next.splice(index + 1, 0, newChip);
    setChips(next, true);
  };

  const handleAddTags = (newTexts: string[]) => {
    const newChips = newTexts.map((txt) => ({
      id: generateChipId(),
      text: txt,
      enabled: true,
    }));
    setChips([...state, ...newChips], true);
  };

  const handleRemoveLast = () => {
    if (state.length === 0) return;
    const next = state.slice(0, -1);
    setChips(next, true);
  };

  return (
    <div className="w-full flex flex-col gap-1.5" id={id}>
      {/* モードトグルとステータス表示 */}
      <div className="flex justify-between items-center text-xs text-[#A1A1AA]">
        <span>
          {isTextMode ? 'Text Mode (Comma separated)' : 'Chips Mode'}
          {(!isTextMode && (canUndo || canRedo)) && (
            <span className="ml-2 opacity-60">
              ({canUndo ? 'Ctrl+Z: Undo' : ''} {canRedo ? 'Ctrl+Y: Redo' : ''})
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={isTextMode ? handleSwitchToChipMode : handleSwitchToTextMode}
          className="flex items-center gap-1.5 px-2 py-1 bg-[#1F1F25] hover:bg-zinc-800 text-[#E4E4E7] border border-[rgba(255,255,255,0.08)] rounded transition-colors"
        >
          {isTextMode ? (
            <>
              <LayoutGrid size={12} />
              <span>チップモード切替</span>
            </>
          ) : (
            <>
              <FileText size={12} />
              <span>テキスト入力モード切替</span>
            </>
          )}
        </button>
      </div>

      {/* エディタのメイン部分 */}
      <div onKeyDown={handleContainerKeyDown} className="outline-none">
        {isTextMode ? (
          <div className="tag-chip-editor-container">
            <textarea
              value={textValue}
              onChange={(e) => {
                setTextValue(e.target.value);
                const newChips = parseToChips(e.target.value);
                setChips(newChips, false);
              }}
              placeholder={placeholder}
              className="tag-chip-editor-textarea"
            />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="tag-chip-editor-container">
              <SortableContext items={state} strategy={horizontalListSortingStrategy}>
                {state.map((chip) => (
                  <TagChip
                    key={chip.id}
                    id={chip.id}
                    text={chip.text}
                    enabled={chip.enabled}
                    isAnimaMode={isAnimaMode}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    onDuplicate={handleDuplicate}
                  />
                ))}
              </SortableContext>

              {/* 新規タグ入力 */}
              <TagInput
                value={inputValue}
                onChange={setInputValue}
                onAddTags={handleAddTags}
                onRemoveLast={handleRemoveLast}
                placeholder={state.length === 0 ? placeholder : ''}
              />
            </div>
          </DndContext>
        )}
      </div>
    </div>
  );
};

export default TagChipEditor;
