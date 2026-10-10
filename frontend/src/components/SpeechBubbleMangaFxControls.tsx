import React, { useState } from 'react'
import { ChevronDown, ChevronRight, X, Zap } from 'lucide-react'
import type {
  SpeechBubble,
  MangaTextEffectConfig,
  MultiStrokeLayer,
  PathPresetType,
  ScaleCurveType,
  FillModeType,
  StrokeLineStyle,
} from '../types/speechBubble'
import { DEFAULT_MANGA_EFFECTS } from '../types/speechBubble'
import { flipPathPoints, getDefaultPathPoints } from '../utils/bubbleGeometry'

export interface SpeechBubbleMangaFxControlsProps {
  bubble: SpeechBubble
  onUpdateEffects: (effects: MangaTextEffectConfig) => void
  recentColors: string[]
  onAddRecentColor: (color: string) => void
}

function rgbaToHexAndAlpha(rgbaStr: string): { hex: string; alpha: number } {
  if (!rgbaStr) return { hex: '#000000', alpha: 1 }

  const rgbaMatch = rgbaStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i)
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10).toString(16).padStart(2, '0')
    const g = parseInt(rgbaMatch[2], 10).toString(16).padStart(2, '0')
    const b = parseInt(rgbaMatch[3], 10).toString(16).padStart(2, '0')
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
    return { hex: `#${r}${g}${b}`, alpha: a }
  }

  if (rgbaStr.startsWith('#')) {
    if (rgbaStr.length === 4) {
      const r = rgbaStr[1] + rgbaStr[1]
      const g = rgbaStr[2] + rgbaStr[2]
      const b = rgbaStr[3] + rgbaStr[3]
      return { hex: `#${r}${g}${b}`, alpha: 1 }
    }
    if (rgbaStr.length === 7) {
      return { hex: rgbaStr, alpha: 1 }
    }
    if (rgbaStr.length === 9) {
      const hex = rgbaStr.substring(0, 7)
      const a = parseInt(rgbaStr.substring(7, 9), 16) / 255
      return { hex, alpha: Math.round(a * 100) / 100 }
    }
  }

  return { hex: '#000000', alpha: 1 }
}

function hexAndAlphaToRgba(hex: string, alpha: number): string {
  let cleanHex = hex.replace('#', '')
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map((c) => c + c).join('')
  }
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const SpeechBubbleMangaFxControls: React.FC<SpeechBubbleMangaFxControlsProps> = ({
  bubble,
  onUpdateEffects,
}) => {
  const [isMangaFxOpen, setIsMangaFxOpen] = useState(false)
  const fx: MangaTextEffectConfig = bubble.effects || DEFAULT_MANGA_EFFECTS

  const updateEffects = (partial: Partial<MangaTextEffectConfig>) => {
    const updatedFx: MangaTextEffectConfig = {
      ...DEFAULT_MANGA_EFFECTS,
      ...(bubble.effects || {}),
      ...partial,
    }
    onUpdateEffects(updatedFx)
  }

  const handleAutoRotatePunctuation = () => {
    if (!bubble.text) return
    const textChars = Array.from(bubble.text)
    const targetIndices: number[] = []
    const punctuationRegex = /[!?！？]/

    textChars.forEach((ch, idx) => {
      if (punctuationRegex.test(ch)) {
        targetIndices.push(idx)
      }
    })

    const currentRotateIndices = fx.rotate90Indices || []
    const allAlreadyIncluded = targetIndices.length > 0 && targetIndices.every((i) => currentRotateIndices.includes(i))

    let nextRotateIndices: number[]
    if (allAlreadyIncluded) {
      nextRotateIndices = currentRotateIndices.filter((i) => !targetIndices.includes(i))
    } else {
      nextRotateIndices = Array.from(new Set([...currentRotateIndices, ...targetIndices]))
    }
    updateEffects({ rotate90Indices: nextRotateIndices })
  }

  const handleToggleCharRotate = (charIdx: number) => {
    const current = fx.rotate90Indices || []
    const next = current.includes(charIdx) ? current.filter((i) => i !== charIdx) : [...current, charIdx]
    updateEffects({ rotate90Indices: next })
  }

  const handleAddMultiStroke = () => {
    const newLayer: MultiStrokeLayer = {
      id: crypto.randomUUID(),
      width: 3,
      color: 'rgba(255, 255, 255, 1)',
      opacity: 1,
      offsetX: 0,
      offsetY: 0,
      lineJoin: 'round',
      lineStyle: 'solid',
    }
    updateEffects({ multiStrokes: [...(fx.multiStrokes || []), newLayer] })
  }

  const handleUpdateMultiStroke = (id: string, partial: Partial<MultiStrokeLayer>) => {
    const updated = (fx.multiStrokes || []).map((layer) => (layer.id === id ? { ...layer, ...partial } : layer))
    updateEffects({ multiStrokes: updated })
  }

  const handleDeleteMultiStroke = (id: string) => {
    const updated = (fx.multiStrokes || []).filter((layer) => layer.id !== id)
    updateEffects({ multiStrokes: updated })
  }

  const handleFlipScale = () => {
    const currentStart = fx.scaleStart ?? 1.0
    const currentEnd = fx.scaleEnd ?? 1.0
    updateEffects({
      scaleStart: currentEnd,
      scaleEnd: currentStart,
    })
  }

  const handleFlipPath = () => {
    if (!bubble) return
    const currentPreset = fx.pathPreset || 'none'
    if (currentPreset === 'none') return
    const defaultPts = getDefaultPathPoints(currentPreset, bubble.orientation)
    const requiredCount = currentPreset === 'arc' ? 3 : currentPreset === 'wave' ? 4 : (currentPreset === 'line' || currentPreset === 'stepped') ? 2 : 0
    const currentPts = fx.pathPoints && fx.pathPoints.length >= requiredCount ? fx.pathPoints : defaultPts
    const flipped = flipPathPoints(currentPts, bubble.orientation)
    updateEffects({ pathPoints: flipped })
  }

  return (
    <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.08)]" data-testid="manga-effects-section">
      <div
        role="button"
        tabIndex={0}
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsMangaFxOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsMangaFxOpen((prev) => !prev)
          }
        }}
      >
        <div className="flex items-center gap-1.5 font-medium text-xs text-zinc-200">
          {isMangaFxOpen
            ? <ChevronDown aria-hidden="true" size={12} />
            : <ChevronRight aria-hidden="true" size={12} />}
          <span className="inline-flex items-center gap-1"><Zap aria-hidden="true" size={12} /> 漫画テキスト演出 (FX)</span>
        </div>
        {(fx.scaleCurve !== 'none' ||
          (fx.multiStrokes && fx.multiStrokes.length > 0) ||
          fx.pathPreset !== 'none' ||
          fx.fillMode !== 'solid' ||
          (fx.rotate90Indices && fx.rotate90Indices.length > 0)) && (
          <span className="text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
            演出適用中
          </span>
        )}
      </div>

      {isMangaFxOpen && (
        <div className="space-y-3 bg-[#18181C] p-2.5 rounded border border-[rgba(255,255,255,0.08)]">
          {/* 1. タイポグラフィ & 縦中横 */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-blue-400 border-b border-[rgba(255,255,255,0.06)] pb-1">
              1. タイポグラフィ & 縦中横
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-0.5">
                  <span>字間 (Letter Spacing)</span>
                  <span>{fx.letterSpacing ?? 0}px</span>
                </div>
                <input
                  type="range"
                  aria-label="字間"
                  min="-10"
                  max="50"
                  value={fx.letterSpacing ?? 0}
                  onChange={(e) => updateEffects({ letterSpacing: parseInt(e.target.value, 10) })}
                  className="w-full accent-blue-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-0.5">
                  <span>行間倍率 (Line Height)</span>
                  <span>{(fx.lineHeightRatio ?? (bubble.orientation === 'vertical' ? 1.15 : 1.25)).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  aria-label="行間倍率"
                  min="0.8"
                  max="2.5"
                  step="0.05"
                  value={fx.lineHeightRatio ?? (bubble.orientation === 'vertical' ? 1.15 : 1.25)}
                  onChange={(e) => updateEffects({ lineHeightRatio: parseFloat(e.target.value) })}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-0.5">
                <span>シアー傾斜 (Shear)</span>
                <span>{fx.shearAngle ?? 0}°</span>
              </div>
              <input
                type="range"
                aria-label="シアー傾斜"
                min="-45"
                max="45"
                value={fx.shearAngle ?? 0}
                onChange={(e) => updateEffects({ shearAngle: parseInt(e.target.value, 10) })}
                className="w-full accent-blue-500"
              />
            </div>

            {bubble.orientation === 'vertical' && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400 font-medium">縦中横（90度回転）</span>
                  <button
                    type="button"
                    onClick={handleAutoRotatePunctuation}
                    className="text-[10px] px-2 py-0.5 bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 rounded border border-blue-700/50 transition-colors"
                  >
                    !? 自動回転トグル
                  </button>
                </div>
                {bubble.text && (
                  <div className="flex flex-wrap gap-1 bg-[#1F1F25] p-1.5 rounded border border-[rgba(255,255,255,0.06)]">
                    {Array.from(bubble.text).map((char, idx) => {
                      const isRotated = fx.rotate90Indices?.includes(idx)
                      return (
                        <button
                          key={`${char}-${idx}`}
                          type="button"
                          onClick={() => handleToggleCharRotate(idx)}
                          className={`w-6 h-6 text-xs rounded border flex items-center justify-center transition-colors ${
                            isRotated
                              ? 'bg-amber-600 border-amber-500 text-white font-bold'
                              : 'bg-[#18181C] border-[rgba(255,255,255,0.1)] text-zinc-300 hover:bg-[#282830]'
                          }`}
                          title={`文字「${char}」(位置:${idx + 1}) を90度回転`}
                        >
                          {char === '\n' ? '↵' : char}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. ダイナミックスケール & 感情揺らぎ */}
          <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center justify-between text-[11px] font-semibold text-blue-400 border-b border-[rgba(255,255,255,0.06)] pb-1">
              <span>2. ダイナミックスケール & 感情揺らぎ</span>
              {fx.scaleCurve && fx.scaleCurve !== 'none' && (
                <button
                  type="button"
                  onClick={handleFlipScale}
                  aria-label="スケール反転"
                  className="px-2 py-0.5 text-[10px] font-normal rounded bg-zinc-800 hover:bg-zinc-700 text-blue-300 border border-blue-500/30 transition-colors"
                >
                  スケール反転 ⇄
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-0.5">スケール変化カーブ</label>
                <select
                  aria-label="スケール変化カーブ"
                  value={fx.scaleCurve ?? 'none'}
                  onChange={(e) => updateEffects({ scaleCurve: e.target.value as ScaleCurveType })}
                  className="w-full p-1 border border-[rgba(255,255,255,0.12)] rounded bg-[#1F1F25] text-zinc-100 text-xs focus:outline-none"
                >
                  <option value="none">なし (均一サイズ)</option>
                  <option value="linear">線形変化 (Linear)</option>
                  <option value="ease-in">イーズイン (Ease In)</option>
                  <option value="ease-out">イーズアウト (Ease Out)</option>
                  <option value="bezier">ベジェ (S字カーブ)</option>
                </select>
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-0.5">
                  <span>サイズ揺らぎ (Jitter)</span>
                  <span>{fx.sizeJitter ?? 0}%</span>
                </div>
                <input
                  type="range"
                  aria-label="サイズ揺らぎ"
                  min="0"
                  max="50"
                  value={fx.sizeJitter ?? 0}
                  onChange={(e) => updateEffects({ sizeJitter: parseInt(e.target.value, 10) })}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>

            {fx.scaleCurve && fx.scaleCurve !== 'none' && (
              <div className="grid grid-cols-2 gap-2 bg-[#1F1F25] p-1.5 rounded border border-[rgba(255,255,255,0.06)]">
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span>開始倍率 (Start)</span>
                    <span>{(fx.scaleStart ?? 1.0).toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    aria-label="開始倍率"
                    min="0.5"
                    max="3.0"
                    step="0.1"
                    value={fx.scaleStart ?? 1.0}
                    onChange={(e) => updateEffects({ scaleStart: parseFloat(e.target.value) })}
                    className="w-full accent-blue-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span>終了倍率 (End)</span>
                    <span>{(fx.scaleEnd ?? 1.0).toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    aria-label="終了倍率"
                    min="0.5"
                    max="3.0"
                    step="0.1"
                    value={fx.scaleEnd ?? 1.0}
                    onChange={(e) => updateEffects({ scaleEnd: parseFloat(e.target.value) })}
                    className="w-full accent-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3. パス・軌道レイアウト */}
          <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center justify-between text-[11px] font-semibold text-blue-400 border-b border-[rgba(255,255,255,0.06)] pb-1">
              <span>3. パス・軌道レイアウト</span>
              {fx.pathPreset && fx.pathPreset !== 'none' && (
                <button
                  type="button"
                  onClick={handleFlipPath}
                  aria-label="パス反転"
                  className="px-2 py-0.5 text-[10px] font-normal rounded bg-zinc-800 hover:bg-zinc-700 text-blue-300 border border-blue-500/30 transition-colors"
                >
                  パス反転 ⇄
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-0.5">軌道タイプ</label>
                <select
                  aria-label="軌道タイプ"
                  value={fx.pathPreset ?? 'none'}
                  onChange={(e) => {
                    const val = e.target.value as PathPresetType
                    const defaultPts = val !== 'none' ? getDefaultPathPoints(val, bubble.orientation) : []
                    updateEffects({ pathPreset: val, pathPoints: defaultPts })
                  }}
                  className="w-full p-1 border border-[rgba(255,255,255,0.12)] rounded bg-[#1F1F25] text-zinc-100 text-xs focus:outline-none"
                >
                  <option value="none">なし (通常整列)</option>
                  <option value="line">直線 (2制御点)</option>
                  <option value="arc">円弧・アーチ (3制御点)</option>
                  <option value="wave">S字波 (4制御点)</option>
                  <option value="stepped">階段 (2制御点)</option>
                </select>
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-0.5">
                  <span>ガタつき (Baseline Jitter)</span>
                  <span>{fx.baselineJitter ?? 0}px</span>
                </div>
                <input
                  type="range"
                  aria-label="ガタつき"
                  min="0"
                  max="20"
                  value={fx.baselineJitter ?? 0}
                  onChange={(e) => updateEffects({ baselineJitter: parseInt(e.target.value, 10) })}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>

            {fx.pathPreset && fx.pathPreset !== 'none' && (
              <div className="flex items-center space-x-2 pt-1">
                <label className="inline-flex items-center text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!fx.pathFollowRotation}
                    onChange={(e) => updateEffects({ pathFollowRotation: e.target.checked })}
                    className="mr-1.5 rounded accent-blue-500"
                  />
                  パス接線方向に文字を回転追従させる
                </label>
              </div>
            )}
          </div>

          {/* 4. カラー・塗り・テクスチャ */}
          <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <div className="text-[11px] font-semibold text-blue-400 border-b border-[rgba(255,255,255,0.06)] pb-1">
              4. カラー・塗り・グラデーション
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-0.5">塗りモード</label>
                <select
                  aria-label="塗りモード"
                  value={fx.fillMode ?? 'solid'}
                  onChange={(e) => updateEffects({ fillMode: e.target.value as FillModeType })}
                  className="w-full p-1 border border-[rgba(255,255,255,0.12)] rounded bg-[#1F1F25] text-zinc-100 text-xs focus:outline-none"
                >
                  <option value="solid">単色塗り (Solid)</option>
                  <option value="gradient">グラデーション (Gradient)</option>
                  <option value="tone">スクリーントーン網点 (Tone)</option>
                  <option value="hollow">中抜き (Hollow)</option>
                </select>
              </div>
              {fx.fillMode === 'gradient' && (
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-0.5">種別</label>
                  <select
                    aria-label="グラデーション種別"
                    value={fx.gradientType ?? 'linear'}
                    onChange={(e) => updateEffects({ gradientType: e.target.value as 'linear' | 'radial' })}
                    className="w-full p-1 border border-[rgba(255,255,255,0.12)] rounded bg-[#1F1F25] text-zinc-100 text-xs focus:outline-none"
                  >
                    <option value="linear">線形 (Linear)</option>
                    <option value="radial">放射状 (Radial)</option>
                  </select>
                </div>
              )}
            </div>

            {fx.fillMode === 'gradient' && (
              <div className="space-y-1.5 bg-[#1F1F25] p-2 rounded border border-[rgba(255,255,255,0.06)]">
                {fx.gradientType === 'linear' && (
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                      <span>角度 (Angle)</span>
                      <span>{fx.gradientAngle ?? 0}°</span>
                    </div>
                    <input
                      type="range"
                      aria-label="グラデーション角度"
                      min="0"
                      max="360"
                      value={fx.gradientAngle ?? 0}
                      onChange={(e) => updateEffects({ gradientAngle: parseInt(e.target.value, 10) })}
                      className="w-full accent-blue-500"
                    />
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-zinc-300">
                  <span>グラデーション色</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="グラデーション開始色"
                      value={rgbaToHexAndAlpha(fx.gradientStops?.[0]?.color || bubble.textColor).hex}
                      onChange={(e) => {
                        const c1 = e.target.value
                        const c2 = fx.gradientStops?.[1]?.color || 'rgba(100, 100, 100, 1)'
                        updateEffects({
                          gradientStops: [
                            { color: c1, offset: 0 },
                            { color: c2, offset: 1 },
                          ],
                        })
                      }}
                      className="w-6 h-6 rounded border border-[rgba(255,255,255,0.15)] bg-transparent cursor-pointer p-0.5"
                    />
                    <span>→</span>
                    <input
                      type="color"
                      aria-label="グラデーション終了色"
                      value={rgbaToHexAndAlpha(fx.gradientStops?.[1]?.color || 'rgba(100, 100, 100, 1)').hex}
                      onChange={(e) => {
                        const c1 = fx.gradientStops?.[0]?.color || bubble.textColor
                        const c2 = e.target.value
                        updateEffects({
                          gradientStops: [
                            { color: c1, offset: 0 },
                            { color: c2, offset: 1 },
                          ],
                        })
                      }}
                      className="w-6 h-6 rounded border border-[rgba(255,255,255,0.15)] bg-transparent cursor-pointer p-0.5"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. 多重フチ（多層アウトライン） */}
          <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-1">
              <span className="text-[11px] font-semibold text-blue-400">5. 多重フチ（多層アウトライン）</span>
              <button
                type="button"
                onClick={handleAddMultiStroke}
                className="text-[10px] px-2 py-0.5 bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 rounded border border-blue-700/50 transition-colors"
              >
                ＋ フチ追加
              </button>
            </div>

            {(!fx.multiStrokes || fx.multiStrokes.length === 0) ? (
              <div className="text-[11px] text-zinc-500 py-1 text-center">多重フチレイヤーはありません</div>
            ) : (
              <div className="space-y-2">
                {fx.multiStrokes.map((layer, idx) => {
                  const layerColorParsed = rgbaToHexAndAlpha(layer.color)
                  return (
                    <div
                      key={layer.id || idx}
                      className="p-2 bg-[#1F1F25] rounded border border-[rgba(255,255,255,0.08)] space-y-1.5"
                      data-testid={`multi-stroke-layer-${idx}`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-zinc-300">
                        <span className="font-medium">レイヤー #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteMultiStroke(layer.id)}
                          aria-label={`レイヤー ${idx + 1} を削除`}
                          className="text-red-400 hover:text-red-300 text-[10px]"
                          title="レイヤー削除"
                        >
                          <X aria-hidden="true" size={12} /> 削除
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                            <span>太さ</span>
                            <span>{layer.width}px</span>
                          </div>
                          <input
                            type="range"
                            aria-label={`フチレイヤー${idx + 1}太さ`}
                            min="1"
                            max="20"
                            value={layer.width}
                            onChange={(e) =>
                              handleUpdateMultiStroke(layer.id, { width: parseInt(e.target.value, 10) })
                            }
                            className="w-full accent-blue-500"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            aria-label={`フチレイヤー${idx + 1}色`}
                            value={layerColorParsed.hex}
                            onChange={(e) => {
                              const rgba = hexAndAlphaToRgba(e.target.value, layer.opacity ?? 1)
                              handleUpdateMultiStroke(layer.id, { color: rgba })
                            }}
                            className="w-6 h-6 rounded border border-[rgba(255,255,255,0.15)] bg-transparent cursor-pointer p-0.5"
                          />
                          <select
                            aria-label={`フチレイヤー${idx + 1}スタイル`}
                            value={layer.lineStyle ?? 'solid'}
                            onChange={(e) =>
                              handleUpdateMultiStroke(layer.id, { lineStyle: e.target.value as StrokeLineStyle })
                            }
                            className="flex-1 p-1 border border-[rgba(255,255,255,0.12)] rounded bg-[#18181C] text-zinc-100 text-[10px] focus:outline-none"
                          >
                            <option value="solid">実線</option>
                            <option value="dashed">破線</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
