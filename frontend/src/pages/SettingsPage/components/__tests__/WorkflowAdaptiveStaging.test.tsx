import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { detectActiveStages, buildStageSelectorPatterns } from '../../../../utils/workflowAdaptiveStageDetector'
import { AdaptiveWorkflowWiring, type WiringMappingItem } from '../../../../components/AdaptiveWorkflowWiring'
import type { StageMaster, MappingMasterV2, Workflow } from '../../../../api/types'
import { rankWorkflowNodeCandidates } from '../../../../utils/workflowNodeUtils'
import { candidateDefinitionForVariant } from '../../../../utils/variantCandidateDefinition'

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

  // REQ-419: stage detection uses NodeSelector patterns only (search_keywords are ignored)
  const stagePatterns = new Map([
    [1, [{ pattern: 'main', match_type: 'contains' }]],
    [2, [{ pattern: 'rough', match_type: 'contains' }]],
    [3, [{ pattern: 'detail', match_type: 'contains' }, { pattern: 'refiner', match_type: 'contains' }]],
  ])

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

    const activeStages = detectActiveStages(singleStageWorkflow, stageMasters, stagePatterns)
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

    const activeStages = detectActiveStages(twoStageWorkflow, stageMasters, stagePatterns)
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

    const activeStages = detectActiveStages(threeStageWorkflow, stageMasters, stagePatterns)
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

    expect(() => detectActiveStages(dirtyWorkflow as any, stageMasters, stagePatterns)).not.toThrow()
    const activeStages = detectActiveStages(dirtyWorkflow as any, stageMasters, stagePatterns)
    const roughStage = activeStages.find((s) => s.stage.key === 'rough')
    expect(roughStage).toBeDefined()
    expect(roughStage?.matchedNodeIds).toEqual(['5'])

    // Null and undefined guards
    expect(detectActiveStages(null, stageMasters)).toEqual([])
    expect(detectActiveStages(undefined, stageMasters)).toEqual([])
    expect(detectActiveStages({} as any, [])).toEqual([])
  })
})

describe('settings wiring stage detection by selector patterns', () => {
  const stages: StageMaster[] = [
    { id: 1, key: 'main', name: 'Main Stage', suffix: '', search_keywords: ['main'], previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 1 },
    { id: 2, key: 'rough', name: 'Rough Stage', suffix: '_rough', search_keywords: ['kwonly'], previous_suffixes: null, is_builtin: false, is_active: true, sort_order: 2 },
    { id: 3, key: 'detail', name: 'Detail Stage', suffix: '_detail', search_keywords: ['detail'], previous_suffixes: null, is_builtin: false, is_active: true, sort_order: 3 },
  ]
  const variant = (id: number, stageId: number, patterns: Array<{ pattern: string; match_type?: string }>) => ({
    id, master_id: 1, stage_id: stageId, stage_key: 's', stage_name: 'S', stage_suffix: '', custom_role_override: null,
    computed_role: 'r', extra_title_patterns: null, is_enabled: true, selector_patterns: patterns,
  })

  it('[REQ-419/AC-13] settings wiring shows stages detected by selector patterns', () => {
    const graph = {
      '1': { class_type: 'KSampler', _meta: { title: 'Main KSampler' } },
      '2': { class_type: 'KSampler', _meta: { title: 'kwonly sampler' } },
      '3': { class_type: 'KSampler', _meta: { title: 'Detail Pass' } },
      '4': { class_type: 'LegacyColumnOnly', _meta: { title: 'Legacy Column Match' } },
    }
    const masters = [{ variants: [variant(11, 1, [{ pattern: 'main' }]), variant(13, 3, [{ pattern: 'Detail Pass', match_type: 'exact' }])] }]
    const result = detectActiveStages(graph, stages, buildStageSelectorPatterns(masters))
    // selector match is shown; (b) search_keywords-only stage is hidden; (a) legacy-column-only node creates no stage
    expect(result.map((r) => r.stage.key)).toEqual(['main', 'detail'])
    expect(result.find((r) => r.stage.key === 'detail')!.matchedNodeIds).toEqual(['3'])
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
          rule_entries: [{ class_type: 'KSampler', param_name: 'sampler_name' }],
          selector_patterns: [{ pattern: 'main', match_type: 'contains' }],
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
          rule_entries: [{ class_type: 'KSampler', param_name: 'sampler_name' }],
          selector_patterns: [{ pattern: 'rough', match_type: 'contains' }],
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
          rule_entries: [{ class_type: 'KSampler', param_name: 'steps' }],
          selector_patterns: [{ pattern: 'main', match_type: 'contains' }],
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
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters, buildStageSelectorPatterns(mappingMasters))
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
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters, buildStageSelectorPatterns(mappingMasters))
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

  it('[REQ-358/WIRING] [REQ-358/AC-14] class候補と選択中node metadataを表示する', () => {
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters, buildStageSelectorPatterns(mappingMasters))
    render(
      <AdaptiveWorkflowWiring
        workflow={mockWorkflow}
        activeStages={activeStages}
        mappingMasters={mappingMasters}
        currentMappings={[{ master_id: 101, variant_id: 1001, node_id: '10' }]}
      />
    )

    const select = screen.getByLabelText(/Rough Stage sampler_name_rough → sampler_name のノード/) as HTMLSelectElement
    expect(select).toBeInTheDocument()

    const options = Array.from(select.options)
    const roughOption = options.find((opt) => opt.value === '20')
    expect(roughOption).toBeDefined()
    expect(roughOption?.textContent).toMatch(/\d+%/)
    expect(roughOption?.textContent).not.toMatch(/推奨/)
    const mainSelect = screen.getByLabelText(/Main Stage sampler_name → sampler_name のノード/) as HTMLSelectElement
    expect(mainSelect.selectedOptions[0].textContent).toMatch(/Main KSampler.*KSampler.*ID 10.*\d+%/)
    expect(screen.queryByLabelText('sampler_name 選択中のノード')).not.toBeInTheDocument()
  })

  it('[REQ-419/AC-13] uses the same variant definition and registered stages as Rescan for option order and scores', () => {
    const base = mappingMasters[0]
    const master: MappingMasterV2 = {
      ...base,
      variants: base.variants.map((variant, i) => ({
        ...variant,
        rule_entries: [
          { class_type: 'KSampler', param_name: 'sampler_name' },
          { class_type: 'KSampler', param_name: 'noise_seed' },
        ],
        selector_patterns: i === 0
          ? [{ pattern: 'Main Stage Sampler', match_type: 'exact' }, { pattern: 'Rough Stage Sampler', match_type: 'exact' }]
          : [{ pattern: 'Rough Stage Sampler', match_type: 'exact' }],
      })),
    }
    const graph = {
      a: { class_type: 'KSampler', title: 'Rough Stage Sampler', inputs: { sampler_name: 'x' } },
      b: { class_type: 'KSampler', title: 'Main Stage Sampler', inputs: { sampler_name: 'x' } },
      c: { class_type: 'Other', title: 'Fallback', inputs: { noise_seed: 1 } },
      d: { class_type: 'Other', title: 'Unrelated' },
    }
    const workflow = { ...mockWorkflow, json_body: graph, mappings: [] }
    const activeStages = detectActiveStages(graph, stageMasters, buildStageSelectorPatterns([master])).filter((info) => info.stage.key === 'main')
    render(<AdaptiveWorkflowWiring workflow={workflow} activeStages={activeStages} mappingMasters={[master]} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    const expected = rankWorkflowNodeCandidates(graph, candidateDefinitionForVariant(master.variants[0]),
      'Main Stage', master.variants.map((variant) => variant.stage_name))
    expect(Array.from(select.options).filter((option) => option.value).map((option) => [option.value, option.textContent?.match(/\d+%/)?.[0]]))
      .toEqual(expected.map((candidate) => [candidate.id, `${candidate.score}%`]))
    expect(expected.find((candidate) => candidate.id === 'a')!.recommended).toBe(true)
    expect(expected.find((candidate) => candidate.id === 'c')!.tier).toBe(3)
  })

  it('[REQ-419/AC-13] wiring ignores legacy-only and keyword-only nodes', () => {
    const base = mappingMasters[1]
    const master: MappingMasterV2 = {
      ...base,
      expected_class_types: ['LegacyOnly'],
      base_title_patterns: ['Legacy Title'],
      variants: [{
        ...base.variants[0],
        extra_title_patterns: ['Extra Legacy'],
        rule_entries: [{ class_type: 'KSampler', param_name: 'steps' }],
        selector_patterns: null,
      }],
    }
    const graph = {
      legacy: { class_type: 'LegacyOnly', title: 'Legacy Title', inputs: { other: 1 } },
      plain: { class_type: 'KSampler', title: 'Plain Sampler', inputs: { steps: 20 } },
      kw: { class_type: 'KSampler', title: 'Extra Legacy keyword main', inputs: { steps: 20 } },
    }
    const workflow = { ...mockWorkflow, json_body: graph, mappings: [] }
    const mainOnly = detectActiveStages(graph, stageMasters).filter((i) => i.stage.key === 'main')
    render(<AdaptiveWorkflowWiring workflow={workflow} activeStages={mainOnly} mappingMasters={[master]} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    const options = Array.from(select.options).filter((option) => option.value)
    // (a) legacy-column-only node is not rendered as recommended in the wiring select
    expect(options.find((option) => option.value === 'legacy')?.textContent ?? '').not.toMatch(/推奨/)
    // (b) keyword / legacy-title-only match ranks in the same band as a plain entry-matched node
    const expected = rankWorkflowNodeCandidates(graph, candidateDefinitionForVariant(master.variants[0]), 'Main Stage', ['Main Stage'])
    const byId = new Map(expected.map((c) => [c.id, c]))
    expect(byId.get('legacy')!.recommended).toBe(false)
    expect(byId.get('legacy')!.tier).toBeGreaterThanOrEqual(3)
    expect(byId.get('kw')!.tier).toBe(byId.get('plain')!.tier)
    expect(byId.get('kw')!.tier).toBe(2)
    expect(byId.get('kw')!.recommended).toBe(false)
  })

  it('retains a missing saved node as the selected option inside the field', () => {
    const onSave = vi.fn()
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters, buildStageSelectorPatterns(mappingMasters))
    render(<AdaptiveWorkflowWiring workflow={mockWorkflow} activeStages={activeStages} mappingMasters={[mappingMasters[1]]}
      currentMappings={[{ master_id: 102, variant_id: 1003, node_id: '999' }]} onSaveMappings={onSave} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select).toHaveValue('999')
    expect(select.selectedOptions[0]).toHaveTextContent('参照先なし · ID 999')
    fireEvent.click(screen.getByRole('button', { name: /対応付けを保存/ }))
    expect(onSave).toHaveBeenCalledWith([{ master_id: 102, variant_id: 1003, node_id: '999' }], expect.any(Object))
  })

  it('[REQ-358/AC-23] slot無効状態を保持し、保存時にstateを渡す', () => {
    const onSave = vi.fn()
    const onChangeSlotStates = vi.fn()
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters, buildStageSelectorPatterns(mappingMasters))
    render(<AdaptiveWorkflowWiring workflow={mockWorkflow} activeStages={activeStages} mappingMasters={mappingMasters} currentSlotStates={{ 'v:1001': false }} onChangeSlotStates={onChangeSlotStates} onSaveMappings={onSave} />)

    const mainSelect = screen.getByLabelText(/Main Stage sampler_name → sampler_name のノード/) as HTMLSelectElement
    expect(mainSelect).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Main Stage sampler_name を有効化'))
    expect(onChangeSlotStates).toHaveBeenCalledWith(expect.objectContaining({ 'v:1001': true }))
    fireEvent.click(screen.getByRole('button', { name: /対応付けを保存/ }))
    expect(onSave).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ 'v:1001': false }))
  })

  it('[REQ-358/AC-23][REQ-358/AC-34] keeps a legacy single-variant ID while disabled and saves its canonical permission', () => {
    const onSave = vi.fn()
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters, buildStageSelectorPatterns(mappingMasters))
    render(<AdaptiveWorkflowWiring workflow={mockWorkflow} activeStages={activeStages} mappingMasters={[mappingMasters[1]]}
      currentMappings={[{ master_id: 102, node_id: '10' }]} currentSlotStates={{ 'm:102': false, 'v:999': false }} onSaveMappings={onSave} />)
    const select = screen.getByLabelText(/Main Stage steps → steps のノード/)
    expect(select).toHaveValue('10')
    expect(select).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /対応付けを保存/ }))
    expect(onSave).toHaveBeenCalledWith([{ master_id: 102, variant_id: 1003, node_id: '10' }], expect.objectContaining({ 'v:1003': false, 'v:999': false }))
  })

  it('物理配線は数値の variant_id でバインド・保存される', () => {
    const onSave = vi.fn()
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters, buildStageSelectorPatterns(mappingMasters))
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
          variant_id: 1001,
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
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters, buildStageSelectorPatterns(mappingMasters))
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

  it('[REQ-423/AC-1] preserves input_name on node selection change and save', () => {
    const onSave = vi.fn()
    const onChangeMappings = vi.fn()
    const activeStages = detectActiveStages(mockWorkflow.json_body, stageMasters, buildStageSelectorPatterns(mappingMasters))
    const stepsMaster = {
      ...mappingMasters[1],
      param_name: 'steps',
      variants: [{ ...mappingMasters[1].variants[0], computed_role: 'sampling' }],
    }

    const currentMappings: WiringMappingItem[] = [
      { master_id: 102, node_id: '3', variant_id: 1003, input_name: 'noise_seed' },
    ]

    render(
      <AdaptiveWorkflowWiring
        workflow={mockWorkflow}
        activeStages={activeStages}
        mappingMasters={[mappingMasters[0], stepsMaster]}
        currentMappings={currentMappings}
        onSaveMappings={onSave}
        onChangeMappings={onChangeMappings}
      />
    )

    const mainGroup = document.querySelector('[data-stage-key="main"]') as HTMLElement
    const stepsSelect = within(mainGroup).getByRole('combobox', { name: 'Main Stage sampling → steps のノード' })

    // Change node selection
    fireEvent.change(stepsSelect, { target: { value: '10' } })

    expect(onChangeMappings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          master_id: 102,
          node_id: '10',
          variant_id: 1003,
          input_name: 'noise_seed',
        }),
      ])
    )

    // Save mappings
    fireEvent.click(screen.getByRole('button', { name: /対応付けを保存/ }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          master_id: 102,
          node_id: '10',
          variant_id: 1003,
          input_name: 'noise_seed',
        }),
      ])
    )
  })
})
