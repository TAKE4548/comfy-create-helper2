import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { detectActiveStages } from '../../../../utils/workflowAdaptiveStageDetector'
import { AdaptiveWorkflowWiring } from '../../../../components/AdaptiveWorkflowWiring'
import type { StageMaster, MappingMasterV2, Workflow } from '../../../../api/types'

describe('detectActiveStages (workflowAdaptiveStageDetector)', () => {
  const stageMasters: StageMaster[] = [
    {
      id: 1,
      key: 'main',
      name: 'Main Stage',
      suffix: '',
      search_keywords: ['main', 'base'],
      previous_suffixes: null,
      is_builtin: true,
      is_active: true,
      sort_order: 1,
    },
    {
      id: 2,
      key: 'rough',
      name: 'Rough Stage',
      suffix: '_rough',
      search_keywords: ['rough', '粗生成', '1st'],
      previous_suffixes: null,
      is_builtin: false,
      is_active: true,
      sort_order: 2,
    },
    {
      id: 3,
      key: 'detail',
      name: 'Detail Stage',
      suffix: '_detail',
      search_keywords: ['detail', 'refiner', '2nd'],
      previous_suffixes: null,
      is_builtin: false,
      is_active: true,
      sort_order: 3,
    },
  ]

  it('1段サンプラ構成: RoughやDetailが非表示となり、Main(is_builtin)のみ展開される', () => {
    const singleStageWorkflow = {
      nodes: {
        '1': {
          class_type: 'KSampler',
          _meta: { title: 'Main KSampler' },
        },
        '2': {
          class_type: 'CLIPTextEncode',
          _meta: { title: 'Positive Prompt' },
        },
      },
    }

    const activeStages = detectActiveStages(singleStageWorkflow, stageMasters)
    expect(activeStages).toHaveLength(1)
    expect(activeStages[0].stage.key).toBe('main')
    expect(activeStages[0].isAlwaysVisible).toBe(true)
    expect(activeStages[0].matchingNodesCount).toBe(1)
    expect(activeStages[0].matchedNodeIds).toEqual(['1'])
    // Rough and Detail must be completely hidden (0 matches and not is_builtin)
    expect(activeStages.some((s) => s.stage.key === 'rough')).toBe(false)
    expect(activeStages.some((s) => s.stage.key === 'detail')).toBe(false)
  })

  it('Mainに合致ノードが0件でもisAlwaysVisibleにより常時バイパス展開される', () => {
    const emptyNodesWorkflow = {
      nodes: {},
    }

    const activeStages = detectActiveStages(emptyNodesWorkflow, stageMasters)
    expect(activeStages).toHaveLength(1)
    expect(activeStages[0].stage.key).toBe('main')
    expect(activeStages[0].isAlwaysVisible).toBe(true)
    expect(activeStages[0].matchingNodesCount).toBe(0)
    expect(activeStages[0].matchedNodeIds).toEqual([])
  })

  it('2段サンプラ構成: Roughに合致ノードが存在する場合に動的展開される', () => {
    const twoStageWorkflow = {
      nodes: {
        '1': {
          class_type: 'KSampler',
          _meta: { title: 'Rough KSampler' },
        },
        '2': {
          class_type: 'KSampler',
          _meta: { title: 'Final KSampler' },
        },
      },
    }

    const activeStages = detectActiveStages(twoStageWorkflow, stageMasters)
    const stageKeys = activeStages.map((s) => s.stage.key)
    expect(stageKeys).toContain('main')
    expect(stageKeys).toContain('rough')
    expect(stageKeys).not.toContain('detail')

    const roughStage = activeStages.find((s) => s.stage.key === 'rough')!
    expect(roughStage.matchingNodesCount).toBe(1)
    expect(roughStage.matchedNodeIds).toEqual(['1'])
  })

  it('3段サンプラ構成: 新ステージ(Detail/Refiner)が合致ノードにより動的に展開される', () => {
    const threeStageWorkflow = {
      nodes: {
        '10': {
          class_type: 'KSampler',
          _meta: { title: 'Rough KSampler' },
        },
        '20': {
          class_type: 'KSampler',
          _meta: { title: 'Main KSampler' },
        },
        '30': {
          class_type: 'KSampler',
          _meta: { title: 'Detail Refiner KSampler' },
        },
      },
    }

    const activeStages = detectActiveStages(threeStageWorkflow, stageMasters)
    const stageKeys = activeStages.map((s) => s.stage.key)
    expect(stageKeys).toEqual(['main', 'rough', 'detail'])

    const detailStage = activeStages.find((s) => s.stage.key === 'detail')!
    expect(detailStage.matchingNodesCount).toBe(1)
    expect(detailStage.matchedNodeIds).toEqual(['30'])
  })

  it('汚染ノード・不正JSON・nullノードに対してクラッシュせず安全にガードする', () => {
    const dirtyWorkflow = {
      nodes: {
        '1': null,
        '2': { class_type: null, _meta: null },
        '3': { _meta: { title: 12345 } },
        '4': 'invalid node string',
        '5': { class_type: 'KSampler', _meta: { title: 'Rough KSampler' } },
      },
    }

    expect(() => detectActiveStages(dirtyWorkflow as any, stageMasters)).not.toThrow()
    const activeStages = detectActiveStages(dirtyWorkflow as any, stageMasters)
    const roughStage = activeStages.find((s) => s.stage.key === 'rough')
    expect(roughStage).toBeDefined()
    expect(roughStage?.matchedNodeIds).toEqual(['5'])

    // Null and undefined guards
    expect(detectActiveStages(null, stageMasters)).toEqual([])
    expect(detectActiveStages(undefined, stageMasters)).toEqual([])
    expect(detectActiveStages({} as any, [])).toEqual([])
  })
})

describe('AdaptiveWorkflowWiring Component', () => {
  const stageMasters: StageMaster[] = [
    {
      id: 1,
      key: 'main',
      name: 'Main Stage',
      suffix: '',
      search_keywords: ['main'],
      previous_suffixes: null,
      is_builtin: true,
      is_active: true,
      sort_order: 1,
    },
    {
      id: 2,
      key: 'rough',
      name: 'Rough Stage',
      suffix: '_rough',
      search_keywords: ['rough'],
      previous_suffixes: null,
      is_builtin: false,
      is_active: true,
      sort_order: 2,
    },
  ]

  const mappingMasters: MappingMasterV2[] = [
    {
      id: 101,
      base_key: 'sampler',
      name: 'サンプラー',
      param_name: 'sampler_name',
      input_type: 'select_sampler',
      group_id: 1,
      expected_class_types: ['KSampler'],
      base_title_patterns: ['KSampler'],
      sort_order: 1,
      variants: [
        {
          id: 1001,
          master_id: 101,
          stage_id: 1,
          stage_key: 'main',
          stage_name: 'Main Stage',
          stage_suffix: '',
          custom_role_override: null,
          computed_role: 'sampler_name',
          extra_title_patterns: null,
          is_enabled: true,
        },
        {
          id: 1002,
          master_id: 101,
          stage_id: 2,
          stage_key: 'rough',
          stage_name: 'Rough Stage',
          stage_suffix: '_rough',
          custom_role_override: null,
          computed_role: 'sampler_name_rough',
          extra_title_patterns: null,
          is_enabled: true,
        },
      ],
    },
    {
      id: 102,
      base_key: 'steps',
      name: 'ステップ数',
      param_name: 'steps',
      input_type: 'int',
      group_id: 1,
      expected_class_types: ['KSampler'],
      base_title_patterns: ['KSampler'],
      sort_order: 2,
      variants: [
        {
          id: 1003,
          master_id: 102,
          stage_id: 1,
          stage_key: 'main',
          stage_name: 'Main Stage',
          stage_suffix: '',
          custom_role_override: null,
          computed_role: 'steps',
          extra_title_patterns: null,
          is_enabled: true,
        },
      ],
    },
  ]

  const mockWorkflow: Workflow = {
    id: 1,
    name: 'Test Workflow',
    created_at: '2026-01-01T00:00:00Z',
    json_body: {
      nodes: {
        '10': { class_type: 'KSampler', _meta: { title: 'Main KSampler' } },
        '20': { class_type: 'KSampler', _meta: { title: 'Rough KSampler' } },
      },
    },
    mappings: [
      {
        id: 1,
        master_id: 101,
        node_id: '10',
        role: 'sampler_name',
        param_name: 'sampler_name',
        input_type: 'select_sampler',
        display_name: 'サンプラー',
      },
    ],
  }

  it('各ステージgroup内に該当ステージのバリアントスロットのみを表示する', () => {
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters)
    render(
      <AdaptiveWorkflowWiring
        workflow={mockWorkflow}
        activeStages={activeStages}
        mappingMasters={mappingMasters}
      />
    )

    const mainGroup = screen.getByRole('region', { name: 'Main Stage (main)' })
    const roughGroup = document.querySelector('[data-stage-key="rough"]') as HTMLElement
    expect(mainGroup).toBeInTheDocument()
    expect(roughGroup).toBeInTheDocument()
    expect(within(mainGroup).getByText(/sampler_name → sampler_name/)).toBeInTheDocument()
    expect(within(mainGroup).getByText(/steps → steps/)).toBeInTheDocument()
    expect(within(mainGroup).queryByText(/sampler_name_rough/)).toBeNull()
    expect(within(roughGroup).getByText(/sampler_name_rough → sampler_name/)).toBeInTheDocument()
    expect(within(roughGroup).queryByText(/steps → steps/)).toBeNull()
  })

  it('Settingsの工程groupだけを独立scroll rootに含め、保存操作をroot外に置く', () => {
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters)
    render(
      <AdaptiveWorkflowWiring
        workflow={mockWorkflow}
        activeStages={activeStages}
        mappingMasters={mappingMasters}
      />
    )

    const root = document.querySelector('#settings-mapping-scroll') as HTMLElement
    expect(root).toHaveAttribute('data-stage-scroll-root', '')
    expect(root).toHaveClass('stage-input-scroll-root')
    expect(root.querySelectorAll('.stage-input-group')).toHaveLength(activeStages.length)
    const select = screen.getByLabelText(/Main Stage sampler_name → sampler_name のノード/)
    expect(select.closest('[data-stage-scroll-root]')).toBe(root)
    expect(select).toHaveClass('min-h-[44px]')
    expect(screen.getByRole('button', { name: /対応付けを保存/ }).closest('[data-stage-scroll-root]')).toBeNull()
  })

  it('ノード選択ドロップダウンにおいて、ステージキーワードに合致する候補ノードを優先ハイライトする', () => {
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters)
    render(
      <AdaptiveWorkflowWiring
        workflow={mockWorkflow}
        activeStages={activeStages}
        mappingMasters={mappingMasters}
      />
    )

    const select = screen.getByLabelText(/Rough Stage sampler_name_rough → sampler_name のノード/) as HTMLSelectElement
    expect(select).toBeInTheDocument()

    // Node 20 matched "Rough" keywords, so it should be prioritized / marked
    const options = Array.from(select.options)
    const roughOption = options.find((opt) => opt.value === '20')
    expect(roughOption).toBeDefined()
    expect(roughOption?.textContent).toMatch(/★|推奨|ステージ合致/)
  })

  it('物理配線は数値の variant_id でバインド・保存される', () => {
    const onSave = vi.fn()
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters)
    render(
      <AdaptiveWorkflowWiring
        workflow={mockWorkflow}
        activeStages={activeStages}
        mappingMasters={mappingMasters}
        onSaveMappings={onSave}
      />
    )

    const select = screen.getByLabelText(/Main Stage steps → steps のノード/)
    fireEvent.change(select, { target: { value: '10' } })

    // Click save button
    const saveButton = screen.getByRole('button', { name: /対応付けを保存/ })
    fireEvent.click(saveButton)

    expect(onSave).toHaveBeenCalled()
    const savedMappings = onSave.mock.calls[0][0]
    expect(savedMappings).toEqual(
      expect.arrayContaining([
        {
          master_id: 101,
          node_id: '10',
        },
        expect.objectContaining({
          variant_id: 1003,
          master_id: 102,
          node_id: '10',
        }),
      ])
    )
  })

  it('同じroleの異なるparamを個別に選択し、master別のpayloadを保存する', () => {
    const onSave = vi.fn()
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters)
    const stepsMaster = {
      ...mappingMasters[1],
      param_name: 'steps',
      variants: [{ ...mappingMasters[1].variants[0], computed_role: 'sampling' }],
    }
    const cfgMaster = {
      ...stepsMaster,
      id: 103,
      base_key: 'cfg',
      name: 'CFG',
      param_name: 'cfg',
      sort_order: 3,
      variants: [{ ...stepsMaster.variants[0], id: 1004, master_id: 103 }],
    }

    render(
      <AdaptiveWorkflowWiring
        workflow={mockWorkflow}
        activeStages={activeStages}
        mappingMasters={[mappingMasters[0], stepsMaster, cfgMaster]}
        onSaveMappings={onSave}
      />
    )

    const mainGroup = document.querySelector('[data-stage-key="main"]') as HTMLElement
    const stepsSelect = within(mainGroup).getByRole('combobox', { name: 'Main Stage sampling → steps のノード' })
    const cfgSelect = within(mainGroup).getByRole('combobox', { name: 'Main Stage sampling → cfg のノード' })
    expect(within(mainGroup).getAllByRole('combobox', { name: 'Main Stage sampling → steps のノード' })).toHaveLength(1)
    expect(within(mainGroup).getAllByRole('combobox', { name: 'Main Stage sampling → cfg のノード' })).toHaveLength(1)

    fireEvent.change(stepsSelect, { target: { value: '10' } })
    fireEvent.change(cfgSelect, { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /対応付けを保存/ }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toEqual(expect.arrayContaining([
      { master_id: 102, node_id: '10', variant_id: 1003 },
      { master_id: 103, node_id: '20', variant_id: 1004 },
    ]))
  })
})
