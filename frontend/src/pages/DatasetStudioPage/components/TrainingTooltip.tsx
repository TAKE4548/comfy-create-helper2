import React, { useState } from 'react'

export const PARAM_TOOLTIPS: Record<string, string> = {
  networkDim: 'LoRAの表現容量（特異値の次元数）。キャラLoRAは16〜32が最適。過学習とポーズ追従性のトレードオフ。',
  networkAlpha: '重みスケーリング倍率。通常はDimと同値（1:1）または半分（1:2）に設定。',
  learningRate: '全体の学習歩幅。Anima DiTは 1e-4 が推奨。',
  textEncoderLr: 'Qwen3テキストエンコーダの学習率。0（Freeze）でVRAM節約＆言語理解保護。',
  mixedPrecision: '計算精度。AMD ROCm / RX 9070 XTではNaN防止のため bf16 が必須。',
  gradientCheckpointing: '中間活性化を再計算してVRAM消費を約50%カット。16GB環境必須。',
  noiseOffset: '極端な明暗表現力を高める正則化。コントラスト焼けを抑制。',
}

export interface TrainingTooltipProps {
  paramKey: string
  title?: string
}

export const TrainingTooltip: React.FC<TrainingTooltipProps> = ({ paramKey, title }) => {
  const [isVisible, setIsVisible] = useState(false)
  const explanation = PARAM_TOOLTIPS[paramKey] || title || ''

  return (
    <span
      className="relative inline-block ml-1 align-middle text-xs"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
      tabIndex={0}
      aria-label={`解説: ${paramKey}`}
      data-testid={`tooltip-trigger-${paramKey}`}
    >
      <span className="cursor-pointer select-none text-zinc-400 hover:text-indigo-400 font-semibold px-1 rounded-full bg-zinc-800 border border-zinc-700">
        (?)
      </span>
      {isVisible && (
        <div
          role="tooltip"
          data-testid={`tooltip-content-${paramKey}`}
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 p-2.5 text-xs font-normal text-zinc-100 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl pointer-events-none"
        >
          {explanation}
        </div>
      )}
    </span>
  )
}
