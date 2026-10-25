// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateUUID } from '../utils/uuid'

describe('generateUUID', () => {
  const originalCrypto = globalThis.crypto

  beforeEach(() => {
    // グローバルの crypto オブジェクトをリセット
    Object.defineProperty(globalThis, 'crypto', {
      value: { ...originalCrypto },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      writable: true,
      configurable: true
    })
  })

  it('should generate a valid UUID format string', () => {
    const uuid = generateUUID()
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('should generate unique UUIDs', () => {
    const uuids = new Set()
    for (let i = 0; i < 100; i++) {
      uuids.add(generateUUID())
    }
    expect(uuids.size).toBe(100)
  })

  it('should fallback to getRandomValues when randomUUID is not available', () => {
    // randomUUID を無効化
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true
    })

    const uuid = generateUUID()
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('should fallback to Math.random when crypto is completely unavailable or limited', () => {
    // crypto 全体を一時的に無効化
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true
    })

    const uuid = generateUUID()
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
})
