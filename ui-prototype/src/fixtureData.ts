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

/** Self-contained fake gallery images; no backend requests, deterministic in A/B.
 * Mixed aspect ratios are intentional so the Generate reel can be reviewed with
 * portrait, square and landscape outputs in the same history. */
const scene = (
  title: string,
  sky: string,
  hill: string,
  sunXRatio: number,
  width = 768,
  height = 1024,
) => {
  const sunX = Math.round(width * sunXRatio)
  const sunY = Math.round(height * 0.24)
  const sunR = Math.round(Math.min(width, height) * 0.11)
  const mid = Math.round(height * 0.70)
  const low = Math.round(height * 0.84)
  const titleY = Math.max(48, Math.round(height * 0.085))
  const footerY = height - Math.max(34, Math.round(height * 0.07))
  const titleSize = Math.max(22, Math.round(Math.min(width, height) * 0.032))
  const footerSize = Math.max(28, Math.round(Math.min(width, height) * 0.044))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="#24253b"/></linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="#ffd7a0" opacity=".85"/>
  <path d="M0 ${mid} L${width*.24} ${height*.39} L${width*.46} ${height*.65} L${width*.66} ${height*.36} L${width} ${height*.72} L${width} ${height} L0 ${height}Z" fill="${hill}"/>
  <path d="M0 ${low} L${width*.29} ${height*.66} L${width*.51} ${height*.82} L${width*.77} ${height*.62} L${width} ${height*.79} L${width} ${height} L0 ${height}Z" fill="#101a2b" opacity=".85"/>
  <text x="${Math.round(width*.05)}" y="${titleY}" font-family="sans-serif" font-size="${titleSize}" fill="#ffffff">UI PROTOTYPE / SAMPLE</text>
  <text x="${Math.round(width*.05)}" y="${footerY}" font-family="sans-serif" font-size="${footerSize}" fill="#ffffff">${title}</text>
  <text x="${Math.round(width*.95)}" y="${titleY}" text-anchor="end" font-family="monospace" font-size="${Math.max(18,titleSize*.75)}" fill="#ffffff" opacity=".7">${width}×${height}</text>
  </svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
export const fixtureHistoryImages = [
  scene('Evening light', '#7f6ab4', '#505079', .74, 768, 1024),   // 3:4 portrait
  scene('Blue hour', '#2c7294', '#275f77', .24, 1024, 1024),      // square
  scene('Warm sunset', '#dc8468', '#84505a', .51, 1344, 768),     // 7:4 landscape
  scene('Twilight', '#716eaf', '#4c5279', .79, 832, 1216),        // tall portrait
  scene('Misty dawn', '#7588a3', '#4b6972', .39, 1216, 832),      // landscape
  scene('Rose sky', '#d78fa7', '#774e76', .69, 1024, 1024),       // square
  scene('Cloud break', '#739bc0', '#3e627f', .27, 1536, 768),     // 2:1 wide
  scene('Golden ridge', '#c89a5b', '#80684e', .61, 768, 1152),    // 2:3 portrait
  scene('Northern night', '#364b83', '#293854', .79, 1280, 896),  // landscape
  scene('Silver lake', '#8caebc', '#526c83', .18, 896, 1280),     // portrait
  scene('Violet dusk', '#8f79b4', '#5a477c', .55, 1152, 768),     // 3:2 landscape
  scene('Amber glow', '#cb7d61', '#855b58', .46, 1024, 1024),     // square
]

/** Collection samples for LoRA / Tag Sets. The arrays are deliberately long enough
 * to inspect multi-row vertical scrolling and category grouping at mobile widths. */
export const fixtureCollectionCategories = [
  { id: 9401, name: '人物・キャラクター', sort_order: 0 },
  { id: 9402, name: '背景・風景', sort_order: 1 },
  { id: 9403, name: '画風・質感', sort_order: 2 },
]
export const fixtureCollectionModels = [
  { id: 9501, name: 'Sample SDXL', model_type: 'sdxl' },
  { id: 9502, name: 'Sample Flux', model_type: 'flux' },
]
const sampleTitles = ['Soft Portrait', 'Evening Valley', 'Ink Detail', 'Studio Light',
  'Forest Walk', 'Pencil Sketch', 'Character Style', 'Golden Hour', 'Fine Texture',
  'City Morning', 'Comic Shading', 'Snow Ridge', 'Face Detail', 'Blue Landscape',
  'Watercolor', 'Warm Studio', 'Cloudy Horizon', 'Graphic Line']
export const fixtureLoras = sampleTitles.map((title, i) => ({
  id: 9601 + i, model_name: title + ' / Demo LoRA',
  description: i % 4 === 0 ? 'デザインレビュー用の長めの説明文。カード内での折り返しと縦スクロールを確認するための架空データです。' : 'UI review sample model',
  category_id: i % 7 === 0 ? null : fixtureCollectionCategories[i % 3].id,
  file_path: '/offline/sample_' + (i+1) + '.safetensors',
  thumbnail_path: fixtureHistoryImages[i % fixtureHistoryImages.length],
  snapshot_paths: i % 4 === 0 ? [] : [fixtureHistoryImages[(i+1) % fixtureHistoryImages.length], fixtureHistoryImages[(i+2) % fixtureHistoryImages.length], ...(i % 3 === 0 ? [fixtureHistoryImages[(i+3) % fixtureHistoryImages.length]] : [])],
  example_paths: [],
  target_base_model_ids: [fixtureCollectionModels[i % 2].id],
  recommended_strength_min: 0.6, recommended_strength_max: 0.9,
  trigger_word_sets: [{ id: 9701+i, name: 'Sample Trigger', words: ['demo style', 'detail', 'light'] }],
  sort_order: i, created_at: '2026-10-17T00:00:00',
}))
export const fixtureTagSets = sampleTitles.map((title, i) => ({
  id: 9801 + i, name: title + ' / Tag Set',
  description: 'UI review sample tag set',
  category_id: i % 7 === 0 ? null : fixtureCollectionCategories[i % 3].id,
  tags: ['masterpiece', 'detailed illustration', 'soft light', 'sample tag ' + (i+1)],
  subsets: i % 3 === 0 ? [{ id: 9901 + i, name: 'Variant A', tags: ['warm colors', 'portrait'], thumbnail_path: null }] : [],
  target_base_model_ids: [fixtureCollectionModels[i % 2].id],
  thumbnail_path: fixtureHistoryImages[i % fixtureHistoryImages.length],
  snapshot_paths: i % 4 === 0 ? [] : [fixtureHistoryImages[(i+1) % fixtureHistoryImages.length], fixtureHistoryImages[(i+2) % fixtureHistoryImages.length], ...(i % 3 === 0 ? [fixtureHistoryImages[(i+3) % fixtureHistoryImages.length]] : [])],
  sort_order: i, created_at: '2026-10-17T00:00:00',
}))

/** History review fixtures: shared by baseline and proposal, completely offline. */
export const fixtureHistorySnapshots = Array.from({length:48},(_,i)=>({
  id: 96001+i,
  workflow_id:fixtureWorkflow.id,
  image_path:fixtureHistoryImages[i%fixtureHistoryImages.length],
  thumbnail_path:fixtureHistoryImages[i%fixtureHistoryImages.length],
  created_at:new Date(Date.UTC(2026,9,17,12,0)-i*3600*1000).toISOString(),
}))
export const fixtureHistoryAlbums = [
  {id:97001,name:'Portrait studies',description:'Portrait variations',sort_order:0,count:16},
  {id:97002,name:'Landscape collection',description:'Lighting and backgrounds',sort_order:1,count:12},
  {id:97003,name:'Reference & experiments',description:'Style tests',sort_order:2,count:24},
  {id:97004,name:'Small selection',description:'A few favorites',sort_order:3,count:3},
  {id:97005,name:'Empty album',description:'Empty state test',sort_order:4,count:0},
].map((album)=>({
 id:album.id,name:album.name,description:album.description,sort_order:album.sort_order,
 created_at:'2026-10-17T12:00:00Z',
 items:Array.from({length:album.count},(_,i)=>{
   const snap=fixtureHistorySnapshots[(i+(album.id-97001)*7)%fixtureHistorySnapshots.length]
   return {snapshot_id:snap.id,sequence_order:i,image_path:snap.image_path,thumbnail_path:snap.thumbnail_path,created_at:snap.created_at}
 })
}))
