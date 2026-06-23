import { X } from 'lucide-react'
import type { AppliedAsset } from '../../../store/useGenerationStore'

export interface AppliedAssetChipsProps {
  role: string
  appliedAssets: Record<string, AppliedAsset[]>
  toggleAppliedAsset: (role: string, id: string) => void
  removeAppliedAsset: (role: string, id: string) => void
}

export const AppliedAssetChips = ({
  role,
  appliedAssets,
  toggleAppliedAsset,
  removeAppliedAsset,
}: AppliedAssetChipsProps) => {
  const assets = appliedAssets[role] || []
  if (!assets.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {assets.map((asset) => (
        <div key={asset.id} className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] transition-all ${
          asset.enabled
            ? asset.type === 'lora' ? 'bg-accent-green/5 text-accent-green border-accent-green/20' : 'bg-[#7C6FDD]/5 text-[#a99ef7] border-[#7C6FDD]/20'
            : 'bg-zinc-900/60 text-zinc-650 border-zinc-800/80 opacity-40'
        }`}>
          <input type="checkbox" checked={asset.enabled} onChange={() => toggleAppliedAsset(role, asset.id)} className="w-3 h-3 rounded border-zinc-800 accent-accent-green cursor-pointer" />
          <span className="font-medium select-none cursor-pointer" onClick={() => toggleAppliedAsset(role, asset.id)}>
            {asset.type === 'lora' ? 'LoRA: ' : 'TagSet: '}{asset.name}
            {asset.type === 'lora' && asset.loraPromptString && (
              <span className="text-[9px] opacity-75 ml-1 font-mono">({asset.loraPromptString.split(':').pop()?.replace('>', '')})</span>
            )}
          </span>
          <button type="button" onClick={() => removeAppliedAsset(role, asset.id)} className="text-current/40 hover:text-red-400 transition-colors"><X size={10} /></button>
        </div>
      ))}
    </div>
  )
}
