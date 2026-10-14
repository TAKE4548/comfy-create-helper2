import { describe, it, expect, afterEach } from 'vitest';
import { MockWebSocket, MockWebSocketController } from './wsHelpers';

describe('wsHelpers (MockWebSocketController)', () => {
  afterEach(() => {
    MockWebSocketController.uninstall();
  });

  it('install stubs global WebSocket and captures instances', () => {
    MockWebSocketController.install();

    const ws = new WebSocket('ws://localhost:8188/test');
    expect(ws).toBeInstanceOf(MockWebSocket);
    expect(MockWebSocketController.getInstances()).toHaveLength(1);
    expect(MockWebSocketController.getLastInstance()).toBe(ws);
  });

  it('supports deterministic transitions: open, message, close, error', () => {
    MockWebSocketController.install();
    const ws = new MockWebSocket('ws://localhost:8188/test');

    expect(ws.readyState).toBe(MockWebSocket.CONNECTING);

    let opened = false;
    ws.onopen = () => { opened = true; };
    ws.open();
    expect(opened).toBe(true);
    expect(ws.readyState).toBe(MockWebSocket.OPEN);

    let receivedData: any = null;
    ws.onmessage = (event) => { receivedData = JSON.parse(event.data); };
    ws.message({ type: 'progress', value: 50 });
    expect(receivedData).toEqual({ type: 'progress', value: 50 });

    let closed = false;
    ws.onclose = () => { closed = true; };
    ws.close();
    expect(closed).toBe(true);
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });

  it('clear closes all active instances and resets registry', () => {
    MockWebSocketController.install();
    const ws1 = new MockWebSocket('ws://localhost/1');
    const ws2 = new MockWebSocket('ws://localhost/2');

    ws1.open();
    ws2.open();

    MockWebSocketController.clear();
    expect(ws1.readyState).toBe(MockWebSocket.CLOSED);
    expect(ws2.readyState).toBe(MockWebSocket.CLOSED);
    expect(MockWebSocketController.getInstances()).toHaveLength(0);
  });
});
