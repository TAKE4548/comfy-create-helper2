import { useQuery } from '@tanstack/react-query'
import { baseModelsApi } from '../../api/client'
import type { BaseModel } from '../../api/types'

export interface BaseModelSelectProps {
  idPrefix?: string
  selectedIds?: number[]
  onChange: (ids: number[]) => void
  baseModels?: BaseModel[]
  accentClass?: string // 'purple' | 'green' または Tailwind クラス
  label?: string
}

export function BaseModelSelect({
  idPrefix = 'base-model-select',
  selectedIds = [],
  onChange,
  baseModels: propBaseModels,
  accentClass = 'purple',
  label = 'Target Base Models',
}: BaseModelSelectProps) {
  // Fetch if not provided as prop
  const { data: queriedBaseModels } = useQuery({
    queryKey: ['base-models'],
    queryFn: () => baseModelsApi.list(),
    enabled: propBaseModels === undefined,
  })

  const baseModels = propBaseModels ?? queriedBaseModels

  const resolvedAccentClass =
    accentClass === 'green'
      ? 'text-accent-green accent-accent-green'
      : accentClass === 'purple'
      ? 'text-[#7C6FDD] accent-[#7C6FDD]'
      : accentClass

  const checkboxClass = `rounded border-[rgba(255,255,255,0.2)] bg-surface focus:ring-0 focus:ring-offset-0 focus:outline-none ${resolvedAccentClass}`

  return (
    <div>
      {label && <label className="text-xs text-zinc-400 mb-1.5 block">{label}</label>}
      <div className="flex flex-wrap gap-3 p-3 bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg">
        {baseModels?.map((bm) => {
          const checked = (selectedIds || []).includes(bm.id)
          return (
            <label key={bm.id} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
              <input
                id={`${idPrefix}-${bm.id}`}
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const ids = selectedIds || []
                  const nextIds = e.target.checked
                    ? [...ids, bm.id]
                    : ids.filter((id) => id !== bm.id)
                  onChange(nextIds)
                }}
                className={checkboxClass}
              />
              <span>{bm.name}</span>
            </label>
          )
        })}
        {(!baseModels || baseModels.length === 0) && (
          <span className="text-xs text-zinc-500 italic">No base models configured.</span>
        )}
      </div>
    </div>
  )
}
