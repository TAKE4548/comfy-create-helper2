import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X, Sparkles, RefreshCw, Ban, Undo, Save, CheckSquare, Square,
  MessageSquare, AlertCircle, CheckCircle2, Loader2, Filter
} from 'lucide-react'
import { Modal } from './common/Modal'
import {
  snapshotsApi, speechTonePresetsApi, speechBatchApi,
  albumsApi, workflowsApi, fontsApi
} from '../api/client'
import type {
  SnapshotSummary, SpeechBatchJob
} from '../api/types'
import type { SpeechBubble } from '../types/speechBubble'
import { LS_KEYS } from '../utils/localStorageKeys'
import { speechBubbleRenderer } from '../utils/speechBubbleRenderer'

export interface BatchSpeechTransformModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
}

export interface SelectedBubbleItem {
  key: string
  snapshotId: number
  snapshot: SnapshotSummary
  bubble: SpeechBubble
  bubbleIndex: number
  selected: boolean
}

export function BatchSpeechTransformModal({
  isOpen,
  onClose,
  onSaved
}: BatchSpeechTransformModalProps) {
  const qc = useQueryClient()

  const [activeJobId, setActiveJobId] = useState<string | null>(() => {
    return localStorage.getItem(LS_KEYS.ACTIVE_SPEECH_BATCH_JOB_ID)
  })
  const [phase, setPhase] = useState<'select' | 'review'>(() => {
    return localStorage.getItem(LS_KEYS.ACTIVE_SPEECH_BATCH_JOB_ID) ? 'review' : 'select'
  })
  const [sceneHints, setSceneHints] = useState<Record<number, string>>({})
  const [includeImages, setIncludeImages] = useState<Record<number, boolean>>({})
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null)
  const [customTonePrompt, setCustomTonePrompt] = useState('')
  const [selectedItemsMap, setSelectedItemsMap] = useState<Record<string, boolean>>({})

  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({})
  const [saveMode, setSaveMode] = useState<'overwrite' | 'new'>('overwrite')
  const [targetAlbumId, setTargetAlbumId] = useState<number | null>(null)
  const [newAlbumName, setNewAlbumName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number } | null>(null)
  const [itemRevisionInstructions, setItemRevisionInstructions] = useState<Record<string, string>>({})
  const [expandedThinkingItems, setExpandedThinkingItems] = useState<Record<string, boolean>>({})

  const { data: workflows } = useQuery({ queryKey: ['workflows'], queryFn: () => workflowsApi.list(), enabled: isOpen })
  const { data: albums } = useQuery({ queryKey: ['albums'], queryFn: () => albumsApi.list(), enabled: isOpen })
  const { data: tonePresets } = useQuery({ queryKey: ['speech-tone-presets'], queryFn: () => speechTonePresetsApi.list(), enabled: isOpen })
  const { data: allSnapshots } = useQuery({ queryKey: ['snapshots'], queryFn: () => snapshotsApi.list(), enabled: isOpen })
  const { data: serverFonts } = useQuery({ queryKey: ['server-fonts'], queryFn: () => fontsApi.list(), enabled: isOpen })

  const speechSnapshots = useMemo(() => {
    if (!allSnapshots) return []
    return allSnapshots.filter((s) => {
      const bubbles = (s as any).params?.speech_bubbles
      return Array.isArray(bubbles) && bubbles.length > 0
    })
  }, [allSnapshots])

  const filteredSnapshots = useMemo(() => {
    let result = [...speechSnapshots]
    if (selectedWorkflowId !== null) result = result.filter((s) => s.workflow_id === selectedWorkflowId)
    if (selectedAlbumId !== null && albums) {
      const album = albums.find((a) => a.id === selectedAlbumId)
      if (album) {
        const itemIds = new Set(album.items.map((i) => i.snapshot_id))
        result = result.filter((s) => itemIds.has(s.id))
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((s) => {
        const bubbles = ((s as any).params?.speech_bubbles as SpeechBubble[]) || []
        return bubbles.some((b) => b.text && b.text.toLowerCase().includes(q))
      })
    }
    result.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime()
      const timeB = new Date(b.created_at).getTime()
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB
    })
    return result
  }, [speechSnapshots, selectedWorkflowId, selectedAlbumId, searchQuery, sortOrder, albums])

  const bubbleItems = useMemo<SelectedBubbleItem[]>(() => {
    const items: SelectedBubbleItem[] = []
    for (const snap of filteredSnapshots) {
      const bubbles = ((snap as any).params?.speech_bubbles as SpeechBubble[]) || []
      bubbles.forEach((b, idx) => {
        const key = `${snap.id}_${b.id}`
        items.push({
          key,
          snapshotId: snap.id,
          snapshot: snap,
          bubble: b,
          bubbleIndex: idx,
          selected: selectedItemsMap[key] !== false
        })
      })
    }
    return items
  }, [filteredSnapshots, selectedItemsMap])

  useEffect(() => {
    if (bubbleItems.length > 0 && Object.keys(selectedItemsMap).length === 0) {
      const initial: Record<string, boolean> = {}
      bubbleItems.forEach((item) => { initial[item.key] = true })
      setSelectedItemsMap(initial)
    }
  }, [bubbleItems])

  const { data: activeJob, refetch: refetchJob } = useQuery<SpeechBatchJob | null>({
    queryKey: ['speech-batch-job', activeJobId],
    queryFn: () => (activeJobId ? speechBatchApi.getJob(activeJobId) : null),
    enabled: isOpen && !!activeJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'processing' || status === 'pending' ? 1000 : false
    }
  })

  const handleSelectAll = (select: boolean) => {
    const next: Record<string, boolean> = {}
    bubbleItems.forEach((item) => { next[item.key] = select })
    setSelectedItemsMap(next)
  }

  const handleToggleItem = (key: string) => {
    setSelectedItemsMap((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleToggleSnapshot = (snapshotId: number) => {
    const items = bubbleItems.filter((i) => i.snapshotId === snapshotId)
    const allSelected = items.every((i) => selectedItemsMap[i.key])
    setSelectedItemsMap((prev) => {
      const next = { ...prev }
      items.forEach((i) => { next[i.key] = !allSelected })
      return next
    })
  }

  const handleStartTransform = async () => {
    const selected = bubbleItems.filter((i) => selectedItemsMap[i.key])
    if (selected.length === 0) {
      alert('変換するセリフを選択してください。')
      return
    }
    let tonePrompt = customTonePrompt.trim()
    if (!tonePrompt && selectedPresetId) {
      const p = tonePresets?.find((t) => t.id === selectedPresetId)
      if (p) tonePrompt = p.prompt
    }
    if (!tonePrompt && !selectedPresetId) {
      alert('口調プリセットまたはカスタムプロンプトを指定してください。')
      return
    }

    try {
      const payload = {
        preset_id: selectedPresetId,
        tone_prompt: tonePrompt || null,
        items: selected.map((i) => ({
          id: i.key,
          snapshot_id: i.snapshotId,
          bubble_id: i.bubble.id,
          bubble_index: i.bubbleIndex,
          text: i.bubble.text,
          scene_hint: sceneHints[i.snapshotId]?.trim() || undefined,
          include_image: includeImages[i.snapshotId] !== false,
          image_path: i.snapshot.image_path,
        }))
      }
      const job = await speechBatchApi.createJob(payload)
      setActiveJobId(job.job_id)
      localStorage.setItem(LS_KEYS.ACTIVE_SPEECH_BATCH_JOB_ID, job.job_id)
      setPhase('review')
    } catch (err: any) {
      alert('一括変換ジョブの開始に失敗しました: ' + (err.message || err))
    }
  }

  const handleCancelAll = async () => {
    if (!activeJobId) return
    try {
      await speechBatchApi.cancelJob(activeJobId)
      refetchJob()
    } catch (err: any) {
      alert('キャンセルの実行に失敗しました: ' + (err.message || err))
    }
  }

  const handleRetryItem = async (itemId: string) => {
    if (!activeJobId) return
    const instruction = itemRevisionInstructions[itemId]?.trim()
    try {
      await speechBatchApi.retryItem(activeJobId, itemId, {
        revision_instruction: instruction || undefined,
      })
      refetchJob()
    } catch (err: any) {
      alert('再生成の開始に失敗しました: ' + (err.message || err))
    }
  }

  const handleCancelItem = async (itemId: string) => {
    if (!activeJobId) return
    try {
      await speechBatchApi.cancelItem(activeJobId, itemId)
      refetchJob()
    } catch (err: any) {
      alert('キャンセルの実行に失敗しました: ' + (err.message || err))
    }
  }

  const handleEditText = (itemId: string, text: string) => {
    setEditedTexts((prev) => ({ ...prev, [itemId]: text }))
  }

  const handleResetItem = (itemId: string) => {
    setEditedTexts((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }

  const handleSaveAll = async () => {
    if (!activeJob) return
    setIsSaving(true)
    try {
      const itemsBySnapshot: Record<number, typeof activeJob.items> = {}
      for (const item of activeJob.items) {
        if (!itemsBySnapshot[item.snapshot_id]) itemsBySnapshot[item.snapshot_id] = []
        itemsBySnapshot[item.snapshot_id].push(item)
      }
      const snapshotIds = Object.keys(itemsBySnapshot).map(Number)
      setSaveProgress({ current: 0, total: snapshotIds.length })

      let createdAlbumId = targetAlbumId
      if (saveMode === 'new' && newAlbumName.trim() && !createdAlbumId) {
        const album = await albumsApi.create({ name: newAlbumName.trim(), snapshot_ids: [] })
        createdAlbumId = album.id
      }

      let count = 0
      for (const snapId of snapshotIds) {
        const snap = speechSnapshots.find((s) => s.id === snapId)
        if (!snap) continue
        const originalBubbles = (((snap as any).params?.speech_bubbles as SpeechBubble[]) || []).map((b) => ({ ...b }))
        const jobItems = itemsBySnapshot[snapId]
        for (const jItem of jobItems) {
          const b = originalBubbles.find((ob) => ob.id === jItem.bubble_id)
          if (b) {
            const finalTxt = editedTexts[jItem.id] ?? jItem.rewritten_text ?? b.text
            b.text = finalTxt
          }
        }
        const baseSrc = (snap as any).params?.base_image_path || snap.image_path
        if (!baseSrc) continue

        const img = new Image()
        img.crossOrigin = 'anonymous'
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error(`Failed to load base image: ${baseSrc}`))
          img.src = baseSrc
        })

        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || img.width
        canvas.height = img.naturalHeight || img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        ctx.drawImage(img, 0, 0)
        const defaultFont = serverFonts && serverFonts.length > 0 ? serverFonts[0].name : 'sans-serif'
        for (const b of originalBubbles) {
          speechBubbleRenderer.drawSpeechBubble(ctx, b, false, 1, 1, b.fontFamily || defaultFont)
        }
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
        if (!blob) continue
        const uploadRes = await snapshotsApi.upload(blob)
        const newParams = { ...(snap as any).params, speech_bubbles: originalBubbles, base_image_path: baseSrc }

        if (saveMode === 'overwrite') {
          await snapshotsApi.patch(snap.id, {
            image_path: uploadRes.image_path,
            thumbnail_path: uploadRes.thumbnail_path,
            params: newParams
          })
        } else {
          await snapshotsApi.create({
            workflow_id: snap.workflow_id,
            image_path: uploadRes.image_path,
            thumbnail_path: uploadRes.thumbnail_path,
            params: newParams,
            album_id: createdAlbumId ?? undefined
          })
        }
        count++
        setSaveProgress({ current: count, total: snapshotIds.length })
      }

      localStorage.removeItem(LS_KEYS.ACTIVE_SPEECH_BATCH_JOB_ID)
      setActiveJobId(null)
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      qc.invalidateQueries({ queryKey: ['albums'] })
      if (onSaved) onSaved()
      onClose()
    } catch (err: any) {
      alert('保存処理中にエラーが発生しました: ' + (err.message || err))
    } finally {
      setIsSaving(false)
      setSaveProgress(null)
    }
  }

  if (!isOpen) return null
  const selectedCount = bubbleItems.filter((i) => selectedItemsMap[i.key]).length

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      dialogClassName="h-full max-h-[88vh] lg:h-[88vh]"
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.06)] bg-surface/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#7C6FDD]/20 text-[#7C6FDD]"><Sparkles size={20} /></div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                セリフ一括変換 (AI Rewrite)
                {phase === 'review' && activeJob && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    activeJob.status === 'completed'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : activeJob.status === 'processing' || activeJob.status === 'pending'
                      ? 'bg-[#7C6FDD]/20 text-[#7C6FDD] border border-[#7C6FDD]/30 animate-pulse'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {activeJob.status === 'completed' ? '変換完了' : activeJob.status === 'processing' ? `変換中 (${activeJob.completed_count}/${activeJob.total_count})` : activeJob.status}
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {phase === 'select' ? '口調と対象セリフを選択して、一括で言い回し・語尾を変換します。' : '変換結果を確認・微調整して、画像に合成保存します。'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {phase === 'review' && (
              <button
                onClick={() => {
                  if (!activeJob || activeJob.status === 'completed' || confirm('現在のジョブを破棄して選択画面に戻りますか？')) {
                    localStorage.removeItem(LS_KEYS.ACTIVE_SPEECH_BATCH_JOB_ID)
                    setActiveJobId(null)
                    setPhase('select')
                  }
                }}
                className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all"
              >
                新規作成に戻る
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-all"><X size={18} /></button>
          </div>
        </div>

        {phase === 'select' ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="p-5 border-b border-[rgba(255,255,255,0.06)] bg-surface/20 space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-[#7C6FDD]" /> 口調プリセット
                  </label>
                  <select
                    id="batch-speech-tone-preset-select"
                    value={selectedPresetId ?? ''}
                    onChange={(e) => {
                      const val = Number(e.target.value) || null
                      setSelectedPresetId(val)
                      if (val) {
                        const p = tonePresets?.find((t) => t.id === val)
                        if (p) setCustomTonePrompt(p.prompt)
                      }
                    }}
                    className="w-full text-xs bg-surface-2 border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#7C6FDD]"
                  >
                    <option value="">カスタム指定（手動入力）</option>
                    {tonePresets?.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} {p.description ? `(${p.description})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">口調・キャラクター指示プロンプト</label>
                <textarea
                  id="batch-speech-tone-prompt-input"
                  value={customTonePrompt}
                  onChange={(e) => { setCustomTonePrompt(e.target.value); setSelectedPresetId(null) }}
                  placeholder="例: ツンデレお嬢様風に。「〜ですわ」「〜じゃない！」のような語尾で話す。"
                  rows={2}
                  className="w-full text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg p-2.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[#7C6FDD] resize-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-[rgba(255,255,255,0.06)] bg-surface/40">
              <div className="flex flex-wrap items-center gap-2">
                <Filter size={13} className="text-zinc-500" />
                <select
                  id="batch-speech-wf-filter"
                  value={selectedWorkflowId ?? ''}
                  onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
                  className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none"
                >
                  <option value="">All Workflows</option>
                  {workflows?.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
                </select>

                <select
                  id="batch-speech-album-filter"
                  value={selectedAlbumId ?? ''}
                  onChange={(e) => setSelectedAlbumId(Number(e.target.value) || null)}
                  className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none"
                >
                  <option value="">All Albums</option>
                  {albums?.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                </select>

                <input
                  type="text"
                  placeholder="セリフテキスト検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2.5 py-1.5 text-zinc-300 placeholder:text-zinc-600 focus:outline-none w-36"
                />

                <div className="flex rounded-md overflow-hidden border border-[rgba(255,255,255,0.08)]">
                  <button onClick={() => setSortOrder('desc')} className={`px-2.5 py-1 text-xs ${sortOrder === 'desc' ? 'bg-surface-2 text-zinc-200' : 'text-zinc-500'}`}>新</button>
                  <button onClick={() => setSortOrder('asc')} className={`px-2.5 py-1 text-xs ${sortOrder === 'asc' ? 'bg-surface-2 text-zinc-200' : 'text-zinc-500'}`}>古</button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => handleSelectAll(true)} className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"><CheckSquare size={12} /> 全選択</button>
                <button onClick={() => handleSelectAll(false)} className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 ml-2"><Square size={12} /> 全解除</button>
                <span className="text-xs text-[#7C6FDD] font-semibold ml-3">{selectedCount} 個選択中</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
              {filteredSnapshots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                  <MessageSquare size={36} strokeWidth={1} />
                  <p className="mt-3 text-sm">セリフが設定された画像が見つかりません。</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredSnapshots.map((snap) => {
                    const bubbles = ((snap as any).params?.speech_bubbles as SpeechBubble[]) || []
                    const isAllSnapSelected = bubbles.every((b) => selectedItemsMap[`${snap.id}_${b.id}`])
                    return (
                      <div key={snap.id} className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-surface-2/40 overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-3 border-b border-[rgba(255,255,255,0.05)] bg-surface/30">
                          <div onClick={() => handleToggleSnapshot(snap.id)} className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={isAllSnapSelected} onChange={() => {}} className="rounded border-zinc-700 text-[#7C6FDD] focus:ring-0 cursor-pointer" />
                            <span className="text-xs font-medium text-zinc-300">Snapshot #{snap.id}</span>
                          </div>
                          <span className="text-[11px] text-zinc-500">{bubbles.length} 吹き出し</span>
                        </div>
                        <div className="p-3 flex gap-3">
                          <div className="w-20 h-24 rounded-lg bg-surface overflow-hidden shrink-0 border border-[rgba(255,255,255,0.05)]">
                            {snap.thumbnail_path || snap.image_path ? (
                              <img src={snap.thumbnail_path || snap.image_path!} alt="" className="w-full h-full object-cover" />
                            ) : null}
                          </div>
                          <div className="flex-1 space-y-2 overflow-y-auto max-h-32 custom-scrollbar pr-1">
                            {bubbles.map((b) => {
                              const key = `${snap.id}_${b.id}`
                              const isChecked = selectedItemsMap[key] !== false
                              return (
                                <label key={b.id} onClick={(e) => e.stopPropagation()} className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${isChecked ? 'border-[#7C6FDD]/40 bg-[#7C6FDD]/10 text-zinc-200' : 'border-[rgba(255,255,255,0.05)] bg-surface/20 text-zinc-500'}`}>
                                  <input type="checkbox" checked={isChecked} onChange={() => handleToggleItem(key)} className="mt-0.5 rounded border-zinc-700 text-[#7C6FDD] focus:ring-0 cursor-pointer" />
                                  <span className="flex-1 line-clamp-2 leading-relaxed">{b.text || '(空のセリフ)'}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/50 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-zinc-400">選択中: <strong className="text-zinc-200">{selectedCount}</strong> 件のセリフ</span>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={onClose} className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-white/5 transition-all">キャンセル</button>
                <button
                  id="start-batch-speech-btn"
                  onClick={() => {
                    if (selectedCount === 0) {
                      alert('変換するセリフを選択してください。')
                      return
                    }
                    let tonePrompt = customTonePrompt.trim()
                    if (!tonePrompt && selectedPresetId) {
                      const p = tonePresets?.find((t) => t.id === selectedPresetId)
                      if (p) tonePrompt = p.prompt
                    }
                    if (!tonePrompt && !selectedPresetId) {
                      alert('口調プリセットまたはカスタムプロンプトを指定してください。')
                      return
                    }
                    setPhase('review')
                  }}
                  disabled={selectedCount === 0}
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-[#7C6FDD] hover:bg-[#6e5fcf] text-white disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-lg shadow-[#7C6FDD]/20"
                >
                  次へ：変換リストへ進む ({selectedCount}件)
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {activeJob && (
              <div className="p-4 border-b border-[rgba(255,255,255,0.06)] bg-surface/30">
                <div className="flex items-center justify-between text-xs text-zinc-300 mb-2">
                  <div className="flex items-center gap-2">
                    {activeJob.status === 'processing' || activeJob.status === 'pending' ? (
                      <Loader2 size={14} className="animate-spin text-[#7C6FDD]" />
                    ) : activeJob.status === 'completed' ? (
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    ) : (
                      <AlertCircle size={14} className="text-amber-400" />
                    )}
                    <span>進捗状況: {activeJob.completed_count} / {activeJob.total_count} 完了 {activeJob.failed_count > 0 && ` (${activeJob.failed_count}件 失敗)`}</span>
                  </div>
                  {(activeJob.status === 'processing' || activeJob.status === 'pending') && (
                    <button
                      id="cancel-all-speech-batch-btn"
                      onClick={handleCancelAll}
                      className="text-xs px-2.5 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all flex items-center gap-1"
                    >
                      <Ban size={12} /> 全体キャンセル
                    </button>
                  )}
                </div>
                <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#7C6FDD] h-full transition-all duration-300 rounded-full"
                    style={{ width: `${activeJob.total_count > 0 ? (activeJob.completed_count / activeJob.total_count) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
              {/* Group items by snapshot */}
              {(() => {
                // Determine snapshots to display: from activeJob or selected items
                const targetSnapshots = speechSnapshots.filter((snap) => {
                  if (activeJob) {
                    return activeJob.items.some((i) => i.snapshot_id === snap.id)
                  }
                  const bubbles = ((snap as any).params?.speech_bubbles as SpeechBubble[]) || []
                  return bubbles.some((b) => selectedItemsMap[`${snap.id}_${b.id}`])
                })

                return targetSnapshots.map((snap) => {
                  const bubbles = ((snap as any).params?.speech_bubbles as SpeechBubble[]) || []
                  const relevantBubbles = activeJob
                    ? bubbles.filter((b) => activeJob.items.some((i) => i.snapshot_id === snap.id && i.bubble_id === b.id))
                    : bubbles.filter((b) => selectedItemsMap[`${snap.id}_${b.id}`])

                  return (
                    <div key={snap.id} className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-surface-2/30 overflow-hidden">
                      {/* Snapshot Header with Image & Scene Hint */}
                      <div className="p-3 bg-surface/30 border-b border-[rgba(255,255,255,0.05)] flex items-start gap-3">
                        <div className="w-14 h-16 rounded bg-surface overflow-hidden shrink-0 border border-[rgba(255,255,255,0.05)]">
                          {snap.thumbnail_path || snap.image_path ? (
                            <img src={snap.thumbnail_path || snap.image_path!} alt="" className="w-full h-full object-cover" />
                          ) : null}
                        </div>
                        <div className="flex-1 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-300">Snapshot #{snap.id}</span>
                            <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={includeImages[snap.id] !== false}
                                onChange={(e) => {
                                  const checked = e.target.checked
                                  setIncludeImages((prev) => ({ ...prev, [snap.id]: checked }))
                                }}
                                className="rounded bg-zinc-800 border-zinc-700 text-[#7C6FDD] focus:ring-0 text-xs"
                                data-testid={`review-include-image-${snap.id}`}
                              />
                              <span>画像を参照する (Vision)</span>
                            </label>
                          </div>
                          <div>
                            <textarea
                              value={sceneHints[snap.id] || ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setSceneHints((prev) => ({ ...prev, [snap.id]: val }))
                              }}
                              placeholder="この画像の場面ヒント・状況説明（例: 照れ隠し、敵に囲まれ焦っている、囁いている 等）"
                              rows={1}
                              className="w-full text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded p-1.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[#7C6FDD] resize-none"
                              data-testid={`review-scene-hint-${snap.id}`}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Bubbles in this snapshot */}
                      <div className="p-3 space-y-3">
                        {relevantBubbles.map((bubble, idx) => {
                          const itemId = `${snap.id}_${bubble.id}`
                          const jobItem = activeJob?.items.find((i) => i.id === itemId)
                          const currentText = editedTexts[itemId] ?? jobItem?.rewritten_text ?? bubble.text
                          const isEdited = editedTexts[itemId] !== undefined

                          return (
                            <div key={bubble.id} className="p-3 rounded-lg border border-[rgba(255,255,255,0.04)] bg-surface/30 flex flex-col md:flex-row gap-3 items-start">
                              <div className="w-full md:w-32 shrink-0 flex items-center justify-between md:flex-col md:items-start gap-1">
                                <span className="text-xs text-zinc-400 font-medium">セリフ #{idx + 1}</span>
                                {jobItem && (
                                  <div>
                                    {jobItem.status === 'completed' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">完了</span>}
                                    {jobItem.status === 'processing' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#7C6FDD]/20 text-[#7C6FDD] border border-[#7C6FDD]/30 animate-pulse flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> 変換中</span>}
                                    {jobItem.status === 'pending' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">待機中</span>}
                                    {jobItem.status === 'failed' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">失敗</span>}
                                    {jobItem.status === 'cancelled' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">中断</span>}
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                                <div className="p-2.5 rounded-lg bg-surface/50 border border-[rgba(255,255,255,0.04)]">
                                  <span className="text-[10px] text-zinc-500 block mb-1 font-medium">元のセリフ</span>
                                  <p className={`text-xs ${jobItem?.rewritten_text ? 'text-zinc-400 line-through' : 'text-zinc-200'} leading-relaxed`}>{bubble.text}</p>
                                </div>

                                <div className="p-2.5 rounded-lg bg-surface/80 border border-[rgba(255,255,255,0.08)] focus-within:border-[#7C6FDD]">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] text-[#7C6FDD] font-semibold flex items-center gap-1"><Sparkles size={10} /> 変換後 (微調整可能)</span>
                                    {isEdited && (
                                      <button onClick={() => handleResetItem(itemId)} className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-0.5"><Undo size={10} /> 戻す</button>
                                    )}
                                  </div>
                                  <textarea
                                    id={`speech-batch-text-${itemId}`}
                                    value={currentText}
                                    onChange={(e) => handleEditText(itemId, e.target.value)}
                                    rows={2}
                                    className="w-full text-xs bg-transparent border-0 p-0 text-zinc-200 focus:outline-none resize-none leading-relaxed"
                                    placeholder={!activeJob ? '一括変換を開始すると生成されます' : jobItem?.status === 'processing' ? 'AIが変換しています...' : '変換テキスト...'}
                                  />

                                  {(jobItem?.scene_interpretation || jobItem?.reasoning) && (
                                    <div className="mt-2 border border-[#7C6FDD]/30 rounded bg-[#7C6FDD]/10 p-2 space-y-1" data-testid={`batch-item-thinking-${itemId}`}>
                                      <button
                                        type="button"
                                        onClick={() => setExpandedThinkingItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }))}
                                        className="flex items-center justify-between w-full text-[10px] font-medium text-[#7C6FDD] hover:text-[#9B8FF0]"
                                      >
                                        <span>💡 AI解釈・思考過程</span>
                                        <span>{expandedThinkingItems[itemId] ? '▲ 閉じる' : '▼ 表示'}</span>
                                      </button>
                                      {expandedThinkingItems[itemId] && (
                                        <div className="text-[10px] text-zinc-300 space-y-1 pt-1 border-t border-[#7C6FDD]/20">
                                          {jobItem.scene_interpretation && (
                                            <div>
                                              <span className="text-zinc-500 font-bold block">【場面解釈】</span>
                                              <p className="whitespace-pre-wrap">{jobItem.scene_interpretation}</p>
                                            </div>
                                          )}
                                          {jobItem.reasoning && (
                                            <div>
                                              <span className="text-zinc-500 font-bold block">【思考・言葉選び】</span>
                                              <p className="whitespace-pre-wrap">{jobItem.reasoning}</p>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {activeJob && (
                                    <div className="mt-2 pt-1.5 border-t border-[rgba(255,255,255,0.06)]">
                                      <input
                                        type="text"
                                        id={`retry-instruction-${itemId}`}
                                        data-testid={`retry-instruction-${itemId}`}
                                        placeholder="修正指示・ダメ出し（例: もっと怒った感じで）..."
                                        value={itemRevisionInstructions[itemId] || ''}
                                        onChange={(e) => setItemRevisionInstructions((prev) => ({ ...prev, [itemId]: e.target.value }))}
                                        className="w-full text-[11px] bg-[#121216] border border-zinc-700/60 rounded px-2 py-1 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#7C6FDD]"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>

                              {activeJob && (
                                <div className="flex md:flex-col items-center gap-1.5 shrink-0 self-center md:self-start">
                                  <button
                                    id={`retry-speech-item-${itemId}`}
                                    data-testid={`retry-speech-item-${itemId}`}
                                    onClick={() => handleRetryItem(itemId)}
                                    disabled={jobItem?.status === 'processing'}
                                    title="このセリフのみ再生成（修正指示があれば反映）"
                                    className="p-2 rounded-lg bg-surface hover:bg-surface-2 border border-[rgba(255,255,255,0.06)] text-zinc-300 hover:text-[#7C6FDD] transition-all disabled:opacity-50"
                                  >
                                    <RefreshCw size={13} />
                                  </button>
                                  {(jobItem?.status === 'pending' || jobItem?.status === 'processing') && (
                                    <button
                                      id={`cancel-speech-item-${itemId}`}
                                      data-testid={`cancel-speech-item-${itemId}`}
                                      onClick={() => handleCancelItem(itemId)}
                                      title="キャンセル"
                                      className="p-2 rounded-lg bg-surface hover:bg-surface-2 border border-[rgba(255,255,255,0.06)] text-zinc-400 hover:text-red-400 transition-all"
                                    >
                                      <Ban size={13} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>

            <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/50 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setPhase('select')}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg border border-[rgba(255,255,255,0.08)] hover:bg-white/5 transition-all"
                >
                  ← 候補選択に戻る
                </button>

                {activeJob && (
                  <>
                    <span className="text-xs text-zinc-400">保存モード:</span>
                    <div className="flex rounded-lg overflow-hidden border border-[rgba(255,255,255,0.08)]">
                      <button
                        id="save-mode-overwrite"
                        onClick={() => setSaveMode('overwrite')}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${saveMode === 'overwrite' ? 'bg-surface-2 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        既存画像を上書き
                      </button>
                      <button
                        id="save-mode-new"
                        onClick={() => setSaveMode('new')}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${saveMode === 'new' ? 'bg-surface-2 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        新規スナップショットとして保存
                      </button>
                    </div>

                    {saveMode === 'new' && (
                      <div className="flex items-center gap-2">
                        <select
                          id="save-new-album-select"
                          value={targetAlbumId ?? ''}
                          onChange={(e) => setTargetAlbumId(Number(e.target.value) || null)}
                          className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none"
                        >
                          <option value="">アルバム未指定</option>
                          {albums?.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                        </select>
                        {!targetAlbumId && (
                          <input
                            type="text"
                            placeholder="新規アルバム名..."
                            value={newAlbumName}
                            onChange={(e) => setNewAlbumName(e.target.value)}
                            className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none"
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button onClick={onClose} className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-white/5 transition-all">閉じる</button>
                {!activeJob ? (
                  <button
                    id="start-batch-speech-execute-btn"
                    onClick={handleStartTransform}
                    className="px-5 py-2 text-xs font-semibold rounded-lg bg-[#7C6FDD] hover:bg-[#6e5fcf] text-white transition-all flex items-center gap-1.5 shadow-lg shadow-[#7C6FDD]/20"
                  >
                    <Sparkles size={14} /> ✨ 一括変換を開始 ({selectedCount}件)
                  </button>
                ) : (
                  <button
                    id="confirm-batch-speech-save-btn"
                    onClick={handleSaveAll}
                    disabled={isSaving}
                    className="px-5 py-2 text-xs font-semibold rounded-lg bg-[#7C6FDD] hover:bg-[#6e5fcf] text-white disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-lg shadow-[#7C6FDD]/20"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> 保存中 ({saveProgress?.current}/{saveProgress?.total})...
                      </>
                    ) : (
                      <>
                        <Save size={14} /> すべての画像に合成して保存
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

