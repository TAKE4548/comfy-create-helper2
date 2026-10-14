import { useGenerationStore } from '../../store/useGenerationStore';
import { usePromptClipboardStore } from '../../store/usePromptClipboardStore';
import { _resetWebSocketForTesting } from '../../store/useGenerationStore';
import { IDBFactory } from 'fake-indexeddb';
import type { QueryClient } from '@tanstack/react-query';
import { clearTestQueryClient } from './queryHelpers';
import { MockWebSocketController } from './wsHelpers';

/**
 * Resets Zustand store to its initial state, with optional state overrides.
 * Uses complete state replacement (second arg true) to eradicate state leaks.
 */
export function resetTestStore(overrides: Record<string, unknown> = {}): void {
  const initial = typeof useGenerationStore.getInitialState === 'function'
    ? useGenerationStore.getInitialState()
    : {};
  useGenerationStore.setState({ ...initial, ...overrides }, true);

  if (typeof usePromptClipboardStore.getInitialState === 'function') {
    usePromptClipboardStore.setState(usePromptClipboardStore.getInitialState(), true);
  }

  _resetWebSocketForTesting();
}

/**
 * Completely clears localStorage and sessionStorage.
 */
export function resetTestStorage(): void {
  if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
    localStorage.clear();
  }
  if (typeof sessionStorage !== 'undefined' && typeof sessionStorage.clear === 'function') {
    sessionStorage.clear();
  }
}

/**
 * Replaces global indexedDB with a fresh IDBFactory instance from fake-indexeddb.
 */
export function resetTestIndexedDB(): void {
  if (typeof globalThis !== 'undefined') {
    globalThis.indexedDB = new IDBFactory();
  }
}

export interface CleanupOptions {
  queryClient?: QueryClient;
}

/**
 * Comprehensive cleanup helper (AC-6):
 * Eradicates state leaks across Zustand, localStorage, sessionStorage,
 * fake-indexeddb, WebSocket instances, and React Query client.
 */
export function cleanupAllTestState(options: CleanupOptions = {}): void {
  resetTestStore();
  resetTestStorage();
  resetTestIndexedDB();
  MockWebSocketController.clear();
  if (options.queryClient) {
    clearTestQueryClient(options.queryClient);
  }
}
