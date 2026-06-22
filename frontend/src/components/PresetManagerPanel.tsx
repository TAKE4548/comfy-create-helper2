import { useState, useEffect } from 'react';
import { GripVertical, Pencil, Loader2 } from 'lucide-react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WorkflowPreset } from '../api/types';

export type PresetManagerPanelProps = {
  presets: WorkflowPreset[];
  onRename: (id: number, newName: string) => Promise<void>;
  onReorder: (ordered_ids: number[]) => Promise<void>;
  isPending?: boolean;
};

export function PresetManagerPanel({
  presets,
  onRename,
  onReorder,
  isPending = false,
}: PresetManagerPanelProps) {
  const [localPresets, setLocalPresets] = useState<WorkflowPreset[]>(presets);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

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
        {isPending && (
          <div className="flex items-center gap-1 text-[10px] text-accent-green">
            <Loader2 size={12} className="animate-spin" />
            更新中...
          </div>
        )}
      </div>

      {localPresets.length === 0 ? (
        <div className="text-center py-6 text-xs text-zinc-550 border border-[rgba(255,255,255,0.04)] rounded-lg bg-surface/30">
          登録されているプリセットはありません。
        </div>
      ) : (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
}: {
  preset: WorkflowPreset;
  isEditing: boolean;
  editingName: string;
  setEditingName: (name: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
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
      className={`flex items-center gap-3 px-3 py-2 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg transition-all ${
        isDragging ? 'border-accent-green/40 shadow-xl' : 'hover:bg-white/[0.01]'
      }`}
    >
      {/* Drag Handle */}
      <button
        type="button"
        className="text-zinc-550 hover:text-zinc-350 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-white/5 transition-all flex-shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

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
          <span className="text-xs font-medium text-zinc-300 truncate block select-none">
            {preset.name}
          </span>
        )}
      </div>

      {/* Edit Pencil Icon */}
      <div className="flex-shrink-0">
        {!isEditing && (
          <button
            type="button"
            onClick={onStartEdit}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded hover:bg-white/5 transition-all"
            title="名前を変更"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
