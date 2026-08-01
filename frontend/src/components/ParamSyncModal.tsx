import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Edit2, Trash2, Check, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { useGenerationStore } from '../store/useGenerationStore';
import { mappingMastersApi, workflowsApi } from '../api/client';
import type { MappingMaster, Workflow } from '../api/types';

export interface ParamSyncModalProps {
  onClose: () => void;
}

export function ParamSyncModal({ onClose }: ParamSyncModalProps) {
  const {
    selectedWorkflowId,
    paramSyncGroups,
    fetchParamSyncGroups,
    createParamSyncGroup,
    updateParamSyncGroup,
    deleteParamSyncGroup,
    toggleParamSyncGroup,
  } = useGenerationStore();

  const [mappingMasters, setMappingMasters] = useState<MappingMaster[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);

  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newMasterRole, setNewMasterRole] = useState('');
  
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const newNameInputRef = useRef<HTMLInputElement>(null);
  const editNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedWorkflowId !== null) {
      fetchParamSyncGroups(selectedWorkflowId);
      workflowsApi.get(selectedWorkflowId).then((wf: any) => {
        setActiveWorkflow(wf);
      }).catch(console.error);
    }
    mappingMastersApi.list().then((masters: any) => {
      setMappingMasters(masters);
    }).catch(console.error);
  }, [selectedWorkflowId, fetchParamSyncGroups]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (isCreating) {
      newNameInputRef.current?.focus();
    }
  }, [isCreating]);

  useEffect(() => {
    if (editingGroupId !== null) {
      editNameInputRef.current?.focus();
      editNameInputRef.current?.select();
    }
  }, [editingGroupId]);

  // Active workflow mapped roles
  const workflowMappedRoles = activeWorkflow?.mappings
    ? activeWorkflow.mappings
        .map((m) => m.role)
        .filter((r): r is string => Boolean(r))
    : [];

  // Mapped roles details (role -> MappingMaster)
  const roleMasterMap = new Map<string, MappingMaster>();
  mappingMasters.forEach((m) => {
    roleMasterMap.set(m.role, m);
  });

  const activeGroup = paramSyncGroups.find((g) => g.id === activeGroupId) || null;

  // Selected master role details
  const currentMasterRole = activeGroup?.master_role || newMasterRole;
  const currentMasterMaster = roleMasterMap.get(currentMasterRole);
  const masterInputType = currentMasterMaster?.input_type;

  // Available slave candidate roles: mapped in workflow, not master, same input_type
  const slaveCandidateRoles = workflowMappedRoles.filter((role) => {
    if (role === currentMasterRole) return false;
    const m = roleMasterMap.get(role);
    if (!m || !masterInputType) return false;
    return m.input_type === masterInputType;
  });

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !newMasterRole || selectedWorkflowId === null) return;
    const created = await createParamSyncGroup(selectedWorkflowId, {
      name: newGroupName.trim(),
      master_role: newMasterRole,
      slave_roles: [],
      is_enabled: true,
    });
    setNewGroupName('');
    setNewMasterRole('');
    setIsCreating(false);
    setActiveGroupId(created.id);
  };

  const handleStartRename = (id: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGroupId(id);
    setEditingName(name);
  };

  const handleSaveRename = async (id: number) => {
    if (!editingName.trim()) return;
    await updateParamSyncGroup(id, { name: editingName.trim() });
    setEditingGroupId(null);
  };

  const handleDeleteGroup = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('このパラメータ同期グループを削除しますか？')) {
      await deleteParamSyncGroup(id);
      if (activeGroupId === id) {
        setActiveGroupId(null);
      }
    }
  };

  const handleSlaveToggle = async (slaveRole: string) => {
    if (!activeGroup) return;
    const currentSlaves = activeGroup.slave_roles;
    const newSlaves = currentSlaves.includes(slaveRole)
      ? currentSlaves.filter((r) => r !== slaveRole)
      : [...currentSlaves, slaveRole];
    await updateParamSyncGroup(activeGroup.id, { slave_roles: newSlaves });
  };

  const handleMasterChange = async (newMaster: string) => {
    if (!activeGroup) return;
    const newMasterMaster = roleMasterMap.get(newMaster);
    const newType = newMasterMaster?.input_type;
    // Filter slave roles to only those matching new input_type
    const validSlaves = activeGroup.slave_roles.filter((r) => {
      const m = roleMasterMap.get(r);
      return m && m.input_type === newType && r !== newMaster;
    });
    await updateParamSyncGroup(activeGroup.id, {
      master_role: newMaster,
      slave_roles: validSlaves,
    });
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
          Parameter Sync Settings
        </h3>

        {/* Two Columns Layout */}
        <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
          {/* Left Column: Groups List */}
          <div className="w-1/2 flex flex-col border-r border-[rgba(255,255,255,0.08)] pr-6 min-h-0">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Sync Groups
              </span>
              {!isCreating && (
                <button
                  onClick={() => {
                    setIsCreating(true);
                    setNewMasterRole(workflowMappedRoles[0] || '');
                  }}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-white/5 transition-all flex items-center gap-1 text-xs"
                >
                  <Plus size={14} /> Add Group
                </button>
              )}
            </div>

            {/* Create new group form */}
            {isCreating && (
              <form onSubmit={handleCreateGroup} className="flex flex-col gap-2 mb-3 p-2.5 bg-zinc-900/60 rounded-lg border border-zinc-700/50">
                <input
                  ref={newNameInputRef}
                  type="text"
                  placeholder="Group name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="px-2.5 py-1 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Master Role:</span>
                  <select
                    value={newMasterRole}
                    onChange={(e) => setNewMasterRole(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none"
                  >
                    {workflowMappedRoles.map((role) => (
                      <option key={role} value={role}>
                        {roleMasterMap.get(role)?.display_name || role} ({role})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-1.5 mt-1">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-2.5 py-1 text-xs text-zinc-400 hover:bg-white/5 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs bg-accent-primary text-white hover:bg-accent-primary-hover rounded flex items-center gap-1"
                  >
                    <Check size={14} /> Create
                  </button>
                </div>
              </form>
            )}

            {/* Groups list */}
            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
              {paramSyncGroups.length === 0 ? (
                <div className="text-sm text-zinc-500 text-center py-8">
                  No sync groups registered.
                </div>
              ) : (
                paramSyncGroups.map((g) => {
                  const isActive = g.id === activeGroupId;
                  const isEditing = g.id === editingGroupId;
                  const masterDisp = roleMasterMap.get(g.master_role)?.display_name || g.master_role;

                  return (
                    <div
                      key={g.id}
                      onClick={() => !isEditing && setActiveGroupId(g.id)}
                      className={`flex justify-between items-center px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${
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
                              if (e.key === 'Enter') handleSaveRename(g.id);
                              if (e.key === 'Escape') setEditingGroupId(null);
                            }}
                            className="flex-1 px-2 py-0.5 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-100 focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveRename(g.id)}
                            className="p-1 text-green-400 hover:bg-white/5 rounded"
                          >
                            <Save size={14} />
                          </button>
                          <button
                            onClick={() => setEditingGroupId(null)}
                            className="p-1 text-zinc-400 hover:bg-white/5 rounded"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm truncate font-medium">
                                {g.name}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleParamSyncGroup(g.id, !g.is_enabled);
                                }}
                                className={`text-xs p-0.5 rounded transition-colors ${
                                  g.is_enabled ? 'text-green-400' : 'text-zinc-500'
                                }`}
                                title={g.is_enabled ? 'Enabled' : 'Disabled'}
                              >
                                {g.is_enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                              </button>
                            </div>
                            <div className="text-[11px] text-zinc-400 truncate">
                              Master: {masterDisp} ({g.slave_roles.length} slaves)
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-60 hover:opacity-100">
                            <button
                              onClick={(e) => handleStartRename(g.id, g.name, e)}
                              className="p-1 hover:bg-white/5 rounded text-zinc-400 hover:text-zinc-200"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteGroup(g.id, e)}
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

          {/* Right Column: Group configuration */}
          <div className="w-1/2 flex flex-col min-h-0">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Group Configuration
            </span>

            {activeGroup ? (
              <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 min-h-0">
                {/* Master role selector */}
                <div className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-800">
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Master Role (主項目)
                  </label>
                  <select
                    value={activeGroup.master_role}
                    onChange={(e) => handleMasterChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none"
                  >
                    {workflowMappedRoles.map((role) => (
                      <option key={role} value={role}>
                        {roleMasterMap.get(role)?.display_name || role} ({role})
                      </option>
                    ))}
                  </select>
                  {masterInputType && (
                    <div className="text-[11px] text-zinc-500 mt-1">
                      Type: <span className="text-zinc-300">{masterInputType}</span>
                    </div>
                  )}
                </div>

                {/* Slave roles selector */}
                <div className="flex-1 flex flex-col min-h-0">
                  <span className="text-xs font-medium text-zinc-400 mb-2">
                    Slave Roles (同期先項目 - 型一致のみ)
                  </span>
                  <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0">
                    {slaveCandidateRoles.length === 0 ? (
                      <div className="text-xs text-zinc-500 text-center py-6">
                        No matching parameters found with same input type ({masterInputType}).
                      </div>
                    ) : (
                      slaveCandidateRoles.map((role) => {
                        const isSlave = activeGroup.slave_roles.includes(role);
                        const masterObj = roleMasterMap.get(role);
                        const dispName = masterObj?.display_name || role;

                        return (
                          <label
                            key={role}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all border select-none ${
                              isSlave
                                ? 'bg-accent-primary/10 border-accent-primary/30 text-zinc-100'
                                : 'bg-zinc-900/20 border-transparent hover:bg-zinc-850/40 text-zinc-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSlave}
                              onChange={() => handleSlaveToggle(role)}
                              className="w-3.5 h-3.5 rounded border-zinc-700 text-accent-primary focus:ring-0 focus:ring-offset-0 bg-zinc-900"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {dispName}
                              </div>
                              <div className="text-[10px] text-zinc-500 truncate">
                                Role: {role}
                              </div>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">
                Select a sync group to configure parameters.
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
