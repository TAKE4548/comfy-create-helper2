
import React from 'react'

export interface TelemetryLossChartProps {
  data: { step: number; loss: number }[]
  currentVramGb?: number
  gpuTemp?: number
  totalVramGb?: number
}

export const TelemetryLossChart: React.FC<TelemetryLossChartProps> = ({
  data,
  currentVramGb = 0,
  gpuTemp = 0,
  totalVramGb = 16,
}) => {
  const width = 460
  const height = 180
  const padding = { top: 20, right: 20, bottom: 30, left: 45 }

  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom

  const maxLoss = data.length > 0 ? Math.max(...data.map((d) => d.loss), 0.2) : 0.2
  const minLoss = 0
  const maxStep = data.length > 0 ? Math.max(...data.map((d) => d.step), 10) : 10
  const minStep = 0

  const getX = (step: number) => {
    if (maxStep === minStep) return padding.left
    return padding.left + ((step - minStep) / (maxStep - minStep)) * innerWidth
  }

  const getY = (loss: number) => {
    if (maxLoss === minLoss) return padding.top + innerHeight
    return padding.top + innerHeight - ((loss - minLoss) / (maxLoss - minLoss)) * innerHeight
  }

  const pointsString = data.map((d) => `${getX(d.step)},${getY(d.loss)}`).join(' ')

  const vramPercent = Math.min(Math.round((currentVramGb / totalVramGb) * 100), 100)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-4 text-zinc-100" data-testid="telemetry-loss-chart">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <h4 className="font-medium text-sm text-zinc-200 flex items-center gap-2">
          <span>📉</span> リアルタイム Loss 収束 & テレメトリ監視
        </h4>
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5" data-testid="vram-indicator">
            <span className="text-zinc-400">実装VRAM:</span>
            <span className="font-semibold text-emerald-400">{currentVramGb.toFixed(1)} GB</span>
            <span className="text-zinc-500">/ {totalVramGb} GB</span>
          </div>
          <div className="flex items-center gap-1.5" data-testid="temp-indicator">
            <span className="text-zinc-400">GPU Temp:</span>
            <span className={`font-semibold ${gpuTemp > 80 ? 'text-rose-400' : gpuTemp > 65 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {gpuTemp.toFixed(0)}°C
            </span>
          </div>
        </div>
      </div>

      {/* VRAM Gauge Bar */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-zinc-400 font-mono">
          <span>VRAM 使用率</span>
          <span>{vramPercent}% ({currentVramGb.toFixed(1)} / {totalVramGb} GB)</span>
        </div>
        <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden" role="progressbar" aria-valuenow={vramPercent} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`h-full transition-all duration-300 ${
              vramPercent > 90 ? 'bg-rose-500' : vramPercent > 75 ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${vramPercent}%` }}
          />
        </div>
      </div>

      {/* SVG Loss Curve */}
      <div className="relative w-full flex justify-center">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto bg-zinc-950/60 rounded border border-zinc-800/80"
          data-testid="loss-svg"
        >
          {/* Grid lines */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left + innerWidth}
            y2={padding.top}
            stroke="#27272a"
            strokeDasharray="2 2"
          />
          <line
            x1={padding.left}
            y1={padding.top + innerHeight / 2}
            x2={padding.left + innerWidth}
            y2={padding.top + innerHeight / 2}
            stroke="#27272a"
            strokeDasharray="2 2"
          />
          <line
            x1={padding.left}
            y1={padding.top + innerHeight}
            x2={padding.left + innerWidth}
            y2={padding.top + innerHeight}
            stroke="#3f3f46"
          />

          {/* Y Axis Labels */}
          <text x={padding.left - 6} y={padding.top + 4} fill="#71717a" fontSize="10" textAnchor="end" fontFamily="monospace">
            {maxLoss.toFixed(2)}
          </text>
          <text x={padding.left - 6} y={padding.top + innerHeight / 2 + 4} fill="#71717a" fontSize="10" textAnchor="end" fontFamily="monospace">
            {((maxLoss + minLoss) / 2).toFixed(2)}
          </text>
          <text x={padding.left - 6} y={padding.top + innerHeight} fill="#71717a" fontSize="10" textAnchor="end" fontFamily="monospace">
            0.00
          </text>

          {/* X Axis Labels */}
          <text x={padding.left} y={height - 8} fill="#71717a" fontSize="10" fontFamily="monospace">
            0
          </text>
          <text x={padding.left + innerWidth} y={height - 8} fill="#71717a" fontSize="10" textAnchor="end" fontFamily="monospace">
            {maxStep} steps
          </text>

          {/* Polyline Loss */}
          {data.length > 1 && (
            <polyline
              fill="none"
              stroke="#6366f1"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pointsString}
            />
          )}

          {/* Points */}
          {data.map((d, i) => (
            <circle
              key={i}
              cx={getX(d.step)}
              cy={getY(d.loss)}
              r="3"
              fill="#818cf8"
              className="hover:r-5 transition-all"
            >
              <title>{`Step ${d.step}: Loss ${d.loss.toFixed(4)}`}</title>
            </circle>
          ))}
        </svg>
      </div>
    </div>
  )
}
