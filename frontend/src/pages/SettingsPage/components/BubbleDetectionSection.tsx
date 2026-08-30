import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sliders, ChevronDown, Save } from 'lucide-react'
import { llmPromptsApi } from '../../../api/client'
import type { LlmPrompt } from '../../../api/types'
import { STALE_TIMES } from '../../../constants/staleTimes'

export interface BubbleDetectionParams {
  min_area: number
  min_brightness: number
}

export interface BubbleDetectionSectionProps {
  isExpanded: boolean
  onToggle: () => void
}

export function BubbleDetectionSection({ isExpanded, onToggle }: BubbleDetectionSectionProps) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [bubbleDetectionParams, setBubbleDetectionParams] = useState<BubbleDetectionParams>({
    min_area: 1000,
    min_brightness: 150,
  })

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
          setBubbleDetectionParams({
            min_area: parsed.min_area ?? 1000,
            min_brightness: parsed.min_brightness ?? 150,
          })
        } catch (e) {
          console.error('Failed to parse bubble_detection_params:', e)
        }
      }
    }
  }, [prompts])

  const updatePrompt = useMutation({
    mutationFn: ({ key, content }: { key: string; content: string }) =>
      llmPromptsApi.update(key, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llm-prompts'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const handleSaveBubbleParams = () => {
    updatePrompt.mutate({
      key: 'bubble_detection_params',
      content: JSON.stringify(bubbleDetectionParams),
    })
  }

  return (
    <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
      <button
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
      </button>
      {isExpanded && (
        <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-4 font-sans">
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
                {saved ? '保存しました!' : '保存'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Min Area */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">最小面積 (min_area: 画素数)</span>
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    step={50}
                    value={bubbleDetectionParams.min_area}
                    onChange={(e) =>
                      setBubbleDetectionParams((prev) => ({
                        ...prev,
                        min_area: parseInt(e.target.value, 10) || 50,
                      }))
                    }
                    className="w-20 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded px-1.5 py-0.5 text-right font-mono text-zinc-200 focus:outline-none"
                  />
                </div>
                <input
                  type="range"
                  min={50}
                  max={5000}
                  step={50}
                  value={bubbleDetectionParams.min_area}
                  onChange={(e) =>
                    setBubbleDetectionParams((prev) => ({
                      ...prev,
                      min_area: parseInt(e.target.value, 10),
                    }))
                  }
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
                    min={0}
                    max={255}
                    step={5}
                    value={bubbleDetectionParams.min_brightness}
                    onChange={(e) =>
                      setBubbleDetectionParams((prev) => ({
                        ...prev,
                        min_brightness: Math.min(
                          255,
                          Math.max(0, parseInt(e.target.value, 10) || 0)
                        ),
                      }))
                    }
                    className="w-20 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded px-1.5 py-0.5 text-right font-mono text-zinc-200 focus:outline-none"
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={255}
                  step={5}
                  value={bubbleDetectionParams.min_brightness}
                  onChange={(e) =>
                    setBubbleDetectionParams((prev) => ({
                      ...prev,
                      min_brightness: parseInt(e.target.value, 10),
                    }))
                  }
                  className="w-full accent-[#7C6FDD]"
                />
                <p className="text-[10px] text-zinc-500">
                  吹き出しの白さの閾値です。背景がグレー等の場合は小さくしてください。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
