// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({
  subscribers: new Map<number, {
    onMessage: (message: Record<string, unknown>) => void
    onOpen?: () => void
    onClose?: () => void
  }>(),
  nextId: 0,
  failSubscribe: false
}))

vi.mock('../systemWsService', () => ({
  systemWsService: {
    subscribe: vi.fn((onMessage, onOpen, onClose) => {
      if (shared.failSubscribe) throw new Error('subscribe failed')
      const id = ++shared.nextId
      shared.subscribers.set(id, { onMessage, onOpen, onClose })
      return () => { shared.subscribers.delete(id) }
    }),
    resetForTesting: vi.fn(() => { shared.subscribers.clear() })
  }
}))

import { systemWsService } from '../systemWsService'
import {
  BASE_RECONNECT_DELAY_MS,
  ComfyWebSocketService,
  MAX_RECONNECT_DELAY_MS
} from '../comfyWebSocketService'

describe('ComfyWebSocketService compatibility facade', () => {
  let service: ComfyWebSocketService

  const callbacks = () => ({
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onError: vi.fn(),
    onBlobMessage: vi.fn(),
    onJsonMessage: vi.fn()
  })

  beforeEach(() => {
    service = new ComfyWebSocketService()
    shared.subscribers.clear()
    shared.nextId = 0
    shared.failSubscribe = false
    vi.stubGlobal('WebSocket', vi.fn())
  })

  afterEach(() => {
    service.resetForTesting()
    shared.subscribers.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('subscribes to the shared backend channel, maps JSON events, and creates no Comfy socket', () => {
    const listener = callbacks()
    expect(service.connect('http://localhost:8188', 'legacy-client', listener)).toBeNull()
    expect(WebSocket).not.toHaveBeenCalled()
    expect(service.getWebSocket()).toBeNull()
    expect(shared.subscribers.size).toBe(1)

    const subscriber = [...shared.subscribers.values()][0]
    subscriber.onOpen?.()
    subscriber.onMessage({ type: 'GENERATION_EVENT', data: { revision: 7 } })
    subscriber.onMessage({ type: 'executed', data: { output: 'ignored legacy shape' } })
    subscriber.onClose?.()

    expect(listener.onOpen).toHaveBeenCalledOnce()
    expect(listener.onJsonMessage).toHaveBeenCalledTimes(2)
    expect(listener.onJsonMessage).toHaveBeenCalledWith('GENERATION_EVENT', { revision: 7 })
    expect(listener.onJsonMessage).toHaveBeenCalledWith('executed', { output: 'ignored legacy shape' })
    expect(listener.onClose).toHaveBeenCalledOnce()
    expect(listener.onBlobMessage).not.toHaveBeenCalled()
    expect(listener.onError).not.toHaveBeenCalled()
  })

  it('disconnect/reset removes only this facade subscriber and leaves other owners connected', () => {
    const otherUnsubscribe = systemWsService.subscribe(vi.fn())
    service.connect('http://localhost:8188', 'legacy-client', callbacks())
    expect(shared.subscribers.size).toBe(2)

    service.disconnect()
    expect(shared.subscribers.size).toBe(1)

    service.connect('http://localhost:8188', 'legacy-client', callbacks())
    service.resetForTesting()
    expect(shared.subscribers.size).toBe(1)
    otherUnsubscribe()
    expect(shared.subscribers.size).toBe(0)
  })

  it('forwards callback failures through onError without owning socket failure/reconnect behavior', () => {
    const listener = callbacks()
    listener.onJsonMessage.mockImplementation(() => { throw new Error('consumer error') })
    service.connect('http://localhost:8188', 'legacy-client', listener)
    const subscriber = [...shared.subscribers.values()][0]

    subscriber.onMessage({ type: 'GENERATION_EVENT', data: {} })

    expect(listener.onError).toHaveBeenCalledOnce()
    expect(service.getReconnectTimer()).toBeNull()
    expect(service.getHeartbeatTimer()).toBeNull()
  })

  it('reports a shared-service subscription initialization failure', () => {
    const listener = callbacks()
    shared.failSubscribe = true

    expect(service.connect('http://localhost:8188', 'legacy-client', listener)).toBeNull()
    expect(listener.onError).toHaveBeenCalledOnce()
    expect(shared.subscribers.size).toBe(0)
  })

  it('preserves URL and request-promise helpers while releasing promises during test reset', async () => {
    const submission = Promise.resolve('prompt-id')
    const history = Promise.resolve()
    service.setComfyUrl('http://localhost:8188')
    service.setIsInitializing(true)
    service.setActiveSubmissionPromise(submission)
    service.setActiveFetchHistoryPromise(history)

    expect(service.getComfyUrl()).toBe('http://localhost:8188')
    expect(service.getIsInitializing()).toBe(true)
    expect(service.getActiveSubmissionPromise()).toBe(submission)
    expect(service.getActiveFetchHistoryPromise()).toBe(history)
    await submission
    await history

    service.resetForTesting()

    expect(service.getComfyUrl()).toBe('http://localhost:8188')
    expect(service.getIsInitializing()).toBe(false)
    expect(service.getActiveSubmissionPromise()).toBeNull()
    expect(service.getActiveFetchHistoryPromise()).toBeNull()
  })

  it('keeps the legacy backoff helpers and resets retry count when shared channel opens', () => {
    service.incrementRetryCount()
    service.incrementRetryCount()
    const delay = service.getReconnectDelay()
    expect(delay).toBeGreaterThanOrEqual(BASE_RECONNECT_DELAY_MS * 4)
    expect(delay).toBeLessThan(BASE_RECONNECT_DELAY_MS * 4 + 500)

    const listener = callbacks()
    service.connect('http://localhost:8188', 'legacy-client', listener)
    service.incrementRetryCount()
    ;[...shared.subscribers.values()][0].onOpen?.()
    expect(service.getRetryCount()).toBe(0)
    expect(MAX_RECONNECT_DELAY_MS).toBe(15000)
  })

  it('never starts an independent heartbeat or emits Comfy ping frames', () => {
    service.startHeartbeat()
    service.sendPing()
    expect(service.getHeartbeatTimer()).toBeNull()
    expect(WebSocket).not.toHaveBeenCalled()
  })
})
