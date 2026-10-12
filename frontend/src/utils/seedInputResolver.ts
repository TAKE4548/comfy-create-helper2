import type { WorkflowMapping } from '../api/types'

/** Resolve the first explicitly registered seed input present on a workflow node. */
export function resolveSeedInputKey(
  mapping: Pick<WorkflowMapping, 'param_name' | 'fallback_param_names'>,
  inputs: Record<string, unknown> | null | undefined,
): string | null {
  if (!inputs) return null

  const candidates = [mapping.param_name, ...(mapping.fallback_param_names ?? [])]
  const seen = new Set<string>()

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.length === 0 || seen.has(candidate)) continue
    seen.add(candidate)
    if (Object.prototype.hasOwnProperty.call(inputs, candidate) && inputs[candidate] !== undefined) {
      return candidate
    }
  }

  return null
}
