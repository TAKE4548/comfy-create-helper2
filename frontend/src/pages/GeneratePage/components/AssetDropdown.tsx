import type { Lora, TagSet } from '../../../api/types'

export interface AssetDropdownProps {
  role: string
  loras?: Lora[]
  tagSets?: TagSet[]
  setLoraStrength: (strength: number) => void
  setSelectedTriggerSetId: (id: number | 'default') => void
  setSelectedLoraForModal: (data: { role: string; lora: Lora } | null) => void
  setOpenAddAssetRole: (role: string | null) => void
  handleAddTagSetAsset: (role: string, ts: TagSet) => void
}

export const AssetDropdown = ({
  role,
  loras,
  tagSets,
  setLoraStrength,
  setSelectedTriggerSetId,
  setSelectedLoraForModal,
  setOpenAddAssetRole,
  handleAddTagSetAsset,
}: AssetDropdownProps) => (
  <div className="absolute right-0 mt-1 w-64 bg-surface border border-[rgba(255,255,255,0.1)] rounded-lg shadow-2xl z-20 max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-3">
    <div>
      <p className="text-[10px] font-semibold text-zinc-500 uppercase px-2 py-1 border-b border-[rgba(255,255,255,0.05)]">LoRAs</p>
      <div className="space-y-0.5 mt-1">
        {loras && loras.length > 0 ? loras.map((lora) => (
          <button type="button" key={lora.id} onClick={() => {
            const min = lora.recommended_strength_min, max = lora.recommended_strength_max
            let initStrength = 1.0
            if (min != null && max != null) initStrength = Math.round(((min + max) / 2) * 10) / 10
            else if (min != null) initStrength = min
            else if (max != null) initStrength = max
            setLoraStrength(initStrength)
            setSelectedTriggerSetId(lora.trigger_word_sets?.length ? lora.trigger_word_sets[0].id : 'default')
            setSelectedLoraForModal({ role, lora })
            setOpenAddAssetRole(null)
          }} className="w-full text-left text-xs px-2 py-1.5 rounded text-zinc-300 hover:bg-white/5 hover:text-white truncate" title={lora.description || lora.model_name}>
            {lora.description || lora.model_name.split('/').pop()?.replace('.safetensors', '')}
          </button>
        )) : <p className="text-[10px] text-zinc-500 px-2 py-1 italic">No LoRAs found</p>}
      </div>
    </div>
    <div>
      <p className="text-[10px] font-semibold text-[#7C6FDD] uppercase px-2 py-1 border-b border-[rgba(255,255,255,0.05)]">Tag Sets</p>
      <div className="space-y-0.5 mt-1">
        {tagSets && tagSets.length > 0 ? tagSets.map((ts) => (
          <button type="button" key={ts.id} onClick={() => handleAddTagSetAsset(role, ts)}
            className="w-full text-left text-xs px-2 py-1.5 rounded text-zinc-300 hover:bg-white/5 hover:text-white truncate" title={ts.description || ts.name}>
            {ts.name}
          </button>
        )) : <p className="text-[10px] text-zinc-500 px-2 py-1 italic">No Tag Sets found</p>}
      </div>
    </div>
  </div>
)
