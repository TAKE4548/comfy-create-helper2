import { useEffect, useState } from 'react'
import { llmPromptsApi } from '../../../api/client'
import { useConfig } from '../../../hooks/useConfig'
import { resolveComfyUrl } from '../../../hooks/useComfyWebSocket'
import { useGenerationStore } from '../../../store/useGenerationStore'

export function ServiceConnectionCard(): React.JSX.Element {
  const comfyUrl = useGenerationStore((state) => state.comfyUrl)
  const setComfyUrl = useGenerationStore((state) => state.setComfyUrl)
  const { data: config } = useConfig()
  const effectiveUrl = resolveComfyUrl(comfyUrl ?? config?.comfy_url ?? null)
  const [draft, setDraft] = useState(effectiveUrl)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!dirty) setDraft(effectiveUrl)
  }, [dirty, effectiveUrl])

  const saveUrl = (): void => {
    try {
      const parsed = new URL(draft.trim())
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.host) throw new Error()
      const savedUrl = parsed.toString().replace(/\/$/, '')
      setComfyUrl(savedUrl)
      setDraft(savedUrl)
      setDirty(false)
      setMessage('ComfyUI URLを保存しました。')
    } catch {
      setMessage('HTTPまたはHTTPSの有効なURLを入力してください。')
    }
  }

  const checkConnections = async (): Promise<void> => {
    setChecking(true)
    const checkUrl = async (url: string): Promise<string> => {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return '接続済み'
    }
    const [backend, comfy, models] = await Promise.allSettled([
      checkUrl(`${window.location.origin}/health`),
      checkUrl(effectiveUrl),
      llmPromptsApi.getModels(),
    ])
    const describe = (result: PromiseSettledResult<unknown>): string => {
      if (result.status === 'fulfilled') return '接続済み'
      const detail = result.reason instanceof Error && /^HTTP \d+$/.test(result.reason.message)
        ? `（${result.reason.message}）`
        : ''
      return `接続に失敗しました${detail}`
    }
    const modelStatus = models.status === 'rejected'
      ? 'バックエンド経由のモデル確認に失敗しました'
      : models.value.length === 0
        ? 'モデルを取得できず接続確認不可'
        : 'モデル一覧を取得しました'
    setMessage(`Backend: ${describe(backend)} / ComfyUI: ${describe(comfy)} / LM Studio: ${modelStatus}。`)
    setChecking(false)
  }

  return (
    <section aria-labelledby="service-connections-title" className="space-y-4 rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface p-4 text-zinc-200">
      <h2 id="service-connections-title" className="text-lg font-semibold text-zinc-100">外部サービス接続</h2>
      <div className="space-y-2">
        <label htmlFor="comfy-url" className="block text-sm font-medium text-zinc-300">ComfyUI URL</label>
        <input
          id="comfy-url"
          type="url"
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setDirty(true) }}
          className="w-full rounded-md border border-[rgba(255,255,255,0.06)] bg-surface-2/20 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
        />
        <button type="button" onClick={saveUrl} className="rounded-md border border-[rgba(255,255,255,0.06)] bg-surface-2/20 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-surface-2/40">URLを保存</button>
      </div>
      <p className="text-sm text-zinc-300">Backend: {window.location.origin}（APIは /api を使用）</p>
      <p className="text-sm text-zinc-400">LM Studio URLはbackendの.env（LLM_BASE_URL）で設定します。この画面ではURLを取得できません。</p>
      <button type="button" onClick={() => void checkConnections()} disabled={checking} className="rounded-md bg-green-500 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-green-400 disabled:opacity-50">
        {checking ? '確認中…' : '接続を確認'}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-zinc-200">{message}</p>
    </section>
  )
}
