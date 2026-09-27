import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSceneSpeechGeneration } from '../useSceneSpeechGeneration';
import { speechBubblePresetsApi } from '../../api/client';
import type { GeneratedSpeechBubbleRead } from '../../api/types';

vi.mock('../../api/client', () => ({
  speechBubblePresetsApi: {
    getByTagSetId: vi.fn(),
  },
}));

describe('useSceneSpeechGeneration', () => {
  const dummyBubbles: GeneratedSpeechBubbleRead[] = [
    {
      id: 'b1',
      text: 'Hello',
      role: 'main',
      speaker_name: 'Hero',
      speaker_tag_set_id: 1,
      is_se: false,
      position: { x: 10, y: 10, width: 100, height: 50 },
      style: {
        shape: 'oval',
        fillColor: '#ffffff',
        borderColor: '#000000',
        textColor: '#000000',
        borderWidth: 2,
        fontFamily: 'sans-serif',
        fontSize: 16,
      },
    },
  ];

  let setBubbles: ReturnType<typeof vi.fn>;
  let generateDraftApi: ReturnType<typeof vi.fn>;
  let applyPresetToBubbles: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setBubbles = vi.fn((updater) => {
      if (typeof updater === 'function') {
        return updater([]);
      }
      return updater;
    });
    generateDraftApi = vi.fn();
    applyPresetToBubbles = vi.fn((bubbles, presetId) =>
      bubbles.map((b) => ({ ...b, appliedPresetId: presetId }))
    );
  });

  it('calls generateDraftApi with target_tag_set_id: null when primaryTagSetId is not provided', async () => {
    generateDraftApi = vi.fn().mockResolvedValue({ bubbles: [] });
    const { result } = renderHook(() =>
      useSceneSpeechGeneration({
        snapshotId: 100,
        primaryTagSetId: null,
        setBubbles,
        generateDraftApi,
        applyPresetToBubbles,
      })
    );

    await act(async () => {
      await result.current.handleBatchGenerateClick();
    });

    expect(speechBubblePresetsApi.getByTagSetId).not.toHaveBeenCalled();
    expect(generateDraftApi).toHaveBeenCalledWith({
      snapshot_id: 100,
      target_tag_set_id: null,
    });
  });

  it('normal path: preset exists -> directly generates and applies preset', async () => {
    vi.mocked(speechBubblePresetsApi.getByTagSetId).mockResolvedValue({
      id: 42,
      name: 'Existing Preset',
      is_default: false,
    } as any);
    generateDraftApi.mockResolvedValue({ bubbles: dummyBubbles });

    const { result } = renderHook(() =>
      useSceneSpeechGeneration({
        snapshotId: 100,
        primaryTagSetId: 1,
        setBubbles,
        generateDraftApi,
        applyPresetToBubbles,
      })
    );

    await act(async () => {
      await result.current.handleBatchGenerateClick();
    });

    expect(result.current.isModalOpen).toBe(false);
    expect(result.current.isGenerating).toBe(false);
    expect(generateDraftApi).toHaveBeenCalledWith({
      snapshot_id: 100,
      target_tag_set_id: 1,
      explicit_preset_id: 42,
    });
    expect(applyPresetToBubbles).toHaveBeenCalledWith(dummyBubbles, 42);
    expect(setBubbles).toHaveBeenCalled();
  });

  it('first-time character: modal confirms BEFORE generation completes (TEST-PAR-03 variant 1)', async () => {
    vi.mocked(speechBubblePresetsApi.getByTagSetId).mockResolvedValue(null);

    let resolveApi!: (res: { bubbles: GeneratedSpeechBubbleRead[] }) => void;
    generateDraftApi.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApi = resolve;
        })
    );

    const { result } = renderHook(() =>
      useSceneSpeechGeneration({
        snapshotId: 100,
        primaryTagSetId: 1,
        setBubbles,
        generateDraftApi,
        applyPresetToBubbles,
      })
    );

    // 1. Click generate and wait for initial state updates (getByTagSetId resolution)
    let clickPromise!: Promise<void>;
    await act(async () => {
      clickPromise = result.current.handleBatchGenerateClick();
      // flush microtask for getByTagSetId
      await Promise.resolve();
    });

    expect(result.current.isModalOpen).toBe(true);
    expect(result.current.isGenerating).toBe(true);

    // 2. Preset created in modal before API returns
    act(() => {
      result.current.onPresetCreatedAndApply(99);
    });

    expect(result.current.isModalOpen).toBe(false);
    expect(setBubbles).not.toHaveBeenCalled();

    // 3. API finishes
    await act(async () => {
      resolveApi({ bubbles: dummyBubbles });
      await clickPromise;
    });

    expect(result.current.isGenerating).toBe(false);
    expect(applyPresetToBubbles).toHaveBeenCalledWith(dummyBubbles, 99);
    expect(setBubbles).toHaveBeenCalled();
  });

  it('first-time character: generation completes BEFORE modal confirms (TEST-PAR-03 variant 2)', async () => {
    vi.mocked(speechBubblePresetsApi.getByTagSetId).mockResolvedValue(null);

    let resolveApi!: (res: { bubbles: GeneratedSpeechBubbleRead[] }) => void;
    generateDraftApi.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApi = resolve;
        })
    );

    const { result } = renderHook(() =>
      useSceneSpeechGeneration({
        snapshotId: 100,
        primaryTagSetId: 1,
        setBubbles,
        generateDraftApi,
        applyPresetToBubbles,
      })
    );

    // 1. Click generate and wait for getByTagSetId resolution
    let clickPromise!: Promise<void>;
    await act(async () => {
      clickPromise = result.current.handleBatchGenerateClick();
      await Promise.resolve();
    });

    expect(result.current.isModalOpen).toBe(true);
    expect(result.current.isGenerating).toBe(true);

    // 2. API completes first
    await act(async () => {
      resolveApi({ bubbles: dummyBubbles });
      await clickPromise;
    });

    // Bubbles not yet applied because modal is open and pending
    expect(setBubbles).not.toHaveBeenCalled();
    expect(result.current.isModalOpen).toBe(true);

    // 3. User saves preset in modal
    act(() => {
      result.current.onPresetCreatedAndApply(88);
    });

    expect(result.current.isModalOpen).toBe(false);
    expect(applyPresetToBubbles).toHaveBeenCalledWith(dummyBubbles, 88);
    expect(setBubbles).toHaveBeenCalled();
  });

  it('first-time character: modal CANCELLED BEFORE generation completes (CRIT-01 rescue drawing)', async () => {
    vi.mocked(speechBubblePresetsApi.getByTagSetId).mockResolvedValue(null);

    let resolveApi!: (res: { bubbles: GeneratedSpeechBubbleRead[] }) => void;
    generateDraftApi.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApi = resolve;
        })
    );

    const { result } = renderHook(() =>
      useSceneSpeechGeneration({
        snapshotId: 100,
        primaryTagSetId: 1,
        setBubbles,
        generateDraftApi,
        applyPresetToBubbles,
      })
    );

    // 1. Click generate and wait for getByTagSetId resolution
    let clickPromise!: Promise<void>;
    await act(async () => {
      clickPromise = result.current.handleBatchGenerateClick();
      await Promise.resolve();
    });

    expect(result.current.isModalOpen).toBe(true);

    // 2. User cancels modal early
    act(() => {
      result.current.onModalCancel();
    });

    expect(result.current.isModalOpen).toBe(false);
    expect(setBubbles).not.toHaveBeenCalled();

    // 3. API completes later -> rescue drawing with presetId: null
    await act(async () => {
      resolveApi({ bubbles: dummyBubbles });
      await clickPromise;
    });

    expect(result.current.isGenerating).toBe(false);
    expect(applyPresetToBubbles).toHaveBeenCalledWith(dummyBubbles, null);
    expect(setBubbles).toHaveBeenCalled();
  });

  it('first-time character: generation completes BEFORE modal CANCELLED (CRIT-01 rescue drawing variant)', async () => {
    vi.mocked(speechBubblePresetsApi.getByTagSetId).mockResolvedValue(null);

    let resolveApi!: (res: { bubbles: GeneratedSpeechBubbleRead[] }) => void;
    generateDraftApi.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApi = resolve;
        })
    );

    const { result } = renderHook(() =>
      useSceneSpeechGeneration({
        snapshotId: 100,
        primaryTagSetId: 1,
        setBubbles,
        generateDraftApi,
        applyPresetToBubbles,
      })
    );

    // 1. Click generate and wait for getByTagSetId resolution
    let clickPromise!: Promise<void>;
    await act(async () => {
      clickPromise = result.current.handleBatchGenerateClick();
      await Promise.resolve();
    });

    // 2. API completes first
    await act(async () => {
      resolveApi({ bubbles: dummyBubbles });
      await clickPromise;
    });

    expect(setBubbles).not.toHaveBeenCalled();
    expect(result.current.isModalOpen).toBe(true);

    // 3. User cancels modal -> rescue drawing applied with null
    act(() => {
      result.current.onModalCancel();
    });

    expect(result.current.isModalOpen).toBe(false);
    expect(applyPresetToBubbles).toHaveBeenCalledWith(dummyBubbles, null);
    expect(setBubbles).toHaveBeenCalled();
  });
});
