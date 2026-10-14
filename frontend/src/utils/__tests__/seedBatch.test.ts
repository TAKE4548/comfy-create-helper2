import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import type { Workflow, WorkflowMapping } from '../../api/types'
import { SEED_MODES_KEY, setSeedModeForMapping } from '../seedModel'
import { prepareSeedBatch, validateSeedBatch } from '../seedBatch'

const mapping = (role: string, node_id = role, master_id = 1): WorkflowMapping => ({
  id: master_id, master_id, node_id, variant_id: 1, role, param_name: 'seed',
  input_type: 'seed', display_name: role,
})
const workflow = (...mappings: WorkflowMapping[]): Workflow => ({
  id: 1, name: 'test', created_at: '', mappings,
  json_body: Object.fromEntries(mappings.map(m => [m.node_id, { inputs: { seed: 0 } }])),
})
const values = (...entries: [string, string][]) => Object.fromEntries(entries)

describe('prepareSeedBatch', () => {
  it('[REQ-350/AC-1] increments fixed seeds per batch item and only replaces seed roles', () => {
    const a = mapping('main_seed')
    const params = values(['main_seed', '42'], ['prompt', 'hello'])
    const result = prepareSeedBatch({ workflow: workflow(a), paramValues: params, batchSize: 3 })
    expect(result.map(item => item.seedsBySlot)).toEqual([
      { 'master:1:variant:1': 42 }, { 'master:1:variant:1': 43 }, { 'master:1:variant:1': 44 },
    ])
    expect(result[1].actualParamValues).toEqual({ ...params, main_seed: '43' })
    expect(params.main_seed).toBe('42')
  })

  it('[REQ-350/AC-2][REQ-350/AC-3] draws random values once per root per item and copies them to synchronized seed children', () => {
    const a = mapping('a', 'node-a', 1)
    const b = mapping('b', 'node-b', 2)
    const draw = vi.fn().mockReturnValueOnce(7).mockReturnValueOnce(8)
    let params = values(['a', '4'], ['b', '99'])
    params = setSeedModeForMapping(a, params, 'random')
    const result = prepareSeedBatch({
      workflow: workflow(a, b), paramValues: params, batchSize: 2,
      paramSyncGroups: [{ id: 1, workflow_id: 1, name: 'sync', master_role: 'a', slave_roles: ['b'], is_enabled: true, created_at: '' }],
      randomUint32: draw,
    })
    expect(draw).toHaveBeenCalledTimes(2)
    expect(result.map(item => Object.values(item.seedsBySlot))).toEqual([[7, 7], [8, 8]])
    expect(result[0].actualParamValues).toMatchObject({ a: '7', b: '7' })
  })

  it('[REQ-350/AC-4] randomizes independent slots independently and does not mutate workflow metadata', () => {
    const a = mapping('a')
    const b = mapping('b', 'b', 2)
    let params = values(['a', '1'], ['b', '2'])
    params = setSeedModeForMapping(a, params, 'random')
    params = setSeedModeForMapping(b, params, 'random')
    const original = JSON.stringify(workflow(a, b))
    const draw = vi.fn().mockReturnValueOnce(11).mockReturnValueOnce(12)
    const result = prepareSeedBatch({ workflow: workflow(a, b), paramValues: params, batchSize: 1, randomUint32: draw })
    expect(Object.values(result[0].seedsBySlot)).toEqual([11, 12])
    expect(JSON.stringify(workflow(a, b))).toBe(original)
    expect(result[0].actualParamValues[SEED_MODES_KEY]).toBe(params[SEED_MODES_KEY])
  })

  it('[REQ-350/AC-5] validates the whole batch before drawing or returning partial results', () => {
    const a = mapping('a')
    const draw = vi.fn(() => 1)
    expect(() => prepareSeedBatch({ workflow: workflow(a), paramValues: values(['a', '4294967295']), batchSize: 2, randomUint32: draw })).toThrow(/a/)
    expect(draw).not.toHaveBeenCalled()
  })

  it.each([0, 9, 10000000, Infinity, 1.5])('[REQ-350/AC-6] rejects invalid dedicated-seed batch size %s before drawing', batchSize => {
    const draw = vi.fn(() => 1)
    expect(() => validateSeedBatch({ workflow: workflow(mapping('a')), paramValues: values(['a', '1']), batchSize, randomUint32: draw })).toThrow()
    expect(draw).not.toHaveBeenCalled()
  })

  it('[REQ-350/AC-6] does not impose the dedicated-seed limit when no seed mapping exists', () => {
    expect(() => validateSeedBatch({ workflow: workflow(), paramValues: {}, batchSize: 10000000 })).not.toThrow()
  })

  it('[REQ-350/AC-5] rejects invalid random draw values', () => {
    const a = mapping('a')
    const params = setSeedModeForMapping(a, values(['a', '1']), 'random')
    expect(() => prepareSeedBatch({ workflow: workflow(a), paramValues: params, batchSize: 1, randomUint32: () => -1 })).toThrow(/random/i)
  })

  it('[REQ-353/AC-1] rejects graph-reference seed inputs and missing node/role mappings', () => {
    const a = mapping('a')
    expect(() => prepareSeedBatch({ workflow: { ...workflow(a), json_body: { [a.node_id]: { inputs: { seed: ['3', 0] } } } }, paramValues: values(['a', '1']), batchSize: 1 })).toThrow(/a/)
    expect(() => validateSeedBatch({ workflow: { ...workflow(a), json_body: {} }, paramValues: values(['a', '1']), batchSize: 1 })).toThrow(/a/)
    expect(() => validateSeedBatch({ workflow: workflow({ ...a, role: null }), paramValues: {}, batchSize: 1 })).toThrow(/role/i)
  })

  it('[REQ-353/AC-2] resolves registered fallback inputs and rejects missing or conflicting destinations', () => {
    const a = mapping('a')
    a.fallback_param_names = ['noise_seed']
    const noiseOnly = { ...workflow(a), json_body: { [a.node_id]: { inputs: { noise_seed: 0 } } } }
    const params = setSeedModeForMapping(a, values(['a', '1']), 'random')
    const result = prepareSeedBatch({ workflow: noiseOnly, paramValues: params, batchSize: 3, randomUint32: vi.fn().mockReturnValueOnce(11).mockReturnValueOnce(22).mockReturnValueOnce(33) })
    expect(result.map(item => item.seedsBySlot['master:1:variant:1'])).toEqual([11, 22, 33])
    expect(result.map(item => item.actualParamValues.a)).toEqual(['11', '22', '33'])

    expect(() => validateSeedBatch({ workflow: { ...noiseOnly, json_body: { [a.node_id]: { inputs: { other: 0 } } } }, paramValues: params, batchSize: 1 })).toThrow(/node/)

    const b = mapping('b', a.node_id, 2)
    b.param_name = 'noise_seed'
    const aliases = { ...workflow(a, b), json_body: { [a.node_id]: { inputs: { noise_seed: 0 } } } }
    expect(() => validateSeedBatch({ workflow: aliases, paramValues: values(['a', '1'], ['b', '2']), batchSize: 1 })).toThrow(/conflicting seed graph destination/)
  })

  it('[REQ-353/AC-3] rejects a graph reference at the primary even when a scalar fallback exists', () => {
    const a = mapping('a')
    a.fallback_param_names = ['noise_seed']
    const source = { ...workflow(a), json_body: { [a.node_id]: { inputs: { seed: ['5', 0], noise_seed: 9 } } } }
    expect(() => validateSeedBatch({ workflow: source, paramValues: values(['a', '1']), batchSize: 1 })).toThrow(/reference/i)
  })

  it('[REQ-350/AC-3] rejects seed sync cycles, mixed types, and duplicate parents', () => {
    const a = mapping('a'); const b = mapping('b', 'b', 2); const c = mapping('c', 'c', 3)
    const group = (master_role: string, slave_roles: string[]) => ({ id: 1, workflow_id: 1, name: 'sync', master_role, slave_roles, is_enabled: true, created_at: '' })
    const options = { workflow: workflow(a, b, c), paramValues: values(['a', '1'], ['b', '2'], ['c', '3']), batchSize: 1 }
    expect(() => validateSeedBatch({ ...options, paramSyncGroups: [group('a', ['b']), group('b', ['a'])] })).toThrow(/cycle/i)
    expect(() => validateSeedBatch({ ...options, workflow: { ...options.workflow, mappings: [a, { ...b, input_type: 'int' }] }, paramSyncGroups: [group('a', ['b'])] })).toThrow(/mix/i)
    expect(() => validateSeedBatch({ ...options, paramSyncGroups: [group('a', ['c']), group('b', ['c'])] })).toThrow(/parent/i)
  })

  it('[REQ-350/AC-1][PBT] preserves sequential increment and 32-bit integer invariants across arbitrary base seeds and batch sizes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4294967295 - 8 }),
        fc.integer({ min: 1, max: 8 }),
        (baseSeed, batchSize) => {
          const a = mapping('main_seed')
          const params = values(['main_seed', String(baseSeed)])
          const result = prepareSeedBatch({ workflow: workflow(a), paramValues: params, batchSize })
          expect(result).toHaveLength(batchSize)
          for (let i = 0; i < batchSize; i++) {
            expect(result[i].seedsBySlot['master:1:variant:1']).toBe(baseSeed + i)
            expect(result[i].actualParamValues.main_seed).toBe(String(baseSeed + i))
          }
          return true
        }
      ),
      { numRuns: 50 }
    )
  })

  it('[REQ-350/AC-2][PBT] generates random uint32 values within bounds without mutating workflow', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.array(fc.integer({ min: 0, max: 4294967295 }), { minLength: 8, maxLength: 8 }),
        (batchSize, randoms) => {
          const a = mapping('main_seed')
          let callCount = 0
          const draw = () => randoms[callCount++ % randoms.length]
          let params = values(['main_seed', '0'])
          params = setSeedModeForMapping(a, params, 'random')
          const wf = workflow(a)
          const snapshot = JSON.stringify(wf)
          const result = prepareSeedBatch({ workflow: wf, paramValues: params, batchSize, randomUint32: draw })
          expect(result).toHaveLength(batchSize)
          expect(JSON.stringify(wf)).toBe(snapshot)
          for (let i = 0; i < batchSize; i++) {
            const seedVal = result[i].seedsBySlot['master:1:variant:1']
            expect(seedVal).toBeGreaterThanOrEqual(0)
            expect(seedVal).toBeLessThanOrEqual(4294967295)
          }
          return true
        }
      ),
      { numRuns: 50 }
    )
  })
})
