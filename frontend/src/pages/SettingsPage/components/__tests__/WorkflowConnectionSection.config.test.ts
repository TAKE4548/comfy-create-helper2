import { describe, expect, it } from 'vitest'
import { validateConfig } from '../WorkflowConnectionSection'

describe('WorkflowConnectionSection - validateConfig', () => {
  const validBaseWorkflowJson = {
    format: 'prompt-surgeon-workflow-config',
    version: 1,
    name: 'Test Workflow',
    json_body: {
      nodes: {
        '10': { class_type: 'KSampler' },
        '20': { class_type: 'VAEDecode' },
      },
    },
    mappings: [],
    target_base_model_id: 1,
    default_applied_assets: null,
  }

  const masterIds = [1, 2, 3]
  const modelIds = [1, 2]

  it('同一 master_id で異なる variant_id を持つマッピングを正常にPASSする', () => {
    const config = {
      ...validBaseWorkflowJson,
      mappings: [
        { master_id: 1, node_id: '10', variant_id: 101 },
        { master_id: 1, node_id: '20', variant_id: 102 },
      ],
    }

    const result = validateConfig(config, masterIds, modelIds)
    expect(result.mappings).toEqual([
      { master_id: 1, node_id: '10', variant_id: 101 },
      { master_id: 1, node_id: '20', variant_id: 102 },
    ])
  })

  it('同一 master_id かつ同一 variant_id の重複時はエラーをスローする', () => {
    const config = {
      ...validBaseWorkflowJson,
      mappings: [
        { master_id: 1, node_id: '10', variant_id: 101 },
        { master_id: 1, node_id: '20', variant_id: 101 },
      ],
    }

    expect(() => validateConfig(config, masterIds, modelIds)).toThrow('対応付けが重複しています')
  })

  it('レガシー（variant_id なし）JSONも正常にPASSし、variant_id が未定義のまま保持される', () => {
    const config = {
      ...validBaseWorkflowJson,
      mappings: [
        { master_id: 1, node_id: '10' },
        { master_id: 2, node_id: '20' },
      ],
    }

    const result = validateConfig(config, masterIds, modelIds)
    expect(result.mappings).toEqual([
      { master_id: 1, node_id: '10' },
      { master_id: 2, node_id: '20' },
    ])
    expect(result.mappings[0].variant_id).toBeUndefined()
  })

  it('variant_id に null が明示された場合は null として保持される', () => {
    const config = {
      ...validBaseWorkflowJson,
      mappings: [
        { master_id: 1, node_id: '10', variant_id: null },
      ],
    }

    const result = validateConfig(config, masterIds, modelIds)
    expect(result.mappings).toEqual([
      { master_id: 1, node_id: '10', variant_id: null },
    ])
  })

  it('レガシー形式で同一 master_id が重複している場合はエラーをスローする', () => {
    const config = {
      ...validBaseWorkflowJson,
      mappings: [
        { master_id: 1, node_id: '10' },
        { master_id: 1, node_id: '20' },
      ],
    }

    expect(() => validateConfig(config, masterIds, modelIds)).toThrow('対応付けが重複しています')
  })

  it('不正なマスターIDまたはノードIDの場合はエラーをスローする', () => {
    const config = {
      ...validBaseWorkflowJson,
      mappings: [
        { master_id: 999, node_id: '10' },
      ],
    }

    expect(() => validateConfig(config, masterIds, modelIds)).toThrow('対応付けのマスターID・ノードIDが不正です')
  })
})
