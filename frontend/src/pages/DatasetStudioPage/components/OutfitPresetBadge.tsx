import React from 'react'
import type { OutfitMasterPreset } from '../../../api/types'
import { X } from 'lucide-react'

export interface OutfitPresetBadgeProps {
  outfit: OutfitMasterPreset
  onRemove?: (id: number) => void
  count?: number
}

export const OutfitPresetBadge: React.FC<OutfitPresetBadgeProps> = ({
  outfit,
  onRemove,
  count,
}) => {
  return (
    <span
      data-testid={`outfit-badge-${outfit.id}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-200"
    >
      <span className="font-semibold text-indigo-300">{outfit.name}</span>
      {count !== undefined && (
        <span className="text-[10px] bg-zinc-700/80 text-zinc-300 px-1.5 py-0.5 rounded-full font-mono">
          {count}枠
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          data-testid={`remove-outfit-${outfit.id}`}
          onClick={(e) => {
            e.stopPropagation()
            onRemove(outfit.id)
          }}
          className="text-zinc-400 hover:text-red-400 focus:outline-none transition-colors ml-0.5"
          aria-label={`${outfit.name}を削除`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}
