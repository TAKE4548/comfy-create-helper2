import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type PasteMode = 'append' | 'overwrite';

export interface PromptClipboardState {
  history: string[];
  pasteMode: PasteMode;
  copyText: (text: string) => Promise<boolean>;
  setPasteMode: (mode: PasteMode) => void;
  clearHistory: () => void;
}

const MAX_HISTORY = 10;

export const usePromptClipboardStore = create<PromptClipboardState>()(
  persist(
    (set) => ({
      history: [],
      pasteMode: 'append',
      copyText: async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return false;
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(trimmed);
          }
        } catch (e) {
          console.warn('Clipboard write failed', e);
        }
        set((state) => {
          const next = [trimmed, ...state.history.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY);
          return { history: next };
        });
        return true;
      },
      setPasteMode: (mode: PasteMode) => set({ pasteMode: mode }),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'prompt-clipboard-history',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
