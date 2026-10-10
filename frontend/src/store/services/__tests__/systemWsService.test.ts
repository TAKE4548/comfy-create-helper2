import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemWsService } from '../systemWsService'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = MockWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({} as CloseEvent)
  })

  constructor(_url: string) {
    MockWebSocket.instances.push(this)
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.({} as Event)
  }

  message(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent)
  }
}

describe('SystemWsService', () => {
  let service: SystemWsService

  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    service = new SystemWsService()
  })

  afterEach(() => {
    service.resetForTesting()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shares one socket across subscribers and removes only the unsubscribed callback', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = service.subscribe(first)
    service.subscribe(second)

    expect(MockWebSocket.instances).toHaveLength(1)
    MockWebSocket.instances[0].open()
    unsubscribeFirst()
    MockWebSocket.instances[0].message({ type: 'GENERATION_EVENT', data: {} })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith({ type: 'GENERATION_EVENT', data: {} })
    expect(MockWebSocket.instances[0].close).not.toHaveBeenCalled()
  })

  it('closes the socket and clears timers after the last subscriber leaves', () => {
    const unsubscribe = service.subscribe(vi.fn())
    const socket = MockWebSocket.instances[0]
    socket.open()
    unsubscribe()

    expect(socket.close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pings every 25 seconds and isolates subscriber callback failures', () => {
    service.subscribe(() => { throw new Error('subscriber failure') })
    const second = vi.fn()
    service.subscribe(second)
    const socket = MockWebSocket.instances[0]
    socket.open()

    vi.advanceTimersByTime(25_000)
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }))
    expect(() => socket.message({ type: 'SYSTEM_STATS', data: {} })).not.toThrow()
    expect(second).toHaveBeenCalledWith({ type: 'SYSTEM_STATS', data: {} })
  })

  it('suspends the shared socket and resumes once for all active subscribers', () => {
    const onOpen = vi.fn()
    const onClose = vi.fn()
    service.subscribe(vi.fn(), onOpen, onClose)
    service.subscribe(vi.fn())
    const socket = MockWebSocket.instances[0]
    socket.open()
    service.suspend()

    expect(socket.close).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    service.resume()
    expect(MockWebSocket.instances).toHaveLength(2)
    MockWebSocket.instances[1].open()
    expect(onOpen).toHaveBeenCalledTimes(2)
  })
})
