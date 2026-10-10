import type { LoraCreate } from '../../api/types'

export type LoraFormState = Omit<LoraCreate, 'trigger_word_sets'> & {
  trigger_word_sets: { name: string; words: string }[]
}

export function validateLoraStrengthRange(
  form: Pick<LoraFormState, 'recommended_strength_min' | 'recommended_strength_max'>,
): string | null {
  const min = form.recommended_strength_min
  const max = form.recommended_strength_max
  if ((min !== undefined && !Number.isFinite(min)) || (max !== undefined && !Number.isFinite(max))) {
    return '強度は有限の数値で入力してください'
  }
  if (min !== undefined && max !== undefined && min > max) {
    return 'MinはMax以下にしてください'
  }
  return null
}
