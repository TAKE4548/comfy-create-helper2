import React, { useMemo } from 'react'
import type { BubbleCandidate } from '../../../api/types'
import type { FilterStatus, SortBy } from '../types'

export interface CandidateDebugDrawerProps {
  showDebugPanel: boolean
  setShowDebugPanel: (show: boolean) => void
  filterStatus: FilterStatus
  setFilterStatus: (status: FilterStatus) => void
  sortBy: SortBy
  setSortBy: (sortBy: SortBy) => void
  candidates: BubbleCandidate[]
  isDebugLoading: boolean
  hoveredCandidate: BubbleCandidate | null
  setHoveredCandidate: (c: BubbleCandidate | null) => void
  hasLastUsedROI: boolean
  lastUsedROI?: { x: number; y: number; w: number; h: number } | null
  onApplyCandidate: (c: BubbleCandidate) => void
}

export const CandidateDebugDrawer: React.FC<CandidateDebugDrawerProps> = ({
  showDebugPanel,
  setShowDebugPanel,
  filterStatus,
  setFilterStatus,
  sortBy,
  setSortBy,
  candidates,
  isDebugLoading,
  hoveredCandidate,
  setHoveredCandidate,
  hasLastUsedROI,
  lastUsedROI,
  onApplyCandidate,
}) => {
  const processedCandidates = useMemo(() => {
    return [...candidates]
      .filter((c) => {
        if (filterStatus === 'pass') return c.status === 'PASS'
        if (filterStatus === 'fail') return c.status !== 'PASS'
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'area_desc') return b.area - a.area
        if (sortBy === 'area_asc') return a.area - b.area
        if (sortBy === 'brightness_desc') return b.mean_brightness - a.mean_brightness
        if (sortBy === 'id') return a.id - b.id

        if (sortBy === 'distance_center' && lastUsedROI) {
          const roiCx = lastUsedROI.x + lastUsedROI.w / 2
          const roiCy = lastUsedROI.y + lastUsedROI.h / 2
          const aCx = a.x + a.w / 2
          const aCy = a.y + a.h / 2
          const distA = Math.pow(aCx - roiCx, 2) + Math.pow(aCy - roiCy, 2)
          const bCx = b.x + b.w / 2
          const bCy = b.y + b.h / 2
          const distB = Math.pow(bCx - roiCx, 2) + Math.pow(bCy - roiCy, 2)
          return distA - distB
        }

        return b.area - a.area
      })
  }, [candidates, filterStatus, sortBy, lastUsedROI])

  return (
    <div className="space-y-2 border-t border-[rgba(255,255,255,0.06)] pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-300">デバッグ: 全ての検出候補を表示</span>
        <input
          type="checkbox"
          checked={showDebugPanel}
          onChange={(e) => setShowDebugPanel(e.target.checked)}
          className="accent-accent-green cursor-pointer"
        />
      </div>

      {showDebugPanel && (
        <>
          <div className="flex gap-2 text-[10px] text-zinc-400 bg-zinc-950/40 p-2 rounded-lg border border-[rgba(255,255,255,0.06)]">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[9px] text-zinc-500 font-semibold">判定フィルタ</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                className="w-full bg-zinc-900 border border-[rgba(255,255,255,0.08)] rounded px-1 py-0.5 text-zinc-200 focus:outline-none"
              >
                <option value="pass">OKのみ</option>
                <option value="all">すべて</option>
                <option value="fail">NGのみ</option>
              </select>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[9px] text-zinc-500 font-semibold">並び替え</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="w-full bg-zinc-900 border border-[rgba(255,255,255,0.08)] rounded px-1 py-0.5 text-zinc-200 focus:outline-none"
              >
                {hasLastUsedROI && <option value="distance_center">ROI中心に近い順</option>}
                <option value="area_desc">面積が大きい順</option>
                <option value="area_asc">面積が小さい順</option>
                <option value="brightness_desc">輝度が高い順</option>
                <option value="id">検出順(ID)</option>
              </select>
            </div>
          </div>

          <div className="border border-[rgba(255,255,255,0.08)] bg-zinc-950/40 rounded-lg overflow-hidden text-[11px] font-sans max-h-40 overflow-y-auto">
            {isDebugLoading ? (
              <div className="p-4 text-center text-zinc-500">読み込み中...</div>
            ) : processedCandidates.length === 0 ? (
              <div className="p-4 text-center text-zinc-500">条件に合う候補が見つかりませんでした</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-900 border-b border-[rgba(255,255,255,0.06)] text-zinc-400">
                    <th className="p-1.5 text-center">判定</th>
                    <th className="p-1.5">面積</th>
                    <th className="p-1.5">輝度</th>
                    <th className="p-1.5 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {processedCandidates.map((c) => {
                    const isPass = c.status === 'PASS'
                    return (
                      <tr
                        key={c.id}
                        className={`border-b border-[rgba(255,255,255,0.02)] transition-colors hover:bg-white/5 cursor-pointer ${
                          hoveredCandidate?.id === c.id ? 'bg-amber-500/10' : ''
                        }`}
                        onMouseEnter={() => setHoveredCandidate(c)}
                        onMouseLeave={() => setHoveredCandidate(null)}
                        onClick={() => onApplyCandidate(c)}
                      >
                        <td className="p-1.5 text-center">
                          <span
                            className={`px-1 rounded text-[9px] font-bold ${
                              isPass ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {isPass ? 'OK' : c.status.replace('FAIL_', '')}
                          </span>
                        </td>
                        <td className="p-1.5 text-zinc-300">{c.area}</td>
                        <td className="p-1.5 text-zinc-300">{c.mean_brightness}</td>
                        <td className="p-1.5 text-right">
                          <button
                            type="button"
                            className="px-1.5 py-0.5 bg-[#7C6FDD] hover:bg-[#6d62cc] text-white rounded text-[10px]"
                            onClick={(e) => {
                              e.stopPropagation()
                              onApplyCandidate(c)
                            }}
                          >
                            適用
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
