import { useState, useEffect, useCallback, useMemo } from 'react'
import { LS_KEYS } from '../utils/localStorageKeys'
import {
  ASPECT_RATIO_PRESETS,
  DEFAULT_ASPECT_RATIO_ID,
  parseAspectRatio,
  type ParsedAspectRatio,
} from '../utils/aspectRatio'

const EVENT_NAME = 'thumbnail-aspect-ratio-changed'

function readStorage(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Keep the hook usable for this session when browser storage is unavailable.
  }
}

export function useThumbnailAspectRatio() {
  const [presetId, setPresetIdState] = useState<string>(() =>
    readStorage(LS_KEYS.THUMBNAIL_ASPECT_RATIO, DEFAULT_ASPECT_RATIO_ID),
  )
  const [customRatio, setCustomRatioState] = useState<string>(() =>
    readStorage(LS_KEYS.THUMBNAIL_ASPECT_RATIO_CUSTOM, ''),
  )

  useEffect(() => {
    const handleStorage = () => {
      setPresetIdState((current) => readStorage(LS_KEYS.THUMBNAIL_ASPECT_RATIO, current))
      setCustomRatioState((current) => readStorage(LS_KEYS.THUMBNAIL_ASPECT_RATIO_CUSTOM, current))
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener(EVENT_NAME, handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(EVENT_NAME, handleStorage)
    }
  }, [])

  const setPreset = useCallback((id: string) => {
    writeStorage(LS_KEYS.THUMBNAIL_ASPECT_RATIO, id)
    setPresetIdState(id)
    window.dispatchEvent(new Event(EVENT_NAME))
  }, [])

  const setCustomRatio = useCallback((ratio: string) => {
    writeStorage(LS_KEYS.THUMBNAIL_ASPECT_RATIO_CUSTOM, ratio)
    setCustomRatioState(ratio)
    window.dispatchEvent(new Event(EVENT_NAME))
  }, [])

  const parsed = useMemo<ParsedAspectRatio>(() => {
    return parseAspectRatio(presetId, customRatio)
  }, [presetId, customRatio])

  const aspectRatioStyle = useMemo(() => ({
    aspectRatio: parsed.ratioStr,
  }), [parsed.ratioStr])

  return {
    presetId,
    customRatio,
    presets: ASPECT_RATIO_PRESETS,
    ratioStr: parsed.ratioStr,
    numericRatio: parsed.numericRatio,
    aspectRatioStyle,
    setPreset,
    setCustomRatio,
  }
}
