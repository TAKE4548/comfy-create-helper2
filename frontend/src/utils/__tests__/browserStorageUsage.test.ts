import { describe, expect, it, vi } from 'vitest'
import {
  formatStorageUsage,
  measureBrowserStorageUsage,
  measureStorageUsage,
} from '../browserStorageUsage'

function fakeStorage(entries: Array<[string, string]>): Storage {
  const map = new Map(entries)
  return {
    get length() { return map.size },
    clear() { map.clear() },
    getItem(key) { return map.get(key) ?? null },
    key(index) { return [...map.keys()][index] ?? null },
    removeItem(key) { map.delete(key) },
    setItem(key, value) { map.set(key, value) },
  }
}

describe('measureStorageUsage', () => {
  it('sums every key and value as UTF-16 code units', () => {
    expect(measureStorageUsage(() => fakeStorage([['k'.repeat(524288), '']]))).toEqual({ status: 'ok', bytes: 1048576 })
    expect(measureStorageUsage(() => fakeStorage([['k'.repeat(1024), '']]))).toEqual({ status: 'ok', bytes: 2048 })
    expect(measureStorageUsage(() => fakeStorage([]))).toEqual({ status: 'ok', bytes: 0 })
    expect(measureStorageUsage(() => fakeStorage([['😀é日本', '語']]))).toEqual({ status: 'ok', bytes: 14 })
  })

  it('returns unavailable for throwing accessors and invalid enumeration', () => {
    const throwing = (property: 'length' | 'key' | 'getItem'): Storage => ({
      get length() { if (property === 'length') throw Error(); return 1 },
      clear() {}, getItem() { if (property === 'getItem') throw Error(); return 'v' },
      key() { if (property === 'key') throw Error(); return 'k' }, removeItem() {}, setItem() {},
    })
    expect(measureStorageUsage(() => { throw Error('blocked') })).toEqual({ status: 'unavailable' })
    for (const property of ['length', 'key', 'getItem'] as const) {
      expect(measureStorageUsage(() => throwing(property))).toEqual({ status: 'unavailable' })
    }
    expect(measureStorageUsage(() => ({ ...fakeStorage([]), length: 1, key: () => null }))).toEqual({ status: 'unavailable' })
    expect(measureStorageUsage(() => ({ ...fakeStorage([['k', 'v']]), getItem: () => null }))).toEqual({ status: 'unavailable' })
  })

  it('rejects length changes and does not return partial bytes', () => {
    let reads = 0
    const storage = fakeStorage([['a', 'b'], ['c', 'd']])
    const changing = Object.create(storage) as Storage
    Object.defineProperty(changing, 'length', { get: () => ++reads === 1 ? 2 : 1 })
    expect(measureStorageUsage(() => changing)).toEqual({ status: 'unavailable' })
  })
})

describe('formatStorageUsage', () => {
  it('selects units using raw bytes and rounds to one decimal', () => {
    expect(formatStorageUsage({ status: 'ok', bytes: 1024 })).toBe('1.0 KiB')
    expect(formatStorageUsage({ status: 'ok', bytes: 1048575 })).toBe('1024.0 KiB')
    expect(formatStorageUsage({ status: 'ok', bytes: 1048576 })).toBe('1.0 MiB')
    expect(formatStorageUsage({ status: 'ok', bytes: 1048577 })).toBe('1.0 MiB')
    expect(formatStorageUsage({ status: 'ok', bytes: 0 })).toBe('0.0 KiB')
    expect(formatStorageUsage({ status: 'unavailable' })).toBe('取得不可')
  })
})

describe('measureBrowserStorageUsage', () => {
  it('measures local and session storage independently', () => {
    const local = fakeStorage([['local', 'data']])
    const session = fakeStorage([['s', 'x']])
    vi.stubGlobal('window', { get localStorage() { return local }, get sessionStorage() { return session } })
    expect(measureBrowserStorageUsage()).toEqual({
      localStorage: { status: 'ok', bytes: 18 },
      sessionStorage: { status: 'ok', bytes: 4 },
    })
  })

  it('preserves the other result when one storage getter is blocked', () => {
    const session = fakeStorage([['s', 'x']])
    vi.stubGlobal('window', {
      get localStorage() { throw Error('blocked') },
      get sessionStorage() { return session },
    })
    expect(measureBrowserStorageUsage()).toEqual({
      localStorage: { status: 'unavailable' },
      sessionStorage: { status: 'ok', bytes: 4 },
    })
  })
})
