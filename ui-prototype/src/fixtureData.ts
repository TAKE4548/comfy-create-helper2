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

export const fixturePresets = [
  {
    id: 91011, workflow_id: fixtureWorkflow.id, name: 'Portrait / soft light',
    param_values: {
      Main_Positive_Prompt: 'portrait, detailed face, soft studio lighting, shallow depth of field',
      Negative_Prompt: 'blurry, distorted hands, low quality',
      Sampler_Steps: '28', Sampler_cfg: '7',
    },
    applied_assets: {}, batch_size: 1, seed_mode: 'fixed', seed: 42,
    sort_order: 0, created_at, updated_at: created_at,
  },
  {
    id: 91012, workflow_id: fixtureWorkflow.id, name: 'Landscape / evening',
    param_values: {
      Main_Positive_Prompt: 'mountain landscape, golden hour, cinematic composition',
      Negative_Prompt: 'blurry, overexposed, artifacts',
      Sampler_Steps: '32', Sampler_cfg: '6.5',
    },
    applied_assets: {}, batch_size: 1, seed_mode: 'random', seed: 42,
    sort_order: 1, created_at, updated_at: created_at,
  },
]

/** Self-contained fake gallery images; no backend requests, deterministic in A/B. */
const scene = (title: string, sky: string, hill: string, sunX: number) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 1024">
  <defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="#24253b"/></linearGradient></defs>
  <rect width="768" height="1024" fill="url(#g)"/>
  <circle cx="${sunX}" cy="250" r="115" fill="#ffd7a0" opacity=".85"/>
  <path d="M0 700 L185 400 L350 650 L500 360 L768 720 L768 1024 L0 1024Z" fill="${hill}"/>
  <path d="M0 850 L220 660 L390 820 L590 620 L768 790 L768 1024 L0 1024Z" fill="#101a2b" opacity=".85"/>
  <text x="38" y="90" font-family="sans-serif" font-size="32" fill="#ffffff">UI PROTOTYPE / SAMPLE</text>
  <text x="38" y="950" font-family="sans-serif" font-size="44" fill="#ffffff">${title}</text>
  </svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
export const fixtureHistoryImages = [
  scene('Evening light', '#7f6ab4', '#505079', 570),
  scene('Blue hour', '#2c7294', '#275f77', 180),
  scene('Warm sunset', '#dc8468', '#84505a', 390),
  scene('Twilight', '#716eaf', '#4c5279', 610),
  scene('Misty dawn', '#7588a3', '#4b6972', 300),
  scene('Rose sky', '#d78fa7', '#774e76', 530),
  scene('Cloud break', '#739bc0', '#3e627f', 210),
  scene('Golden ridge', '#c89a5b', '#80684e', 470),
  scene('Northern night', '#364b83', '#293854', 610),
  scene('Silver lake', '#8caebc', '#526c83', 140),
  scene('Violet dusk', '#8f79b4', '#5a477c', 420),
  scene('Amber glow', '#cb7d61', '#855b58', 350),
]
