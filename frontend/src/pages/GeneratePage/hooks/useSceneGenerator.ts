import { llmPromptsApi, workflowPresetsApi } from '../../../api/client'
import type { SceneItem, SceneDiffParams } from '../../../api/types'

interface UseSceneGeneratorParams {
  workflowId: number
  baseParamValues: Record<string, string>
}

export function useSceneGenerator({ workflowId, baseParamValues }: UseSceneGeneratorParams) {

  const generateDrafts = async (
    targetFields: string[],
    scenes: SceneItem[],
  ): Promise<SceneDiffParams[]> => {
    const baseParams: Record<string, string> = {}
    targetFields.forEach(f => { baseParams[f] = baseParamValues[f] ?? '' })

    return await llmPromptsApi.sceneGenerate({
      target_fields: targetFields,
      base_params: baseParams,
      scenes: scenes.map(s => ({ id: s.id, summary: s.summary })),
    })
  }

  const saveAsProfiles = async (
    scenes: SceneItem[],
    drafts: SceneDiffParams[],
  ): Promise<void> => {
    for (const draft of drafts) {
      const scene = scenes.find(s => s.id === draft.scene_id)
      const profileName = scene?.summary ?? `Scene ${draft.scene_id}`
      const finalParams = { ...baseParamValues, ...draft.diff_params }

      await workflowPresetsApi.create({
        workflow_id: workflowId,
        name: profileName,
        param_values: finalParams,
        applied_assets: {},
        batch_size: 1,
        seed_mode: 'random',
        seed: 42,
      })
    }
  }

  return { generateDrafts, saveAsProfiles }
}
