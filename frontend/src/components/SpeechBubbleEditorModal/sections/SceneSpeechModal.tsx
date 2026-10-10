import { useEffect, useState } from 'react'
import { Check, Circle, CircleX, Loader2, X } from 'lucide-react'
import type { GeneratedSpeechBubbleRead, ServerFont } from '../../../api/types'
import { SceneSpeechOnboarding } from './SceneSpeechOnboarding'
import type { ProgressStep, SceneSpeechModalState } from './SceneSpeechModalState'

interface SceneSpeechModalProps {
  state: SceneSpeechModalState | null
  onClose: () => void
  onRetry: () => void
  onApply: (selectedBubbles: GeneratedSpeechBubbleRead[]) => void
  onPresetCreated: (presetId: number) => void
  onPresetSkipped: () => void
  onReferenceSwitch: (snapshotId: number) => void
  fontList: ServerFont[]
}

const errorLabels = {
  lm_studio_400: 'LM Studio 400',
  connection_refused: '接続拒否',
  timeout: 'タイムアウト',
  unknown: '不明',
}
const stepIcons: Record<ProgressStep['status'], typeof Circle> = {
  pending: Circle, active: Loader2, done: Check, error: CircleX,
}
const tierLabels = { high: '高', mid: '中', low: '低', fallback: '補助' }

export function SceneSpeechModal({ state, onClose, onRetry, onApply, onPresetCreated, onPresetSkipped, onReferenceSwitch, fontList }: SceneSpeechModalProps) {
  const [elapsed, setElapsed] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const result = state?.type === 'review' ? state.result : null

  useEffect(() => {
    if (state?.type !== 'progress') return
    setElapsed(state.elapsedSeconds)
    const timer = window.setInterval(() => setElapsed(current => current + 1), 1000)
    return () => window.clearInterval(timer)
  }, [state?.type, state?.type === 'progress' ? state.elapsedSeconds : null])

  useEffect(() => {
    setSelectedIds(result?.bubbles.map(bubble => bubble.id) ?? [])
  }, [result])

  if (!state) return null

  const content = () => {
    switch (state.type) {
      case 'progress':
        return <>
          <h2 className="text-lg font-semibold">シーン台詞を生成中</h2>
          <p>経過 {elapsed} 秒</p>
          <ol className="space-y-2" aria-label="生成進捗">
            {state.steps.map(step => {
              const StepIcon = stepIcons[step.status]
              return <li key={step.key}>
                <StepIcon className={step.status === 'active' ? 'animate-spin inline-block' : 'inline-block'} size={14} aria-hidden="true" /> {step.label}
              </li>
            })}
          </ol>
        </>
      case 'onboarding':
        return <>
          <h2 className="text-lg font-semibold">キャラクターのスタイル設定</h2>
          <SceneSpeechOnboarding tagSetId={state.tagSetId} fontList={fontList} onPresetCreated={onPresetCreated} onSkip={onPresetSkipped} />
        </>
      case 'error':
        return <>
          <h2 className="text-lg font-semibold">{errorLabels[state.errorKind]}</h2>
          <p role="alert">{state.message}</p>
          <button type="button" onClick={onRetry}>再試行</button>
        </>
      case 'review':
        return <>
          <h2 className="text-lg font-semibold">生成結果を確認</h2>
          <p>{state.result.scene_interpretation}</p>
          <ul className="space-y-2">
            {state.result.bubbles.map(bubble => <li key={bubble.id}>
              <label><input type="checkbox" checked={selectedIds.includes(bubble.id)} onChange={() => setSelectedIds(current => current.includes(bubble.id) ? current.filter(id => id !== bubble.id) : [...current, bubble.id])} />{bubble.text}</label>
            </li>)}
          </ul>
          <section aria-label="系統A">
            <h3>系統A</h3>
            {state.result.tone_samples.length === 0 ? <p>参照なし</p> : <div className="grid grid-cols-3 gap-2">
              {state.result.tone_samples.slice(0, 3).map((sample, index) => <div key={index}>
                {sample.thumbnail_url && <img src={sample.thumbnail_url} alt={`${sample.similarity_tier} トーン参考`} />}
                <span>{tierLabels[sample.similarity_tier]}: {sample.snapshot_id == null ? '参照なし' : `スナップ#${sample.snapshot_id}`}</span>
                <p>{sample.text}</p>
              </div>)}
            </div>}
          </section>
          {state.result.candidate_similar_scenes.length > 0 && <section aria-label="系統B">
            <h3>系統B</h3>
            <div className="grid grid-cols-3 gap-2">
              {state.result.candidate_similar_scenes.slice(0, 3).map(candidate => <div key={candidate.snapshot_id}>
                <img src={candidate.thumbnail_url} alt={`候補シーン ${candidate.snapshot_id}`} />
                <p>{candidate.prompt}</p>
                <button type="button" onClick={() => onReferenceSwitch(candidate.snapshot_id)}>このシーンで再生成</button>
              </div>)}
            </div>
          </section>}
          <button type="button" onClick={() => onApply(state.result.bubbles.filter(bubble => selectedIds.includes(bubble.id)))}>キャンバスに反映</button>
        </>
    }
  }

  const panel = <div className="rounded-t-xl md:rounded-xl bg-white p-5 shadow-xl w-full max-w-[540px] max-h-[80vh] overflow-y-auto" role="dialog" aria-modal="true">
    <div className="flex justify-end"><button type="button" aria-label="閉じる" onClick={onClose}><X aria-hidden="true" size={18} /></button></div>
    {content()}
  </div>

  return <div data-testid="scene-speech-modal">
    <div className="fixed inset-0 z-50 hidden md:flex items-center justify-center bg-black/50">{panel}</div>
    <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">{panel}</div>
  </div>
}
