import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { usePresetConflict } from '../usePresetConflict'
import type { WorkflowPreset } from '../../../../api/types'
import type { PresetConflictData } from '../presetStateUtils'

describe('usePresetConflict', () => {
  const mockServerPreset: WorkflowPreset = {
    id: 42,
    workflow_id: 1,
    name: 'Server Preset',
    description: 'Server Description',
    param_values: { prompt: 'server prompt' },
    applied_assets: { lora: [] },
    batch_size: 2,
    seed_mode: 'fixed',
    seed: 12345,
    is_default: false,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-25T12:00:00Z',
  }

  const mockConflictData: PresetConflictData = {
    serverPreset: mockServerPreset,
    localDraft: {
      name: 'Local Draft Preset',
      paramValues: { prompt: 'local draft prompt' },
      appliedAssets: { lora: [{ asset_id: 1 }] },
      batchSize: 4,
      seedMode: 'random',
      seed: 99999,
    },
  }

  it('初期状態では conflictData は null である', () => {
    const onLoadPreset = vi.fn()
    const onUpdatePreset = vi.fn()
    const onCreatePreset = vi.fn()

    const { result } = renderHook(() =>
      usePresetConflict({
        onLoadPreset,
        onUpdatePreset,
        onCreatePreset,
      })
    )

    expect(result.current.conflictData).toBeNull()
  })

  it('setConflictData で競合データを設定・更新できる', () => {
    const onLoadPreset = vi.fn()
    const onUpdatePreset = vi.fn()
    const onCreatePreset = vi.fn()

    const { result } = renderHook(() =>
      usePresetConflict({
        onLoadPreset,
        onUpdatePreset,
        onCreatePreset,
      })
    )

    act(() => {
      result.current.setConflictData(mockConflictData)
    })

    expect(result.current.conflictData).toEqual(mockConflictData)
  })

  describe('handleResolveConflictUseServer（サーバー版採用）', () => {
    it('conflictData が存在しない場合は何もしない', () => {
      const onLoadPreset = vi.fn()
      const onUpdatePreset = vi.fn()
      const onCreatePreset = vi.fn()

      const { result } = renderHook(() =>
        usePresetConflict({
          onLoadPreset,
          onUpdatePreset,
          onCreatePreset,
        })
      )

      act(() => {
        result.current.handleResolveConflictUseServer()
      })

      expect(onLoadPreset).not.toHaveBeenCalled()
      expect(result.current.conflictData).toBeNull()
    })

    it('onLoadPreset に serverPreset を渡し、conflictData を null にリセットする', () => {
      const onLoadPreset = vi.fn()
      const onUpdatePreset = vi.fn()
      const onCreatePreset = vi.fn()

      const { result } = renderHook(() =>
        usePresetConflict({
          onLoadPreset,
          onUpdatePreset,
          onCreatePreset,
        })
      )

      act(() => {
        result.current.setConflictData(mockConflictData)
      })

      act(() => {
        result.current.handleResolveConflictUseServer()
      })

      expect(onLoadPreset).toHaveBeenCalledWith(mockServerPreset)
      expect(result.current.conflictData).toBeNull()
    })
  })

  describe('handleResolveConflictOverwrite（サーバー版の更新日時に基いて上書き）', () => {
    it('conflictData が存在しない場合は何もしない', () => {
      const onLoadPreset = vi.fn()
      const onUpdatePreset = vi.fn()
      const onCreatePreset = vi.fn()

      const { result } = renderHook(() =>
        usePresetConflict({
          onLoadPreset,
          onUpdatePreset,
          onCreatePreset,
        })
      )

      act(() => {
        result.current.handleResolveConflictOverwrite()
      })

      expect(onUpdatePreset).not.toHaveBeenCalled()
      expect(result.current.conflictData).toBeNull()
    })

    it('onUpdatePreset に更新ペイロード（base_updated_at 含む）を渡し、conflictData を null にリセットする', () => {
      const onLoadPreset = vi.fn()
      const onUpdatePreset = vi.fn()
      const onCreatePreset = vi.fn()

      const { result } = renderHook(() =>
        usePresetConflict({
          onLoadPreset,
          onUpdatePreset,
          onCreatePreset,
        })
      )

      act(() => {
        result.current.setConflictData(mockConflictData)
      })

      act(() => {
        result.current.handleResolveConflictOverwrite()
      })

      expect(onUpdatePreset).toHaveBeenCalledWith({
        id: mockServerPreset.id,
        name: mockConflictData.localDraft.name,
        param_values: mockConflictData.localDraft.paramValues,
        applied_assets: mockConflictData.localDraft.appliedAssets,
        batch_size: mockConflictData.localDraft.batchSize,
        seed_mode: mockConflictData.localDraft.seedMode,
        seed: mockConflictData.localDraft.seed,
        base_updated_at: mockServerPreset.updated_at,
      })
      expect(result.current.conflictData).toBeNull()
    })
  })

  describe('handleResolveConflictSaveAsNew（新規別名保存）', () => {
    it('conflictData が存在しない場合は何もしない', () => {
      const onLoadPreset = vi.fn()
      const onUpdatePreset = vi.fn()
      const onCreatePreset = vi.fn()

      const { result } = renderHook(() =>
        usePresetConflict({
          onLoadPreset,
          onUpdatePreset,
          onCreatePreset,
        })
      )

      act(() => {
        result.current.handleResolveConflictSaveAsNew('New Fork Preset')
      })

      expect(onCreatePreset).not.toHaveBeenCalled()
      expect(result.current.conflictData).toBeNull()
    })

    it('onCreatePreset に新しいプリセット名とローカル下書き内容を渡し、conflictData を null にリセットする', () => {
      const onLoadPreset = vi.fn()
      const onUpdatePreset = vi.fn()
      const onCreatePreset = vi.fn()

      const { result } = renderHook(() =>
        usePresetConflict({
          onLoadPreset,
          onUpdatePreset,
          onCreatePreset,
        })
      )

      act(() => {
        result.current.setConflictData(mockConflictData)
      })

      act(() => {
        result.current.handleResolveConflictSaveAsNew('New Fork Preset')
      })

      expect(onCreatePreset).toHaveBeenCalledWith('New Fork Preset', {
        paramValues: mockConflictData.localDraft.paramValues,
        appliedAssets: mockConflictData.localDraft.appliedAssets,
        batchSize: mockConflictData.localDraft.batchSize,
        seedMode: mockConflictData.localDraft.seedMode,
        seed: mockConflictData.localDraft.seed,
      })
      expect(result.current.conflictData).toBeNull()
    })
  })
})
