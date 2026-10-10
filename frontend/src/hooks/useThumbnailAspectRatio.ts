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

function writeStorage(key: string, value: string): string | null {
  try {
    localStorage.setItem(key, value)
    return null
  } catch (error) {
    return error instanceof Error && error.message ? error.message : 'ブラウザーの保存領域に書き込めませんでした'
  }
}

export function useThumbnailAspectRatio() {
  const [presetId, setPresetIdState] = useState<string>(() =>
    readStorage(LS_KEYS.THUMBNAIL_ASPECT_RATIO, DEFAULT_ASPECT_RATIO_ID),
  )
  const [customRatio, setCustomRatioState] = useState<string>(() =>
    readStorage(LS_KEYS.THUMBNAIL_ASPECT_RATIO_CUSTOM, ''),
  )
  const [persistenceError, setPersistenceError] = useState<string | null>(null)

  useEffect(() => {
    const handleStorage = (event: Event) => {
      if (event instanceof CustomEvent && event.type === EVENT_NAME) {
        const change = event.detail as { key?: string; value?: string; error?: string | null } | undefined
        if (change?.key === LS_KEYS.THUMBNAIL_ASPECT_RATIO && typeof change.value === 'string') {
          setPresetIdState(change.value)
          setPersistenceError(change.error ?? null)
          return
        }
        if (change?.key === LS_KEYS.THUMBNAIL_ASPECT_RATIO_CUSTOM && typeof change.value === 'string') {
          setCustomRatioState(change.value)
          setPersistenceError(change.error ?? null)
          return
        }
      }
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

  const setPreset = useCallback((id: string): boolean => {
    const error = writeStorage(LS_KEYS.THUMBNAIL_ASPECT_RATIO, id)
    setPresetIdState(id)
    setPersistenceError(error)
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { key: LS_KEYS.THUMBNAIL_ASPECT_RATIO, value: id, error } }))
    return error === null
  }, [])

  const setCustomRatio = useCallback((ratio: string): boolean => {
    const error = writeStorage(LS_KEYS.THUMBNAIL_ASPECT_RATIO_CUSTOM, ratio)
    setCustomRatioState(ratio)
    setPersistenceError(error)
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { key: LS_KEYS.THUMBNAIL_ASPECT_RATIO_CUSTOM, value: ratio, error } }))
    return error === null
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
    persistenceError,
    setPreset,
    setCustomRatio,
  }
}
