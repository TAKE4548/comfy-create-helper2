import type { LoraCreate } from '../../api/types'

export type LoraFormState = Omit<LoraCreate, 'trigger_word_sets'> & {
  trigger_word_sets: { name: string; words: string }[]
}
