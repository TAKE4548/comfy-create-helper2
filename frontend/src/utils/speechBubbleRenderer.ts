// Facade module for speech bubble rendering, geometry, typography, and coordinate transform.
// Re-exports all components for backward compatibility.

export * from './bubbleTransform'
export * from './bubbleGeometry'
export * from './bubbleTypography'
export * from './bubbleCanvasRenderer'

import {
  getDefaultPathPoints,
  flipPathPoints,
  clampTailApexOutsideBubble,
  getTailContactPositions,
  getTailBasePosition,
} from './bubbleGeometry'

import {
  verticalCharMap,
  layoutVerticalText,
  layoutHorizontalText,
  calculateCharacterTransform,
  calculateFitFontSize,
  calculateFitBubbleDimensions,
} from './bubbleTypography'

import {
  drawMultiStrokes,
  applyTextFill,
  drawBubbleShape,
  drawBubbleText,
  drawSpeechBubble,
} from './bubbleCanvasRenderer'

// Also provide bundled facade object for backward compatibility
export const speechBubbleRenderer = {
  verticalCharMap,
  getDefaultPathPoints,
  flipPathPoints,
  clampTailApexOutsideBubble,
  getTailContactPositions,
  getTailBasePosition,
  layoutVerticalText,
  layoutHorizontalText,
  calculateCharacterTransform,
  drawMultiStrokes,
  applyTextFill,
  calculateFitFontSize,
  calculateFitBubbleDimensions,
  drawBubbleShape,
  drawBubbleText,
  drawSpeechBubble,
}
