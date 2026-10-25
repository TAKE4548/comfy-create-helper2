// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePromptClipboardStore } from '../usePromptClipboardStore';

describe('usePromptClipboardStore', () => {
  beforeEach(() => {
    usePromptClipboardStore.getState().clearHistory();
    usePromptClipboardStore.getState().setPasteMode('append');
    vi.restoreAllMocks();
  });

  it('should initialize with default values', () => {
    const state = usePromptClipboardStore.getState();
    expect(state.history).toEqual([]);
    expect(state.pasteMode).toBe('append');
  });

  it('should copy valid text and add to history', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const success = await usePromptClipboardStore.getState().copyText('masterpiece, 1girl');
    expect(success).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('masterpiece, 1girl');
    expect(usePromptClipboardStore.getState().history).toEqual(['masterpiece, 1girl']);
  });

  it('should ignore empty or whitespace-only text', async () => {
    const success = await usePromptClipboardStore.getState().copyText('   ');
    expect(success).toBe(false);
    expect(usePromptClipboardStore.getState().history).toEqual([]);
  });

  it('should deduplicate and move latest text to the front', async () => {
    await usePromptClipboardStore.getState().copyText('tag1');
    await usePromptClipboardStore.getState().copyText('tag2');
    await usePromptClipboardStore.getState().copyText('tag1');

    expect(usePromptClipboardStore.getState().history).toEqual(['tag1', 'tag2']);
  });

  it('should cap history at 10 items', async () => {
    for (let i = 1; i <= 12; i++) {
      await usePromptClipboardStore.getState().copyText('tag_' + i);
    }

    const history = usePromptClipboardStore.getState().history;
    expect(history.length).toBe(10);
    expect(history[0]).toBe('tag_12');
    expect(history[9]).toBe('tag_3');
  });

  it('should update paste mode and clear history correctly', () => {
    usePromptClipboardStore.getState().setPasteMode('overwrite');
    expect(usePromptClipboardStore.getState().pasteMode).toBe('overwrite');

    usePromptClipboardStore.setState({ history: ['item1', 'item2'] });
    expect(usePromptClipboardStore.getState().history.length).toBe(2);

    usePromptClipboardStore.getState().clearHistory();
    expect(usePromptClipboardStore.getState().history).toEqual([]);
  });

  it('Red Teaming: should handle OS clipboard write failure gracefully and preserve history', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
    });

    const success = await usePromptClipboardStore.getState().copyText('fallback tag');
    expect(success).toBe(true);
    expect(usePromptClipboardStore.getState().history).toEqual(['fallback tag']);
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });
});
