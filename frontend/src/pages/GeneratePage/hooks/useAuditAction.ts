/**
 * useAuditAction — manages LLM audit state and execution.
 */

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { auditApi } from '../../../api/client'
import { useGenerationStore } from '../../../store/useGenerationStore'
import type { AuditResult } from '../../../api/types'

export type AuditType = 'interference' | 'vocabulary' | 'physical'

export function useAuditAction() {
  const { paramValues } = useGenerationStore()

  const [auditOpen, setAuditOpen] = useState(false)
  const [auditIntent, setAuditIntent] = useState('')
  const [auditTypes, setAuditTypes] = useState<AuditType[]>(['interference'])
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null)
  const [auditStatus, setAuditStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const runAudit = useMutation({
    mutationFn: async () => {
      setAuditStatus('loading')
      try {
        const pos = Object.entries(paramValues)
          .filter(([k]) => {
            const keyLower = k.toLowerCase()
            return (keyLower.includes('positive') || keyLower.includes('prompt')) && !keyLower.includes('negative')
          })
          .map(([, v]) => v)
          .join(', ')

        const res = (await auditApi.run({
          audit_types: auditTypes,
          positive: pos,
          negative: paramValues['Negative_Prompt'] ?? '',
          intent: auditIntent,
          model_hint: 'SDXL',
        })) as AuditResult

        setAuditResult(res)
        setAuditStatus('done')
        return res
      } catch (error) {
        setAuditStatus('error')
        throw error
      }
    },
  })

  return {
    auditOpen,
    setAuditOpen,
    auditIntent,
    setAuditIntent,
    auditTypes,
    setAuditTypes,
    auditResult,
    auditStatus,
    runAudit,
  }
}
