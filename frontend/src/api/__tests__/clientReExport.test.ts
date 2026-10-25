// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as client from '../client'

describe('client.ts backward-compatibility re-export hub', () => {
  it('re-exports core symbols', () => {
    expect(client.BASE_URL).toBe('/api')
    expect(typeof client.request).toBe('function')
    expect(typeof client.SceneSpeechStreamError).toBe('function')
    expect(typeof client.parseSceneSpeechEvent).toBe('function')
    expect(typeof client.abortError).toBe('function')
  })

  it('re-exports all 27 API objects', () => {
    const apis = [
      client.workflowsApi,
      client.mappingMastersApi,
      client.snapshotsApi,
      client.albumsApi,
      client.lorasApi,
      client.tagSetsApi,
      client.loraCategoriesApi,
      client.tagsetCategoriesApi,
      client.auditApi,
      client.llmPromptsApi,
      client.configApi,
      client.fontsApi,
      client.workflowPresetsApi,
      client.bypassProfilesApi,
      client.paramSyncGroupsApi,
      client.baseModelsApi,
      client.checkpointMappingsApi,
      client.paramTypeMastersApi,
      client.speechBubblePresetsApi,
      client.speechTonePresetsApi,
      client.sceneSpeechApi,
      client.comfyApi,
      client.translateApi,
      client.speechBatchApi,
      client.promptMetadataApi,
      client.settingsApi,
      client.datasetApi,
      client.trainingApi,
      client.benchmarkApi,
    ]

    for (const api of apis) {
      expect(api).toBeDefined()
      expect(typeof api).toBe('object')
    }
  })

  it('maintains expected method signatures on key API domains', () => {
    expect(typeof client.workflowsApi.list).toBe('function')
    expect(typeof client.snapshotsApi.list).toBe('function')
    expect(typeof client.lorasApi.list).toBe('function')
    expect(typeof client.sceneSpeechApi.generateStream).toBe('function')
    expect(typeof client.settingsApi.getVram).toBe('function')
    expect(typeof client.promptMetadataApi.get).toBe('function')
    expect(typeof client.datasetApi.getProjects).toBe('function')
    expect(typeof client.trainingApi.createJob).toBe('function')
    expect(typeof client.benchmarkApi.generatePrompts).toBe('function')
  })
})
