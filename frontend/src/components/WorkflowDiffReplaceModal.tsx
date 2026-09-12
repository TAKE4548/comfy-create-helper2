import { useState, useEffect, useMemo } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-react'
import { Modal } from './common/Modal'
import type { DiffAnalyzeResponse, RoleMigration } from '../api/types'

export interface WorkflowDiffReplaceModalProps {
  isOpen: boolean
  onClose: () => void
  workflowId: number
  workflowName: string
  diffResult: DiffAnalyzeResponse | null
  onConfirm: (customMappings: { master_id: number; node_id: string }[]) => Promise<void> | void
  isSubmitting?: boolean
}

export function WorkflowDiffReplaceModal({
  isOpen,
  onClose,
  workflowId: _workflowId,
  workflowName,
  diffResult,
  onConfirm,
  isSubmitting = false,
}: WorkflowDiffReplaceModalProps) {
  const [roleMigrations, setRoleMigrations] = useState<RoleMigration[]>([])
  const [selectedRoleIndex, setSelectedRoleIndex] = useState<number>(0)

  // Initialize or reset migrations when diffResult changes
  useEffect(() => {
    if (diffResult?.role_migrations) {
      setRoleMigrations([...diffResult.role_migrations])
      setSelectedRoleIndex(0)
    } else {
      setRoleMigrations([])
      setSelectedRoleIndex(0)
    }
  }, [diffResult])

  const selectedMigration: RoleMigration | undefined = roleMigrations[selectedRoleIndex]

  // Available new nodes map for dropdown selection
  const allNewNodes = useMemo(() => {
    const list: Array<{ node_id: string; title: string; class_type: string }> = []
    if (!diffResult) return list

    // Collect from candidates and unmapped new nodes
    const seen = new Set<string>()
    diffResult.role_migrations.forEach((rm) => {
      rm.candidates.forEach((c) => {
        if (!seen.has(c.node_id)) {
          seen.add(c.node_id)
          list.push({ node_id: c.node_id, title: c.title, class_type: c.class_type })
        }
      })
      if (rm.new_topology && !seen.has(rm.new_topology.node_id)) {
        seen.add(rm.new_topology.node_id)
        list.push({
          node_id: rm.new_topology.node_id,
          title: rm.new_topology.title,
          class_type: rm.new_topology.class_type,
        })
      }
    })
    diffResult.unmapped_new_nodes.forEach((un) => {
      if (!seen.has(un.node_id)) {
        seen.add(un.node_id)
        list.push(un)
      }
    })
    return list.sort((a, b) => {
      const numA = parseInt(a.node_id, 10)
      const numB = parseInt(b.node_id, 10)
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB
      return a.node_id.localeCompare(b.node_id)
    })
  }, [diffResult])

  // Handle manual dropdown node assignment
  const handleAssignNode = (index: number, newNodeId: string | null) => {
    setRoleMigrations((prev) => {
      const updated = [...prev]
      const current = { ...updated[index] }
      current.new_node_id = newNodeId

      if (newNodeId === null) {
        current.status = 'not_found'
        current.confidence = 0
        current.reason = '手動で割当なしに設定されました'
        current.new_topology = null
      } else {
        // Find matching candidate
        const cand = current.candidates.find((c) => c.node_id === newNodeId)
        if (cand) {
          current.confidence = cand.score
          current.reason = `手動割当: 類似度 ${cand.score}点`
        } else {
          current.confidence = 50.0
          current.reason = `手動割当: ノード #${newNodeId}`
        }

        if (newNodeId === current.old_node_id) {
          current.status = 'ok'
        } else {
          current.status = 'reindexed'
        }

        // Locate new topology if available
        const foundTopo = diffResult?.role_migrations.find(
          (rm) => rm.new_topology?.node_id === newNodeId
        )?.new_topology
        current.new_topology = foundTopo || null
      }

      updated[index] = current
      return updated
    })
  }

  // Validation: all roles must have a non-null new_node_id (AC-5)
  const hasUnmappedRequiredRole = useMemo(() => {
    return roleMigrations.some((rm) => rm.new_node_id === null || rm.new_node_id === '')
  }, [roleMigrations])

  const handleConfirm = () => {
    if (hasUnmappedRequiredRole || isSubmitting) return
    const customMappings = roleMigrations
      .filter((rm) => rm.new_node_id !== null)
      .map((rm) => ({
        master_id: rm.master_id,
        node_id: rm.new_node_id as string,
      }))
    onConfirm(customMappings)
  }

  if (!isOpen || !diffResult) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="5xl" closeOnBackdropClick={false}>
      <div className="flex flex-col h-[85vh] max-h-[900px]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-500" />
              ワークフロー置換の差分レビュー
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              対象ワークフロー: <span className="font-medium text-zinc-700 dark:text-zinc-300">{workflowName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Badges and Warnings */}
        <div className="px-6 py-3 bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-200 dark:border-zinc-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium">
              全役割: {roleMigrations.length}件
            </span>
            {diffResult.summary.ok !== undefined && diffResult.summary.ok > 0 && (
              <span className="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 完全一致: {diffResult.summary.ok}
              </span>
            )}
            {diffResult.summary.reindexed !== undefined && diffResult.summary.reindexed > 0 && (
              <span className="px-2.5 py-1 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 font-medium">
                ID変更: {diffResult.summary.reindexed}
              </span>
            )}
            {diffResult.summary.renamed !== undefined && diffResult.summary.renamed > 0 && (
              <span className="px-2.5 py-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium">
                改名: {diffResult.summary.renamed}
              </span>
            )}
            {diffResult.summary.false_reuse !== undefined && diffResult.summary.false_reuse > 0 && (
              <span className="px-2.5 py-1 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> 不正再利用警告: {diffResult.summary.false_reuse}
              </span>
            )}
            {diffResult.summary.not_found !== undefined && diffResult.summary.not_found > 0 && (
              <span className="px-2.5 py-1 rounded bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 font-medium flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> 未検出: {diffResult.summary.not_found}
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            ※ 表の行をクリックすると下段にトポロジー詳細が表示されます
          </div>
        </div>

        {/* Bypass Warnings Banner if any */}
        {diffResult.bypass_warnings && diffResult.bypass_warnings.length > 0 && (
          <div className="px-6 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex flex-col gap-1">
            {diffResult.bypass_warnings.map((bw, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>
                  【バイパス警告】プロファイル「{bw.profile_name}」: {bw.warning || `ノード #${bw.node_id} が新ワークフローに存在しません`}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Modal Main Body (Split Vertical Layout) */}
        <div className="flex-1 flex flex-col min-h-0 divide-y divide-zinc-200 dark:divide-zinc-700">
          {/* Top Section: Master Table */}
          <div className="flex-1 overflow-y-auto min-h-[180px] max-h-[45%]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold select-none z-10 shadow-sm">
                <tr>
                  <th className="py-2.5 px-3 border-b border-zinc-200 dark:border-zinc-700 w-10 text-center">#</th>
                  <th className="py-2.5 px-4 border-b border-zinc-200 dark:border-zinc-700">役割 (Role)</th>
                  <th className="py-2.5 px-4 border-b border-zinc-200 dark:border-zinc-700">旧ノード</th>
                  <th className="py-2.5 px-4 border-b border-zinc-200 dark:border-zinc-700">判定ステータス</th>
                  <th className="py-2.5 px-4 border-b border-zinc-200 dark:border-zinc-700 min-w-[200px]">新ノード割当</th>
                  <th className="py-2.5 px-4 border-b border-zinc-200 dark:border-zinc-700 w-24 text-center">信頼度</th>
                  <th className="py-2.5 px-4 border-b border-zinc-200 dark:border-zinc-700">推測理由</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {roleMigrations.map((rm, idx) => {
                  const isSelected = idx === selectedRoleIndex
                  return (
                    <tr
                      key={rm.master_id}
                      onClick={() => setSelectedRoleIndex(idx)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50/80 dark:bg-blue-950/40 ring-1 ring-inset ring-blue-500/50'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center text-zinc-400 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-zinc-800 dark:text-zinc-200">{rm.display_name}</div>
                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">{rm.role}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-zinc-600 dark:text-zinc-400">
                        #{rm.old_node_id}
                        {rm.old_topology && (
                          <span className="text-[11px] text-zinc-400 ml-1">({rm.old_topology.class_type})</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusBadge status={rm.status} />
                      </td>
                      <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={rm.new_node_id || ''}
                          onChange={(e) => handleAssignNode(idx, e.target.value === '' ? null : e.target.value)}
                          className={`w-full text-xs rounded border px-2 py-1.5 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 ${
                            rm.new_node_id === null
                              ? 'border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 focus:ring-rose-500'
                              : 'border-zinc-300 dark:border-zinc-600 text-zinc-800 dark:text-zinc-200 focus:ring-blue-500'
                          }`}
                        >
                          <option value="">-- 未割当 (None) --</option>
                          {rm.candidates.length > 0 && (
                            <optgroup label="推測候補 (Candidates)">
                              {rm.candidates.map((c) => (
                                <option key={`c-${c.node_id}`} value={c.node_id}>
                                  #{c.node_id}: {c.title} ({c.class_type}) - {c.score}点
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="全ノード一覧 (All Nodes)">
                            {allNewNodes.map((n) => (
                              <option key={`all-${n.node_id}`} value={n.node_id}>
                                #{n.node_id}: {n.title} ({n.class_type})
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`font-semibold font-mono text-xs px-2 py-0.5 rounded ${
                            rm.confidence >= 80
                              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                              : rm.confidence >= 50
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                              : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {rm.confidence.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-zinc-600 dark:text-zinc-400 max-w-[240px] truncate" title={rm.reason}>
                        {rm.reason}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Section: Detail Topology Inspector (AC-3) */}
          <div className="flex-1 overflow-y-auto p-4 bg-zinc-50/60 dark:bg-zinc-900/50 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-blue-500" />
                トポロジー詳細インスペクター:
                {selectedMigration ? (
                  <span className="text-blue-600 dark:text-blue-400 font-bold ml-1">
                    {selectedMigration.display_name} (#{selectedMigration.old_node_id} → #{selectedMigration.new_node_id || '未割当'})
                  </span>
                ) : (
                  <span className="text-zinc-400 font-normal">役割が選択されていません</span>
                )}
              </h3>
              {selectedMigration && (
                <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  スコア: {selectedMigration.confidence.toFixed(1)}点 ({selectedMigration.status})
                </div>
              )}
            </div>

            {selectedMigration ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                {/* Old Topology Card */}
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-3.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-700 pb-2">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-zinc-400" />
                      旧ワークフロー接続 (Old)
                    </span>
                    <span className="text-xs font-mono text-zinc-500">
                      ID: #{selectedMigration.old_node_id}
                    </span>
                  </div>
                  {selectedMigration.old_topology ? (
                    <div className="flex flex-col gap-2 text-xs">
                      <div>
                        <div className="text-[11px] text-zinc-400">ノードタイトル / クラス</div>
                        <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {selectedMigration.old_topology.title}
                        </div>
                        <div className="text-zinc-500 font-mono text-[11px]">
                          {selectedMigration.old_topology.class_type}
                        </div>
                      </div>

                      <div className="mt-1">
                        <div className="text-[11px] font-medium text-zinc-500 mb-1">
                          入力配線 (Inputs: {selectedMigration.old_topology.inputs.length}本):
                        </div>
                        <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1">
                          {selectedMigration.old_topology.inputs.length === 0 ? (
                            <span className="text-zinc-400 italic">なし (ソースノード)</span>
                          ) : (
                            selectedMigration.old_topology.inputs.map((inp, i) => (
                              <div key={i} className="flex items-center gap-1.5 font-mono text-[11px] bg-zinc-100 dark:bg-zinc-700/50 px-2 py-1 rounded">
                                <span className="text-blue-500 font-medium">{inp.slot}</span>
                                <ArrowRight className="w-3 h-3 text-zinc-400" />
                                <span className="text-zinc-600 dark:text-zinc-300">
                                  #{inp.source_node_id} ({inp.source_class})
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="mt-1">
                        <div className="text-[11px] font-medium text-zinc-500 mb-1">
                          出力配線 (Outputs: {selectedMigration.old_topology.outputs.length}本):
                        </div>
                        <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1">
                          {selectedMigration.old_topology.outputs.length === 0 ? (
                            <span className="text-zinc-400 italic">なし (シンクノード)</span>
                          ) : (
                            selectedMigration.old_topology.outputs.map((out, i) => (
                              <div key={i} className="flex items-center gap-1.5 font-mono text-[11px] bg-zinc-100 dark:bg-zinc-700/50 px-2 py-1 rounded">
                                <span className="text-emerald-500 font-medium">{out.slot}</span>
                                <ArrowRight className="w-3 h-3 text-zinc-400" />
                                <span className="text-zinc-600 dark:text-zinc-300">
                                  #{out.target_node_id} ({out.target_class})
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-400 italic py-4 text-center">
                      旧トポロジー情報がありません
                    </div>
                  )}
                </div>

                {/* New Topology Card */}
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-3.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-700 pb-2">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${selectedMigration.new_node_id ? 'bg-blue-500' : 'bg-rose-500'}`} />
                      新ワークフロー接続 (New)
                    </span>
                    <span className="text-xs font-mono text-zinc-500">
                      ID: #{selectedMigration.new_node_id || '未割当'}
                    </span>
                  </div>
                  {selectedMigration.new_topology ? (
                    <div className="flex flex-col gap-2 text-xs">
                      <div>
                        <div className="text-[11px] text-zinc-400">ノードタイトル / クラス</div>
                        <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {selectedMigration.new_topology.title}
                        </div>
                        <div className="text-zinc-500 font-mono text-[11px]">
                          {selectedMigration.new_topology.class_type}
                        </div>
                      </div>

                      <div className="mt-1">
                        <div className="text-[11px] font-medium text-zinc-500 mb-1">
                          入力配線 (Inputs: {selectedMigration.new_topology.inputs.length}本):
                        </div>
                        <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1">
                          {selectedMigration.new_topology.inputs.length === 0 ? (
                            <span className="text-zinc-400 italic">なし (ソースノード)</span>
                          ) : (
                            selectedMigration.new_topology.inputs.map((inp, i) => (
                              <div key={i} className="flex items-center gap-1.5 font-mono text-[11px] bg-zinc-100 dark:bg-zinc-700/50 px-2 py-1 rounded">
                                <span className="text-blue-500 font-medium">{inp.slot}</span>
                                <ArrowRight className="w-3 h-3 text-zinc-400" />
                                <span className="text-zinc-600 dark:text-zinc-300">
                                  #{inp.source_node_id} ({inp.source_class})
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="mt-1">
                        <div className="text-[11px] font-medium text-zinc-500 mb-1">
                          出力配線 (Outputs: {selectedMigration.new_topology.outputs.length}本):
                        </div>
                        <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1">
                          {selectedMigration.new_topology.outputs.length === 0 ? (
                            <span className="text-zinc-400 italic">なし (シンクノード)</span>
                          ) : (
                            selectedMigration.new_topology.outputs.map((out, i) => (
                              <div key={i} className="flex items-center gap-1.5 font-mono text-[11px] bg-zinc-100 dark:bg-zinc-700/50 px-2 py-1 rounded">
                                <span className="text-emerald-500 font-medium">{out.slot}</span>
                                <ArrowRight className="w-3 h-3 text-zinc-400" />
                                <span className="text-zinc-600 dark:text-zinc-300">
                                  #{out.target_node_id} ({out.target_class})
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-rose-500 italic py-4 text-center">
                      新ノードが割り当てられていません。上のセレクトボックスからノードを選択してください。
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-zinc-400 italic py-6 text-center">
                上の表から役割を選択してください。
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80">
          <div className="text-xs">
            {hasUnmappedRequiredRole ? (
              <span className="text-rose-500 dark:text-rose-400 font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                未割当の役割が存在します。すべての役割に新ノードを割り当ててください。(AC-5)
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                すべての役割の割当が完了しています。
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-600 transition"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={hasUnmappedRequiredRole || isSubmitting}
              className={`px-5 py-2 text-xs font-semibold text-white rounded-lg transition flex items-center gap-2 ${
                hasUnmappedRequiredRole || isSubmitting
                  ? 'bg-blue-400 dark:bg-blue-600 cursor-not-allowed opacity-50'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-sm'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  置換実行中...
                </>
              ) : (
                '確定して置換を実行'
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function StatusBadge({ status }: { status: RoleMigration['status'] }) {
  switch (status) {
    case 'ok':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
          完全一致
        </span>
      )
    case 'reindexed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 border border-sky-500/30">
          ID変更
        </span>
      )
    case 'renamed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-500/30">
          タイトル変更
        </span>
      )
    case 'substituted':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border border-purple-500/30">
          代替ノード
        </span>
      )
    case 'false_reuse':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-500/30">
          不正再利用警告
        </span>
      )
    case 'not_found':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-400/30">
          未検出
        </span>
      )
  }
}
