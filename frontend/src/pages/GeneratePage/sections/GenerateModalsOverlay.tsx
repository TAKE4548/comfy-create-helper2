import { memo } from 'react'
import { X } from 'lucide-react'
import { BypassSettingsModal } from '../../../components/BypassSettingsModal'
import { ParamSyncModal } from '../../../components/ParamSyncModal'
import { PromptTranslationModal } from '../components/PromptTranslationModal'
import { SaveAsTagSetModal } from '../components/SaveAsTagSetModal'
import { generateNextProfileName } from '../../../utils/profileUtils'
import type { useGeneratePageState } from '../hooks/useGeneratePageState'

type StateProps = ReturnType<typeof useGeneratePageState>

export interface GenerateModalsOverlayProps {
  state: StateProps
  // Local UI modal states managed by parent layouts
  showCopyModal: boolean
  setShowCopyModal: (open: boolean) => void
  newSetName: string
  setNewSetName: (name: string) => void
  copySourceId: string | number
  setCopySourceId: (id: string | number) => void
  isBypassSettingsOpen: boolean
  setIsBypassSettingsOpen: (open: boolean) => void
  isParamSyncSettingsOpen: boolean
  setIsParamSyncSettingsOpen: (open: boolean) => void
  saveAsTagSetRole: string | null
  setSaveAsTagSetRole: (role: string | null) => void
  errorToast: { message: string; type?: 'error' | 'success'; persistent?: boolean } | null
  setErrorToast: (toast: any) => void
}

export const GenerateModalsOverlay = memo(function GenerateModalsOverlay({
  state,
  showCopyModal,
  setShowCopyModal,
  newSetName,
  setNewSetName,
  copySourceId,
  setCopySourceId,
  isBypassSettingsOpen,
  setIsBypassSettingsOpen,
  isParamSyncSettingsOpen,
  setIsParamSyncSettingsOpen,
  saveAsTagSetRole,
  setSaveAsTagSetRole,
  errorToast,
  setErrorToast,
}: GenerateModalsOverlayProps) {
  const {
    workflow,
    presets,
    handleCreatePreset,
    textMappings,
    promptTranslation,
    paramValues,
  } = state

  return (
    <>
      {showCopyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in px-4">
          <div className="bg-surface border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl p-6 w-96 max-w-[90%] space-y-4 text-left">
            <h3 className="text-sm font-bold text-zinc-200">新規プロファイル作成 (Add Set)</h3>
            <div className="space-y-1.5">
              <label htmlFor="new-profile-name" className="text-xs text-zinc-400 font-semibold">プロファイル名</label>
              <input
                id="new-profile-name"
                type="text"
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                placeholder="プロファイル名を入力..."
                className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/50"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="copy-source-select" className="text-xs text-zinc-400 font-semibold">コピー元 (ベース設定)</label>
              <select
                id="copy-source-select"
                value={copySourceId}
                onChange={(e) => {
                  const val = e.target.value
                  const allNames = presets?.map((p) => p.name) || []
                  if (val === 'default') {
                    setCopySourceId('default')
                    setNewSetName(generateNextProfileName('Set', allNames))
                  } else {
                    const numId = Number(val)
                    setCopySourceId(numId)
                    const selected = presets?.find((p) => p.id === numId)
                    if (selected) {
                      setNewSetName(generateNextProfileName(selected.name, allNames))
                    }
                  }
                }}
                className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/50"
              >
                <option value="default">ワークフローのデフォルト設定</option>
                {presets?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2 font-medium">
              <button
                type="button"
                id="cancel-add-set-btn"
                onClick={() => setShowCopyModal(false)}
                className="px-4 py-2 rounded-lg bg-surface-2 border border-[rgba(255,255,255,0.06)] text-zinc-350 hover:text-white text-xs font-semibold transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                id="confirm-add-set-btn"
                onClick={() => {
                  if (newSetName.trim()) {
                    handleCreatePreset(newSetName.trim(), copySourceId)
                    setShowCopyModal(false)
                  }
                }}
                disabled={!newSetName.trim()}
                className="px-4 py-2 rounded-lg bg-accent-green text-background hover:brightness-110 disabled:opacity-50 text-xs font-bold transition-all"
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}

      {isBypassSettingsOpen && (
        <BypassSettingsModal 
          onClose={() => setIsBypassSettingsOpen(false)} 
          workflowJson={workflow?.json_body}
        />
      )}

      {isParamSyncSettingsOpen && (
        <ParamSyncModal
          onClose={() => setIsParamSyncSettingsOpen(false)}
        />
      )}

      {errorToast && (
        <div
          role="alert"
          /* ui-invariant-ignore: rule-no-raw-100vh reason: legacy baseline toast max-height */
          className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-900 border border-red-800 text-red-100 px-4 py-2 rounded-lg shadow-lg flex items-start gap-3 animate-fade-in w-[calc(100vw-2rem)] max-w-xl max-h-[calc(100vh-2rem)] overflow-y-auto"
        >
          <span className="text-sm font-medium whitespace-pre-wrap break-words min-w-0 flex-1">{errorToast.message}</span>
          <button
            type="button"
            onClick={() => setErrorToast(null)}
            className="p-1 hover:bg-white/10 rounded text-red-300 hover:text-red-100 transition-all"
            aria-label="通知を閉じる"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {promptTranslation && (
        <PromptTranslationModal
          isOpen={promptTranslation.isOpen}
          onClose={promptTranslation.closeTranslation}
          roleDisplayName={
            textMappings.find((m) => m.role === promptTranslation.activeRole)?.display_name ||
            promptTranslation.activeRole ||
            'プロンプト'
          }
          mode={promptTranslation.mode}
          onModeChange={promptTranslation.setMode}
          sourceText={promptTranslation.sourceText}
          onSourceTextChange={promptTranslation.setSourceText}
          translatedText={promptTranslation.translatedText}
          meta={promptTranslation.meta}
          isTranslating={promptTranslation.isTranslating}
          error={promptTranslation.error}
          onTranslate={promptTranslation.executeTranslate}
          onApply={promptTranslation.applyToPrompt}
        />
      )}

      {saveAsTagSetRole && (
        <SaveAsTagSetModal
          role={saveAsTagSetRole}
          promptText={paramValues[saveAsTagSetRole] ?? ''}
          onClose={() => setSaveAsTagSetRole(null)}
        />
      )}
    </>
  )
})
