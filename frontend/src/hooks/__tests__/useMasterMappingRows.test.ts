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

  it('REQ-358/HOOK [REQ-358/AC-33] preserves a saved ID outside scan candidates and marks its mismatch', () => {
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

    expect(promptRow?.node_id).toBe('999')
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

  describe('REQ-358/HOOK multi-stage slot expansion and clearSlot', () => {
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

    it('[REQ-358/AC-16] keeps row and slot identity stable while editing', () => {
      const scanResult: ScanResult = { matched: [], warnings: [] }
      const { result, rerender } = renderHook(({ scan }) => useMasterMappingRows(mockMultiStageMasters, scan), { initialProps: { scan: scanResult } })
      act(() => result.current.initFromScan(scanResult))
      const before = result.current.rows.map(row => [row.rowKey, row.stageSlots?.map(slot => slot.slotKey)])
      act(() => {
        result.current.updateSlotNodeId('v_101', 'a')
        result.current.updateSlotNodeId('v_101', 'ab')
        result.current.updateSlotNodeId('v_101', 'abc')
      })
      rerender({ scan: { matched: [], warnings: [] } })
      expect(result.current.rows.map(row => [row.rowKey, row.stageSlots?.map(slot => slot.slotKey)])).toEqual(before)
      expect(result.current.rows[0].stageSlots?.[0].node_id).toBe('abc')
    })

    it('[REQ-358/AC-17] keeps a cleared slot unused after scan updates', () => {
      const scanResult: ScanResult = { matched: [], warnings: [] }
      const { result, rerender } = renderHook(({ scan }) => useMasterMappingRows(mockMultiStageMasters, scan), { initialProps: { scan: scanResult } })
      act(() => result.current.initFromScan(scanResult))
      act(() => result.current.clearSlot('v_101'))
      rerender({ scan: { matched: [{ master_id: 10, variant_id: 101, role: 'prompt', node_id: 'fresh', status: 'ok' }], warnings: [] } })
      expect(result.current.rows[0].stageSlots?.[0]).toMatchObject({ slotKey: 'v_101', node_id: '', unused: true, enabled: true })
    })

    it('[REQ-358/AC-18] marks typed values as used without changing the slot', () => {
      const scanResult: ScanResult = { matched: [], warnings: [] }
      const { result } = renderHook(() => useMasterMappingRows(mockMultiStageMasters, scanResult))
      act(() => result.current.initFromScan(scanResult))
      act(() => result.current.updateSlotNodeId('v_101', 'xyz'))
      expect(result.current.rows[0].stageSlots?.[0]).toMatchObject({ slotKey: 'v_101', node_id: 'xyz', unused: false })
    })

    it('[REQ-358/AC-31] restores saved IDs and enabled state when state was omitted', () => {
      const scanResult: ScanResult = { matched: [], warnings: [] }
      const { result } = renderHook(() => useMasterMappingRows(mockMultiStageMasters, scanResult, {
        existingMappings: [{ master_id: 10, variant_id: 101, node_id: 'saved' }],
      }))
      act(() => result.current.initFromScan(scanResult))
      expect(result.current.rows[0].stageSlots?.[0]).toMatchObject({ node_id: 'saved', enabled: true })
      expect(result.current.getMappings(result.current.rows, [])).toContainEqual({ master_id: 10, variant_id: 101, node_id: 'saved' })
    })

    it('[REQ-358/AC-23][REQ-358/AC-34] associates legacy master role with exactly one stage without duplicating the assignment', () => {
      const masters = [{ ...mockMultiStageMasters[0], role: 'prompt' }]
      const scan: ScanResult = { matched: [{ master_id: 10, variant_id: 102, role: 'prompt_rough', node_id: 'rough', status: 'ok' }], warnings: [] }
      const { result } = renderHook(() => useMasterMappingRows(masters, scan, {
        existingMappings: [{ master_id: 10, variant_id: null, node_id: 'main' }],
        mappingSlotStates: { 'v:101': false, 'v:102': true, 'v:999': false },
      }))
      act(() => result.current.initFromScan(scan))
      expect(result.current.rows[0].stageSlots?.[0]).toMatchObject({ node_id: 'main', enabled: false })
      expect(result.current.rows[0].stageSlots?.[1]).toMatchObject({ node_id: '', enabled: true })
      expect(result.current.getMappings(result.current.rows, [])).toEqual([
        { master_id: 10, variant_id: 101, node_id: 'main' },
      ])
    })

    it('[REQ-369/AC-1] drops orphaned mappings for nonexistent masters and variants while keeping valid disabled variants', () => {
      const masters = mockMultiStageMasters
      const scan: ScanResult = { matched: [], warnings: [] }
      const { result } = renderHook(() => useMasterMappingRows(masters, scan, {
        existingMappings: [
          { master_id: 10, variant_id: 101, node_id: 'node-main' },
          { master_id: 999, variant_id: null, node_id: 'orphan-master' },
          { master_id: 10, variant_id: 8888, node_id: 'orphan-variant' },
        ],
        mappingSlotStates: { 'v:101': false, 'v:102': false },
      }))
      act(() => result.current.initFromScan(scan))
      const mappings = result.current.getMappings(result.current.rows, [])
      expect(mappings).toEqual([
        { master_id: 10, variant_id: 101, node_id: 'node-main' },
      ])
      expect(mappings.some(m => m.master_id === 999)).toBe(false)
      expect(mappings.some(m => m.variant_id === 8888)).toBe(false)
    })

    it('[REQ-369/AC-2] keeps unassigned stage slots empty during rescan of existing workflow without auto-assigning', () => {
      const masters = mockMultiStageMasters
      const scan: ScanResult = {
        matched: [
          { master_id: 10, variant_id: 101, node_id: 'node-101', status: 'ok' },
          { master_id: 10, variant_id: 102, node_id: 'node-102', status: 'ok' },
        ],
        warnings: [],
      }
      const { result } = renderHook(() => useMasterMappingRows(masters, scan, {
        existingMappings: [
          { master_id: 10, variant_id: 101, node_id: 'saved-main' },
        ],
      }))
      act(() => result.current.initFromScan(scan))
      expect(result.current.rows[0].stageSlots?.[0]).toMatchObject({ node_id: 'saved-main' })
      expect(result.current.rows[0].stageSlots?.[1]).toMatchObject({ node_id: '', status: 'unassigned' })
      expect(result.current.rows[0].stageSlots?.[1].candidates).toContain('node-102')
      expect(result.current.getMappings(result.current.rows, [])).toEqual([
        { master_id: 10, variant_id: 101, node_id: 'saved-main' },
      ])
    })

    it('[REQ-369/AC-3] auto-populates scan defaults on new workflow without existing mappings', () => {
      const masters = mockMultiStageMasters
      const scan: ScanResult = {
        matched: [
          { master_id: 10, variant_id: 101, node_id: 'node-101', status: 'ok' },
          { master_id: 10, variant_id: 102, node_id: 'node-102', status: 'ok' },
        ],
        warnings: [],
      }
      const { result } = renderHook(() => useMasterMappingRows(masters, scan, {
        existingMappings: [],
      }))
      act(() => result.current.initFromScan(scan))
      expect(result.current.rows[0].stageSlots?.[0]).toMatchObject({ node_id: 'node-101' })
      expect(result.current.rows[0].stageSlots?.[1]).toMatchObject({ node_id: 'node-102' })
      expect(result.current.getMappings(result.current.rows, [])).toEqual([
        { master_id: 10, variant_id: 101, node_id: 'node-101' },
        { master_id: 10, variant_id: 102, node_id: 'node-102' },
      ])
    })

    it('[REQ-358/AC-23][REQ-358/AC-34] migrates a single variant legacy assignment once and retains explicit disabled permission', () => {
      const masters = [{ ...mockMultiStageMasters[0], variants: [mockMultiStageMasters[0].variants[0]] }]
      const scanResult: ScanResult = { matched: [], warnings: [] }
      const { result } = renderHook(() => useMasterMappingRows(masters, scanResult, {
        existingMappings: [{ master_id: 10, variant_id: null, node_id: 'saved' }],
        mappingSlotStates: { 'm:10': false, 'v:999': false },
      }))
      act(() => result.current.initFromScan(scanResult))
      expect(result.current.rows[0].stageSlots?.[0]).toMatchObject({ node_id: 'saved', enabled: false })
      expect(result.current.getMappings(result.current.rows, [])).toEqual([{ master_id: 10, variant_id: 101, node_id: 'saved' }])
      expect(result.current.mappingSlotStates).toMatchObject({ 'm:10': false, 'v:101': false, 'v:999': false })
    })

    it('[REQ-358/AC-23][REQ-358/AC-34] toggles slots without losing values or unknown state', () => {
      const scanResult: ScanResult = { matched: [], warnings: [] }
      const { result } = renderHook(() => useMasterMappingRows(mockMultiStageMasters, scanResult, {
        existingMappings: [{ master_id: 10, variant_id: 101, node_id: 'saved' }],
        mappingSlotStates: { 'v:101': false, 'v:999': false },
      }))
      act(() => result.current.initFromScan(scanResult))
      act(() => result.current.updateSlotNodeId('v_101', 'blocked'))
      expect(result.current.rows[0].stageSlots?.[0]).toMatchObject({ node_id: 'saved', enabled: false })
      act(() => result.current.setSlotEnabled('v_101', true))
      act(() => result.current.setStageEnabled(1, false))
      act(() => result.current.setStageEnabled(1, true))
      expect(result.current.rows[0].stageSlots?.[0]).toMatchObject({ node_id: 'saved', enabled: true })
      expect(result.current.mappingSlotStates['v:999']).toBe(false)
    })

    it('[REQ-358/AC-24][REQ-358/AC-29] retains explicit disabled slots and omits a newly added disabled master', () => {
      const scanResult: ScanResult = { matched: [], warnings: [] }
      const disabledMaster = { ...mockMasters[1], default_enabled: false }
      const { result, rerender } = renderHook(({ masters }) => useMasterMappingRows(masters, scanResult, {
        mappingSlotStates: { 'm:2': false },
      }), { initialProps: { masters: [mockMasters[0], disabledMaster] } })
      act(() => result.current.initFromScan(scanResult))
      expect(result.current.rows.map(row => row.rowKey)).toEqual(['m_1', 'm_2'])
      expect(result.current.rows[1]).toMatchObject({ enabled: false, unused: true })
      rerender({ masters: [mockMasters[0]] })
      rerender({ masters: [mockMasters[0], { ...disabledMaster, id: 3 }] })
      expect(result.current.rows.map(row => row.rowKey)).toEqual(['m_1'])
    })

    it('[REQ-358/AC-27] omits a basic-disabled master on first import', () => {
      const scanResult: ScanResult = { matched: [], warnings: [] }
      const { result } = renderHook(() => useMasterMappingRows([mockMasters[0], { ...mockMasters[1], default_enabled: false }], scanResult))
      act(() => result.current.initFromScan(scanResult))
      expect(result.current.rows.map(row => row.rowKey)).toEqual(['m_1'])
      expect(result.current.mappingSlotStates).not.toHaveProperty('m:2')
    })

    it('[REQ-358/AC-28] keeps a saved mapping when the master default is disabled', () => {
      const scanResult: ScanResult = { matched: [], warnings: [] }
      const { result } = renderHook(() => useMasterMappingRows([{
        ...mockMasters[1], default_enabled: false,
      }], scanResult, { existingMappings: [{ master_id: 2, node_id: 'saved' }] }))
      act(() => result.current.initFromScan(scanResult))
      expect(result.current.rows[0]).toMatchObject({ rowKey: 'm_2', node_id: 'saved', enabled: true })
    })

    it('[REQ-358/AC-33] keeps a saved noncandidate ID across scan updates', () => {
      const scanResult: ScanResult = { matched: [{ master_id: 10, variant_id: 101, role: 'prompt', node_id: 'recommended', status: 'ok' }], warnings: [] }
      const { result, rerender } = renderHook(({ scan }) => useMasterMappingRows(mockMultiStageMasters, scan, {
        existingMappings: [{ master_id: 10, variant_id: 101, node_id: 'other' }],
        workflowJson: { nodes: { other: {} } },
      }), { initialProps: { scan: scanResult } })
      act(() => result.current.initFromScan(scanResult))
      rerender({ scan: { matched: [], warnings: [] } })
      expect(result.current.rows[0].stageSlots?.[0]).toMatchObject({ node_id: 'other', reference_missing: false })
    })

    it('[REQ-358/AC-35] preserves saved IDs and marks missing graph references', () => {
      const scanResult: ScanResult = { matched: [], warnings: [] }
      const { result } = renderHook(() => useMasterMappingRows(mockMultiStageMasters, scanResult, {
        existingMappings: [{ master_id: 10, variant_id: 101, node_id: 'lost' }],
        workflowJson: { nodes: {} },
      }))
      act(() => result.current.initFromScan(scanResult))
      expect(result.current.rows[0].stageSlots?.[0]).toMatchObject({ node_id: 'lost', reference_missing: true })
      expect(result.current.getMappings(result.current.rows, [])).toContainEqual({ master_id: 10, variant_id: 101, node_id: 'lost' })
    })
  })
})



it('[REQ-358/AC-16] memoizes a realistic mapping grid and reports toggle CPU time', () => {
  const masters = Array.from({ length: 32 }, (_, index) => ({
    id: index + 1, role: `role${index}`, display_name: `Role ${index}`, param_name: 'steps', input_type: 'int', expected_class_types: ['KSampler'], sort_order: index,
    variants: Array.from({ length: 9 }, (_, stage) => ({ id: index * 9 + stage + 1, master_id: index + 1, stage_id: stage + 1, stage_name: `Stage ${stage}`, stage_key: `stage${stage}`, computed_role: `role${index}_${stage}`, is_enabled: true })),
  })) as MappingMasterV2[]
  const scan: ScanResult = { matched: [], warnings: [] }
  const graph = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [String(i), { class_type: 'KSampler', inputs: { steps: 20 } }]))
  const { result } = renderHook(() => useMasterMappingRows(masters, scan, { workflowJson: graph }))
  act(() => result.current.initFromScan(scan))
  const start = performance.now()
  for (let i = 0; i < 10; i++) act(() => result.current.setSlotEnabled('v_1', i % 2 === 0))
  console.info(`REQ-358/T35 32x9 grid, 200 nodes, 10 checkbox transitions: ${(performance.now() - start).toFixed(2)} ms`)
  expect(result.current.buildRows().rows).toBe(result.current.rows)
  expect(result.current.buildRows()).toBe(result.current.buildRows())
})
