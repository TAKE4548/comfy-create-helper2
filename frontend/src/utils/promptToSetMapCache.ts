/**
 * prompt-surgeon-prompt-to-set-map のインメモリキャッシュ。
 * レンダリングループ内での同期 localStorage.getItem / JSON.parse を完全に排除する。
 */
const STORAGE_KEY = 'prompt-surgeon-prompt-to-set-map';
const MAX_ENTRIES = 200;

let memoryCache: Record<string, string> | null = null;

function loadCache(): Record<string, string> {
  if (memoryCache !== null) return memoryCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    memoryCache = raw ? JSON.parse(raw) : {};
  } catch {
    memoryCache = {};
  }
  return memoryCache!;
}

export const promptToSetMapCache = {
  getSetName(promptId: string): string | null {
    if (!promptId) return null;
    const cache = loadCache();
    return cache[promptId] || null;
  },

  setMapping(promptId: string, setName: string): void {
    if (!promptId || !setName) return;
    const cache = loadCache();
    cache[promptId] = setName;
  },

  saveToStorage(): void {
    const cache = loadCache();
    const keys = Object.keys(cache);
    let prunedCache = cache;
    if (keys.length > MAX_ENTRIES) {
      // 最新の MAX_ENTRIES 件のみ保持
      const trimmedKeys = keys.slice(keys.length - MAX_ENTRIES);
      prunedCache = {};
      trimmedKeys.forEach((k) => {
        prunedCache[k] = cache[k];
      });
      memoryCache = prunedCache;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prunedCache));
    } catch (e) {
      console.error('Failed to save promptToSetMap to localStorage:', e);
    }
  },

  getSetNameForUrl(imgUrl: string): string | null {
    if (!imgUrl) return null;
    const match = imgUrl.match(/[?&]t=([^&#]+)/);
    if (match && match[1]) {
      return promptToSetMapCache.getSetName(decodeURIComponent(match[1]));
    }
    return null;
  },

  _resetForTesting(): void {
    memoryCache = null;
  }
};
