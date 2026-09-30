import type { SceneDraftResponse } from '../../../api/types'

export interface ProgressStep {
  key: 'reference' | 'vlm' | 'style' | 'vram'
  label: string
  status: 'pending' | 'active' | 'done' | 'error'
}

export type SceneSpeechModalState =
  | { type: 'progress'; steps: ProgressStep[]; elapsedSeconds: number }
  | { type: 'onboarding'; tagSetId: number }
  | { type: 'error'; errorKind: 'lm_studio_400' | 'connection_refused' | 'timeout' | 'unknown'; message: string }
  | { type: 'review'; result: SceneDraftResponse }
