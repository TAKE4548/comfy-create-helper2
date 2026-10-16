/** Deterministic sample workflow for offline UI inspection. */
const created_at = '2026-10-17T00:00:00'
export const fixtureWorkflow = {
  id: 91001, name: 'UI review / Sample SDXL', created_at,
  target_base_model_id: null, mapping_slot_states: {},
  json_body: {
    '1': { class_type: 'CLIPTextEncode', inputs: { text: '1girl, detailed face, soft lighting' }, _meta: { title: 'Positive' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: 'low quality, blurry' }, _meta: { title: 'Negative' } },
    '3': { class_type: 'KSampler', inputs: { steps: 28, cfg: 7, seed: 42, denoise: 1 }, _meta: { title: 'Sampler' } },
  },
  mappings: [
    { id: 1, master_id: 1, node_id: '1', role: 'Main_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Main Positive Prompt' },
    { id: 2, master_id: 2, node_id: '2', role: 'Negative_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Negative Prompt' },
    { id: 3, master_id: 3, node_id: '3', role: 'Sampler_Steps', param_name: 'steps', input_type: 'int', display_name: 'Steps' },
    { id: 4, master_id: 4, node_id: '3', role: 'Sampler_cfg', param_name: 'cfg', input_type: 'float', display_name: 'CFG Scale' },
  ],
}
export const fixtureMasters = fixtureWorkflow.mappings.map((m, i) => ({
  id: m.master_id, role: m.role, display_name: m.display_name, name: m.display_name,
  param_name: m.param_name, input_type: m.input_type, expected_class_types: null,
  title_patterns: null, sort_order: i, default_enabled: true, variants: [],
}))
export const fixtureSnapshot = {
  version: 1, epoch: 'prototype-offline', revision: 1, normal_group_id: null,
  jobs: [], batches: [], upstream: { http_ready: false, ws_connected: false, failure_since: null },
}
