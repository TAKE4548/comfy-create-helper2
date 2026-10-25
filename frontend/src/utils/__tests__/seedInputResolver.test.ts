// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { WorkflowMapping } from '../../api/types'
import { resolveSeedInputKey } from '../seedInputResolver'

const mapping = (overrides: Partial<WorkflowMapping> = {}): Pick<WorkflowMapping, 'param_name' | 'fallback_param_names'> => ({
  param_name: 'seed',
  ...overrides,
})

describe('resolveSeedInputKey', () => {
  it('prefers primary when primary and fallback inputs both exist', () => {
    expect(resolveSeedInputKey(mapping({ fallback_param_names: ['noise_seed'] }), { seed: 0, noise_seed: 2 })).toBe('seed')
  })

  it('uses fallback registration order', () => {
    expect(resolveSeedInputKey(mapping({ fallback_param_names: ['noise_seed', 'value'] }), { value: 3, noise_seed: 4 })).toBe('noise_seed')
  })

  it('ignores duplicate, empty, and non-string candidates', () => {
    expect(resolveSeedInputKey(mapping({ param_name: '', fallback_param_names: ['', 1 as unknown as string, 'noise_seed', 'noise_seed'] }), { noise_seed: 1 })).toBe('noise_seed')
  })

  it('accepts zero and null as present values', () => {
    expect(resolveSeedInputKey(mapping(), { seed: 0 })).toBe('seed')
    expect(resolveSeedInputKey(mapping(), { seed: null })).toBe('seed')
  })

  it('does not infer unregistered keys such as value or noise_seed', () => {
    expect(resolveSeedInputKey(mapping({ param_name: 'custom' }), { value: 1, noise_seed: 2 })).toBeNull()
  })

  it('skips registered keys whose value is undefined', () => {
    expect(resolveSeedInputKey(mapping({ fallback_param_names: ['noise_seed'] }), { seed: undefined, noise_seed: 4 })).toBe('noise_seed')
  })

  it('handles missing inputs and null fallback registrations', () => {
    expect(resolveSeedInputKey(mapping(), undefined)).toBeNull()
    expect(resolveSeedInputKey(mapping({ fallback_param_names: null }), {})).toBeNull()
  })

  it('does not resolve inherited properties', () => {
    const inputs = Object.create({ seed: 7 }) as Record<string, unknown>
    expect(resolveSeedInputKey(mapping(), inputs)).toBeNull()
  })

  it('returns the primary key even when its value is an array', () => {
    expect(resolveSeedInputKey(mapping({ fallback_param_names: ['noise_seed'] }), { seed: ['1', '2'], noise_seed: 4 })).toBe('seed')
  })
})
