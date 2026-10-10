import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sliders, ChevronDown, Save } from 'lucide-react'
import { llmPromptsApi } from '../../../api/client'
import { snapshotsApi } from '../../../api/client'
import type { LlmPrompt } from '../../../api/types'
import type { SnapshotSummary, BubbleCandidate } from '../../../api/types'
import { STALE_TIMES } from '../../../constants/staleTimes'
import '../SettingsResponsive.css'

export interface BubbleDetectionParams {
  min_area: number
  min_brightness: number
}

export interface BubbleDetectionSectionProps {
  isExpanded: boolean
  onToggle: () => void
  embedded?: boolean
}

export function BubbleDetectionSection({ isExpanded, onToggle, embedded = false }: BubbleDetectionSectionProps) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [bubbleDetectionParams, setBubbleDetectionParams] = useState<BubbleDetectionParams>({
    min_area: 1000,
    min_brightness: 150,
  })
  const paramsRef = useRef(bubbleDetectionParams)
  const dirtyRef = useRef(false)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)
  const [candidates, setCandidates] = useState<BubbleCandidate[]>([])
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewPending, setPreviewPending] = useState(false)
  const previewRequestId = useRef(0)

  const { data: snapshots = [] } = useQuery({
    queryKey: ['bubble-detection-preview-snapshots'],
    queryFn: () => snapshotsApi.list(),
    staleTime: STALE_TIMES.SNAPSHOTS,
    enabled: isExpanded || embedded,
  })
  const previewSnapshots = snapshots.filter((snapshot: SnapshotSummary) => Boolean(snapshot.image_path))

  useEffect(() => {
    if (selectedSnapshotId === null && previewSnapshots.length > 0) {
      setSelectedSnapshotId(previewSnapshots[0].id)
    } else if (selectedSnapshotId !== null && !previewSnapshots.some((item) => item.id === selectedSnapshotId)) {
      setSelectedSnapshotId(previewSnapshots[0]?.id ?? null)
    }
  }, [previewSnapshots, selectedSnapshotId])

  const selectedSnapshot = previewSnapshots.find((snapshot) => snapshot.id === selectedSnapshotId)
  const invalidatePreview = () => {
    previewRequestId.current += 1
    setPreviewPending(false)
    setCandidates([])
    setPreviewError(null)
  }

  const handlePreview = async () => {
    if (!selectedSnapshot || !imageDimensions) return
    const requestId = ++previewRequestId.current
    setPreviewPending(true)
    setPreviewError(null)
    setCandidates([])
    try {
      const result = await snapshotsApi.detectBubbleDebug(selectedSnapshot.id, null, {
        min_area: bubbleDetectionParams.min_area,
        min_brightness: bubbleDetectionParams.min_brightness,
      })
      if (requestId === previewRequestId.current) setCandidates(result.candidates)
    } catch (error) {
      if (requestId === previewRequestId.current) {
        setPreviewError(error instanceof Error ? error.message : 'プレビューに失敗しました')
      }
    } finally {
      if (requestId === previewRequestId.current) setPreviewPending(false)
    }
  }

  const { data: prompts } = useQuery({
    queryKey: ['llm-prompts'],
    queryFn: () => llmPromptsApi.list() as Promise<LlmPrompt[]>,
    staleTime: STALE_TIMES.LLM_PROMPTS,
  })

  useEffect(() => {
    if (prompts) {
      const record = prompts.find((p) => p.key === 'bubble_detection_params')
      if (record && record.content) {
        try {
          const parsed = JSON.parse(record.content)
          if (dirtyRef.current) return
          const loadedParams = {
            min_area: parsed.min_area ?? 1000,
            min_brightness: parsed.min_brightness ?? 150,
          }
          paramsRef.current = loadedParams
          setBubbleDetectionParams(loadedParams)
        } catch (e) {
          console.error('Failed to parse bubble_detection_params:', e)
        }
      }
    }
  }, [prompts])

  const updatePrompt = useMutation({
    mutationFn: ({ key, content }: { key: string; content: string }) =>
      llmPromptsApi.update(key, { content }),
    onSuccess: (_result, { content }) => {
      qc.invalidateQueries({ queryKey: ['llm-prompts'] })
      if (JSON.stringify(paramsRef.current) === content) {
        dirtyRef.current = false
        setSaved(true)
        setSaveError(null)
      }
    },
    onError: (error, { content }) => {
      if (JSON.stringify(paramsRef.current) === content) {
        setSaved(false)
        setSaveError(error instanceof Error ? error.message : '保存に失敗しました')
      }
    },
  })

  const handleParamDraftChange = (update: (current: BubbleDetectionParams) => BubbleDetectionParams) => {
    const next = update(paramsRef.current)
    paramsRef.current = next
    dirtyRef.current = true
    setSaved(false)
    setSaveError(null)
    invalidatePreview()
    setBubbleDetectionParams(next)
  }

  const handleSaveBubbleParams = () => {
    setSaved(false)
    setSaveError(null)
    updatePrompt.mutate({
      key: 'bubble_detection_params',
      content: JSON.stringify(paramsRef.current),
    })
  }

  return (
    <section className={embedded ? 'space-y-4 font-sans' : 'border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden'}>
      {!embedded && <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <Sliders size={15} className="text-[#7C6FDD]" />
          <h2 className="text-sm font-semibold text-zinc-300">吹き出し検出パラメータ設定</h2>
          <span className="text-xs text-zinc-600">— 画像処理による吹き出し検出の感度調整</span>
        </div>
        <ChevronDown
          size={16}
          className={`text-zinc-500 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>}
      {(isExpanded || embedded) && (
        <div className={embedded ? 'space-y-4' : 'p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-4 font-sans'}>
          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.04)] pb-2 mb-2">
              <h3 className="text-xs font-semibold text-zinc-300">画像処理フィルタパラメータ</h3>
              <button
                type="button"
                onClick={handleSaveBubbleParams}
                disabled={updatePrompt.isPending}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                  saved
                    ? 'bg-accent-green/20 text-accent-green border border-accent-green/40'
                    : 'bg-[#7C6FDD] text-white hover:bg-[#6d62cc]'
                }`}
              >
                <Save size={12} />
                {saved ? '設定を保存しました' : '保存'}
              </button>
            </div>
            {saveError && <p role="alert" className="text-xs text-red-300">保存に失敗しました: {saveError}（設定は未保存です）</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Min Area */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">最小面積 (min_area: 画素数)</span>
                  <input
                    type="number"
                    aria-label="最小面積 (min_area: 画素数)"
                    min={50}
                    max={5000}
                    step={50}
                    value={bubbleDetectionParams.min_area}
                    onChange={(e) => handleParamDraftChange((prev) => ({ ...prev, min_area: parseInt(e.target.value, 10) || 50 }))}
                    className="w-20 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded px-1.5 py-0.5 text-right font-mono text-zinc-200 focus:outline-none"
                  />
                </div>
                <input
                  type="range"
                  min={50}
                  max={5000}
                  step={50}
                  value={bubbleDetectionParams.min_area}
                  onChange={(e) => handleParamDraftChange((prev) => ({ ...prev, min_area: parseInt(e.target.value, 10) }))}
                  className="w-full accent-[#7C6FDD]"
                />
                <p className="text-[10px] text-zinc-500">
                  吹き出しと判定する最小の画素サイズです。検出されない場合は小さくしてください。
                </p>
              </div>

              {/* Min Brightness */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">最小輝度 (min_brightness: 0-255)</span>
                  <input
                    type="number"
                    aria-label="最小輝度 (min_brightness: 0-255)"
                    min={0}
                    max={255}
                    step={5}
                    value={bubbleDetectionParams.min_brightness}
                    onChange={(e) => handleParamDraftChange((prev) => ({
                        ...prev,
                        min_brightness: Math.min(
                          255,
                          Math.max(0, parseInt(e.target.value, 10) || 0)
                        ),
                      }))}
                    className="w-20 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded px-1.5 py-0.5 text-right font-mono text-zinc-200 focus:outline-none"
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={255}
                  step={5}
                  value={bubbleDetectionParams.min_brightness}
                  onChange={(e) => handleParamDraftChange((prev) => ({
                      ...prev,
                      min_brightness: parseInt(e.target.value, 10),
                    }))}
                  className="w-full accent-[#7C6FDD]"
                />
                <p className="text-[10px] text-zinc-500">
                  吹き出しの白さの閾値です。背景がグレー等の場合は小さくしてください。
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface p-4 space-y-3">
            <h3 className="text-xs font-semibold text-zinc-300">検出プレビュー</h3>
            {previewSnapshots.length > 0 ? (
              <>
                <label className="block text-xs text-zinc-400" htmlFor="bubble-preview-snapshot">作例画像</label>
                <select
                  id="bubble-preview-snapshot"
                  aria-label="作例画像"
                  value={selectedSnapshotId ?? ''}
                  onChange={(event) => {
                    invalidatePreview()
                    setImageDimensions(null)
                    setSelectedSnapshotId(Number(event.target.value))
                  }}
                  className="w-full rounded bg-surface-2 px-2 py-2 text-sm text-zinc-200"
                >
                  {previewSnapshots.map((snapshot) => (
                    <option key={snapshot.id} value={snapshot.id}>#{snapshot.id} — {snapshot.created_at}</option>
                  ))}
                </select>
                {selectedSnapshot?.image_path && (
                  <div className="relative inline-block max-w-full" data-testid="bubble-preview-image-container">
                    <img
                      src={selectedSnapshot.image_path}
                      alt={`作例画像 #${selectedSnapshot.id}`}
                      onLoad={(event) => setImageDimensions({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      })}
                      onError={() => setImageDimensions(null)}
                      className="block max-h-[480px] max-w-full object-contain"
                    />
                    {imageDimensions && candidates.map((candidate, index) => (
                      <div
                        key={`${index}-${candidate.x}-${candidate.y}`}
                        data-testid="bubble-candidate-overlay"
                        data-status={candidate.status}
                        title={`検出候補 ${candidate.status}`}
                        className="absolute border-2 border-emerald-400 bg-emerald-300/10"
                        style={{
                          left: `${(candidate.x / imageDimensions.width) * 100}%`,
                          top: `${(candidate.y / imageDimensions.height) * 100}%`,
                          width: `${(candidate.w / imageDimensions.width) * 100}%`,
                          height: `${(candidate.h / imageDimensions.height) * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                )}
                <button type="button" onClick={handlePreview} disabled={!imageDimensions || previewPending}
                  className="rounded-lg bg-[#7C6FDD] px-3 py-2 text-sm text-white disabled:opacity-50">
                  {previewPending ? '検出中…' : '現在の感度でプレビュー'}
                </button>
                {previewError && <p role="alert" className="text-sm text-red-400">{previewError}</p>}
                {imageDimensions && <p className="text-xs text-zinc-500">画像サイズ: {imageDimensions.width} × {imageDimensions.height}</p>}
                {!candidates.length && !previewPending && !previewError && <p className="text-xs text-zinc-500">プレビューを実行してください。</p>}
                {candidates.length > 0 && <p className="text-xs text-zinc-400">検出候補: {candidates.length} 件</p>}
              </>
            ) : <p className="text-sm text-zinc-500">利用できる作例画像がありません。</p>}
          </div>
        </div>
      )}
    </section>
  )
}
