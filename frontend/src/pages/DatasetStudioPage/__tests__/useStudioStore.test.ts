import { describe, it, expect, beforeEach } from 'vitest'
import { useStudioStore } from '../useStudioStore'
import type { DatasetProject, DatasetItem, OutfitMasterPreset } from '../../../api/types'

describe('useStudioStore', () => {
  beforeEach(() => {
    useStudioStore.getState().resetStudio()
  })

  it('initializes with default state', () => {
    const state = useStudioStore.getState()
    expect(state.currentStep).toBe(1)
    expect(state.activeProject).toBeNull()
    expect(state.items).toEqual([])
    expect(state.selectedAltOutfits).toEqual([])
    expect(state.isTrainingActive).toBe(false)
    expect(state.telemetryLogs).toEqual([])
    expect(state.lossHistory).toEqual([])
  })

  it('updates currentStep', () => {
    useStudioStore.getState().setCurrentStep(2)
    expect(useStudioStore.getState().currentStep).toBe(2)
    useStudioStore.getState().setCurrentStep(4)
    expect(useStudioStore.getState().currentStep).toBe(4)
  })

  it('manages activeProject and items lifecycle', () => {
    const mockProject: DatasetProject = {
      id: 1,
      name: 'Test Project',
      character_trigger: 'mychar',
      outfit_trigger: 'myoutfit',
      workflow_id: 10,
      prompt_meta: 'masterpiece',
      prompt_physical: 'silver hair',
      prompt_exclusive_outfit: 'dress',
      selected_alt_outfits: '[]',
      created_at: '2026-10-07T00:00:00Z',
      updated_at: '2026-10-07T00:00:00Z',
    }

    const mockItem: DatasetItem = {
      id: 101,
      project_id: 1,
      slot_index: 0,
      factors_json: JSON.stringify({ shot: 'Bust', angle: 'Front' }),
      raw_prompt: 'masterpiece, silver hair, dress',
      caption_text: 'mychar, myoutfit',
      seed: 42,
      status: 'APPROVED',
    }

    useStudioStore.getState().setActiveProject(mockProject)
    expect(useStudioStore.getState().activeProject?.id).toBe(1)

    useStudioStore.getState().setItems([mockItem])
    expect(useStudioStore.getState().items).toHaveLength(1)

    // update status
    useStudioStore.getState().updateItemStatus(101, 'REJECTED')
    expect(useStudioStore.getState().items[0].status).toBe('REJECTED')

    // update caption
    useStudioStore.getState().updateItemCaption(101, 'new caption')
    expect(useStudioStore.getState().items[0].caption_text).toBe('new caption')

    // update image
    useStudioStore.getState().updateItemImage(0, '/path/to/img.png')
    expect(useStudioStore.getState().items[0].image_path).toBe('/path/to/img.png')
  })

  it('manages alt outfits selection', () => {
    const preset: OutfitMasterPreset = {
      id: 1,
      name: 'Casual',
      category: 'casual',
      prompt_tags: 'hoodie, jeans',
      is_builtin: true,
    }

    useStudioStore.getState().setSelectedAltOutfits([preset])
    expect(useStudioStore.getState().selectedAltOutfits).toEqual([preset])
  })

  it('handles telemetry messages and updates logs and loss history', () => {
    useStudioStore.getState().handleTelemetryMessage({
      job_id: 1,
      step: 10,
      total_steps: 100,
      epoch: 1,
      epochs: 10,
      loss: 0.123,
      status: 'RUNNING',
      log: 'Step 10: loss=0.123',
    })

    const state = useStudioStore.getState()
    expect(state.isTrainingActive).toBe(true)
    expect(state.lossHistory).toEqual([{ step: 10, loss: 0.123 }])
    expect(state.telemetryLogs).toContain('Step 10: loss=0.123')

    // Completion stops active training
    useStudioStore.getState().handleTelemetryMessage({
      job_id: 1,
      step: 100,
      total_steps: 100,
      epoch: 10,
      epochs: 10,
      loss: 0.045,
      status: 'COMPLETED',
    })
    expect(useStudioStore.getState().isTrainingActive).toBe(false)
  })

  it('resets studio state completely', () => {
    useStudioStore.getState().setCurrentStep(3)
    useStudioStore.getState().setIsTrainingActive(true)
    useStudioStore.getState().addLossPoint({ step: 1, loss: 0.5 })
    useStudioStore.getState().addTelemetryLog('test log')

    useStudioStore.getState().resetStudio()
    const state = useStudioStore.getState()
    expect(state.currentStep).toBe(1)
    expect(state.isTrainingActive).toBe(false)
    expect(state.lossHistory).toEqual([])
    expect(state.telemetryLogs).toEqual([])
  })
  it('manages paramValues state (REQ-331)', () => {
    expect(useStudioStore.getState().paramValues).toEqual({})

    useStudioStore.getState().setParamValue('steps', '25')
    expect(useStudioStore.getState().paramValues).toEqual({ steps: '25' })

    useStudioStore.getState().setParamValue('cfg', '7.0')
    expect(useStudioStore.getState().paramValues).toEqual({ steps: '25', cfg: '7.0' })

    useStudioStore.getState().setParamValues({ sampler: 'euler', steps: '30' })
    expect(useStudioStore.getState().paramValues).toEqual({ sampler: 'euler', steps: '30' })
  })

  it('manages bypassedNodeIds state (REQ-331)', () => {
    expect(useStudioStore.getState().bypassedNodeIds).toEqual([])

    useStudioStore.getState().setBypassedNodeIds(['node-1', 'node-2'])
    expect(useStudioStore.getState().bypassedNodeIds).toEqual(['node-1', 'node-2'])

    useStudioStore.getState().toggleBypassedNodeId('node-3')
    expect(useStudioStore.getState().bypassedNodeIds).toEqual(['node-1', 'node-2', 'node-3'])

    useStudioStore.getState().toggleBypassedNodeId('node-2')
    expect(useStudioStore.getState().bypassedNodeIds).toEqual(['node-1', 'node-3'])
  })

  it('clears paramValues and bypassedNodeIds on resetStudio (REQ-331)', () => {
    useStudioStore.getState().setParamValues({ steps: '20' })
    useStudioStore.getState().setBypassedNodeIds(['node-1'])

    useStudioStore.getState().resetStudio()
    expect(useStudioStore.getState().paramValues).toEqual({})
    expect(useStudioStore.getState().bypassedNodeIds).toEqual([])
  })
})