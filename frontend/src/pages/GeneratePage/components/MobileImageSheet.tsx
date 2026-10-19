import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, ImageOff, Download, Camera } from 'lucide-react'

export interface MobileImageSheetProps {
  isOpen: boolean
  onClose: () => void
  image: string | null
  onSaveSnapshot?: (imageUrl: string) => void
}

interface WakeLockSentinel {
  released: boolean
  release: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
}

const requestFullscreenSafe = async (el: HTMLElement) => {
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen()
    } else if ((el as any).webkitRequestFullscreen) {
      await (el as any).webkitRequestFullscreen()
    }
  } catch (_e) {
    // Non-blocking fallback to CSS 100dvh
  }
}

const exitFullscreenSafe = async () => {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen()
    } else if ((document as any).webkitFullscreenElement && (document as any).webkitExitFullscreen) {
      await (document as any).webkitExitFullscreen()
    }
  } catch (_e) {
    // Non-blocking
  }
}

export const MobileImageSheet: React.FC<MobileImageSheetProps> = ({
  isOpen,
  onClose,
  image,
  onSaveSnapshot,
}) => {
  const [viewMode, setViewMode] = useState<'sheet' | 'fullscreen'>('sheet')
  const [hasError, setHasError] = useState(false)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Reset state when opening/closing or image changes
  useEffect(() => {
    if (isOpen) {
      setViewMode('sheet')
      setHasError(false)
    }
  }, [isOpen, image])

  // Screen Wake Lock acquisition
  const requestWakeLock = useCallback(async () => {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && (navigator as any).wakeLock?.request) {
      try {
        if (wakeLockRef.current && !wakeLockRef.current.released) {
          return
        }
        const sentinel = await (navigator as any).wakeLock.request('screen')
        wakeLockRef.current = sentinel
      } catch (_e) {
        // Non-blocking graceful fallback
      }
    }
  }, [])

  // Screen Wake Lock release
  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release()
      } catch (_e) {
        // Non-blocking
      } finally {
        wakeLockRef.current = null
      }
    }
  }, [])

  // Transition to fullscreen
  const enterFullscreen = useCallback(async () => {
    setViewMode('fullscreen')
    if (containerRef.current) {
      await requestFullscreenSafe(containerRef.current)
    }
  }, [])

  // Return from fullscreen to sheet
  const exitFullscreen = useCallback(async () => {
    setViewMode('sheet')
    await exitFullscreenSafe()
  }, [])

  // WakeLock lifecycle and visibilitychange handling
  useEffect(() => {
    if (viewMode !== 'fullscreen') {
      return
    }

    // Entering fullscreen: request wake lock
    requestWakeLock()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        releaseWakeLock()
      } else if (document.visibilityState === 'visible') {
        requestWakeLock()
      }
    }

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
        // Handled if browser UI exited fullscreen directly
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      releaseWakeLock()
    }
  }, [viewMode, requestWakeLock, releaseWakeLock])

  // Close sheet completely
  const handleSheetClose = useCallback(() => {
    exitFullscreenSafe()
    setViewMode('sheet')
    onClose()
  }, [onClose])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewMode === 'fullscreen') {
          exitFullscreen()
        } else {
          handleSheetClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, viewMode, exitFullscreen, handleSheetClose])

  if (!isOpen || !image) {
    return null
  }

  if (viewMode === 'fullscreen') {
    return (
      <div
        ref={containerRef}
        data-testid="mobile-fullscreen-viewer"
        className="fixed inset-0 z-50 bg-black flex items-center justify-center w-full h-[100dvh] touch-manipulation select-none"
      >
        <button
          type="button"
          data-testid="mobile-fullscreen-close-btn"
          aria-label="全画面表示を閉じる"
          onClick={exitFullscreen}
          className="absolute top-[calc(12px+env(safe-area-inset-top))] right-3.5 z-10 w-11 h-11 rounded-full bg-black/60 text-white flex items-center justify-center border border-white/10 active:scale-95 transition-all min-w-[44px] min-h-[44px]"
        >
          <X size={20} />
        </button>

        {hasError ? (
          <div
            data-testid="mobile-sheet-image-error"
            className="flex flex-col items-center justify-center gap-2 text-zinc-400 p-4"
          >
            <ImageOff size={48} className="text-zinc-500" />
            <span className="text-sm">画像の読み込みに失敗しました</span>
          </div>
        ) : (
          <img
            src={image}
            alt="全画面画像"
            onClick={exitFullscreen}
            onError={() => setHasError(true)}
            className="w-full h-full object-contain cursor-pointer"
          />
        )}
      </div>
    )
  }

  return (
    <div
      data-testid="mobile-image-sheet"
      className="fixed inset-0 z-50 bg-black/65 flex flex-col justify-end backdrop-blur-sm animate-fade-in"
    >
      <div
        data-testid="mobile-image-sheet-backdrop"
        className="absolute inset-0 -z-10"
        onClick={handleSheetClose}
        aria-hidden="true"
      />

      <div
        data-testid="mobile-image-sheet-content"
        className="w-full bg-surface-2 border-t border-white/10 rounded-t-2xl max-h-[88dvh] p-3.5 flex flex-col overscroll-contain shadow-2xl pb-[calc(14px+env(safe-area-inset-bottom))]"
      >
        {/* Handle / Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-300">画像プレビュー</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              id="download-btn-mobile"
              href={image}
              download="generated.png"
              aria-label="画像をダウンロード"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-surface border border-white/10 text-zinc-200 hover:text-white px-2.5 py-1.5 text-xs transition-colors"
            >
              <Download size={16} className="mr-1" />
              <span>ダウンロード</span>
            </a>

            {onSaveSnapshot && (
              <button
                type="button"
                data-testid="mobile-sheet-save-btn"
                aria-label="スナップショット保存"
                onClick={() => onSaveSnapshot(image)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-surface border border-white/10 text-zinc-200 hover:text-white px-2.5 py-1.5 text-xs transition-colors"
              >
                <Camera size={16} className="mr-1" />
                <span>保存</span>
              </button>
            )}

            <button
              type="button"
              data-testid="mobile-sheet-close-btn"
              aria-label="シートを閉じる"
              onClick={handleSheetClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Image Preview Body */}
        <div className="flex-1 flex flex-col items-center justify-center py-4 overflow-hidden min-h-[220px]">
          {hasError ? (
            <div
              data-testid="mobile-sheet-image-error"
              className="flex flex-col items-center justify-center gap-2 text-zinc-400 p-8"
            >
              <ImageOff size={48} className="text-zinc-500" />
              <span className="text-sm">画像の読み込みに失敗しました</span>
            </div>
          ) : (
            <img
              src={image}
              alt="プレビュー画像"
              onClick={enterFullscreen}
              onError={() => setHasError(true)}
              className="max-h-[60dvh] w-auto max-w-full object-contain rounded-lg cursor-pointer active:scale-[0.99] transition-transform"
            />
          )}
        </div>

        {/* Footer Guidance */}
        {!hasError && (
          <p className="text-center text-[11px] text-zinc-400 pt-1">
            画像をタップして全画面で確認
          </p>
        )}
      </div>
    </div>
  )
}
