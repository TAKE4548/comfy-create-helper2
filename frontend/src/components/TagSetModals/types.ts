export interface TagSetFormState {
  name: string
  description: string
  category_id: number | undefined
  tags: string
  thumbnail_path?: string
  subsets?: { name: string; tags: string }[]
  target_base_model_ids?: number[]
}
