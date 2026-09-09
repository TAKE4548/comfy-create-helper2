import { http, HttpResponse } from 'msw'

export const handlers = [
  // ── FastAPI Endpoints ──
  http.get('/api/base-models', () => {
    return HttpResponse.json([
      { id: 1, name: 'SD 1.5', key: 'sd15' },
      { id: 2, name: 'SDXL', key: 'sdxl' },
      { id: 3, name: 'Anima', key: 'anima' },
    ])
  }),
  http.get('/api/mapping-masters', () => {
    return HttpResponse.json([])
  }),
  http.get('/api/workflows', () => {
    return HttpResponse.json([])
  }),
  http.get('/api/workflows/:id', () => {
    return HttpResponse.json({
      id: 1,
      name: 'Default Workflow',
      mappings: [],
      target_base_model_id: null,
    })
  }),
  http.get('/api/loras', () => {
    return HttpResponse.json([])
  }),
  http.get('/api/tag-sets', () => {
    return HttpResponse.json([])
  }),
  http.get('/api/param-type-masters', () => {
    return HttpResponse.json([])
  }),

  // ── ComfyUI Endpoints ──
  http.get('/comfy/object_info', () => {
    return HttpResponse.json({})
  }),
  http.get('/api/comfy/object_info', () => {
    return HttpResponse.json({})
  }),
  http.post('/comfy/prompt', () => {
    return HttpResponse.json({ prompt_id: 'mock-prompt-id', number: 1 })
  }),
  http.post('/api/comfy/prompt', () => {
    return HttpResponse.json({ prompt_id: 'mock-prompt-id', number: 1 })
  }),
  http.get('/comfy/history/:promptId', () => {
    return HttpResponse.json({})
  }),
  http.get('/api/comfy/history/:promptId', () => {
    return HttpResponse.json({})
  }),
]
