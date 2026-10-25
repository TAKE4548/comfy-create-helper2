import { describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore } from '../../store/useGenerationStore';
import { usePromptClipboardStore } from '../../store/usePromptClipboardStore';
import { resetTestStore, resetTestStorage, resetTestIndexedDB, cleanupAllTestState } from './storeHelpers';
import { createTestQueryClient } from './queryHelpers';
import { MockWebSocketController } from './wsHelpers';

describe('storeHelpers (AC-6)', () => {
  beforeEach(() => {
    cleanupAllTestState();
  });

  it('resetTestStore resets useGenerationStore to initial state', () => {
    useGenerationStore.setState({ isAnimaMode: true });
    expect(useGenerationStore.getState().isAnimaMode).toBe(true);

    resetTestStore();
    expect(useGenerationStore.getState().isAnimaMode).toBe(false);
  });

  it('resetTestStore applies overrides cleanly', () => {
    resetTestStore({ isAnimaMode: true });
    expect(useGenerationStore.getState().isAnimaMode).toBe(true);
  });

  it('resetTestStorage clears both localStorage and sessionStorage', () => {
    localStorage.setItem('test-key', 'local-value');
    sessionStorage.setItem('test-key', 'session-value');
    expect(localStorage.getItem('test-key')).toBe('local-value');
    expect(sessionStorage.getItem('test-key')).toBe('session-value');

    resetTestStorage();
    expect(localStorage.getItem('test-key')).toBeNull();
    expect(sessionStorage.getItem('test-key')).toBeNull();
  });

  it('resetTestIndexedDB replaces global indexedDB with a fresh instance', () => {
    const prevIdb = globalThis.indexedDB;
    resetTestIndexedDB();
    expect(globalThis.indexedDB).toBeDefined();
    expect(globalThis.indexedDB).not.toBe(prevIdb);
  });

  it('cleanupAllTestState cleans up store, storage, indexedDB, ws, and query client', () => {
    const client = createTestQueryClient();
    client.setQueryData(['test-query'], { data: 123 });

    useGenerationStore.setState({ isAnimaMode: true });
    localStorage.setItem('key', 'val');
    sessionStorage.setItem('key', 'val');

    MockWebSocketController.install();
    const ws = new WebSocket('ws://localhost:8188/ws');

    cleanupAllTestState({ queryClient: client });

    expect(useGenerationStore.getState().isAnimaMode).toBe(false);
    expect(localStorage.getItem('key')).toBeNull();
    expect(sessionStorage.getItem('key')).toBeNull();
    expect(client.getQueryData(['test-query'])).toBeUndefined();
    expect(ws.readyState).toBe(3); // CLOSED

    MockWebSocketController.uninstall();
  });
  it('[REQ-394/AC-1] files without a docblock keep the jsdom default', () => {
    expect(typeof document).toBe('object');
    expect(typeof window).toBe('object');
  });
});
