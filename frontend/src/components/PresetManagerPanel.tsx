import { useState, useEffect } from 'react';
import { GripVertical, Pencil, Loader2, Trash2, ListChecks, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  useSensors,
  useSensor,
  MouseSensor,
  TouchSensor
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WorkflowPreset } from '../api/types';
import { MultiSelectToolbar } from './MultiSelectToolbar';
import { useMultiSelect } from '../hooks/useMultiSelect';

type SetCheckState = { id: string | number; checked: boolean };

export type PresetManagerPanelProps = {
  presets: WorkflowPreset[];
  onRename: (id: number, newName: string) => Promise<void>;
  onReorder: (ordered_ids: number[]) => Promise<void>;
  isPending?: boolean;
  sets?: SetCheckState[];
  activeSetId?: string | number | null;
  openPresetIds?: (string | number)[];
  onToggleCheck?: (id: string | number) => void;
  onDelete?: (id: number) => void;
  onSaveOverwrite?: (id: number, name: string) => void;
  onSaveAsNew?: (name: string) => void;
  onOpenAsTab?: (id: string | number) => void;
  onCloseTab?: (id: string | number) => void;
  onOpenSceneGenerator?: () => void;
  onBulkDelete?: (selectedIds: number[]) => void;
  onBulkEdit?: (selectedIds: number[]) => void;
};

export function PresetManagerPanel({
  presets,
  onRename,
  onReorder,
  isPending = false,
  sets,
  activeSetId,
  openPresetIds,
  onToggleCheck,
  onDelete,
  onSaveOverwrite,
  onSaveAsNew,
  onOpenAsTab,
  onCloseTab,
  onOpenSceneGenerator,
  onBulkDelete,
  onBulkEdit,
}: PresetManagerPanelProps) {
  const [localPresets, setLocalPresets] = useState<WorkflowPreset[]>(presets);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [newName, setNewName] = useState('');

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
    })
  );

  // Bulk operation state managed via useMultiSelect
  const multiSelect = useMultiSelect<number>({ items: localPresets });
  const bulkMode = multiSelect.isMultiSelectMode;
  const bulkSelectedIds = multiSelect.selectedIds;

  const toggleBulkMode = () => {
    if (bulkMode) {
      multiSelect.exitMultiSelectMode();
    } else {
      multiSelect.enterMultiSelectMode();
    }
  };

  // Sync with presets prop
  useEffect(() => {
    setLocalPresets(presets);
  }, [presets]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localPresets.findIndex((p) => p.id === active.id);
    const newIndex = localPresets.findIndex((p) => p.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const updated = [...localPresets];
      const [moved] = updated.splice(oldIndex, 1);
      updated.splice(newIndex, 0, moved);

      // Optimistic update
      setLocalPresets(updated);

      const orderedIds = updated.map((p) => p.id);
      try {
        await onReorder(orderedIds);
      } catch (err) {
        // Revert on error
        setLocalPresets(presets);
      }
    }
  };

  const startEdit = (preset: WorkflowPreset) => {
    setEditingId(preset.id);
    setEditingName(preset.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveEdit = async (id: number) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      cancelEdit();
      return;
    }
    const original = presets.find((p) => p.id === id);
    if (original && original.name === trimmed) {
      cancelEdit();
      return;
    }
    setEditingId(null);
    try {
      await onRename(id, trimmed);
    } catch (err) {
      // Parent mutation should handle the error toast/state, but we sync back anyway if needed
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-450 uppercase tracking-wider">
          プリセット一覧
        </span>
        <div className="flex items-center gap-2">
          {isPending && (
            <div className="flex items-center gap-1 text-[10px] text-accent-green">
              <Loader2 size={12} className="animate-spin" />
              更新中...
            </div>
          )}
          {(onBulkDelete || onBulkEdit) && (
            <button
              type="button"
              onClick={toggleBulkMode}
              title={bulkMode ? '通常モードに戻る' : '一括操作モード'}
              className={`p-1 rounded transition-colors ${
                bulkMode
                  ? 'text-[#3ECF8E] bg-[#3ECF8E]/10'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <ListChecks size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Bulk mode toolbar */}
      {bulkMode && (
        <MultiSelectToolbar
          selectedCount={bulkSelectedIds.size}
          totalCount={localPresets.length}
          onSelectAll={multiSelect.selectAll}
          onClearSelection={multiSelect.clearSelection}
          onExitMode={toggleBulkMode}
          actions={
            <>
              {onBulkEdit && (
                <button
                  type="button"
                  disabled={bulkSelectedIds.size === 0}
                  onClick={() => onBulkEdit(Array.from(bulkSelectedIds))}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white bg-[#3ECF8E]/10 border border-[#3ECF8E]/30 rounded-md hover:bg-[#3ECF8E]/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  一括編集
                </button>
              )}
              {onBulkDelete && (
                <button
                  type="button"
                  disabled={bulkSelectedIds.size === 0}
                  onClick={() => onBulkDelete(Array.from(bulkSelectedIds))}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/30 rounded-md hover:bg-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  一括削除
                </button>
              )}
            </>
          }
        />
      )}

      {localPresets.length === 0 ? (
        <div className="text-center py-6 text-xs text-zinc-550 border border-[rgba(255,255,255,0.04)] rounded-lg bg-surface/30">
          登録されているプリセットはありません。
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localPresets.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar pr-1">
              {localPresets.map((preset) => (
                <SortablePresetRow
                  key={preset.id}
                  preset={preset}
                  isEditing={editingId === preset.id}
                  editingName={editingName}
                  setEditingName={setEditingName}
                  onStartEdit={() => startEdit(preset)}
                  onSaveEdit={() => saveEdit(preset.id)}
                  onCancelEdit={cancelEdit}
                  isChecked={sets ? (sets.find((x) => String(x.id) === String(preset.id))?.checked ?? false) : false}
                  isActive={activeSetId !== undefined && activeSetId !== null ? String(activeSetId) === String(preset.id) : false}
                  isOpenAsTab={openPresetIds ? openPresetIds.map(String).includes(String(preset.id)) : false}
                  onToggleCheck={onToggleCheck ? () => onToggleCheck(preset.id) : undefined}
                  onDelete={onDelete ? () => onDelete(preset.id) : undefined}
                  onOpenAsTab={onOpenAsTab ? () => onOpenAsTab(preset.id) : undefined}
                  onCloseTab={onCloseTab ? () => onCloseTab(preset.id) : undefined}
                  bulkMode={bulkMode}
                  isBulkSelected={multiSelect.isSelected(preset.id)}
                  onRowClick={(e: React.MouseEvent) => {
                    if (bulkMode) {
                      multiSelect.handleItemClick(preset.id, e);
                    } else if (!editingId && onOpenAsTab) {
                      onOpenAsTab(preset.id);
                    }
                  }}
                  onCheckboxClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    multiSelect.handleItemClick(preset.id, e);
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Bottom Actions */}
      <div className="border-t border-[rgba(255,255,255,0.06)] pt-3 space-y-3">
        {activeSetId !== undefined && activeSetId !== null && onSaveOverwrite && onSaveAsNew && (
          <div className="space-y-1.5">
            <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">現在の設定</span>
            <div className="flex gap-2">
              <button
                type="button"
                id="preset-overwrite-btn"
                onClick={() => {
                  const p = presets.find((x) => String(x.id) === String(activeSetId));
                  if (p) onSaveOverwrite(p.id, p.name);
                }}
                className="flex-1 py-1.5 rounded-lg bg-surface border border-[rgba(255,255,255,0.08)] text-zinc-300 text-[10px] font-semibold hover:bg-white/5 transition-all"
              >
                💾 上書き保存
              </button>
              <button
                type="button"
                id="preset-saveas-btn"
                onClick={() => setShowSaveAs(!showSaveAs)}
                className="flex-1 py-1.5 rounded-lg bg-surface border border-[rgba(255,255,255,0.08)] text-zinc-300 text-[10px] font-semibold hover:bg-white/5 transition-all"
              >
                ＋ 別名で保存
              </button>
            </div>
          </div>
        )}

        {showSaveAs && onSaveAsNew && (
          <div className="flex gap-1.5">
            <input
              id="preset-new-name-input"
              type="text"
              placeholder="新しいプリセット名..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-[10px] text-zinc-300 focus:outline-none focus:border-[#7C6FDD]/45"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  onSaveAsNew(newName.trim());
                  setShowSaveAs(false);
                  setNewName('');
                }
              }}
            />
            <button
              type="button"
              id="preset-saveas-confirm-btn"
              onClick={() => {
                if (newName.trim()) {
                  onSaveAsNew(newName.trim());
                  setShowSaveAs(false);
                  setNewName('');
                }
              }}
              className="px-2 py-1 rounded bg-[#7C6FDD] text-white text-[10px] font-semibold hover:bg-[#6d62cc]"
            >
              保存
            </button>
          </div>
        )}

        {sets && onToggleCheck && (
          <div className="flex justify-between items-center">
            <button
              type="button"
              id="preset-check-all-btn"
              onClick={() =>
                presets.forEach((p) => {
                  const s = sets.find((x) => String(x.id) === String(p.id));
                  if (!s?.checked) onToggleCheck(p.id);
                })
              }
              className="text-[10px] text-zinc-500 hover:text-zinc-355 transition-colors"
            >
              全選択
            </button>
            <button
              type="button"
              id="preset-uncheck-all-btn"
              onClick={() =>
                presets.forEach((p) => {
                  const s = sets.find((x) => String(x.id) === String(p.id));
                  if (s?.checked) onToggleCheck(p.id);
                })
              }
              className="text-[10px] text-zinc-500 hover:text-zinc-355 transition-colors"
            >
              全解除
            </button>
          </div>
        )}
      </div>

      {onOpenSceneGenerator && (
        <div className="border-t border-[rgba(255,255,255,0.06)] pt-3">
          <button
            id="scene-generator-from-preset-btn"
            type="button"
            onClick={onOpenSceneGenerator}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[rgba(124,111,221,0.08)] border border-[#7C6FDD]/30 text-[#7C6FDD] text-xs font-semibold hover:bg-[rgba(124,111,221,0.15)] transition-all"
          >
            🎬 Scene Generator で複数プリセットを自動生成
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sub Component: Sortable Row ───────────────────────────────────

function SortablePresetRow({
  preset,
  isEditing,
  editingName,
  setEditingName,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  isChecked,
  isActive,
  isOpenAsTab,
  onToggleCheck,
  onDelete,
  onCloseTab,
  bulkMode = false,
  isBulkSelected = false,
  onRowClick,
  onCheckboxClick,
}: {
  preset: WorkflowPreset;
  isEditing: boolean;
  editingName: string;
  setEditingName: (name: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  isChecked?: boolean;
  isActive?: boolean;
  isOpenAsTab?: boolean;
  onToggleCheck?: () => void;
  onDelete?: () => void;
  onOpenAsTab?: () => void;
  onCloseTab?: () => void;
  bulkMode?: boolean;
  isBulkSelected?: boolean;
  onRowClick?: (e: React.MouseEvent) => void;
  onCheckboxClick?: (e: React.MouseEvent) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: preset.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        onRowClick?.(e);
      }}
      className={`flex items-center gap-3 px-3 py-2 bg-surface-2 border rounded-lg transition-all cursor-pointer ${
        bulkMode && isBulkSelected
          ? 'border-[#3ECF8E]/50 bg-[#3ECF8E]/5'
          : isDragging
          ? 'border-accent-green/40 shadow-xl'
          : 'border-[rgba(255,255,255,0.06)] hover:bg-white/[0.01]'
      }`}
    >
      {/* Drag Handle - hidden in bulk mode */}
      {!bulkMode && (
        <button
          type="button"
          className="text-zinc-500 hover:text-zinc-355 cursor-grab active:cursor-grabbing touch-none select-none p-1 rounded hover:bg-white/5 transition-all flex-shrink-0"
          style={{ touchAction: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
          onContextMenu={(e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault()}
          {...attributes}
          {...listeners}
          title="ドラッグして並び替え"
          aria-label="並び替えハンドル"
        >
          <GripVertical size={16} />
        </button>
      )}

      {/* Checkbox */}
      {onToggleCheck && (
        <input
          type="checkbox"
          id={`preset-check-${preset.id}`}
          checked={isChecked ?? false}
          onChange={onToggleCheck}
          onClick={(e) => e.stopPropagation()}
          className="w-3.5 h-3.5 rounded accent-accent-green cursor-pointer flex-shrink-0"
        />
      )}

      {/* Preset Name */}
      <div className="flex-1 min-w-0" onDoubleClick={onStartEdit}>
        {isEditing ? (
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={onSaveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            autoFocus
            className="w-full bg-zinc-900 border border-[rgba(255,255,255,0.12)] rounded px-2 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 focus:ring-1 focus:ring-accent-green/10"
          />
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-zinc-300 truncate block select-none">
              {preset.name}
            </span>
            {isActive && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent-green/15 text-accent-green border border-accent-green/30 font-medium flex-shrink-0">
                編集中
              </span>
            )}
            {isOpenAsTab && !isActive && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#7C6FDD]/15 text-[#7C6FDD] border border-[#7C6FDD]/30 font-medium flex-shrink-0">
                タブ表示中
              </span>
            )}
          </div>
        )}
      </div>

      {/* Edit / Delete / Close Tab buttons (normal mode) or Bulk checkbox (bulk mode) */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {bulkMode ? (
          <input
            type="checkbox"
            id={`preset-bulk-check-${preset.id}`}
            checked={isBulkSelected}
            onChange={() => {}}
            onClick={(e) => onCheckboxClick?.(e)}
            className="w-4 h-4 rounded accent-accent-green cursor-pointer"
          />
        ) : (
          !isEditing && (
            <>
              {isOpenAsTab && onCloseTab && (
                <button
                  type="button"
                  id={`preset-close-tab-btn-${preset.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab();
                  }}
                  className="p-1 text-zinc-500 hover:text-amber-400 rounded hover:bg-amber-500/10 transition-all"
                  title="タブを閉じる"
                >
                  <X size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onStartEdit() }}
                className="p-1 text-zinc-500 hover:text-zinc-300 rounded hover:bg-white/5 transition-all"
                title="名前を変更"
              >
                <Pencil size={13} />
              </button>
              {onDelete && (
                <button
                  type="button"
                  id={`preset-delete-btn-${preset.id}`}
                  onClick={(e) => { e.stopPropagation(); onDelete() }}
                  className="p-1 text-zinc-500 hover:text-red-400 rounded hover:bg-red-500/10 transition-all"
                  title="削除"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
