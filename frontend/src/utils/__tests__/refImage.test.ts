import { describe, it, expect, vi, afterEach } from 'vitest'
import fc from 'fast-check'
import {
  isRefImageToken,
  refIdFromToken,
  refImageThumbnailUrl,
  refImageViewUrl,
  parseHistoryImageUrl,
} from '../refImage'
import { refImagesApi } from '../../api/domains/refImages'

const HEX64 = 'a'.repeat(63) + '1'
const hex64Arb = fc.stringMatching(/^[0-9a-f]{64}$/)
const extArb = fc.constantFrom('png', 'jpg', 'webp')

describe('refImage utils', () => {
  it('[REQ-427/AC-5] isRefImageToken accepts only canonical tokens (property)', () => {
    fc.assert(fc.property(hex64Arb, extArb, (h, e) => {
      const token = `refimg:${h}.${e}`
      expect(isRefImageToken(token)).toBe(true)
      expect(refIdFromToken(token)).toBe(`${h}.${e}`)
      expect(refImageThumbnailUrl(token)).toBe(`/api/ref-images/${h}.${e}/thumbnail`)
      expect(refImageViewUrl(token)).toBe(`/api/ref-images/${h}.${e}`)
    }))
  })

  it('[REQ-427/AC-5] isRefImageToken rejects mutations and arbitrary strings (property)', () => {
    const canonical = new RegExp(`^refimg:[0-9a-f]{64}\.(png|jpg|webp)$`)
    fc.assert(fc.property(fc.string(), (s) => {
      expect(isRefImageToken(s)).toBe(canonical.test(s))
    }))
    const good = `refimg:${HEX64}.png`
    const mutations = [
      good.replace('a', 'A'),
      ` ${good}`,
      `${good} `,
      `${good}\n`,
      `refimg:${HEX64.slice(1)}.png`,
      `refimg:${HEX64}0.png`,
      `refimg:${HEX64}.gif`,
      `refimage:${HEX64}.png`,
      `REFIMG:${HEX64}.png`,
    ]
    for (const m of mutations) {
      expect(isRefImageToken(m)).toBe(false)
      expect(refIdFromToken(m)).toBeNull()
      expect(refImageThumbnailUrl(m)).toBeNull()
      expect(refImageViewUrl(m)).toBeNull()
    }
    for (const v of [undefined, null, 1, {}, []]) expect(isRefImageToken(v)).toBe(false)
  })

  it('[REQ-427/AC-4] parseHistoryImageUrl extracts filename, subfolder, type', () => {
    expect(parseHistoryImageUrl('/api/comfy/view?filename=a.png&subfolder=s&type=output&t=1'))
      .toEqual({ filename: 'a.png', subfolder: 's', type: 'output' })
    expect(parseHistoryImageUrl('/api/comfy/view?filename=a.png')).toEqual({ filename: 'a.png', subfolder: '', type: 'output' })
    expect(parseHistoryImageUrl('/api/comfy/view?filename=a.png&type=temp')?.type).toBe('temp')
  })

  it('[REQ-427/AC-4] parseHistoryImageUrl returns null for missing filename or unsupported type', () => {
    expect(parseHistoryImageUrl('/api/comfy/view?subfolder=s&type=output')).toBeNull()
    expect(parseHistoryImageUrl('/api/comfy/view?filename=&type=output')).toBeNull()
    expect(parseHistoryImageUrl('/api/comfy/view?filename=a.png&type=input')).toBeNull()
  })
})

describe('refImagesApi', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  const sample = { token: `refimg:${HEX64}.png`, ref_id: `${HEX64}.png`, media_type: 'image/png', width: 1, height: 1, byte_size: 1, view_url: 'v', thumbnail_url: 't' }
  const okFetch = () => vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => JSON.stringify(sample) })

  it('[REQ-427/AC-5] upload posts FormData with file and no Content-Type', async () => {
    const f = okFetch()
    vi.stubGlobal('fetch', f)
    const res = await refImagesApi.upload(new Blob(['x'], { type: 'image/png' }), 'a.png')
    expect(res).toEqual(sample)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/ref-images/upload')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('file')).toBeInstanceOf(Blob)
    expect(init.headers['Content-Type']).toBeUndefined()
  })

  it('[REQ-427/AC-5] importFromHistory and importFromSnapshot send JSON with source', async () => {
    const f = okFetch()
    vi.stubGlobal('fetch', f)
    await refImagesApi.importFromHistory({ filename: 'a.png', subfolder: 's', type: 'output' })
    await refImagesApi.importFromSnapshot(7)
    expect(f.mock.calls[0][0]).toBe('/api/ref-images/import')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ source: 'history', filename: 'a.png', subfolder: 's', type: 'output' })
    expect(f.mock.calls[1][0]).toBe('/api/ref-images/import')
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ source: 'snapshot', snapshot_id: 7 })
    expect(f.mock.calls[0][1].headers['Content-Type']).toBe('application/json')
  })

  it('[REQ-427/AC-5] non-2xx responses throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 415, text: async () => 'bad' }))
    await expect(refImagesApi.upload(new Blob(['x']))).rejects.toThrow(/415/)
    await expect(refImagesApi.importFromSnapshot(1)).rejects.toThrow(/415/)
  })
})
