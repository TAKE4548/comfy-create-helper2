import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Edit2, Trash2, Check, Save } from 'lucide-react';
import { useGenerationStore } from '../store/useGenerationStore';

export interface BypassSettingsModalProps {
  onClose: () => void;
  workflowJson?: Record<string, any> | null;
}

export function BypassSettingsModal({ onClose, workflowJson }: BypassSettingsModalProps) {
  const {
    selectedWorkflowId,
    currentWorkflow,
    bypassProfiles,
    fetchBypassProfiles,
    createBypassProfile,
    updateBypassProfile,
    deleteBypassProfile,
  } = useGenerationStore();

  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const newNameInputRef = useRef<HTMLInputElement>(null);
  const editNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedWorkflowId !== null) {
      fetchBypassProfiles(selectedWorkflowId);
    }
  }, [selectedWorkflowId, fetchBypassProfiles]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Auto-focus on new profile input when shown
  useEffect(() => {
    if (isCreating) {
      newNameInputRef.current?.focus();
    }
  }, [isCreating]);

  // Auto-focus on edit profile name input when shown
  useEffect(() => {
    if (editingProfileId !== null) {
      editNameInputRef.current?.focus();
      editNameInputRef.current?.select();
    }
  }, [editingProfileId]);

  const activeProfile = bypassProfiles.find((p) => p.id === activeProfileId) || null;

  // Extract valid workflow nodes
  const activeWfJson = workflowJson || currentWorkflow || {};
  const nodes = Object.entries(activeWfJson)
    .filter(([_, node]: [string, any]) => node && typeof node === 'object' && 'class_type' in node)
    .map(([id, node]: [string, any]) => ({
      id,
      title: node._meta?.title || node.class_type || `Node ${id}`,
      classType: node.class_type,
    }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim() || selectedWorkflowId === null) return;
    await createBypassProfile(selectedWorkflowId, newProfileName.trim(), []);
    setNewProfileName('');
    setIsCreating(false);
  };

  const handleStartRename = (id: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProfileId(id);
    setEditingName(name);
  };

  const handleSaveRename = async (id: number) => {
    if (!editingName.trim()) return;
    await updateBypassProfile(id, { name: editingName.trim() });
    setEditingProfileId(null);
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('このバイパスプロファイルを削除しますか？')) {
      await deleteBypassProfile(id);
      if (activeProfileId === id) {
        setActiveProfileId(null);
      }
    }
  };

  const handleNodeToggle = async (nodeId: string) => {
    if (!activeProfile) return;
    const currentIds = activeProfile.bypassed_node_ids;
    const newIds = currentIds.includes(nodeId)
      ? currentIds.filter((id) => id !== nodeId)
      : [...currentIds, nodeId];
    await updateBypassProfile(activeProfile.id, { bypassed_node_ids: newIds });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-3xl bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-xl p-6 shadow-2xl relative max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-white/5 transition-all"
        >
          <X size={18} />
        </button>

        {/* Title */}
        <h3 className="text-base font-semibold text-zinc-100 mb-5">
          Bypass Settings
        </h3>

        {/* Two Columns Layout */}
        <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
          {/* Left Column: Profiles list */}
          <div className="w-1/2 flex flex-col border-r border-[rgba(255,255,255,0.08)] pr-6 min-h-0">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Profiles
              </span>
              {!isCreating && (
                <button
                  onClick={() => setIsCreating(true)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-white/5 transition-all flex items-center gap-1 text-xs"
                >
                  <Plus size={14} /> Add
                </button>
              )}
            </div>

            {/* Create new profile input */}
            {isCreating && (
              <form onSubmit={handleCreate} className="flex gap-2 mb-3">
                <input
                  ref={newNameInputRef}
                  type="text"
                  placeholder="Profile name..."
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="flex-1 px-2.5 py-1 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
                <button
                  type="submit"
                  className="p-1.5 text-green-400 hover:bg-white/5 rounded"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="p-1.5 text-zinc-400 hover:bg-white/5 rounded"
                >
                  <X size={16} />
                </button>
              </form>
            )}

            {/* Profiles scroll container */}
            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
              {bypassProfiles.length === 0 ? (
                <div className="text-sm text-zinc-500 text-center py-8">
                  No profiles registered.
                </div>
              ) : (
                bypassProfiles.map((p) => {
                  const isActive = p.id === activeProfileId;
                  const isEditing = p.id === editingProfileId;

                  return (
                    <div
                      key={p.id}
                      onClick={() => !isEditing && setActiveProfileId(p.id)}
                      className={`flex justify-between items-center px-3 py-2 rounded-lg cursor-pointer transition-all border ${
                        isActive
                          ? 'bg-zinc-800 border-zinc-650 text-zinc-100'
                          : 'bg-zinc-900/40 border-transparent hover:bg-zinc-800/40 text-zinc-300 hover:text-zinc-100'
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex-1 flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            ref={editNameInputRef}
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(p.id);
                              if (e.key === 'Escape') setEditingProfileId(null);
                            }}
                            className="flex-1 px-2 py-0.5 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-100 focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveRename(p.id)}
                            className="p-1 text-green-400 hover:bg-white/5 rounded"
                          >
                            <Save size={14} />
                          </button>
                          <button
                            onClick={() => setEditingProfileId(null)}
                            className="p-1 text-zinc-400 hover:bg-white/5 rounded"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm truncate font-medium">
                            {p.name}
                          </span>
                          <div className="flex items-center gap-1 opacity-60 hover:opacity-100">
                            <button
                              onClick={(e) => handleStartRename(p.id, p.name, e)}
                              className="p-1 hover:bg-white/5 rounded text-zinc-400 hover:text-zinc-200"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={(e) => handleDelete(p.id, e)}
                              className="p-1 hover:bg-white/5 rounded text-zinc-400 hover:text-red-400"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Node list */}
          <div className="w-1/2 flex flex-col min-h-0">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Bypass Targets
            </span>

            {activeProfile ? (
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0">
                {nodes.length === 0 ? (
                  <div className="text-sm text-zinc-500 text-center py-8">
                    No nodes in current workflow.
                  </div>
                ) : (
                  nodes.map((node) => {
                    const isBypassed = activeProfile.bypassed_node_ids.includes(node.id);

                    return (
                      <label
                        key={node.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all border select-none ${
                          isBypassed
                            ? 'bg-red-950/20 border-red-900/30 text-red-200'
                            : 'bg-zinc-900/20 border-transparent hover:bg-zinc-850/40 text-zinc-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isBypassed}
                          onChange={() => handleNodeToggle(node.id)}
                          className="w-3.5 h-3.5 rounded border-zinc-700 text-red-500 focus:ring-0 focus:ring-offset-0 bg-zinc-900"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {node.title}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate">
                            ID: {node.id} • {node.classType}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">
                Select a profile to configure bypass targets.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 rounded-lg text-sm transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
