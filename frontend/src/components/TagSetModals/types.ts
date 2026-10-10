export const TAGSET_SUBSET_CLIENT_ID: unique symbol = Symbol('tagset-subset-client-id')

export interface TagSetSubsetFormState {
  name: string
  tags: string
  thumbnail_path?: string | null
  /** Symbol-keyed identity survives edits/reordering and is omitted from JSON payloads. */
  [TAGSET_SUBSET_CLIENT_ID]?: string
}

export interface TagSetFormState {
  name: string
  description: string
  category_id: number | undefined
  tags: string
  thumbnail_path?: string
  subsets?: TagSetSubsetFormState[]
  target_base_model_ids?: number[]
}
