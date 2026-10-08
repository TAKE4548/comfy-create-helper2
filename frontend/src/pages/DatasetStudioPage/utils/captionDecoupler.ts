import { PromptTokenEngine } from '../../../utils/prompt/PromptTokenEngine'

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

  let tokens = PromptTokenEngine.tokenize(rawPrompt || '')

  // 1. Strip physical tags
  tokens = PromptTokenEngine.decoupleTags(tokens, physicalTags || [])

  // 2. Strip outfit tags if default outfit slot & prepare triggers
  let triggersToInject: string[] = []
  if (isDefaultOutfit) {
    tokens = PromptTokenEngine.decoupleTags(tokens, exclusiveOutfitTags || [])
    triggersToInject = [characterTrigger, outfitTrigger].filter(Boolean)
  } else {
    // Alt outfit slot: keep alt tags, never inject outfitTrigger
    triggersToInject = [characterTrigger].filter(Boolean)
  }

  if (triggersToInject.length > 0) {
    tokens = PromptTokenEngine.decoupleTags(tokens, [], triggersToInject, { position: 'prepend' })
  }

  return PromptTokenEngine.serializeToComfyPrompt(tokens)
}
