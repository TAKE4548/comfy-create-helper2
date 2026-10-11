import { describe, expect, it } from 'vitest'
import type { ParamSyncGroup, WorkflowMapping } from '../../api/types'
import {
  parseSeedValue,
  readSeedSettings,
  resolveSeedSyncRoots,
  seedSlotKey,
  setSeedModeForMapping,
  validateSeedMappings,
  SEED_MODES_KEY,
  UINT32_MAX,
} from '../seedModel'

const mapping = (overrides: Partial<WorkflowMapping> = {}): WorkflowMapping => ({
  id: 1,
  master_id: 10,
  node_id: '1',
  variant_id: 20,
  role: 'main_seed',
  param_name: 'seed',
  input_type: 'seed',
  display_name: 'Main Seed',
  ...overrides,
})
const group = (master_role: string, slave_roles: string[], id = 1): ParamSyncGroup => ({
  id,
  workflow_id: 1,
  name: 'sync',
  master_role,
  slave_roles,
  is_enabled: true,
  created_at: '',
})

describe('seedModel', () => {
  it('keys seed settings by master and variant, preserving legacy slots', () => {
    expect(seedSlotKey(mapping())).toBe('master:10:variant:20')
    expect(seedSlotKey(mapping({ variant_id: null }))).toBe('master:10:variant:legacy')
    expect(seedSlotKey(mapping({ variant_id: 21 }))).not.toBe(seedSlotKey(mapping()))
  })

  it('defaults legacy settings to fixed and reads the exact role value', () => {
    expect(readSeedSettings(mapping(), { main_seed: '42' })).toEqual({ mode: 'fixed', seed: 42 })
    expect(readSeedSettings(mapping({ input_type: 'integer' }), { main_seed: '42' })).toEqual({ mode: 'fixed', seed: 42 })
  })

  it('reads and updates versioned modes without changing other values or slots', () => {
    const values = {
      main_seed: '0007',
      other: 'keep',
      [SEED_MODES_KEY]: JSON.stringify({ version: 1, modes: { 'master:10:variant:20': 'random', untouched: 'fixed' } }),
    }
    expect(readSeedSettings(mapping(), values)).toEqual({ mode: 'random', seed: 7 })
    const updated = setSeedModeForMapping(mapping(), values, 'fixed')
    expect(updated.main_seed).toBe('0007')
    expect(updated.other).toBe('keep')
    expect(JSON.parse(updated[SEED_MODES_KEY])).toEqual({ version: 1, modes: { 'master:10:variant:20': 'fixed', untouched: 'fixed' } })
    expect(values.main_seed).toBe('0007')
  })

  it.each([
    ['', 'empty'], ['-1', 'negative'], ['1.2', 'decimal'], ['1e2', 'exponent'], ['NaN', 'NaN'], ['Infinity', 'Infinity'], ['4294967296', 'overflow'],
  ])('rejects invalid seed input %s', (raw) => {
    expect(() => parseSeedValue(raw, 'Main Seed')).toThrow('Main Seed')
  })

  it('accepts uint32 boundaries and rejects unsafe integers', () => {
    expect(parseSeedValue('0', 'Seed')).toBe(0)
    expect(parseSeedValue(String(UINT32_MAX), 'Seed')).toBe(UINT32_MAX)
    expect(() => parseSeedValue('9007199254740992', 'Seed')).toThrow()
  })

  it.each([
    ['bad json', '{'],
    ['unknown version', JSON.stringify({ version: 2, modes: {} })],
    ['invalid mode', JSON.stringify({ version: 1, modes: { 'master:10:variant:20': 'sometimes' } })],
  ])('rejects malformed active mode metadata (%s)', (_label, metadata) => {
    expect(() => readSeedSettings(mapping(), { main_seed: '1', [SEED_MODES_KEY]: metadata })).toThrow()
  })

  it('resolves multi-hop seed syncs to the root seed slot', () => {
    const maps = [mapping(), mapping({ id: 2, master_id: 11, role: 'rough_seed' }), mapping({ id: 3, master_id: 12, role: 'final_seed' })]
    expect(resolveSeedSyncRoots(maps, [group('main_seed', ['rough_seed']), group('rough_seed', ['final_seed'], 2)]))
      .toEqual({ 'master:10:variant:20': 'master:10:variant:20', 'master:11:variant:20': 'master:10:variant:20', 'master:12:variant:20': 'master:10:variant:20' })
  })

  it('rejects seed mixed type, multiple parents, cycles, and mapping collisions', () => {
    const maps = [mapping(), mapping({ id: 2, master_id: 11, role: 'child', input_type: 'seed' }), mapping({ id: 3, master_id: 12, role: 'ordinary', input_type: 'integer' })]
    expect(() => resolveSeedSyncRoots(maps, [group('main_seed', ['ordinary'])])).toThrow()
    expect(() => resolveSeedSyncRoots(maps.slice(0, 2), [group('main_seed', ['child']), group('child', ['main_seed'], 2)])).toThrow()
    expect(() => resolveSeedSyncRoots([maps[0], maps[1], mapping({ id: 3, master_id: 12, role: 'other' })], [group('main_seed', ['child']), group('other', ['child'], 2)])).toThrow()
    expect(validateSeedMappings([mapping(), mapping({ id: 2, master_id: 10, role: 'main_seed' })])).not.toEqual([])
    expect(validateSeedMappings([mapping({ role: SEED_MODES_KEY })])).not.toEqual([])
  })
})
