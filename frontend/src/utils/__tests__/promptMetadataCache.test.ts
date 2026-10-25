// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { LS_KEYS } from '../localStorageKeys'
import { LOCAL_METADATA_CACHE_LIMIT, prunePromptMetadataCache } from '../promptMetadataCache'

function createStorage(entries: Record<string, string>, overrides: Partial<Storage> = {}): Storage {
  const values = new Map(Object.entries(entries))
  return {
    get length() { return values.size },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)) },
    removeItem: (key: string) => { values.delete(key) },
    clear: () => values.clear(),
    ...overrides,
  } as Storage
}

const keyFor = (id: string) => `${LS_KEYS.METADATA_PREFIX}${id}`
const record = (timestamp: number) => JSON.stringify({ timestamp, paramValues: {} })

describe('prunePromptMetadataCache', () => {
  it('exports the 30-record limit and does not remove anything below the limit', () => {
    expect(LOCAL_METADATA_CACHE_LIMIT).toBe(30)
    const storage = createStorage({ [keyFor('a')]: record(1), [keyFor('b')]: record(2) })

    prunePromptMetadataCache('incoming', storage)

    expect(storage.length).toBe(2)
  })

  it.each([0, 29, 30, 200])('keeps at most 29 existing records when there is no stored incoming id (%i)', (count) => {
    const entries = Object.fromEntries(Array.from({ length: count }, (_, i) => [keyFor(`p${i}`), record(i)]))
    const storage = createStorage(entries)

    prunePromptMetadataCache('incoming', storage)

    expect(storage.length).toBe(Math.min(count, LOCAL_METADATA_CACHE_LIMIT - 1))
  })

  it('retains the incoming id and the 29 newest other records', () => {
    const entries = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [keyFor(`p${i}`), record(i)]))
    const storage = createStorage(entries)

    prunePromptMetadataCache('p0', storage)

    expect(storage.getItem(keyFor('p0'))).not.toBeNull()
    expect(storage.getItem(keyFor('p30'))).not.toBeNull()
    expect(storage.getItem(keyFor('p1'))).toBeNull()
    expect(storage.getItem(keyFor('p2'))).not.toBeNull()
    expect(storage.length).toBe(30)
  })

  it('does not count an existing incoming record among the 29 others', () => {
    const entries = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [keyFor(`p${i}`), record(i)]))
    const storage = createStorage(entries)

    prunePromptMetadataCache('p0', storage)

    expect(storage.length).toBe(30)
    expect(storage.getItem(keyFor('p0'))).not.toBeNull()
    expect(storage.getItem(keyFor('p29'))).not.toBeNull()
  })

  it('prefers higher timestamps and uses key order for timestamp ties', () => {
    const entries = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [keyFor(`p${String(i).padStart(2, '0')}`), record(i < 3 ? 1 : i)]))
    const storage = createStorage(entries)

    prunePromptMetadataCache('incoming', storage)

    expect(storage.getItem(keyFor('p00'))).not.toBeNull()
    expect(storage.getItem(keyFor('p01'))).toBeNull()
    expect(storage.getItem(keyFor('p02'))).toBeNull()
  })

  it('removes corrupt, non-object, missing, and invalid timestamps before keeping valid entries', () => {
    const storage = createStorage({
      [keyFor('broken')]: '{',
      [keyFor('array')]: '[]',
      [keyFor('missing')]: JSON.stringify({ paramValues: {} }),
      [keyFor('string')]: JSON.stringify({ timestamp: '5' }),
      [keyFor('infinite')]: JSON.stringify({ timestamp: Infinity }),
      [keyFor('valid')]: record(1),
    })

    prunePromptMetadataCache('incoming', storage)

    expect(storage.length).toBe(1)
    expect(storage.getItem(keyFor('valid'))).not.toBeNull()
  })

  it('collects keys before deleting and propagates storage read failures', () => {
    const storage = createStorage({ [keyFor('a')]: record(1), [keyFor('b')]: record(2) }, {
      getItem: vi.fn(() => { throw new Error('denied') }),
    })

    expect(() => prunePromptMetadataCache('incoming', storage)).toThrow('denied')
    expect(storage.length).toBe(2)
  })

  it('leaves keys outside the metadata prefix untouched', () => {
    const storage = createStorage({
      [keyFor('a')]: record(1),
      'prompt-surgeon-other': record(2),
    })

    prunePromptMetadataCache('incoming', storage)

    expect(storage.getItem('prompt-surgeon-other')).not.toBeNull()
  })
})
