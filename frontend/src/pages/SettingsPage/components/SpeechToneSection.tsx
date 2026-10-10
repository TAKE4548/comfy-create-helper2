import { useEffect, useId, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wand2, Plus, Pencil, Trash2, RefreshCw, ChevronDown, X } from 'lucide-react'
import { speechTonePresetsApi } from '../../../api/client'
import type { SpeechTonePreset, SpeechTonePresetCreate, SpeechTonePresetUpdate } from '../../../api/types'
import { STALE_TIMES } from '../../../constants/staleTimes'

export interface SpeechTonePresetModalProps {
  mode: 'create' | 'edit'
  initial?: SpeechTonePreset | null
  isPending: boolean
  onClose: () => void
  onSubmit: (data: SpeechTonePresetCreate) => void
}

export function SpeechTonePresetModal({
  mode,
  initial,
  isPending,
  onClose,
  onSubmit,
}: SpeechTonePresetModalProps) {
  const headingId = useId()
  const [name, setName] = useState(initial?.name || '')
  const [prompt, setPrompt] = useState(initial?.prompt || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [sortOrder, setSortOrder] = useState<number>(initial?.sort_order ?? 0)
  const [previewText, setPreviewText] = useState('')
  const [previewResult, setPreviewResult] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const revision = useRef(0)
  const requestPending = useRef(false)

  useEffect(() => () => { revision.current += 1 }, [])

  const invalidatePreview = () => {
    revision.current += 1
    setPreviewResult(null)
    setPreviewError(null)
  }

  const handlePreview = async () => {
    if (requestPending.current || !prompt.trim() || !previewText.trim()) return
    requestPending.current = true
    const requestRevision = ++revision.current
    setIsPreviewing(true)
    setPreviewError(null)
    try {
      const result = await speechTonePresetsApi.rewrite({ text: previewText, tone_prompt: prompt, preset_id: initial?.id })
      if (revision.current === requestRevision) setPreviewResult(result.rewritten_text)
    } catch (error) {
      if (revision.current === requestRevision) setPreviewError(error instanceof Error ? error.message : String(error))
    } finally {
      requestPending.current = false
      setIsPreviewing(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !prompt.trim()) return
    onSubmit({
      name: name.trim(),
      prompt: prompt.trim(),
      description: description.trim() || undefined,
      sort_order: sortOrder,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      data-testid="speech-tone-preset-modal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="bg-[#18181C] border border-[rgba(255,255,255,0.12)] rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-3">
          <h3 id={headingId} className="text-sm font-semibold text-zinc-100">
            {mode === 'create' ? '新規口調プリセット作成' : '口調プリセット編集'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 inline-flex items-center justify-center text-zinc-400 hover:text-zinc-200 text-xs px-2 py-1"
            aria-label="閉じる"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              プリセット名 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: ツンデレ風, お嬢様風"
              className="min-h-11 w-full bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              口調指示プロンプト <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={prompt}
              onChange={(e) => { invalidatePreview(); setPrompt(e.target.value) }}
              placeholder="例: ツンデレな口調で。「べ、別に〜じゃないんだからね！」のような言い回しに変換してください。"
              className="min-h-11 w-full bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="space-y-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1F1F25] p-3">
            <label className="block text-xs font-medium text-zinc-300" htmlFor="speech-tone-preview-input">プレビュー用セリフ</label>
            <textarea id="speech-tone-preview-input" aria-label="プレビュー用セリフ" rows={2} value={previewText} onChange={(e) => { invalidatePreview(); setPreviewText(e.target.value) }} className="min-h-11 w-full rounded-lg bg-[#18181C] px-3 py-2 text-xs text-zinc-100" />
            <button type="button" onClick={() => void handlePreview()} disabled={isPreviewing || !prompt.trim() || !previewText.trim()} className="min-h-11 rounded-lg bg-purple-600 px-4 text-xs text-white disabled:opacity-50">{isPreviewing ? 'プレビュー中...' : 'プレビュー実行'}</button>
            {previewError && <p role="alert" className="text-xs text-red-400">プレビューに失敗しました: {previewError}</p>}
            {previewResult !== null && <div aria-live="polite" className="rounded bg-zinc-900 p-3 text-sm text-zinc-100"><p className="mb-1 text-[10px] text-zinc-500">生成プレビュー</p><p>{previewResult}</p></div>}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">説明（任意）</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例: キャラクターAの標準的な口調"
              className="min-h-11 w-full bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">表示順 (sort_order)</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
              className="min-h-11 w-28 bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 min-w-11 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim() || !prompt.trim()}
              className="min-h-11 min-w-11 px-4 py-1.5 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 transition-colors"
            >
              {isPending ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export interface SpeechToneSectionProps {
  isExpanded: boolean
  onToggle: () => void
}

export function SpeechToneSection({ isExpanded, onToggle }: SpeechToneSectionProps) {
  const qc = useQueryClient()
  const [tonePresetModalMode, setTonePresetModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingTonePreset, setEditingTonePreset] = useState<SpeechTonePreset | null>(null)
  const [pendingDeleteToneId, setPendingDeleteToneId] = useState<number | null>(null)

  const { data: tonePresets = [], isLoading: isLoadingTonePresets } = useQuery<SpeechTonePreset[]>({
    queryKey: ['speech-tone-presets'],
    queryFn: speechTonePresetsApi.list,
    staleTime: STALE_TIMES.SPEECH_TONE_PRESETS,
  })

  const createTonePresetMutation = useMutation({
    mutationFn: (data: SpeechTonePresetCreate) => speechTonePresetsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['speech-tone-presets'] })
      setTonePresetModalMode(null)
      setEditingTonePreset(null)
    },
  })

  const updateTonePresetMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: SpeechTonePresetUpdate }) =>
      speechTonePresetsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['speech-tone-presets'] })
      setTonePresetModalMode(null)
      setEditingTonePreset(null)
    },
  })

  const deleteTonePresetMutation = useMutation({
    mutationFn: (id: number) => speechTonePresetsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['speech-tone-presets'] })
    },
  })

  return (
    <section
      className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden"
      data-testid="speech-tone-presets-settings-section"
    >
      <div className="flex items-center justify-between px-4 py-2 bg-surface">
        <h2 className="flex-1">
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={onToggle}
            className="min-h-11 min-w-11 w-full flex items-center gap-2 text-left hover:bg-white/5 transition-colors select-none"
          >
            <Wand2 size={15} className="text-purple-400 shrink-0" />
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-zinc-300">セリフ口調プリセット設定</span>
              <span className="text-xs text-zinc-600">— セリフ編集画面で使用する口調変換プリセットの管理</span>
            </span>
            <ChevronDown size={16} className={`ml-auto text-zinc-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        </h2>
        <div className="flex items-center gap-3 pl-2">
          <button
            type="button"
            onClick={() => {
              setEditingTonePreset(null)
              setTonePresetModalMode('create')
            }}
            className="min-h-11 min-w-11 flex items-center justify-center gap-1 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-purple-500 transition-all"
          >
            <Plus size={12} />プリセット追加
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-4">
          {isLoadingTonePresets ? (
            <div className="flex items-center gap-2 text-zinc-600 text-sm py-8">
              <RefreshCw size={14} className="animate-spin" />Loading tone presets…
            </div>
          ) : (
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sr-only">
                  <tr className="border-b border-[rgba(255,255,255,0.06)] text-zinc-400 bg-white/[0.01]">
                    <th className="px-4 py-3 font-medium">プリセット名</th>
                    <th className="px-4 py-3 font-medium">プロンプト指示</th>
                    <th className="px-4 py-3 font-medium">説明</th>
                    <th className="px-4 py-3 font-medium text-center w-16">順序</th>
                    <th className="px-4 py-3 font-medium text-right w-24">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.04)] text-zinc-300">
                  {tonePresets.map((tp) => (
                    <tr key={tp.id} className="block border-b border-[rgba(255,255,255,0.04)] md:table-row hover:bg-white/[0.02] transition-colors">
                      <td data-label="プリセット名" className="relative block whitespace-normal py-2 pl-24 pr-4 text-zinc-100 before:absolute before:left-4 before:top-2 before:font-medium before:text-zinc-500 before:content-[attr(data-label)] md:table-cell md:whitespace-nowrap md:px-4 md:py-3 md:before:hidden font-medium">
                        <article aria-label={tp.name} className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2/40 p-2">
                          <h3 data-label="プリセット名" className="text-xs font-semibold">{tp.name}</h3>
                          <p className="mt-1 whitespace-normal text-[11px] font-normal text-zinc-400">{tp.description || '説明なし'}</p>
                        </article>
                      </td>
                      <td data-label="プロンプト指示" className="relative block whitespace-normal break-words py-2 pl-24 pr-4 text-zinc-300 before:absolute before:left-4 before:top-2 before:font-medium before:text-zinc-500 before:content-[attr(data-label)] md:table-cell md:max-w-xs md:truncate md:px-4 md:py-3 md:before:hidden" title={tp.prompt}>
                        {tp.prompt}
                      </td>
                      <td data-label="説明" className="relative block whitespace-normal break-words py-2 pl-24 pr-4 text-zinc-400 before:absolute before:left-4 before:top-2 before:font-medium before:text-zinc-500 before:content-[attr(data-label)] md:table-cell md:max-w-xs md:truncate md:px-4 md:py-3 md:before:hidden">
                        {tp.description || '-'}
                      </td>
                      <td data-label="順序" className="relative block py-2 pl-24 pr-4 text-zinc-500 before:absolute before:left-4 before:top-2 before:font-medium before:font-sans before:text-zinc-500 before:content-[attr(data-label)] md:table-cell md:px-4 md:py-3 md:text-center md:before:hidden font-mono">
                        {tp.sort_order}
                      </td>
                      <td data-label="操作" className="relative block py-2 pl-24 pr-4 text-right before:absolute before:left-4 before:top-3 before:font-medium before:text-zinc-500 before:content-[attr(data-label)] md:table-cell md:px-4 md:py-3 md:before:hidden whitespace-nowrap">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTonePreset(tp)
                              setTonePresetModalMode('edit')
                            }}
                            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                            title="編集"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteToneId(tp.id)}
                            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="削除"
                          >
                            <Trash2 size={13} />
                          </button>
                          {pendingDeleteToneId === tp.id && <div role="alertdialog" aria-label="口調プリセット削除の確認" className="mt-2 flex items-center gap-2 rounded border border-red-500/30 p-2 text-xs">
                            <span>「{tp.name}」を削除しますか？</span>
                            <button type="button" onClick={() => setPendingDeleteToneId(null)}>キャンセル</button>
                            <button type="button" aria-label="削除を確認" onClick={() => { deleteTonePresetMutation.mutate(tp.id); setPendingDeleteToneId(null) }}>削除</button>
                          </div>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tonePresets.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                        登録されている口調プリセットはありません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tonePresetModalMode && (
        <SpeechTonePresetModal
          mode={tonePresetModalMode}
          initial={editingTonePreset}
          isPending={createTonePresetMutation.isPending || updateTonePresetMutation.isPending}
          onClose={() => {
            setTonePresetModalMode(null)
            setEditingTonePreset(null)
          }}
          onSubmit={(data) => {
            if (tonePresetModalMode === 'create') {
              createTonePresetMutation.mutate(data)
            } else if (tonePresetModalMode === 'edit' && editingTonePreset) {
              updateTonePresetMutation.mutate({ id: editingTonePreset.id, data })
            }
          }}
        />
      )}
    </section>
  )
}
