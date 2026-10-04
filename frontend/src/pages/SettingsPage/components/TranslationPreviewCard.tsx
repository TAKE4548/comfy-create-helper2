import { useEffect, useRef, useState } from 'react'
import { translateApi } from '../../../api/client'

export interface TranslationPreviewCardProps {
  provider: 'google_cloud' | 'deepl' | 'llm' | 'fugumt'
  enabled: boolean
  debounceMs: number
}

type Direction = 'en-ja' | 'ja-en'

const delayFor = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.min(2000, Math.max(300, value)) : 500

export function TranslationPreviewCard({ provider, enabled, debounceMs }: TranslationPreviewCardProps): React.JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [direction, setDirection] = useState<Direction>('en-ja')
  const [translated, setTranslated] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const debounceTimer = useRef<number | null>(null)
  const delay = delayFor(debounceMs)

  const translate = async (text: string, selectedDirection: Direction, selectedProvider: typeof provider) => {
    const normalized = text.trim()
    if (!enabled || !normalized) return
    const requestSequence = ++sequence.current
    setLoading(true)
    setError('')
    try {
      const result = await translateApi.translatePrompt({
        prompt: normalized,
        source_lang: selectedDirection === 'en-ja' ? 'en' : 'ja',
        target_lang: selectedDirection === 'en-ja' ? 'ja' : 'en',
        provider: selectedProvider,
      })
      if (requestSequence === sequence.current) setTranslated(result.translated_prompt)
    } catch {
      if (requestSequence === sequence.current) setError('翻訳に失敗しました。もう一度お試しください。')
    } finally {
      if (requestSequence === sequence.current) setLoading(false)
    }
  }

  useEffect(() => {
    sequence.current += 1
    setTranslated('')
    setError('')
    setLoading(false)
    if (!enabled || !prompt.trim()) return
    debounceTimer.current = window.setTimeout(() => {
      debounceTimer.current = null
      void translate(prompt, direction, provider)
    }, delay)
    return () => {
      if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current)
      debounceTimer.current = null
      sequence.current += 1
    }
  }, [prompt, direction, provider, enabled, delay])

  const changePrompt = (value: string) => {
    sequence.current += 1
    setTranslated('')
    setError('')
    setPrompt(value)
  }
  const chooseDirection = (value: Direction) => {
    if (value === direction) return
    sequence.current += 1
    setTranslated('')
    setError('')
    setDirection(value)
  }
  const submit = () => {
    if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current)
    debounceTimer.current = null
    void translate(prompt, direction, provider)
  }

  return (
    <section aria-labelledby="translation-preview-title" className="rounded-lg border p-4">
      <h3 id="translation-preview-title">翻訳プレビュー</h3>
      <div className="my-3 flex flex-wrap gap-2">
        <button type="button" aria-pressed={direction === 'en-ja'} onClick={() => chooseDirection('en-ja')} className="min-h-11 px-3">
          英語から日本語
        </button>
        <button type="button" aria-pressed={direction === 'ja-en'} onClick={() => chooseDirection('ja-en')} className="min-h-11 px-3">
          日本語から英語
        </button>
      </div>
      <label className="block" htmlFor="translation-source">原文</label>
      <textarea id="translation-source" value={prompt} onChange={(event) => changePrompt(event.target.value)} className="min-h-24 w-full" />
      <div className="my-3 flex items-center gap-3">
        <button type="button" onClick={submit} disabled={!enabled || !prompt.trim() || loading} className="min-h-11 px-4">
          翻訳する
        </button>
        {loading && <span role="status" aria-live="polite">翻訳中です</span>}
      </div>
      <label className="block" htmlFor="translation-result">翻訳結果</label>
      <textarea id="translation-result" value={translated} readOnly className="min-h-24 w-full" />
      <div role="status" aria-live="polite">{error}</div>
      {error && <button type="button" onClick={submit} disabled={!enabled || !prompt.trim()} className="mt-2 min-h-11 px-4">再試行</button>}
    </section>
  )
}
