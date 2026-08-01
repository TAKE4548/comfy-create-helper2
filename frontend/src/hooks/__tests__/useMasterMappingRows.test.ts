import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useMasterMappingRows } from '../useMasterMappingRows'
import type { MappingMaster, ScanResult } from '../../api/types'

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
})
