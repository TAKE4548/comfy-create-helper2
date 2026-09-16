import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ComfyWebSocketService,
  HEARTBEAT_INTERVAL_MS,
  BASE_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
} from '../comfyWebSocketService';

describe('ComfyWebSocketService', () => {
  let service: ComfyWebSocketService;
  let mockWs: any;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new ComfyWebSocketService();

    mockWs = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
      binaryType: '',
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
    };

    // Global WebSocket mock
    vi.stubGlobal(
      'WebSocket',
      vi.fn().mockImplementation(() => mockWs)
    );
    (WebSocket as any).OPEN = 1;
    (WebSocket as any).CONNECTING = 0;
    (WebSocket as any).CLOSING = 2;
    (WebSocket as any).CLOSED = 3;
  });

  afterEach(() => {
    service.resetForTesting();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Heartbeat Mechanism', () => {
    it('starts heartbeat timer and sends ping message every HEARTBEAT_INTERVAL_MS', () => {
      const callbacks = {
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
        onBlobMessage: vi.fn(),
        onJsonMessage: vi.fn(),
      };

      service.connect('http://localhost:8188', 'test-client', callbacks);
      expect(mockWs.onopen).toBeDefined();

      // Trigger onopen
      mockWs.onopen();
      expect(callbacks.onOpen).toHaveBeenCalled();
      expect(service.getHeartbeatTimer()).not.toBeNull();

      // Advance by HEARTBEAT_INTERVAL_MS
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
      expect(mockWs.send).toHaveBeenCalledTimes(1);
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));

      // Advance again
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
      expect(mockWs.send).toHaveBeenCalledTimes(2);
    });

    it('stops heartbeat timer on ws.onclose', () => {
      const callbacks = {
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
        onBlobMessage: vi.fn(),
        onJsonMessage: vi.fn(),
      };

      service.connect('http://localhost:8188', 'test-client', callbacks);
      mockWs.onopen();
      expect(service.getHeartbeatTimer()).not.toBeNull();

      mockWs.onclose();
      expect(callbacks.onClose).toHaveBeenCalled();
      expect(service.getHeartbeatTimer()).toBeNull();
    });

    it('stops heartbeat timer on ws.onerror', () => {
      const callbacks = {
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
        onBlobMessage: vi.fn(),
        onJsonMessage: vi.fn(),
      };

      service.connect('http://localhost:8188', 'test-client', callbacks);
      mockWs.onopen();
      expect(service.getHeartbeatTimer()).not.toBeNull();

      mockWs.onerror();
      expect(callbacks.onError).toHaveBeenCalled();
      expect(service.getHeartbeatTimer()).toBeNull();
    });

    it('stops heartbeat timer on disconnect()', () => {
      const callbacks = {
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
        onBlobMessage: vi.fn(),
        onJsonMessage: vi.fn(),
      };

      service.connect('http://localhost:8188', 'test-client', callbacks);
      mockWs.onopen();
      expect(service.getHeartbeatTimer()).not.toBeNull();

      service.disconnect();
      expect(service.getHeartbeatTimer()).toBeNull();
    });

    it('handles send exception gracefully and stops heartbeat (Red Teaming test case 1)', () => {
      const callbacks = {
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
        onBlobMessage: vi.fn(),
        onJsonMessage: vi.fn(),
      };

      service.connect('http://localhost:8188', 'test-client', callbacks);
      mockWs.onopen();

      mockWs.send.mockImplementationOnce(() => {
        throw new Error('Socket abruptly closed');
      });

      // Should not throw
      expect(() => {
        service.sendPing();
      }).not.toThrow();

      // Heartbeat timer should be stopped
      expect(service.getHeartbeatTimer()).toBeNull();
    });
  });

  describe('Exponential Backoff & Retry Logic', () => {
    it('calculates exponential delay capped at MAX_RECONNECT_DELAY_MS', () => {
      // retryCount = 0: 1000 + [0, 500)
      const delay0 = service.getReconnectDelay();
      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay0).toBeLessThan(1500);

      // retryCount = 1: 2000 + [0, 500)
      service.incrementRetryCount();
      const delay1 = service.getReconnectDelay();
      expect(delay1).toBeGreaterThanOrEqual(2000);
      expect(delay1).toBeLessThan(2500);

      // retryCount = 2: 4000 + [0, 500)
      service.incrementRetryCount();
      const delay2 = service.getReconnectDelay();
      expect(delay2).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThan(4500);

      // retryCount = 3: 8000 + [0, 500)
      service.incrementRetryCount();
      const delay3 = service.getReconnectDelay();
      expect(delay3).toBeGreaterThanOrEqual(8000);
      expect(delay3).toBeLessThan(8500);

      // retryCount = 4: 16000 -> capped at 15000 + [0, 500)
      service.incrementRetryCount();
      const delay4 = service.getReconnectDelay();
      expect(delay4).toBeGreaterThanOrEqual(15000);
      expect(delay4).toBeLessThan(15500);

      // retryCount = 10: still capped at 15000 + [0, 500)
      for (let i = 0; i < 6; i++) {
        service.incrementRetryCount();
      }
      const delay10 = service.getReconnectDelay();
      expect(delay10).toBeGreaterThanOrEqual(15000);
      expect(delay10).toBeLessThan(15500);
    });

    it('resets retry count on resetRetryCount() and on ws.onopen', () => {
      service.incrementRetryCount();
      service.incrementRetryCount();
      expect(service.getRetryCount()).toBe(2);

      service.resetRetryCount();
      expect(service.getRetryCount()).toBe(0);

      // Also reset on onopen
      service.incrementRetryCount();
      const callbacks = {
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
        onBlobMessage: vi.fn(),
        onJsonMessage: vi.fn(),
      };
      service.connect('http://localhost:8188', 'test-client', callbacks);
      expect(service.getRetryCount()).toBe(1);

      mockWs.onopen();
      expect(service.getRetryCount()).toBe(0);
    });

    it('resets retry count and stops heartbeat in resetForTesting()', () => {
      service.incrementRetryCount();
      service.startHeartbeat();
      expect(service.getRetryCount()).toBe(1);
      expect(service.getHeartbeatTimer()).not.toBeNull();

      service.resetForTesting();
      expect(service.getRetryCount()).toBe(0);
      expect(service.getHeartbeatTimer()).toBeNull();
    });
  });
});
