import { useQuery } from '@tanstack/react-query'
import { lorasApi } from '../api/client'
import type { Lora } from '../api/types'
import { Plus, Trash2 } from 'lucide-react'
import { SearchableLoraSelect } from './SearchableLoraSelect'

interface LoraStackEditorProps {
  role: string
  paramValues: Record<string, string>
  setParamValues: (values: Record<string, string>) => void
  loras: Lora[] | undefined
  title?: string
  activeBaseModelId?: number | null
}

export function LoraStackEditor({ role, paramValues, setParamValues, loras, title, activeBaseModelId }: LoraStackEditorProps) {
  const { data: comfyModels } = useQuery({
    queryKey: ['comfy-lora-models'],
    queryFn: lorasApi.getComfyModels,
  })

  const loraCount = parseInt(paramValues[`${role}_lora_count`] || '0', 10)

  const handleAddSlot = () => {
    if (loraCount >= 10) return
    const nextIdx = loraCount + 1
    const newValues = { ...paramValues }
    newValues[`${role}_lora_count`] = String(nextIdx)
    newValues[`${role}_lora_name_${nextIdx}`] = ''
    newValues[`${role}_lora_wt_${nextIdx}`] = '0.0'
    newValues[`${role}_model_str_${nextIdx}`] = '1.0'
    newValues[`${role}_clip_str_${nextIdx}`] = '1.0'
    setParamValues(newValues)
  }

  const handleRemoveSlot = (removeIdx: number) => {
    const newValues = { ...paramValues }
    
    // Shift following slots left (from index removeIdx+1 to loraCount)
    for (let i = removeIdx; i < loraCount; i++) {
      const next = i + 1
      newValues[`${role}_lora_name_${i}`] = paramValues[`${role}_lora_name_${next}`] || ''
      newValues[`${role}_lora_wt_${i}`] = paramValues[`${role}_lora_wt_${next}`] || '0.0'
      newValues[`${role}_model_str_${i}`] = paramValues[`${role}_model_str_${next}`] || '1.0'
      newValues[`${role}_clip_str_${i}`] = paramValues[`${role}_clip_str_${next}`] || '1.0'
    }

    // Delete keys of the last slot (which is now redundant)
    delete newValues[`${role}_lora_name_${loraCount}`]
    delete newValues[`${role}_lora_wt_${loraCount}`]
    delete newValues[`${role}_model_str_${loraCount}`]
    delete newValues[`${role}_clip_str_${loraCount}`]

    newValues[`${role}_lora_count`] = String(loraCount - 1)
    setParamValues(newValues)
  }

  const handleValueChange = (key: string, val: string) => {
    setParamValues({
      ...paramValues,
      [key]: val,
    })
  }

  const slots = Array.from({ length: loraCount }, (_, i) => i + 1)

  return (
    <div className="space-y-2 border-t border-[rgba(255,255,255,0.06)] pt-3 mt-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400">{title || 'LoRA Stack'}</span>
        <button
          type="button"
          onClick={handleAddSlot}
          disabled={loraCount >= 10}
          className="flex items-center gap-1 text-[10px] px-2 py-1 bg-[#7C6FDD] text-white hover:bg-[#6d62cc] disabled:opacity-40 disabled:cursor-not-allowed rounded transition-all font-medium"
        >
          <Plus size={10} />Add LoRA
        </button>
      </div>

      {slots.length === 0 ? (
        <p className="text-[10px] text-zinc-550 italic">No LoRAs added.</p>
      ) : (
        <div className="space-y-2.5">
          {slots.map((idx) => {
            const currentName = paramValues[`${role}_lora_name_${idx}`] || ''
            const currentWt = paramValues[`${role}_lora_wt_${idx}`] || '0.0'
            const currentModelStr = paramValues[`${role}_model_str_${idx}`] || '1.0'
            const currentClipStr = paramValues[`${role}_clip_str_${idx}`] || '1.0'

            return (
              <div key={idx} className="bg-surface p-2 rounded border border-[rgba(255,255,255,0.04)] space-y-2">
                <div className="flex items-center gap-2">
                  <SearchableLoraSelect
                    value={currentName}
                    onChange={(val) => handleValueChange(`${role}_lora_name_${idx}`, val)}
                    comfyModels={comfyModels}
                    loras={loras}
                    activeBaseModelId={activeBaseModelId}
                    className="flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveSlot(idx)}
                    className="text-zinc-500 hover:text-red-400 p-1"
                    title="Remove slot"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-zinc-500">Weight</span>
                    <input
                      type="number"
                      step={0.1}
                      value={currentWt}
                      onChange={(e) => handleValueChange(`${role}_lora_wt_${idx}`, e.target.value)}
                      className="bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-zinc-500">Model Str</span>
                    <input
                      type="number"
                      step={0.1}
                      value={currentModelStr}
                      onChange={(e) => handleValueChange(`${role}_model_str_${idx}`, e.target.value)}
                      className="bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-zinc-500">Clip Str</span>
                    <input
                      type="number"
                      step={0.1}
                      value={currentClipStr}
                      onChange={(e) => handleValueChange(`${role}_clip_str_${idx}`, e.target.value)}
                      className="bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
