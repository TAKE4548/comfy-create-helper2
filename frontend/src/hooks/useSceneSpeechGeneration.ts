import { useRef, useState } from 'react';
import { SceneSpeechStreamError, speechBubblePresetsApi } from '../api/client';
import type { GeneratedSpeechBubbleRead, SceneDraftRequest, SceneDraftResponse, SceneSpeechProgressEvent, SceneSpeechStreamOptions } from '../api/types';
import type { SceneSpeechModalState } from '../components/SpeechBubbleEditorModal/sections/SceneSpeechModalState';

interface UseSceneSpeechGenerationParams {
  snapshotId: number;
  primaryTagSetId?: number | null;
  setBubbles: React.Dispatch<React.SetStateAction<any[]>>;
  generateDraftApi: (payload: SceneDraftRequest, options?: SceneSpeechStreamOptions) => Promise<SceneDraftResponse>;
  applyPresetToBubbles: (bubbles: GeneratedSpeechBubbleRead[], presetId: number | null) => any[];
  setActiveMobileTab?: (tab: 'preview' | 'controls') => void;
}

function classifyError(err: unknown): 'lm_studio_400' | 'connection_refused' | 'timeout' | 'unknown' {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('lm studio error 400') || msg.includes('400')) return 'lm_studio_400';
    if (msg.includes('failed to fetch') || msg.includes('econnrefused')) return 'connection_refused';
    if (msg.includes('timeout') || msg.includes('aborted')) return 'timeout';
  }
  return 'unknown';
}

const initialProgress = (): SceneSpeechModalState => ({
  type: 'progress',
  steps: [
    { key: 'reference', label: '参照抽出', status: 'active' },
    { key: 'vlm', label: 'VLM推論', status: 'pending' },
    { key: 'style', label: 'スタイル割当', status: 'pending' },
    { key: 'vram', label: 'VRAM解放', status: 'pending' },
  ],
  elapsedSeconds: 0,
});

function progressWithEvent(state: SceneSpeechModalState, event: SceneSpeechProgressEvent): SceneSpeechModalState {
  const progress = state.type === 'progress' ? state : initialProgress() as Extract<SceneSpeechModalState, { type: 'progress' }>;
  return {
    ...progress,
    steps: progress.steps.map((step) => step.key === event.step ? { ...step, status: event.status } : step),
  };
}

function streamError(err: unknown): { errorKind: 'lm_studio_400' | 'connection_refused' | 'timeout' | 'unknown'; message: string } {
  if (err instanceof SceneSpeechStreamError) {
    const errorKind = err.kind === 'lm_studio_400' || err.kind === 'connection_refused' || err.kind === 'timeout'
      ? err.kind : 'unknown';
    return { errorKind, message: err.message };
  }
  return { errorKind: classifyError(err), message: String(err) };
}

export function useSceneSpeechGeneration({
  snapshotId, primaryTagSetId, setBubbles, generateDraftApi, applyPresetToBubbles, setActiveMobileTab,
}: UseSceneSpeechGenerationParams) {
  const [modalState, setModalState] = useState<SceneSpeechModalState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const createdPresetIdRef = useRef<number | null>(null);
  const pendingDraftResultRef = useRef<SceneDraftResponse | null>(null);
  const onboardingCompleteRef = useRef(false);
  const generationIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const latestProgressRef = useRef<SceneSpeechModalState>(initialProgress());

  const showReview = (result: SceneDraftResponse) => {
    setModalState({ type: 'review', result });
    setActiveMobileTab?.('preview');
  };

  const handleBatchGenerateClick = async (overrideSimilarSceneSnapshotId?: number): Promise<void> => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const generationId = ++generationIdRef.current;
    createdPresetIdRef.current = null;
    pendingDraftResultRef.current = null;
    onboardingCompleteRef.current = false;
    latestProgressRef.current = initialProgress();
    setModalState(latestProgressRef.current);
    setIsGenerating(true);
    try {
      let existingPresetId: number | null = null;
      if (primaryTagSetId != null) {
        const existingPreset = await speechBubblePresetsApi.getByTagSetId(primaryTagSetId);
        if (generationId !== generationIdRef.current) return;
        if (existingPreset) {
          existingPresetId = existingPreset.id;
          createdPresetIdRef.current = existingPreset.id;
          onboardingCompleteRef.current = true;
        } else {
          setModalState({ type: 'onboarding', tagSetId: primaryTagSetId });
        }
      } else {
        onboardingCompleteRef.current = true;
      }
      const payload: SceneDraftRequest = { snapshot_id: snapshotId, target_tag_set_id: primaryTagSetId ?? null };
      if (existingPresetId !== null) payload.explicit_preset_id = existingPresetId;
      if (overrideSimilarSceneSnapshotId !== undefined) {
        payload.override_similar_scene_snapshot_id = overrideSimilarSceneSnapshotId;
      }
      const result = await generateDraftApi(payload, {
        signal: controller.signal,
        onProgress: (event) => {
          if (generationId !== generationIdRef.current) return;
          latestProgressRef.current = progressWithEvent(latestProgressRef.current, event);
          setModalState((current) => current?.type === 'onboarding' ? current : latestProgressRef.current);
        },
      });
      if (generationId !== generationIdRef.current) return;
      if (onboardingCompleteRef.current) showReview(result);
      else pendingDraftResultRef.current = result;
    } catch (err) {
      if (generationId !== generationIdRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setModalState({ type: 'error', ...streamError(err) });
    } finally {
      if (generationId === generationIdRef.current) {
        abortControllerRef.current = null;
        setIsGenerating(false);
      }
    }
  };

  const finishOnboarding = (presetId: number | null) => {
    createdPresetIdRef.current = presetId;
    onboardingCompleteRef.current = true;
    const pending = pendingDraftResultRef.current;
    pendingDraftResultRef.current = null;
    if (pending) showReview(pending);
    else setModalState(latestProgressRef.current);
  };

  const onModalCancel = () => {
    ++generationIdRef.current;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    pendingDraftResultRef.current = null;
    setIsGenerating(false);
    setModalState(null);
  };

  const onApply = (selectedBubbles: GeneratedSpeechBubbleRead[]) => {
    if (modalState?.type !== 'review') return;
    if (selectedBubbles.length > 0) {
      setBubbles((previous) => [...previous, ...applyPresetToBubbles(selectedBubbles, createdPresetIdRef.current)]);
    }
    onModalCancel();
  };

  return {
    modalState, isModalOpen: modalState !== null, isGenerating, handleBatchGenerateClick,
    onPresetCreatedAndApply: (id: number) => finishOnboarding(id),
    onPresetSkipped: () => finishOnboarding(null),
    onModalCancel,
    onRetry: () => handleBatchGenerateClick(),
    onReferenceSwitch: (id: number) => { setModalState(null); return handleBatchGenerateClick(id); },
    onApply,
  };
}
