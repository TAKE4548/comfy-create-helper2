import { useCallback, useMemo } from 'react'
import { useGenerationStore } from '../../../store/useGenerationStore'
import type { GenerationItem, GenerationSnapshot } from '../../../api/domains/generation'

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function useStudioGeneration(projectId: number | null): {
  batches: GenerationSnapshot['batches']
  submit: (items: GenerationItem[]) => Promise<string>
  progress: (id: string) => { finished: number; total: number }
} {
  const snapshot = useGenerationStore((state) => state.generationSnapshot)
  const sessionId = useGenerationStore((state) => state.clientId)
  const batches = useMemo(
    () => snapshot?.batches.filter((batch) => batch.scope === 'studio' && batch.project_id === projectId) ?? [],
    [snapshot, projectId],
  )

  const submit = useCallback(async (items: GenerationItem[]) => {
    if (projectId === null) throw new Error('Studioプロジェクトが保存されていません')
    const frozenItems = JSON.parse(JSON.stringify(items)) as GenerationItem[]
    const accepted = await useGenerationStore.getState().submitGenerationBatch({
      request_id: createRequestId(),
      session_id: sessionId,
      scope: 'studio',
      project_id: projectId,
      items: frozenItems,
    })
    return accepted.batch_id
  }, [projectId, sessionId])

  const progress = useCallback((batchId: string) => {
    const jobs = snapshot?.jobs.filter((job) => job.batch_id === batchId && job.scope === 'studio') ?? []
    return {
      finished: jobs.filter((job) => job.status === 'succeeded' || job.status === 'failed').length,
      total: jobs.length,
    }
  }, [snapshot])

  return { batches, submit, progress }
}
