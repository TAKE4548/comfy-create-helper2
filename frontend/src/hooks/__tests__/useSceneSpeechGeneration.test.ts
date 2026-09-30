import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSceneSpeechGeneration } from '../useSceneSpeechGeneration';
import { speechBubblePresetsApi } from '../../api/client';
import type { GeneratedSpeechBubbleRead, SceneDraftResponse } from '../../api/types';

vi.mock('../../api/client', () => ({
  speechBubblePresetsApi: { getByTagSetId: vi.fn() },
  SceneSpeechStreamError: class SceneSpeechStreamError extends Error {
    constructor(public readonly kind: string, message: string) { super(message); }
  },
}));

describe('useSceneSpeechGeneration', () => {
  const bubbles = [
    { id: 'b1', text: 'Hello' },
    { id: 'b2', text: 'World' },
  ] as GeneratedSpeechBubbleRead[];
  const response = { bubbles } as SceneDraftResponse;
  let setBubbles: ReturnType<typeof vi.fn>;
  let generateDraftApi: ReturnType<typeof vi.fn>;
  let applyPresetToBubbles: ReturnType<typeof vi.fn>;
  let setActiveMobileTab: ReturnType<typeof vi.fn>;

  const setup = (primaryTagSetId: number | null = null) =>
    renderHook(() => useSceneSpeechGeneration({
      snapshotId: 100, primaryTagSetId, setBubbles, generateDraftApi,
      applyPresetToBubbles, setActiveMobileTab,
    }));

  beforeEach(() => {
    vi.clearAllMocks();
    setBubbles = vi.fn((updater) => typeof updater === 'function' ? updater([]) : updater);
    generateDraftApi = vi.fn();
    applyPresetToBubbles = vi.fn((selected) => selected);
    setActiveMobileTab = vi.fn();
  });

  it('opens progress immediately, reviews the null route, and applies only selected bubbles', async () => {
    let resolve!: (value: SceneDraftResponse) => void;
    generateDraftApi.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { result } = setup();
    let operation!: Promise<void>;
    act(() => { operation = result.current.handleBatchGenerateClick(); });
    expect(result.current.modalState?.type).toBe('progress');
    expect(generateDraftApi).toHaveBeenCalledWith(
      { snapshot_id: 100, target_tag_set_id: null }, expect.objectContaining({ signal: expect.any(AbortSignal), onProgress: expect.any(Function) }),
    );
    expect(result.current.modalState).toMatchObject({ type: 'progress', steps: [
      { key: 'reference', label: '参照抽出', status: 'active' },
      { key: 'vlm', label: 'VLM推論', status: 'pending' },
      { key: 'style', label: 'スタイル割当', status: 'pending' },
      { key: 'vram', label: 'VRAM解放', status: 'pending' },
    ] });
    await act(async () => { resolve(response); await operation; });
    expect(result.current.modalState?.type).toBe('review');
    expect(setActiveMobileTab).toHaveBeenCalledWith('preview');
    expect(setBubbles).not.toHaveBeenCalled();
    act(() => result.current.onApply([bubbles[1]]));
    expect(applyPresetToBubbles).toHaveBeenCalledWith([bubbles[1]], null);
    expect(setBubbles).toHaveBeenCalledTimes(1);
    expect(result.current.isModalOpen).toBe(false);
  });

  it('reviews existing preset results without auto applying', async () => {
    vi.mocked(speechBubblePresetsApi.getByTagSetId).mockResolvedValue({ id: 42 } as any);
    generateDraftApi.mockResolvedValue(response);
    const { result } = setup(1);
    await act(async () => { await result.current.handleBatchGenerateClick(); });
    expect(generateDraftApi).toHaveBeenCalledWith({ snapshot_id: 100, target_tag_set_id: 1, explicit_preset_id: 42 }, expect.any(Object));
    expect(result.current.modalState?.type).toBe('review');
    expect(setBubbles).not.toHaveBeenCalled();
    act(() => result.current.onApply(bubbles));
    expect(applyPresetToBubbles).toHaveBeenCalledWith(bubbles, 42);
  });

  it('holds an early result until preset save, then reviews', async () => {
    vi.mocked(speechBubblePresetsApi.getByTagSetId).mockResolvedValue(null);
    generateDraftApi.mockResolvedValue(response);
    const { result } = setup(1);
    await act(async () => { await result.current.handleBatchGenerateClick(); });
    expect(result.current.modalState?.type).toBe('onboarding');
    expect(setBubbles).not.toHaveBeenCalled();
    act(() => result.current.onPresetCreatedAndApply(88));
    expect(result.current.modalState?.type).toBe('review');
    act(() => result.current.onApply(bubbles));
    expect(applyPresetToBubbles).toHaveBeenCalledWith(bubbles, 88);
  });

  it('returns to progress after an early skip and reviews when generation completes', async () => {
    vi.mocked(speechBubblePresetsApi.getByTagSetId).mockResolvedValue(null);
    let resolve!: (value: SceneDraftResponse) => void;
    generateDraftApi.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { result } = setup(1);
    let operation!: Promise<void>;
    await act(async () => { operation = result.current.handleBatchGenerateClick(); await Promise.resolve(); });
    expect(result.current.modalState?.type).toBe('onboarding');
    act(() => result.current.onPresetSkipped());
    expect(result.current.modalState?.type).toBe('progress');
    await act(async () => { resolve(response); await operation; });
    expect(result.current.modalState?.type).toBe('review');
    act(() => result.current.onApply(bubbles));
    expect(applyPresetToBubbles).toHaveBeenCalledWith(bubbles, null);
  });

  it('discards a cancelled result and never applies it', async () => {
    let resolve!: (value: SceneDraftResponse) => void;
    generateDraftApi.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { result } = setup();
    let operation!: Promise<void>;
    act(() => { operation = result.current.handleBatchGenerateClick(); });
    act(() => result.current.onModalCancel());
    await act(async () => { resolve(response); await operation; });
    expect(result.current.modalState).toBeNull();
    expect(setBubbles).not.toHaveBeenCalled();
  });

  it('ignores stale results after reference switch and sends override id', async () => {
    const pending: Array<(value: SceneDraftResponse) => void> = [];
    generateDraftApi.mockImplementation(() => new Promise((done) => { pending.push(done); }));
    const { result } = setup();
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => { first = result.current.handleBatchGenerateClick(); });
    act(() => { second = result.current.onReferenceSwitch(77); });
    expect(generateDraftApi).toHaveBeenLastCalledWith(
      { snapshot_id: 100, target_tag_set_id: null, override_similar_scene_snapshot_id: 77 }, expect.any(Object),
    );
    await act(async () => { pending[0](response); await first; });
    expect(result.current.modalState?.type).toBe('progress');
    await act(async () => { pending[1](response); await second; });
    expect(result.current.modalState?.type).toBe('review');
    expect(setActiveMobileTab).toHaveBeenCalledTimes(1);
  });

  it('classifies errors and retries with a fresh request', async () => {
    generateDraftApi.mockRejectedValueOnce(new Error('LM Studio error 400')).mockResolvedValueOnce(response);
    const { result } = setup();
    await act(async () => { await result.current.handleBatchGenerateClick(); });
    expect(result.current.modalState).toMatchObject({ type: 'error', errorKind: 'lm_studio_400' });
    await act(async () => { await result.current.onRetry(); });
    expect(result.current.modalState?.type).toBe('review');
  });

  it('updates steps only from progress events and preserves event order', async () => {
    let resolve!: (value: SceneDraftResponse) => void;
    let report!: (event: any) => void;
    generateDraftApi.mockImplementation((_payload, options) => {
      report = options.onProgress;
      return new Promise((done) => { resolve = done; });
    });
    const { result } = setup();
    let operation!: Promise<void>;
    act(() => { operation = result.current.handleBatchGenerateClick(); });
    act(() => report({ type: 'progress', step: 'reference', status: 'done' }));
    act(() => report({ type: 'progress', step: 'vlm', status: 'active' }));
    expect(result.current.modalState).toMatchObject({ type: 'progress', steps: [
      { key: 'reference', status: 'done' }, { key: 'vlm', status: 'active' },
      { key: 'style', status: 'pending' }, { key: 'vram', status: 'pending' },
    ] });
    await act(async () => { resolve(response); await operation; });
  });

  it('retains latest progress during onboarding and restores it after either completion order', async () => {
    vi.mocked(speechBubblePresetsApi.getByTagSetId).mockResolvedValue(null);
    let resolve!: (value: SceneDraftResponse) => void;
    let report!: (event: any) => void;
    generateDraftApi.mockImplementation((_payload, options) => {
      report = options.onProgress;
      return new Promise((done) => { resolve = done; });
    });
    const { result } = setup(1);
    let operation!: Promise<void>;
    await act(async () => { operation = result.current.handleBatchGenerateClick(); await Promise.resolve(); });
    act(() => report({ type: 'progress', step: 'reference', status: 'done' }));
    act(() => report({ type: 'progress', step: 'vlm', status: 'active' }));
    expect(result.current.modalState?.type).toBe('onboarding');
    act(() => result.current.onPresetSkipped());
    expect(result.current.modalState).toMatchObject({ type: 'progress', steps: [
      { key: 'reference', status: 'done' }, { key: 'vlm', status: 'active' },
      { key: 'style', status: 'pending' }, { key: 'vram', status: 'pending' },
    ] });
    await act(async () => { resolve(response); await operation; });
    expect(result.current.modalState?.type).toBe('review');
  });

  it('passes an abort signal and aborts it on cancel and retry', async () => {
    let options: any;
    generateDraftApi.mockImplementation((_payload, received) => {
      options = received;
      return new Promise(() => {});
    });
    const { result } = setup();
    act(() => { void result.current.handleBatchGenerateClick(); });
    const firstSignal = options.signal as AbortSignal;
    expect(firstSignal.aborted).toBe(false);
    act(() => { void result.current.onRetry(); });
    expect(firstSignal.aborted).toBe(true);
    const secondSignal = options.signal as AbortSignal;
    act(() => result.current.onModalCancel());
    expect(secondSignal.aborted).toBe(true);
  });

  it('ignores stale progress callbacks after switching references', async () => {
    const optionsList: any[] = [];
    generateDraftApi.mockImplementation((_payload, options) => {
      optionsList.push(options);
      return new Promise(() => {});
    });
    const { result } = setup();
    act(() => { void result.current.handleBatchGenerateClick(); });
    act(() => { void result.current.onReferenceSwitch(77); });
    act(() => optionsList[0].onProgress({ type: 'progress', step: 'vram', status: 'done' }));
    expect(result.current.modalState).toMatchObject({ type: 'progress', steps: [
      { key: 'reference', status: 'active' }, { key: 'vlm', status: 'pending' },
      { key: 'style', status: 'pending' }, { key: 'vram', status: 'pending' },
    ] });
  });

  it.each([
    ['lm_studio_400', 'lm_studio_400'],
    ['connection_refused', 'connection_refused'],
    ['timeout', 'timeout'],
    ['invalid_request', 'unknown'],
    ['vram_unload_failed', 'unknown'],
  ])('maps stream error kind %s and keeps the server message', async (kind, expectedKind) => {
    const { SceneSpeechStreamError } = await import('../../api/client');
    generateDraftApi.mockRejectedValueOnce(new SceneSpeechStreamError(kind, 'Server safe message'));
    const { result } = setup();
    await act(async () => { await result.current.handleBatchGenerateClick(); });
    expect(result.current.modalState).toEqual({ type: 'error', errorKind: expectedKind, message: 'Server safe message' });
  });

  it('does not show an error for an AbortError', async () => {
    const error = new Error('stopped');
    error.name = 'AbortError';
    generateDraftApi.mockRejectedValue(error);
    const { result } = setup();
    await act(async () => { await result.current.handleBatchGenerateClick(); });
    expect(result.current.modalState?.type).toBe('progress');
  });
});
