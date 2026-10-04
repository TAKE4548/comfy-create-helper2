import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sliders, Layers, Settings, ChevronDown, RefreshCw, Pencil, Copy, Wand2, Trash2, ArrowLeftRight, Undo2 } from 'lucide-react'
import { workflowsApi, workflowPresetsApi, snapshotsApi } from '../../../api/client'
import type { WorkflowSummary, WorkflowPreset, DiffAnalyzeResponse } from '../../../api/types'
import { useConfig } from '../../../hooks/useConfig'
import { resolveComfyUrl } from '../../../hooks/useComfyWebSocket'
import { LS_KEYS } from '../../../utils/localStorageKeys'
import { WorkflowManageModal } from '../../../components/WorkflowManageModal'
import { WorkflowDiffReplaceModal } from '../../../components/WorkflowDiffReplaceModal'
import { PresetManagerPanel } from '../../../components/PresetManagerPanel'
import { ConnectionStatus, WorkflowDeleteConfirmDialog } from '../../../components/SettingsComponents'
import { ServiceConnectionCard } from './ServiceConnectionCard'

export interface WorkflowConnectionSectionProps {
  group?: 'workflows' | 'system'
  showConnections?: boolean
  isExpandedLongPress: boolean
  onToggleLongPress: () => void
  isExpandedWorkflows: boolean
  onToggleWorkflows: () => void
  isExpandedConnections: boolean
  onToggleConnections: () => void
}

export function WorkflowConnectionSection({
  group,
  showConnections = true,
  isExpandedLongPress,
  onToggleLongPress,
  isExpandedWorkflows,
  onToggleWorkflows,
  isExpandedConnections,
  onToggleConnections,
}: WorkflowConnectionSectionProps) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState<string | null>(null)
  const [comfyUrl, setComfyUrl] = useState('http://localhost:8188')
  const [longPressMultiSelect, setLongPressMultiSelect] = useState(0.8)
  const [longPressCardMove, setLongPressCardMove] = useState(0.5)

  // Workflow states
  const [workflowManageMode, setWorkflowManageMode] = useState<'rename' | 'copy' | null>(null)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [expandedPresetWorkflowId, setExpandedPresetWorkflowId] = useState<number | null>(null)
  const [showWorkflowDeleteDialog, setShowWorkflowDeleteDialog] = useState(false)
  const [deleteWorkflowDetails, setDeleteWorkflowDetails] = useState({
    mappings: 0,
    presets: 0,
    snapshots: 0,
  })
  const [isLoadingWorkflowDetails, setIsLoadingWorkflowDetails] = useState(false)

  // Smart Diff & Rollback states
  const [diffReplaceModalOpen, setDiffReplaceModalOpen] = useState(false)
  const [diffTargetWorkflow, setDiffTargetWorkflow] = useState<WorkflowSummary | null>(null)
  const [diffResult, setDiffResult] = useState<DiffAnalyzeResponse | null>(null)
  const [newWorkflowJson, setNewWorkflowJson] = useState<Record<string, unknown> | null>(null)
  const [isReplacing, setIsReplacing] = useState(false)
  const [hasRollbackMap, setHasRollbackMap] = useState<Record<number, boolean>>({})
  const diffFileInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingDiffWorkflow, setPendingDiffWorkflow] = useState<WorkflowSummary | null>(null)

  const { data: config } = useConfig()

  useEffect(() => {
    if (config?.comfy_url) {
      setComfyUrl(config.comfy_url)
    }
  }, [config])

  useEffect(() => {
    let msStored: string | null = null
    let cmStored: string | null = null
    try {
      msStored = localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_MULTI_SELECT)
    } catch {
      // Keep the in-memory default when browser storage is unavailable.
    }
    try {
      cmStored = localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_CARD_MOVE)
    } catch {
      // Keep the in-memory default when browser storage is unavailable.
    }
    const msParsed = msStored !== null ? parseFloat(msStored) : NaN
    const cmParsed = cmStored !== null ? parseFloat(cmStored) : NaN
    if (!isNaN(msParsed)) setLongPressMultiSelect(msParsed)
    if (!isNaN(cmParsed)) setLongPressCardMove(cmParsed)
  }, [])

  const { data: workflows, isLoading: isLoadingWorkflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list() as Promise<WorkflowSummary[]>,
    enabled: group !== 'system',
  })

  const { data: workflowPresets } = useQuery({
    queryKey: ['workflow-presets', expandedPresetWorkflowId],
    queryFn: () => workflowPresetsApi.list(expandedPresetWorkflowId!) as Promise<WorkflowPreset[]>,
    enabled: group !== 'system' && !!expandedPresetWorkflowId,
  })

  // Fetch deletion metadata
  useEffect(() => {
    if (group === 'system' || !showWorkflowDeleteDialog || !selectedWorkflowId) return
    let active = true
    setIsLoadingWorkflowDetails(true)

    Promise.all([
      workflowsApi.get(selectedWorkflowId),
      workflowPresetsApi.list(selectedWorkflowId),
      snapshotsApi.list(selectedWorkflowId),
    ])
      .then(([wf, presets, snapshots]: [any, any, any]) => {
        if (active) {
          setDeleteWorkflowDetails({
            mappings: wf.mappings?.length || 0,
            presets: presets?.length || 0,
            snapshots: snapshots?.length || 0,
          })
          setIsLoadingWorkflowDetails(false)
        }
      })
      .catch((err) => {
        console.error(err)
        if (active) setIsLoadingWorkflowDetails(false)
      })

    return () => {
      active = false
    }
  }, [group, showWorkflowDeleteDialog, selectedWorkflowId])

  // Fetch rollback history statuses for workflows
  useEffect(() => {
    if (group === 'system' || !workflows || workflows.length === 0) return
    let active = true
    Promise.all(
      workflows.map((wf) =>
        workflowsApi
          .getHistoryStatus(wf.id)
          .then((res) => ({ id: wf.id, has_rollback: res.has_rollback }))
          .catch(() => ({ id: wf.id, has_rollback: false }))
      )
    ).then((results) => {
      if (active) {
        const map: Record<number, boolean> = {}
        results.forEach((r) => {
          map[r.id] = r.has_rollback
        })
        setHasRollbackMap(map)
      }
    })
    return () => {
      active = false
    }
  }, [group, workflows])

  const handleOpenDiffFilePicker = (wf: WorkflowSummary) => {
    setPendingDiffWorkflow(wf)
    if (diffFileInputRef.current) {
      diffFileInputRef.current.value = ''
      diffFileInputRef.current.click()
    }
  }

  const handleDiffFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !pendingDiffWorkflow) return

    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const res = await workflowsApi.diffAnalyze(pendingDiffWorkflow.id, json)
      setDiffTargetWorkflow(pendingDiffWorkflow)
      setNewWorkflowJson(json)
      setDiffResult(res)
      setDiffReplaceModalOpen(true)
    } catch (err: any) {
      alert(`差分解析エラー: ${err.message || err}`)
    }
  }

  const handleConfirmDiffReplace = async (
    customMappings: { master_id: number; node_id: string }[]
  ) => {
    if (!diffTargetWorkflow || !newWorkflowJson) return
    setIsReplacing(true)
    try {
      await workflowsApi.update(diffTargetWorkflow.id, {
        json_body: newWorkflowJson,
        mappings: customMappings,
      })
      await qc.invalidateQueries({ queryKey: ['workflows'] })
      setHasRollbackMap((prev) => ({ ...prev, [diffTargetWorkflow.id]: true }))
      setDiffReplaceModalOpen(false)
    } catch (err: any) {
      alert(`置換エラー: ${err.message || err}`)
    } finally {
      setIsReplacing(false)
    }
  }

  const handleRollback = async (workflowId: number) => {
    if (!window.confirm('直前のワークフロー状態にロールバックしますか？')) return
    try {
      await workflowsApi.rollback(workflowId)
      await qc.invalidateQueries({ queryKey: ['workflows'] })
      setHasRollbackMap((prev) => ({ ...prev, [workflowId]: false }))
    } catch (err: any) {
      alert(`ロールバックエラー: ${err.message || err}`)
    }
  }

  // Workflow mutations
  const renameWorkflowMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => workflowsApi.update(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      setWorkflowManageMode(null)
      setSelectedWorkflowId(null)
    },
  })

  const copyWorkflowMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => workflowsApi.copy(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      setWorkflowManageMode(null)
      setSelectedWorkflowId(null)
    },
  })

  const deleteWorkflowMutation = useMutation({
    mutationFn: (id: number) => workflowsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      setShowWorkflowDeleteDialog(false)
      setSelectedWorkflowId(null)
    },
  })

  // Preset mutations
  const renamePresetMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      workflowPresetsApi.update(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', expandedPresetWorkflowId] })
    },
  })

  const reorderPresetsMutation = useMutation({
    mutationFn: (ordered_ids: number[]) => workflowPresetsApi.reorder(ordered_ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', expandedPresetWorkflowId] })
    },
  })

  const handleLongPressChange = (key: 'multi-select' | 'card-move', value: number) => {
    if (key === 'multi-select') {
      setLongPressMultiSelect(value)
    } else {
      setLongPressCardMove(value)
    }
    try {
      localStorage.setItem(
        key === 'multi-select'
          ? LS_KEYS.LONG_PRESS_DELAY_MULTI_SELECT
          : LS_KEYS.LONG_PRESS_DELAY_CARD_MOVE,
        String(value),
      )
      setSaved('longpress')
    } catch {
      // Keep the updated in-memory value when browser storage is unavailable.
      setSaved(null)
    }
    setTimeout(() => setSaved(null), 2000)
  }

  return (
    <>
      {/* Long Press Sensitivity */}
      {group !== 'workflows' && <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
        {group === 'system' ? (
          <div className="flex items-center justify-between px-4 py-3.5 bg-surface">
            <div className="flex items-center gap-2">
              <Sliders size={15} className="text-[#7C6FDD]" />
              <h2 className="text-sm font-semibold text-zinc-300">長押し感度設定（アプリ全体）</h2>
              <span className="text-xs text-zinc-600">— ブラウザ（LocalStorage）に保存</span>
            </div>
            {saved === 'longpress' && <span className="text-xs text-accent-green">✓ 保存しました</span>}
          </div>
        ) : (
        <div
          onClick={onToggleLongPress}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Sliders size={15} className="text-[#7C6FDD]" />
            <h2 className="text-sm font-semibold text-zinc-300">長押し感度設定（アプリ全体）</h2>
            <span className="text-xs text-zinc-600">— ブラウザ（LocalStorage）に保存</span>
          </div>
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {saved === 'longpress' && (
              <span className="text-xs text-accent-green">✓ 保存しました</span>
            )}
            <ChevronDown
              size={16}
              className={`text-zinc-500 transition-transform duration-200 ${
                isExpandedLongPress ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>
        )}
        {(group === 'system' || isExpandedLongPress) && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-zinc-300">履歴の複数選択長押し時間</label>
                <span className="text-xs font-mono text-[#7C6FDD]">
                  {longPressMultiSelect.toFixed(1)}s
                </span>
              </div>
              <input
                id="settings-longpress-multiselect"
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={longPressMultiSelect}
                onChange={(e) => handleLongPressChange('multi-select', parseFloat(e.target.value))}
                className="w-full accent-[#7C6FDD]"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>0.1s（敏感）</span>
                <span>5.0s（鈍感）</span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-zinc-300">カード移動の長押し時間</label>
                <span className="text-xs font-mono text-[#7C6FDD]">
                  {longPressCardMove.toFixed(1)}s
                </span>
              </div>
              <input
                id="settings-longpress-cardmove"
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={longPressCardMove}
                onChange={(e) => handleLongPressChange('card-move', parseFloat(e.target.value))}
                className="w-full accent-[#7C6FDD]"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>0.1s（敏感）</span>
                <span>5.0s（鈍感）</span>
              </div>
            </div>
          </div>
        )}
      </section>
      }

      {/* Workflows Section */}
      {group !== 'system' && <>
      <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={onToggleWorkflows}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans"
        >
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-300">ワークフロー管理</h2>
          </div>
          <ChevronDown
            size={16}
            className={`text-zinc-500 transition-transform duration-200 ${
              isExpandedWorkflows ? 'rotate-180' : ''
            }`}
          />
        </button>
        {isExpandedWorkflows && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30">
            {isLoadingWorkflows ? (
              <div className="flex items-center gap-2 text-zinc-600 text-xs py-4">
                <RefreshCw size={12} className="animate-spin" />
                ワークフローを読み込み中...
              </div>
            ) : (
              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden">
                <div className="divide-y divide-[rgba(255,255,255,0.04)]">
                  {workflows?.map((wf) => {
                    const isExpanded = expandedPresetWorkflowId === wf.id
                    return (
                      <div key={wf.id} className="flex flex-col">
                        <div className="flex items-center justify-between p-4 hover:bg-white/[0.01] transition-colors">
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-zinc-200 block truncate">
                              {wf.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">
                              作成日: {new Date(wf.created_at).toLocaleString('ja-JP')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedWorkflowId(wf.id)
                                setWorkflowManageMode('rename')
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-medium transition-all"
                              title="名前を変更"
                            >
                              <Pencil size={11} />
                              名前変更
                            </button>
                            <button
                              onClick={() => {
                                setSelectedWorkflowId(wf.id)
                                setWorkflowManageMode('copy')
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-medium transition-all"
                              title="コピーを作成"
                            >
                              <Copy size={11} />
                              コピー
                            </button>
                            <button
                              onClick={() => handleOpenDiffFilePicker(wf)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-accent-green/30 bg-accent-green/10 hover:bg-accent-green/20 text-accent-green text-[10px] font-medium transition-all"
                              title="新ワークフローJSONとのスマート差分置換"
                            >
                              <ArrowLeftRight size={11} />
                              スマート置換
                            </button>
                            {hasRollbackMap[wf.id] && (
                              <button
                                onClick={() => handleRollback(wf.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] font-medium transition-all"
                                title="直前のワークフロー状態へ復元"
                              >
                                <Undo2 size={11} />
                                ロールバック
                              </button>
                            )}
                            <button
                              onClick={() =>
                                setExpandedPresetWorkflowId(isExpanded ? null : wf.id)
                              }
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-all ${
                                isExpanded
                                  ? 'border-[#7C6FDD] bg-[#7C6FDD]/10 text-[#7C6FDD]'
                                  : 'border-[rgba(255,255,255,0.08)] bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                              }`}
                              title="プリセット管理"
                            >
                              <Wand2 size={11} />
                              プロファイル管理
                            </button>
                            <button
                              onClick={() => {
                                setSelectedWorkflowId(wf.id)
                                setShowWorkflowDeleteDialog(true)
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-650 hover:text-white text-red-400 text-[10px] font-medium transition-all"
                              title="削除"
                            >
                              <Trash2 size={11} />
                              削除
                            </button>
                          </div>
                        </div>

                        {/* Inline Preset Manager Panel */}
                        {isExpanded && (
                          <div className="px-5 py-4 bg-zinc-950 border-t border-[rgba(255,255,255,0.04)] animate-fade-in">
                            <PresetManagerPanel
                              presets={workflowPresets || []}
                              onRename={async (pid, pName) => {
                                await renamePresetMutation.mutateAsync({ id: pid, name: pName })
                              }}
                              onReorder={async (ordered_ids) => {
                                await reorderPresetsMutation.mutateAsync(ordered_ids)
                              }}
                              isPending={
                                renamePresetMutation.isPending || reorderPresetsMutation.isPending
                              }
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {(!workflows || workflows.length === 0) && (
                    <div className="px-4 py-8 text-center text-xs text-zinc-500">
                      登録されているワークフローはありません。
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      </>}

      {/* Connections */}
      {group === 'system' ? (showConnections && <ServiceConnectionCard />) : group !== 'workflows' && <>
      <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={onToggleConnections}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans"
        >
          <div className="flex items-center gap-2">
            <Settings size={15} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-300">Connections</h2>
          </div>
          <ChevronDown
            size={16}
            className={`text-zinc-500 transition-transform duration-200 ${
              isExpandedConnections ? 'rotate-180' : ''
            }`}
          />
        </button>
        {isExpandedConnections && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-3">
            {[
              { label: 'FastAPI Backend', url: `${window.location.origin}/health` },
              { label: 'ComfyUI', url: resolveComfyUrl(comfyUrl) },
            ].map(({ label, url }) => (
              <ConnectionStatus key={label} label={label} url={url} />
            ))}
          </div>
        )}
      </section>
      </>}

      {group !== 'system' && workflowManageMode && selectedWorkflowId && (
        <WorkflowManageModal
          mode={workflowManageMode}
          currentName={workflows?.find((w) => w.id === selectedWorkflowId)?.name || ''}
          onSubmit={async (newName) => {
            if (workflowManageMode === 'rename') {
              await renameWorkflowMutation.mutateAsync({ id: selectedWorkflowId, name: newName })
            } else {
              await copyWorkflowMutation.mutateAsync({ id: selectedWorkflowId, name: newName })
            }
          }}
          onClose={() => {
            setWorkflowManageMode(null)
            setSelectedWorkflowId(null)
          }}
          isPending={renameWorkflowMutation.isPending || copyWorkflowMutation.isPending}
        />
      )}

      {group !== 'system' && showWorkflowDeleteDialog && selectedWorkflowId && (
        <WorkflowDeleteConfirmDialog
          workflowName={workflows?.find((w) => w.id === selectedWorkflowId)?.name || ''}
          isPending={deleteWorkflowMutation.isPending}
          onClose={() => {
            setShowWorkflowDeleteDialog(false)
            setSelectedWorkflowId(null)
          }}
          onConfirm={() => deleteWorkflowMutation.mutate(selectedWorkflowId)}
          mappingsCount={deleteWorkflowDetails.mappings}
          presetsCount={deleteWorkflowDetails.presets}
          snapshotsCount={deleteWorkflowDetails.snapshots}
          isLoadingDetails={isLoadingWorkflowDetails}
        />
      )}

      {group !== 'system' && <input
        ref={diffFileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleDiffFileSelected}
      />}

      {group !== 'system' && diffReplaceModalOpen && diffTargetWorkflow && (
        <WorkflowDiffReplaceModal
          isOpen={diffReplaceModalOpen}
          onClose={() => setDiffReplaceModalOpen(false)}
          workflowId={diffTargetWorkflow.id}
          workflowName={diffTargetWorkflow.name}
          diffResult={diffResult}
          onConfirm={handleConfirmDiffReplace}
          isSubmitting={isReplacing}
        />
      )}
    </>
  )
}
