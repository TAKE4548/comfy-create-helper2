import { useState, useRef } from 'react';
import { speechBubblePresetsApi } from '../api/client';
import type { GeneratedSpeechBubbleRead } from '../api/types';

interface UseSceneSpeechGenerationParams {
  snapshotId: number;
  primaryTagSetId?: number | null;
  setBubbles: React.Dispatch<React.SetStateAction<any[]>>;
  generateDraftApi: (payload: { snapshot_id: number; target_tag_set_id?: number | null; explicit_preset_id?: number | null }) => Promise<{ bubbles: GeneratedSpeechBubbleRead[] }>;
  applyPresetToBubbles: (bubbles: GeneratedSpeechBubbleRead[], presetId: number | null) => any[];
}

export function useSceneSpeechGeneration({
  snapshotId,
  primaryTagSetId,
  setBubbles,
  generateDraftApi,
  applyPresetToBubbles,
}: UseSceneSpeechGenerationParams) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const createdPresetIdRef = useRef<number | null>(null);
  const pendingDraftResultRef = useRef<{ bubbles: GeneratedSpeechBubbleRead[] } | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  const handleBatchGenerateClick = async (): Promise<void> => {
    // primaryTagSetId が有効値（非null・非undefined）のとき → 既存のプリセット検索ルート
    // 注意: `!= null` は null と undefined の両方を除外するゆるい比較
    if (primaryTagSetId != null) {
      const existingPreset = await speechBubblePresetsApi.getByTagSetId(primaryTagSetId);

      if (!existingPreset) {
        // 初出キャラ: 並行オンボーディング発火
        setIsModalOpen(true);
        createdPresetIdRef.current = null;
        pendingDraftResultRef.current = null;
        isCancelledRef.current = false;
        setIsGenerating(true);

        generateDraftApi({ snapshot_id: snapshotId, target_tag_set_id: primaryTagSetId })
          .then((res) => {
            if (createdPresetIdRef.current !== null) {
              setBubbles((prev) => [...prev, ...applyPresetToBubbles(res.bubbles, createdPresetIdRef.current)]);
            } else if (isCancelledRef.current) {
              setBubbles((prev) => [...prev, ...applyPresetToBubbles(res.bubbles, null)]);
            } else {
              pendingDraftResultRef.current = res;
            }
          })
          .finally(() => setIsGenerating(false));
      } else {
        // 通常ルート: ワンクリック完全自動展開
        setIsGenerating(true);
        try {
          const res = await generateDraftApi({
            snapshot_id: snapshotId,
            target_tag_set_id: primaryTagSetId,
            explicit_preset_id: existingPreset.id,
          });
          setBubbles((prev) => [...prev, ...applyPresetToBubbles(res.bubbles, existingPreset.id)]);
        } finally {
          setIsGenerating(false);
        }
      }
    } else {
      // null/undefined ルート: プリセット検索をスキップして直接 API 呼出
      // primaryTagSetId が undefined の場合も同じ処理（意図的動作）
      setIsGenerating(true);
      try {
        const res = await generateDraftApi({
          snapshot_id: snapshotId,
          target_tag_set_id: null,
        });
        setBubbles((prev) => [...prev, ...applyPresetToBubbles(res.bubbles, null)]);
      } catch (err) {
        console.error('[useSceneSpeechGeneration] null-route API error:', err);
      } finally {
        setIsGenerating(false);
      }
    }
  };

  const onPresetCreatedAndApply = (newPresetId: number) => {
    setIsModalOpen(false);
    createdPresetIdRef.current = newPresetId;
    if (pendingDraftResultRef.current) {
      setBubbles((prev) => [...prev, ...applyPresetToBubbles(pendingDraftResultRef.current!.bubbles, newPresetId)]);
      pendingDraftResultRef.current = null;
    }
  };

  const onModalCancel = () => {
    setIsModalOpen(false);
    isCancelledRef.current = true;
    if (pendingDraftResultRef.current) {
      setBubbles((prev) => [...prev, ...applyPresetToBubbles(pendingDraftResultRef.current!.bubbles, null)]);
      pendingDraftResultRef.current = null;
    }
  };

  return {
    isModalOpen,
    isGenerating,
    handleBatchGenerateClick,
    onPresetCreatedAndApply,
    onModalCancel,
  };
}
