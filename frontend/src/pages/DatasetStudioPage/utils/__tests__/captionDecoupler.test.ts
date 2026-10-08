import { describe, it, expect } from 'vitest'
import { decoupleCaption } from '../captionDecoupler'

describe('decoupleCaption', () => {
  it('default outfit slot: removes physical and exclusive outfit tags, prepends triggers', () => {
    const result = decoupleCaption({
      rawPrompt: '1girl, blue eyes, sailor suit, pleated skirt, smile, classroom',
      characterTrigger: 'chara_alice',
      outfitTrigger: 'outfit_school',
      physicalTags: ['blue eyes'],
      exclusiveOutfitTags: ['sailor suit', 'pleated skirt'],
      isDefaultOutfit: true,
    })

    expect(result).toBe('chara_alice, outfit_school, 1girl, smile, classroom')
  })

  it('alt outfit slot: removes physical tags, retains alt tags, injects only characterTrigger', () => {
    const result = decoupleCaption({
      rawPrompt: '1girl, blue eyes, maid dress, apron, smile',
      characterTrigger: 'chara_alice',
      outfitTrigger: 'outfit_school',
      physicalTags: ['blue eyes'],
      exclusiveOutfitTags: ['sailor suit', 'pleated skirt'],
      isDefaultOutfit: false,
    })

    expect(result).toBe('chara_alice, 1girl, maid dress, apron, smile')
  })

  it('handles empty triggers gracefully without leading commas', () => {
    const result = decoupleCaption({
      rawPrompt: '1girl, blue eyes, smile',
      characterTrigger: '',
      outfitTrigger: '',
      physicalTags: ['blue eyes'],
      exclusiveOutfitTags: [],
      isDefaultOutfit: true,
    })

    expect(result).toBe('1girl, smile')
  })

  it('handles case-insensitivity and whitespace in tags', () => {
    const result = decoupleCaption({
      rawPrompt: '1girl, BLUE EYES , Sailor Suit , smile',
      characterTrigger: 'chara_alice',
      outfitTrigger: 'outfit_school',
      physicalTags: ['blue eyes'],
      exclusiveOutfitTags: ['sailor suit'],
      isDefaultOutfit: true,
    })

    expect(result).toBe('chara_alice, outfit_school, 1girl, smile')
  })

  it('handles empty or blank rawPrompt gracefully', () => {
    const result = decoupleCaption({
      rawPrompt: '',
      characterTrigger: 'chara_alice',
      outfitTrigger: 'outfit_school',
      physicalTags: ['blue eyes'],
      exclusiveOutfitTags: ['sailor suit'],
      isDefaultOutfit: true,
    })

    expect(result).toBe('chara_alice, outfit_school')
  })
})
