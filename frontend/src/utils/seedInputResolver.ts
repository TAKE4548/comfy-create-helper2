import type { WorkflowMapping } from '../api/types'

/** Resolve the first explicitly registered seed input present on a workflow node. */
export function resolveSeedInputKey(
  mapping: Pick<WorkflowMapping, 'input_name' | 'param_name' | 'fallback_param_names'>,
  inputs: Record<string, unknown> | null | undefined,
): string | null {
  if (typeof mapping.input_name === 'string' && mapping.input_name.trim().length > 0) {
    return mapping.input_name.trim()
  }

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
