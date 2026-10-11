import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useMasterMappingRows } from '../useMasterMappingRows'
import type { MappingMaster, MappingMasterV2, ScanResult } from '../../api/types'

describe('useMasterMappingRows', () => {
  const mockMasters: MappingMaster[] = [
    {
      id: 1,
      role: 'prompt',
      expected_class_types: ['CLIPTextEncode'],
      param_name: 'text',
      input_type: 'textarea',
      display_name: 'プロンプト',
      title_patterns: null,
      sort_order: 1,
    },
    {
      id: 2,
      role: 'steps',
      expected_class_types: ['KSampler'],
      param_name: 'steps',
      input_type: 'int',
      display_name: 'ステップ数',
      title_patterns: null,
      sort_order: 2,
    },
  ]

  it('should return empty rows when scanResult is null', () => {
    const { result } = renderHook(() => useMasterMappingRows(mockMasters, null))
    const { mainRows, notFoundRows } = result.current.buildRows()
    expect(mainRows).toEqual([])
    expect(notFoundRows).toEqual([])
  })

  it('AC-2: should handle ok match and include node_id in candidates', () => {
    const scanResult: ScanResult = {
      matched: [
        {
          master_id: 1,
          role: 'prompt',
          node_id: '6',
          node_title: 'CLIP Text Encode',
          status: 'ok',
        },
      ],
      warnings: [],
    }

    const { result } = renderHook(() => useMasterMappingRows(mockMasters, scanResult))

    // Initialize from scan
    act(() => {
      result.current.initFromScan(scanResult)
    })

    const { mainRows, notFoundRows } = result.current.buildRows()

    // 1:1マッチしたマスター項目は mainRows に入り、ステータスは 'ok'、候補に node_id が入る
    const promptRow = mainRows.find(r => r.master.id === 1)
    expect(promptRow).toBeDefined()
    expect(promptRow?.status).toBe('ok')
    expect(promptRow?.node_id).toBe('6')
    expect(promptRow?.candidates).toEqual(['6'])
    expect(promptRow?.node_title).toBe('CLIP Text Encode')

    // スキャン結果にないマスター項目は notFoundRows に入る
    const stepsRow = notFoundRows.find(r => r.master.id === 2)
    expect(stepsRow).toBeDefined()
    expect(stepsRow?.status).toBe('not_found')
    expect(stepsRow?.node_id).toBe('')
    expect(stepsRow?.candidates).toEqual([])
  })

  it('AC-1: should prioritize warning and handle duplicated status with candidates', () => {
    const scanResult: ScanResult = {
      matched: [
        {
          master_id: 1,
          role: 'prompt',
          node_id: '6', // 警告があっても matched に第1候補等が入っている可能性があるが、warning がある場合は warning を優先
          node_title: 'CLIP Text Encode',
          status: 'ok',
        },
      ],
      warnings: [
        {
          master_id: 1,
          role: 'prompt',
          status: 'duplicated',
          node_ids: ['6', '7'],
        },
      ],
    }

    const { result } = renderHook(() => useMasterMappingRows(mockMasters, scanResult))

    act(() => {
      result.current.initFromScan(scanResult)
    })

    const { mainRows } = result.current.buildRows()
    const promptRow = mainRows.find(r => r.master.id === 1)

    // warning が優先され、status は duplicated になり、candidates には候補がすべて入る
    expect(promptRow).toBeDefined()
    expect(promptRow?.status).toBe('duplicated')
    expect(promptRow?.node_id).toBe('6')
    expect(promptRow?.candidates).toEqual(['6', '7'])
  })

  it('AC-3: should reflect manually updated node_id correctly', () => {
    const scanResult: ScanResult = {
      matched: [
        {
          master_id: 1,
          role: 'prompt',
          node_id: '6',
          node_title: 'CLIP Text Encode',
          status: 'ok',
        },
      ],
      warnings: [],
    }

    const { result } = renderHook(() => useMasterMappingRows(mockMasters, scanResult))

    act(() => {
      result.current.initFromScan(scanResult)
    })

    // 手動で node_id を更新
    act(() => {
      result.current.updateNodeId(1, '99')
    })

    const { mainRows } = result.current.buildRows()
    const promptRow = mainRows.find(r => r.master.id === 1)

    expect(promptRow?.node_id).toBe('99')

    // マッピングデータの抽出結果の確認
    const { notFoundRows } = result.current.buildRows()
    const mappings = result.current.getMappings(mainRows, notFoundRows)
    expect(mappings).toEqual([{ master_id: 1, node_id: '99' }])
  })

  it('should respect explicitly updated empty string (unspecified) and exclude it from final mappings', () => {
    const scanResult: ScanResult = {
      matched: [
        {
          master_id: 1,
          role: 'prompt',
          node_id: '6',
          node_title: 'CLIP Text Encode',
          status: 'ok',
        },
      ],
      warnings: [],
    }

    const { result } = renderHook(() => useMasterMappingRows(mockMasters, scanResult))

    act(() => {
      result.current.initFromScan(scanResult)
    })

    // 手動で空文字列（未指定）に更新
    act(() => {
      result.current.updateNodeId(1, '')
    })

    const { mainRows, notFoundRows } = result.current.buildRows()
    const promptRow = mainRows.find(r => r.master.id === 1)

    // 空文字列が保持されていること
    expect(promptRow?.node_id).toBe('')

    // マッピングデータから除外されていること
    const mappings = result.current.getMappings(mainRows, notFoundRows)
    expect(mappings).toEqual([])
  })

  it('should initialize using existingMappings when valid', () => {
    const scanResult: ScanResult = {
      matched: [
        {
          master_id: 1,
          role: 'prompt',
          node_id: '6',
          node_title: 'CLIP Text Encode',
          status: 'ok',
          node_ids: ['6', '10'],
        },
      ],
      warnings: [],
    }

    const { result } = renderHook(() => useMasterMappingRows(mockMasters, scanResult))

    act(() => {
      result.current.initFromScan(scanResult, [{ master_id: 1, node_id: '10' }])
    })

    const { mainRows } = result.current.buildRows()
    const promptRow = mainRows.find(r => r.master.id === 1)

    expect(promptRow?.node_id).toBe('10')
    expect(promptRow?.is_existing_mismatch).toBe(false)
  })

  it('should fallback to scan default and set is_existing_mismatch when existingMapping is invalid', () => {
    const scanResult: ScanResult = {
      matched: [
        {
          master_id: 1,
          role: 'prompt',
          node_id: '6',
          node_title: 'CLIP Text Encode',
          status: 'ok',
        },
      ],
      warnings: [],
    }

    const { result } = renderHook(() => useMasterMappingRows(mockMasters, scanResult))

    act(() => {
      result.current.initFromScan(scanResult, [{ master_id: 1, node_id: '999' }])
    })

    const { mainRows } = result.current.buildRows()
    const promptRow = mainRows.find(r => r.master.id === 1)

    expect(promptRow?.node_id).toBe('6')
    expect(promptRow?.is_existing_mismatch).toBe(true)
  })

  it('should validate existingMapping via workflowJson if node exists in workflowJson', () => {
    const scanResult: ScanResult = {
      matched: [
        {
          master_id: 1,
          role: 'prompt',
          node_id: '6',
          node_title: 'CLIP Text Encode',
          status: 'ok',
        },
      ],
      warnings: [],
    }

    const { result } = renderHook(() => useMasterMappingRows(mockMasters, scanResult))

    act(() => {
      result.current.initFromScan(
        scanResult,
        [{ master_id: 1, node_id: '15' }],
        { '15': { class_type: 'CustomNode' } }
      )
    })

    const { mainRows } = result.current.buildRows()
    const promptRow = mainRows.find(r => r.master.id === 1)

    expect(promptRow?.node_id).toBe('15')
    expect(promptRow?.is_existing_mismatch).toBe(false)
  })

  describe('multi-stage slot expansion and clearSlot', () => {
    const mockMultiStageMasters: MappingMasterV2[] = [
      {
        id: 10,
        group_id: 1,
        base_key: 'prompt',
        name: 'プロンプト',
        param_name: 'text',
        input_type: 'textarea',
        expected_class_types: ['CLIPTextEncode'],
        base_title_patterns: null,
        sort_order: 1,
        variants: [
          {
            id: 101,
            master_id: 10,
            stage_id: 1,
            stage_key: 'main',
            stage_name: 'Main Stage',
            stage_suffix: '',
            custom_role_override: null,
            computed_role: 'prompt',
            extra_title_patterns: null,
            is_enabled: true,
          },
          {
            id: 102,
            master_id: 10,
            stage_id: 2,
            stage_key: 'rough',
            stage_name: 'Rough Stage',
            stage_suffix: '_rough',
            custom_role_override: null,
            computed_role: 'prompt_rough',
            extra_title_patterns: null,
            is_enabled: true,
          },
        ],
      },
    ]

    it('should expand stageSlots for multi-variant masters and maintain distinct node IDs', () => {
      const scanResult: ScanResult = {
        matched: [
          {
            master_id: 10,
            variant_id: 101,
            role: 'prompt',
            node_id: '6',
            node_title: 'CLIP Text Encode (Main)',
            status: 'ok',
          },
          {
            master_id: 10,
            variant_id: 102,
            role: 'prompt_rough',
            node_id: '16',
            node_title: 'CLIP Text Encode (Rough)',
            status: 'ok',
          },
        ],
        warnings: [],
      }

      const { result } = renderHook(() => useMasterMappingRows(mockMultiStageMasters, scanResult))

      act(() => {
        result.current.initFromScan(scanResult)
      })

      const { mainRows } = result.current.buildRows()
      expect(mainRows).toHaveLength(1)
      const row = mainRows[0]
      expect(row.stageSlots).toBeDefined()
      expect(row.stageSlots).toHaveLength(2)

      const mainSlot = row.stageSlots![0]
      expect(mainSlot.slotKey).toBe('v_101')
      expect(mainSlot.variantId).toBe(101)
      expect(mainSlot.stageName).toBe('Main Stage')
      expect(mainSlot.node_id).toBe('6')
      expect(mainSlot.status).toBe('ok')
      expect(mainSlot.candidates).toEqual(['6'])

      const roughSlot = row.stageSlots![1]
      expect(roughSlot.slotKey).toBe('v_102')
      expect(roughSlot.variantId).toBe(102)
      expect(roughSlot.stageName).toBe('Rough Stage')
      expect(roughSlot.node_id).toBe('16')
      expect(roughSlot.status).toBe('ok')
      expect(roughSlot.candidates).toEqual(['16'])

      // Update slot independently
      act(() => {
        result.current.updateSlotNodeId('v_102', '26')
      })

      const { mainRows: updatedRows, notFoundRows } = result.current.buildRows()
      expect(updatedRows[0].stageSlots![1].node_id).toBe('26')

      // Check getMappings returns both with variant_id
      const mappings = result.current.getMappings(updatedRows, notFoundRows)
      expect(mappings).toEqual([
        { master_id: 10, node_id: '6', variant_id: 101 },
        { master_id: 10, node_id: '26', variant_id: 102 },
      ])
    })

    it('should clear slot via clearSlot and exclude unassigned slots from getMappings', () => {
      const scanResult: ScanResult = {
        matched: [
          {
            master_id: 10,
            variant_id: 101,
            role: 'prompt',
            node_id: '6',
            node_title: 'CLIP Text Encode (Main)',
            status: 'ok',
          },
          {
            master_id: 10,
            variant_id: 102,
            role: 'prompt_rough',
            node_id: '16',
            node_title: 'CLIP Text Encode (Rough)',
            status: 'ok',
          },
        ],
        warnings: [],
      }

      const { result } = renderHook(() => useMasterMappingRows(mockMultiStageMasters, scanResult))

      act(() => {
        result.current.initFromScan(scanResult)
      })

      // Clear rough slot
      act(() => {
        result.current.clearSlot('v_102')
      })

      const { mainRows, notFoundRows } = result.current.buildRows()
      const roughSlot = mainRows[0].stageSlots![1]
      expect(roughSlot.node_id).toBe('')
      expect(roughSlot.status).toBe('unassigned')

      // getMappings must exclude rough slot
      const mappings = result.current.getMappings(mainRows, notFoundRows)
      expect(mappings).toEqual([
        { master_id: 10, node_id: '6', variant_id: 101 },
      ])

      // Also clear main slot
      act(() => {
        result.current.clearSlot('v_101')
      })

      const { mainRows: clearedRows, notFoundRows: clearedNotFound } = result.current.buildRows()
      const emptyMappings = result.current.getMappings(clearedRows, clearedNotFound)
      expect(emptyMappings).toEqual([])
    })

    it('should initialize multi-stage slots from existingMappings with variant_id matching', () => {
      const scanResult: ScanResult = {
        matched: [
          {
            master_id: 10,
            variant_id: 101,
            role: 'prompt',
            node_id: '6',
            node_title: 'CLIP Text Encode (Main)',
            status: 'ok',
            node_ids: ['6', '8'],
          },
          {
            master_id: 10,
            variant_id: 102,
            role: 'prompt_rough',
            node_id: '16',
            node_title: 'CLIP Text Encode (Rough)',
            status: 'ok',
            node_ids: ['16', '18'],
          },
        ],
        warnings: [],
      }

      const { result } = renderHook(() => useMasterMappingRows(mockMultiStageMasters, scanResult))

      act(() => {
        result.current.initFromScan(scanResult, [
          { master_id: 10, variant_id: 101, node_id: '8' },
          { master_id: 10, variant_id: 102, node_id: '18' },
        ])
      })

      const { mainRows, notFoundRows } = result.current.buildRows()
      expect(mainRows[0].stageSlots![0].node_id).toBe('8')
      expect(mainRows[0].stageSlots![1].node_id).toBe('18')

      const mappings = result.current.getMappings(mainRows, notFoundRows)
      expect(mappings).toEqual([
        { master_id: 10, node_id: '8', variant_id: 101 },
        { master_id: 10, node_id: '18', variant_id: 102 },
      ])
    })
  })
})

