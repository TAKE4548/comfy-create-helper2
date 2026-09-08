import { useState } from 'react'
import { AlertTriangle, Server, Smartphone, Copy, X } from 'lucide-react'
import type { WorkflowPreset } from '../api/types'

export interface PresetConflictData {
  serverPreset: WorkflowPreset
  localDraft: {
    name: string
    paramValues: Record<string, string>
    appliedAssets: Record<string, any[]>
    batchSize: number
    seedMode: 'random' | 'fixed'
    seed: number
  }
}

export interface PresetConflictModalProps {
  isOpen: boolean
  conflictData: PresetConflictData | null
  onClose: () => void
  onUseServer: () => void
  onOverwriteServer: () => void
  onSaveAsNew: (newName: string) => void
}

export function PresetConflictModal({
  isOpen,
  conflictData,
  onClose,
  onUseServer,
  onOverwriteServer,
  onSaveAsNew,
}: PresetConflictModalProps) {
  const [activeMobileTab, setActiveMobileTab] = useState<'server' | 'local'>('server')
  const [saveAsNewName, setSaveAsNewName] = useState('')
  const [isNamingNew, setIsNamingNew] = useState(false)

  if (!isOpen || !conflictData) return null

  const { serverPreset, localDraft } = conflictData
  const defaultForkName = `${localDraft.name || serverPreset.name} (別端末の編集)`

  // Collect all unique param keys
  const allParamKeys = Array.from(
    new Set([
      ...Object.keys(serverPreset.param_values || {}),
      ...Object.keys(localDraft.paramValues || {}),
    ])
  )

  const isParamDifferent = (key: string) => {
    const sVal = serverPreset.param_values?.[key] ?? ''
    const lVal = localDraft.paramValues?.[key] ?? ''
    return sVal !== lVal
  }

  const isBatchDifferent = (serverPreset.batch_size ?? 1) !== localDraft.batchSize
  const isSeedModeDifferent = (serverPreset.seed_mode ?? 'random') !== localDraft.seedMode
  const isSeedDifferent = (serverPreset.seed ?? 42) !== localDraft.seed

  const handleStartSaveAsNew = () => {
    setSaveAsNewName(defaultForkName)
    setIsNamingNew(true)
  }

  const handleConfirmSaveAsNew = () => {
    const name = saveAsNewName.trim() || defaultForkName
    onSaveAsNew(name)
    setIsNamingNew(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#1A1A22] border border-[#2E2E3A] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#2E2E3A] bg-[#14141B]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">プリセットの競合を検知しました</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                プリセット「<span className="text-white font-medium">{serverPreset.name}</span>」は他端末で更新されています。競合の解決方法を選択してください。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex md:hidden border-b border-[#2E2E3A] bg-[#16161F]">
          <button
            onClick={() => setActiveMobileTab('server')}
            className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
              activeMobileTab === 'server'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Server className="w-4 h-4" />
            サーバー最新版（他端末）
          </button>
          <button
            onClick={() => setActiveMobileTab('local')}
            className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
              activeMobileTab === 'local'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            この端末の編集（未保存）
          </button>
        </div>

        {/* Content Body: Side-by-Side Comparison */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column: Server Version */}
            <div
              className={`flex flex-col rounded-xl border border-[#2E2E3A] bg-[#14141B] overflow-hidden ${
                activeMobileTab === 'server' ? 'block' : 'hidden md:flex'
              }`}
            >
              <div className="px-4 py-3 bg-indigo-950/30 border-b border-indigo-900/40 flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-300 font-semibold text-sm">
                  <Server className="w-4 h-4" />
                  サーバー最新版（他端末での編集）
                </div>
                {serverPreset.updated_at && (
                  <span className="text-[11px] text-indigo-400 font-mono">
                    {new Date(serverPreset.updated_at).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="p-4 space-y-4 text-xs overflow-y-auto max-h-[50vh]">
                {/* General Settings */}
                <div className="space-y-2">
                  <div className="text-zinc-400 font-medium">基本設定</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div
                      className={`p-2 rounded-lg border ${
                        isBatchDifferent
                          ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                          : 'border-[#2E2E3A] bg-[#1A1A22]'
                      }`}
                    >
                      <span className="text-[10px] text-zinc-400 block">Batch</span>
                      <span className="font-semibold text-sm">{serverPreset.batch_size ?? 1}</span>
                    </div>
                    <div
                      className={`p-2 rounded-lg border ${
                        isSeedModeDifferent
                          ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                          : 'border-[#2E2E3A] bg-[#1A1A22]'
                      }`}
                    >
                      <span className="text-[10px] text-zinc-400 block">Mode</span>
                      <span className="font-semibold text-xs capitalize">{serverPreset.seed_mode ?? 'random'}</span>
                    </div>
                    <div
                      className={`p-2 rounded-lg border ${
                        isSeedDifferent
                          ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                          : 'border-[#2E2E3A] bg-[#1A1A22]'
                      }`}
                    >
                      <span className="text-[10px] text-zinc-400 block">Seed</span>
                      <span className="font-semibold text-xs font-mono">{serverPreset.seed ?? 42}</span>
                    </div>
                  </div>
                </div>

                {/* Parameters & Prompts */}
                <div className="space-y-2">
                  <div className="text-zinc-400 font-medium">パラメータ・プロンプト</div>
                  {allParamKeys.length === 0 ? (
                    <div className="text-zinc-500 italic py-2">設定値なし</div>
                  ) : (
                    allParamKeys.map((key) => {
                      const val = serverPreset.param_values?.[key] ?? ''
                      const diff = isParamDifferent(key)
                      return (
                        <div
                          key={key}
                          className={`p-2.5 rounded-lg border transition-all ${
                            diff
                              ? 'border-indigo-500/40 bg-indigo-950/20'
                              : 'border-[#2E2E3A] bg-[#181820]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-[11px] text-zinc-400">{key}</span>
                            {diff && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                                差分あり
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-zinc-300 break-words whitespace-pre-wrap max-h-24 overflow-y-auto">
                            {val || <span className="text-zinc-600 italic">(空)</span>}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Local Version */}
            <div
              className={`flex flex-col rounded-xl border border-[#2E2E3A] bg-[#14141B] overflow-hidden ${
                activeMobileTab === 'local' ? 'block' : 'hidden md:flex'
              }`}
            >
              <div className="px-4 py-3 bg-amber-950/30 border-b border-amber-900/40 flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                  <Smartphone className="w-4 h-4" />
                  この端末の編集（未保存ローカル）
                </div>
                <span className="text-[11px] text-amber-400 font-medium">未保存ドラフト</span>
              </div>
              <div className="p-4 space-y-4 text-xs overflow-y-auto max-h-[50vh]">
                {/* General Settings */}
                <div className="space-y-2">
                  <div className="text-zinc-400 font-medium">基本設定</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div
                      className={`p-2 rounded-lg border ${
                        isBatchDifferent
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                          : 'border-[#2E2E3A] bg-[#1A1A22]'
                      }`}
                    >
                      <span className="text-[10px] text-zinc-400 block">Batch</span>
                      <span className="font-semibold text-sm">{localDraft.batchSize}</span>
                    </div>
                    <div
                      className={`p-2 rounded-lg border ${
                        isSeedModeDifferent
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                          : 'border-[#2E2E3A] bg-[#1A1A22]'
                      }`}
                    >
                      <span className="text-[10px] text-zinc-400 block">Mode</span>
                      <span className="font-semibold text-xs capitalize">{localDraft.seedMode}</span>
                    </div>
                    <div
                      className={`p-2 rounded-lg border ${
                        isSeedDifferent
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                          : 'border-[#2E2E3A] bg-[#1A1A22]'
                      }`}
                    >
                      <span className="text-[10px] text-zinc-400 block">Seed</span>
                      <span className="font-semibold text-xs font-mono">{localDraft.seed}</span>
                    </div>
                  </div>
                </div>

                {/* Parameters & Prompts */}
                <div className="space-y-2">
                  <div className="text-zinc-400 font-medium">パラメータ・プロンプト</div>
                  {allParamKeys.length === 0 ? (
                    <div className="text-zinc-500 italic py-2">設定値なし</div>
                  ) : (
                    allParamKeys.map((key) => {
                      const val = localDraft.paramValues?.[key] ?? ''
                      const diff = isParamDifferent(key)
                      return (
                        <div
                          key={key}
                          className={`p-2.5 rounded-lg border transition-all ${
                            diff
                              ? 'border-amber-500/40 bg-amber-950/20'
                              : 'border-[#2E2E3A] bg-[#181820]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-[11px] text-zinc-400">{key}</span>
                            {diff && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                                差分あり
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-zinc-300 break-words whitespace-pre-wrap max-h-24 overflow-y-auto">
                            {val || <span className="text-zinc-600 italic">(空)</span>}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Inline Save As New Name Input */}
          {isNamingNew && (
            <div className="mt-4 p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/20 flex flex-col sm:flex-row items-center gap-3">
              <span className="text-xs font-semibold text-indigo-300 whitespace-nowrap">新規保存名:</span>
              <input
                type="text"
                value={saveAsNewName}
                onChange={(e) => setSaveAsNewName(e.target.value)}
                placeholder={defaultForkName}
                className="flex-1 w-full bg-black/40 border border-[#2E2E3A] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                autoFocus
              />
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => setIsNamingNew(false)}
                  className="px-3 py-2 text-xs text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleConfirmSaveAsNew}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-md shadow-indigo-600/30"
                >
                  別名で保存
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer: Resolution Action Buttons */}
        <div className="p-4 border-t border-[#2E2E3A] bg-[#14141B] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-xs text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition-all text-center"
          >
            後で確認する
          </button>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              onClick={onUseServer}
              className="px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white border border-[#2E2E3A] hover:border-zinc-500 bg-[#1E1E28] hover:bg-[#262634] rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Server className="w-4 h-4 text-indigo-400" />
              サーバー最新版を採用
            </button>
            <button
              onClick={onOverwriteServer}
              className="px-4 py-2.5 text-xs font-semibold text-amber-300 hover:text-amber-200 border border-amber-500/30 hover:border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Smartphone className="w-4 h-4 text-amber-400" />
              この端末の編集で上書き
            </button>
            <button
              onClick={handleStartSaveAsNew}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
            >
              <Copy className="w-4 h-4" />
              別名で両方保存 (推奨)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
