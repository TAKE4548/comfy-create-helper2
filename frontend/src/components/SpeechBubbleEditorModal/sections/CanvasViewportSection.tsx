import React from 'react'
import { Loader2 } from 'lucide-react'
import type { SpeechBubble } from '../../../types/speechBubble'
import type { MobileTab } from '../types'

export interface CanvasViewportSectionProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  imageObj: HTMLImageElement | null
  canvasDimensions: { width: number; height: number }
  cursorStyle: string
  selectedBubble: SpeechBubble | null
  setBubbles: React.Dispatch<React.SetStateAction<SpeechBubble[]>>
  activeMobileTab: MobileTab
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onMouseUp: () => void
  onTouchStart: (e: React.TouchEvent<HTMLCanvasElement>) => void
  onTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => void
  onTouchEnd: () => void
  onDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void
}

export const CanvasViewportSection: React.FC<CanvasViewportSectionProps> = ({
  canvasRef,
  imageObj,
  canvasDimensions,
  cursorStyle,
  selectedBubble,
  setBubbles,
  activeMobileTab,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onDoubleClick,
}) => {
  return (
    <div
      className={`${
        activeMobileTab === 'preview' ? 'flex' : 'hidden'
      } md:flex flex-[3] flex-col items-center justify-center bg-black/40 rounded-lg p-2 md:p-3 border border-[rgba(255,255,255,0.04)] relative`}
    >
      {selectedBubble && selectedBubble.tail && (
        <div className="flex flex-wrap items-center justify-between w-full max-w-lg mb-2 px-3 py-1.5 bg-zinc-900/80 rounded-lg border border-[rgba(255,255,255,0.08)] backdrop-blur-sm text-xs">
          <label className="inline-flex items-center gap-1.5 text-zinc-200 cursor-pointer font-medium select-none">
            <input
              type="checkbox"
              aria-label="しっぽ微調整モード"
              checked={!!selectedBubble.tail.isFineTuning}
              onChange={(e) => {
                const isChecked = e.target.checked
                setBubbles((prev) =>
                  prev.map((b) =>
                    b.id === selectedBubble.id && b.tail
                      ? { ...b, tail: { ...b.tail, isFineTuning: isChecked } }
                      : b
                  )
                )
              }}
              className="rounded accent-blue-500"
            />
            <span>🎯 しっぽ微調整モード</span>
          </label>
          {selectedBubble.tail.isFineTuning && (
            <div className="flex items-center gap-2 pl-2 border-l border-zinc-700 text-zinc-400">
              <span className="text-[11px] text-zinc-300">💡 橙色の2接点をドラッグして配置</span>
              <button
                type="button"
                onClick={() => {
                  setBubbles((prev) =>
                    prev.map((b) =>
                      b.id === selectedBubble.id && b.tail
                        ? {
                            ...b,
                            tail: {
                              ...b.tail,
                              baseAngle1: undefined,
                              baseAngle2: undefined,
                              baseAngleOffset: 0,
                              baseSpreadRatio: 1.0,
                            },
                          }
                        : b
                    )
                  )
                }}
                className="px-2 py-0.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
              >
                🔄 接点初期化
              </button>
            </div>
          )}
        </div>
      )}

      {!imageObj ? (
        <div className="flex flex-col items-center gap-2 text-zinc-400">
          <Loader2 className="animate-spin" size={28} />
          <span>画像をロード中...</span>
        </div>
      ) : (
        <div className="relative border border-[rgba(255,255,255,0.08)] shadow-lg rounded max-w-full overflow-hidden">
          <canvas
            ref={canvasRef as React.RefObject<HTMLCanvasElement>}
            width={canvasDimensions.width}
            height={canvasDimensions.height}
            style={{ cursor: cursorStyle }}
            className="block touch-none max-w-full"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onDoubleClick={onDoubleClick}
          />
        </div>
      )}
      <span className="text-[10px] text-zinc-500 mt-2 text-center">
        ※ダブルクリックで新規吹き出し追加 / バブル・尻尾・四隅ハンドルをドラッグして移動・サイズ変更 / 余白ドラッグでROI検出
      </span>
    </div>
  )
}
