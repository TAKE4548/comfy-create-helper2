import { describe, it, expect, afterEach } from 'vitest';
import { setupNetworkGuard, teardownNetworkGuard, assertNoRealNetwork, getNetworkViolations } from './networkGuard';
import { MockWebSocketController } from './wsHelpers';

describe('networkGuard (AC-7)', () => {
  afterEach(() => {
    teardownNetworkGuard();
    MockWebSocketController.uninstall();
  });

  it('blocks unmocked WebSocket connection attempts and throws error', () => {
    setupNetworkGuard();

    expect(() => {
      new WebSocket('ws://localhost:8188/leak');
    }).toThrow(/\[NetworkGuard\] Real WebSocket connection blocked/);

    expect(getNetworkViolations()).toHaveLength(1);
  });

  it('allows MockWebSocket when MockWebSocketController is installed', () => {
    setupNetworkGuard();
    MockWebSocketController.install();

    expect(() => {
      const ws = new WebSocket('ws://localhost:8188/allowed');
      ws.open();
    }).not.toThrow();

    expect(getNetworkViolations()).toHaveLength(0);
  });

  it('blocks unmocked fetch calls immediately when MSW is inactive', async () => {
    setupNetworkGuard();

    await expect(fetch('http://localhost:8188/api/leak')).rejects.toThrow(
      /\[NetworkGuard\] Real network fetch blocked/
    );

    expect(getNetworkViolations()).toHaveLength(1);
  });

  it('assertNoRealNetwork throws error if violations were recorded', () => {
    setupNetworkGuard();

    try {
      new WebSocket('ws://localhost:9999');
    } catch {
      // ignore
    }

    expect(() => assertNoRealNetwork()).toThrow(/\[NetworkGuard\] Real network communication detected/);
  });

  it('assertNoRealNetwork passes when no violations occurred', () => {
    setupNetworkGuard();
    expect(() => assertNoRealNetwork()).not.toThrow();
  });
});
