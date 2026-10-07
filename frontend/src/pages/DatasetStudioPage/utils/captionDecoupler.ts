export interface DecoupleParams {
  rawPrompt: string
  characterTrigger: string
  outfitTrigger: string
  physicalTags: string[]
  exclusiveOutfitTags: string[]
  isDefaultOutfit: boolean
}

export function decoupleCaption(params: DecoupleParams): string {
  const { rawPrompt, characterTrigger, outfitTrigger, physicalTags, exclusiveOutfitTags, isDefaultOutfit } = params
  let tags = rawPrompt.split(',').map((t) => t.trim()).filter(Boolean)

  // 1. Strip physical tags
  const physicalLower = new Set(physicalTags.map((t) => t.toLowerCase()))
  tags = tags.filter((t) => !physicalLower.has(t.toLowerCase()))

  // 2. Strip outfit tags if default outfit slot
  if (isDefaultOutfit) {
    const exclusiveLower = new Set(exclusiveOutfitTags.map((t) => t.toLowerCase()))
    tags = tags.filter((t) => !exclusiveLower.has(t.toLowerCase()))
    return [characterTrigger, outfitTrigger, ...tags].filter(Boolean).join(', ')
  } else {
    // Alt outfit slot: keep alt tags, never inject outfitTrigger
    return [characterTrigger, ...tags].filter(Boolean).join(', ')
  }
}
