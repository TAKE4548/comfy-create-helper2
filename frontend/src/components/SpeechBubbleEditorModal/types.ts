import type { SnapshotSummary, BubbleCandidate, GeneratedSpeechBubbleRead, SceneDraftRequest, SceneDraftResponse, SceneSpeechStreamOptions } from '../../api/types'
import type { SpeechBubble } from '../../types/speechBubble'

export type MobileTab = 'preview' | 'controls'

export interface SpeechBubbleEditorModalProps {
  snapshot: SnapshotSummary
  initialAlbumId?: number
  onClose: () => void
  onSaved: () => void
  primaryTagSetId?: number | null
  generateDraftApi?: (payload: SceneDraftRequest, options?: SceneSpeechStreamOptions) => Promise<SceneDraftResponse>
  applyPresetToBubbles?: (bubbles: GeneratedSpeechBubbleRead[], presetId: number | null) => SpeechBubble[]
}

export type DraggingType = 'bubble' | 'tail' | 'tail-base-1' | 'tail-base-2' | 'resize' | 'rotate'
export type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw'

export interface DraggingState {
  bubbleId: string
  type: DraggingType
  handle?: ResizeHandle
  startX: number
  startY: number
  initialBubble: SpeechBubble
}

export interface ROI {
  x: number
  y: number
  w: number
  h: number
}

export type FilterStatus = 'all' | 'pass' | 'fail'
export type SortBy = 'area_desc' | 'area_asc' | 'brightness_desc' | 'distance_center' | 'id'

export type { BubbleCandidate }
