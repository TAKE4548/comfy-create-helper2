import React from 'react'

export interface SweetSpotCardProps {
  recommendedWeightDisplay: string // e.g. "0.75 〜 0.85"
  reason: string
}

export const SweetSpotCard: React.FC<SweetSpotCardProps> = ({
  recommendedWeightDisplay,
  reason,
}) => {
  return (
    <div
      data-testid="sweet-spot-card"
      className="p-4 rounded-xl border-2 border-emerald-500/80 bg-emerald-950/20 shadow-lg flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-black text-xs font-bold">
          ★
        </span>
        <h4 className="text-emerald-300 font-semibold text-sm tracking-wide">
          推奨運用強度 (スイートスポット)
        </h4>
      </div>

      <div className="flex items-baseline gap-2 mt-1">
        <span
          data-testid="sweet-spot-weight"
          className="text-2xl font-black text-emerald-400 tracking-tight"
        >
          {recommendedWeightDisplay}
        </span>
        <span className="text-xs text-emerald-200/70 font-medium">推奨LoRA適用強度</span>
      </div>

      <p data-testid="sweet-spot-reason" className="text-xs text-emerald-100/80 leading-relaxed mt-1">
        {reason}
      </p>
    </div>
  )
}
