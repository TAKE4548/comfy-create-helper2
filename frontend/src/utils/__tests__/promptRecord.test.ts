import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Workflow } from '../../api/types'
import { buildGenerationRecord, PROMPT_RECORD_KEY, ASSOCIATIONS_KEY } from '../generationRecord'
import { getMetadataView, readLocalRecordedMetadata, resolveRecordedMetadata } from '../promptRecord'
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../api/client', () => ({ promptMetadataApi: { get } }))
const wf: Workflow = { id: 1, name: 'Original', created_at: '', json_body: {}, mappings: [
  { id: 1, master_id: 1, node_id: '1', role: 'quality', param_name: 'text', input_type: 'textarea', display_name: 'Quality' },
  { id: 2, master_id: 2, node_id: '2', role: 'Sampler_Seed', param_name: 'seed', input_type: 'int', display_name: 'Seed' },
  { id: 3, master_id: 3, node_id: '3', role: 'positive', param_name: null, input_type: 'lora_stack', display_name: 'LoRA' },
] }
const graph = { '1': { inputs: { text: '' } }, '2': { inputs: { seed: 812 } }, '3': { class_type: 'easy loraStack', inputs: { num_loras: 1, lora_1_name: 'frozen.safetensors', lora_1_strength: 0.6, lora_1_model_strength: 0.8, lora_1_clip_strength: 0.4 } } }
const record = () => buildGenerationRecord(wf, graph, graph, {})
const params = () => ({ [PROMPT_RECORD_KEY]: JSON.stringify(record()), quality: '', extra: { x: [false, 0, null] }, [ASSOCIATIONS_KEY]: '{}' })
const generatedParams = (prompt: string, aspect: string, seed: number, steps: number) => {
  const workflow: Workflow = { ...wf, mappings: [
    { ...wf.mappings[0], role: 'positive', param_name: 'text', display_name: 'Prompt' },
    { ...wf.mappings[1], role: 'Sampler_Seed', param_name: 'seed', display_name: 'Seed' },
    { ...wf.mappings[2], role: 'resolution_aspect', input_type: 'combo', param_name: 'aspect', display_name: 'Aspect ratio' },
    { id: 4, master_id: 4, node_id: '4', role: 'steps', param_name: 'steps', input_type: 'int', display_name: 'Steps' },
  ] }
  const submitted = {
    '1': { inputs: { text: prompt } }, '2': { inputs: { seed } },
    '3': { inputs: { aspect } }, '4': { inputs: { steps } },
  }
  return { [PROMPT_RECORD_KEY]: JSON.stringify(buildGenerationRecord(workflow, submitted, submitted, {})) }
}
beforeEach(() => { localStorage.clear(); get.mockReset(); get.mockRejectedValue(new Error('404')) })
describe('getMetadataView', () => {
  it('exposes a valid backend completion timestamp without inferring it from queue time', () => {
    const saved = record()
    const completedAt = '2026-10-10T12:34:56.000Z'
    const view = getMetadataView({
      [PROMPT_RECORD_KEY]: JSON.stringify({ ...saved, queued_at: '2026-10-10T12:00:00.000Z', completed_at: completedAt }),
    })
    expect(view.completedAt).toBe(completedAt)

    const legacy = getMetadataView({ [PROMPT_RECORD_KEY]: JSON.stringify(saved) })
    expect(legacy.completedAt).toBeNull()
    expect(legacy.fields[0].value).toBe('')
  })

  it('treats absent, null, and invalid completion timestamps as null while preserving the record', () => {
    for (const completed_at of [undefined, null, 'not-a-date', 42, {}]) {
      const saved = record()
      const raw = { ...saved, ...(completed_at === undefined ? {} : { completed_at }) }
      const view = getMetadataView({ [PROMPT_RECORD_KEY]: JSON.stringify(raw), extra: 'preserved' })
      expect(view.completedAt).toBeNull()
      expect(view.fields[0].value).toBe('')
      expect(view.actualSeed).toBe('812')
      expect(view.extras).toContainEqual({ key: 'extra', name: 'extra', recorded: true, value: 'preserved' })
    }
  })

  it('interprets completed_at in snapshot param_values using the same record view', () => {
    const saved = record()
    const completedAt = '2026-10-10T12:34:56Z'
    const snapshotJob = { param_values: { [PROMPT_RECORD_KEY]: JSON.stringify({ ...saved, completed_at: completedAt }) } }
    expect(getMetadataView(snapshotJob.param_values).completedAt).toBe(completedAt)
  })

  it('shows empty prompts, typed extras and actual seed/LoRA strengths without exposing internal keys', () => {
    const view = getMetadataView(params())
    expect(view.fields[0]).toMatchObject({ name: 'Quality', recorded: true, value: '' })
    expect(view.extras).toEqual([{ key: 'extra', name: 'extra', recorded: true, value: { x: [false, 0, null] } }])
    expect(view.actualSeed).toBe('812')
    expect(view.loraRows[0]).toMatchObject({ model: 'frozen.safetensors', weight: '0.6', modelStrength: '0.8', clipStrength: '0.4' })
    expect(view.workflowName).toBe('Original'); expect(view.warning).toBeNull()
  })
  it('preserves every legacy JSON item without promoting legacy seed or workflow labels to generation facts', () => {
    const view = getMetadataView({ seed: 45, arbitrary: [0, false], empty: '', nil: null })
    expect(view.extras.map(p => p.value)).toEqual([45, [0, false], '', null])
    expect(view.actualSeed).toBeNull(); expect(view.workflowName).toBeNull(); expect(view.warning).toBeTruthy()
    expect(getMetadataView({}).warning).toContain('未記録')
  })
  it('does not claim complete history for malformed, unknown or contradictory records', () => {
    for (const invalid of ['{broken', JSON.stringify({ version: 9 }), JSON.stringify({ ...record(), fields: null })]) {
      expect(getMetadataView({ [PROMPT_RECORD_KEY]: invalid, saved: 'kept' }).extras[0].value).toBe('kept')
      expect(getMetadataView({ [PROMPT_RECORD_KEY]: invalid }).warning).toBeTruthy()
    }
    const bad = record(); bad.fields[0].value = null
    const view = getMetadataView({ [PROMPT_RECORD_KEY]: JSON.stringify(bad) })
    expect(view.fields[0].recorded).toBe(false); expect(view.warning).toBeTruthy()
  })
})
describe('resolveRecordedMetadata', () => {
  it('reads matching v1 local records synchronously without calling the server and preserves falsy JSON values', () => {
    const expected = { ...params(), empty: '', zero: 0, no: false, nil: null }
    const generation = record()
    generation.prompt_id = 'p'
    expected[PROMPT_RECORD_KEY] = JSON.stringify(generation)
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: expected, timestamp: 1000 }))

    const found = readLocalRecordedMetadata('p')
    expect(found).not.toBeInstanceOf(Promise)
    expect(found?.paramValues).toEqual(expected)
    expect(found?.metadataSavedAt).toBeNull()
    expect(get).not.toHaveBeenCalled()
  })
  it('returns null for legacy, corrupt, missing and prompt-mismatched local records', () => {
    expect(readLocalRecordedMetadata('missing')).toBeNull()
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: { old: 'local' } }))
    expect(readLocalRecordedMetadata('p')).toBeNull()
    const mismatch = record()
    mismatch.prompt_id = 'other'
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: { [PROMPT_RECORD_KEY]: JSON.stringify(mismatch) } }))
    expect(readLocalRecordedMetadata('p')).toBeNull()
    localStorage.setItem('prompt-surgeon-meta-p', '{broken')
    expect(readLocalRecordedMetadata('p')).toBeNull()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage unavailable') })
    expect(readLocalRecordedMetadata('p')).toBeNull()
    vi.restoreAllMocks()
  })
  it('does not add a prompt id to a valid v1 record that did not store one', () => {
    const noId = record()
    delete noId.prompt_id
    const paramValues = { [PROMPT_RECORD_KEY]: JSON.stringify(noId) }
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues }))
    expect(readLocalRecordedMetadata('p')?.paramValues).toEqual(paramValues)
    expect(JSON.parse(String(readLocalRecordedMetadata('p')?.paramValues[PROMPT_RECORD_KEY])).prompt_id).toBeUndefined()
  })
  it('ignores invalid timestamps and continues server lookup for a mismatched v1 prompt id', async () => {
    const matching = record()
    matching.prompt_id = 'p'
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: { [PROMPT_RECORD_KEY]: JSON.stringify(matching) }, timestamp: Number.MAX_VALUE }))
    expect(readLocalRecordedMetadata('p')?.metadataSavedAt).toBeNull()

    const mismatch = record()
    mismatch.prompt_id = 'other'
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: { [PROMPT_RECORD_KEY]: JSON.stringify(mismatch) }, timestamp: Number.MAX_VALUE }))
    expect(readLocalRecordedMetadata('p')).toBeNull()
    const expected = generatedParams('server prompt', '3:2', 99123, 27)
    get.mockResolvedValue({ prompt_id: 'p', workflow_id: 1, param_values: expected, applied_assets: null, created_at: 'saved' })
    expect((await resolveRecordedMetadata('p'))?.paramValues).toEqual(expected)
    expect(get).toHaveBeenCalledWith('p')
  })
  it('uses valid completed local generation facts without fetching or requiring assets', async () => {
    const completed = record()
    completed.completed_at = '2026-10-10T12:34:56Z'
    const localParams = { [PROMPT_RECORD_KEY]: JSON.stringify(completed) }
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: localParams, timestamp: 1000 }))
    const found = await resolveRecordedMetadata('p')
    expect(found?.paramValues).toEqual(localParams)
    expect(found?.appliedAssets).toEqual({})
    expect(get).not.toHaveBeenCalled()
  })
  it('merges only a matching server completion timestamp into frozen local metadata', async () => {
    const frozen = record()
    frozen.prompt_id = 'p'
    const localParams = { ...params(), localOnly: 'keep-local', [PROMPT_RECORD_KEY]: JSON.stringify(frozen) }
    const localCache = JSON.stringify({ paramValues: localParams, workflowId: 1, appliedAssets: { local: [] }, timestamp: 1000 })
    localStorage.setItem('prompt-surgeon-meta-p', localCache)

    const remoteCompletedAt = '2026-10-10T12:34:56Z'
    const remote = { ...record(), prompt_id: 'p', completed_at: remoteCompletedAt, workflow_name: 'Remote default', parameters: [] }
    const remoteParams = { [PROMPT_RECORD_KEY]: JSON.stringify(remote), remoteOnly: 'discard' }
    get.mockResolvedValue({ prompt_id: 'p', workflow_id: 99, param_values: remoteParams, applied_assets: { remote: [] }, created_at: 'metadata-save-time' })

    const found = await resolveRecordedMetadata('p')
    const mergedRecord = JSON.parse(String(found?.paramValues[PROMPT_RECORD_KEY]))
    expect(mergedRecord.completed_at).toBe(remoteCompletedAt)
    expect(mergedRecord.workflow_name).toBe('Original')
    expect(mergedRecord.parameters).toEqual(frozen.parameters)
    expect(found?.paramValues.localOnly).toBe('keep-local')
    expect(found?.paramValues.remoteOnly).toBeUndefined()
    expect(found?.workflowId).toBe(1)
    expect(found?.appliedAssets).toEqual({ local: [] })
    expect(found?.metadataSavedAt).toBeNull()
    expect(localStorage.getItem('prompt-surgeon-meta-p')).toBe(localCache)
    expect(get).toHaveBeenCalledWith('p')
  })
  it('replaces an invalid local completion value only with a valid matching remote timestamp', async () => {
    const frozen = { ...record(), prompt_id: 'p', completed_at: 'not-a-time' }
    const localParams = { [PROMPT_RECORD_KEY]: JSON.stringify(frozen), localOnly: 'keep-local' }
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: localParams }))
    const remote = { ...record(), prompt_id: 'p', completed_at: '2026-10-10T12:34:56Z' }
    get.mockResolvedValue({ prompt_id: 'p', param_values: { [PROMPT_RECORD_KEY]: JSON.stringify(remote) }, applied_assets: null, created_at: 'saved' })

    const found = await resolveRecordedMetadata('p')
    const merged = JSON.parse(String(found?.paramValues[PROMPT_RECORD_KEY]))
    expect(merged.completed_at).toBe(remote.completed_at)
    expect(merged.workflow_name).toBe(frozen.workflow_name)
    expect(found?.paramValues.localOnly).toBe('keep-local')
  })
  it('retains valid frozen local metadata when timestamp lookup fails or the remote prompt id mismatches', async () => {
    const frozen = record()
    frozen.prompt_id = 'p'
    const localParams = { ...params(), localOnly: 'authoritative', [PROMPT_RECORD_KEY]: JSON.stringify(frozen) }
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: localParams, workflowId: 1, appliedAssets: { local: [] } }))

    get.mockRejectedValueOnce(new Error('server unavailable'))
    const onFailure = await resolveRecordedMetadata('p')
    expect(onFailure?.paramValues).toEqual(localParams)
    expect(JSON.parse(String(onFailure?.paramValues[PROMPT_RECORD_KEY])).completed_at).toBeUndefined()

    const wrongRecord = { ...record(), prompt_id: 'other', completed_at: '2026-10-10T12:34:56Z' }
    get.mockResolvedValueOnce({ prompt_id: 'other', workflow_id: 99, param_values: { [PROMPT_RECORD_KEY]: JSON.stringify(wrongRecord) }, applied_assets: { remote: [] }, created_at: 'saved' })
    const onMismatch = await resolveRecordedMetadata('p')
    expect(onMismatch?.paramValues).toEqual(localParams)
    expect(onMismatch?.appliedAssets).toEqual({ local: [] })
  })
  it('prefers server generation facts over legacy or corrupt local records', async () => {
    get.mockResolvedValue({ prompt_id: 'p', workflow_id: 1, param_values: params(), applied_assets: null, created_at: 'server-time' })
    localStorage.setItem('prompt-surgeon-meta-p', '{broken')
    expect((await resolveRecordedMetadata('p'))?.metadataSavedAt).toBe('server-time')
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: { old: 'local' }, appliedAssets: { old: [] } }))
    expect((await resolveRecordedMetadata('p'))?.paramValues).toEqual(params())
  })
  it('rejects another image ID and falls back to available legacy records without combining assets', async () => {
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: { old: 'local' } }))
    get.mockResolvedValue({ prompt_id: 'other', param_values: params(), applied_assets: { another: [] } })
    expect(await resolveRecordedMetadata('p')).toMatchObject({ paramValues: { old: 'local' }, appliedAssets: {} })
    expect(await resolveRecordedMetadata(null)).toBeNull()
  })
  it('resolves all four generation facts from server metadata when the local cache is missing', async () => {
    const expected = generatedParams('server prompt', '3:2', 99123, 27)
    get.mockResolvedValue({ prompt_id: 'p', workflow_id: 1, param_values: expected, applied_assets: null, created_at: 'saved' })
    const found = await resolveRecordedMetadata('p')
    expect(found?.paramValues).toEqual(expected)
    expect(get).toHaveBeenCalledWith('p')
  })
  it('continues server lookup when localStorage is unavailable and returns local facts when server lookup fails', async () => {
    const expected = generatedParams('recorded prompt', '4:3', 8172, 31)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage unavailable') })
    get.mockResolvedValue({ prompt_id: 'p', workflow_id: 1, param_values: expected, applied_assets: null, created_at: 'saved' })
    expect((await resolveRecordedMetadata('p'))?.paramValues).toEqual(expected)

    vi.restoreAllMocks()
    get.mockRejectedValue(new Error('server unavailable'))
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: expected, timestamp: 1000 }))
    expect((await resolveRecordedMetadata('p'))?.paramValues).toEqual(expected)
  })
})
