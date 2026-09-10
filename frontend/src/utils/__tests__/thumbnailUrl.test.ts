import { describe, it, expect } from 'vitest'
import { toThumbnailUrl } from '../thumbnailUrl'

describe('toThumbnailUrl', () => {
  it('should return empty string for null, undefined, or empty string', () => {
    expect(toThumbnailUrl(null)).toBe('')
    expect(toThumbnailUrl(undefined)).toBe('')
    expect(toThumbnailUrl('')).toBe('')
  })

  it('should convert standard ComfyUI /view URL to /api/comfy/thumbnail', () => {
    const comfyUrl = 'http://localhost:8188/view?filename=ComfyUI_00001_.png&subfolder=sub&type=output&t=12345'
    const result = toThumbnailUrl(comfyUrl)
    expect(result).toBe('/api/comfy/thumbnail?filename=ComfyUI_00001_.png&subfolder=sub&type=output&size=256')
  })

  it('should support custom size parameter', () => {
    const comfyUrl = '/view?filename=test.png&type=temp'
    const result = toThumbnailUrl(comfyUrl, 128)
    expect(result).toBe('/api/comfy/thumbnail?filename=test.png&subfolder=&type=temp&size=128')
  })

  it('should preserve non-ComfyUI snapshot URLs without modification', () => {
    const snapshotUrl = '/api/snapshots/images/thumb_test_123.webp'
    expect(toThumbnailUrl(snapshotUrl)).toBe(snapshotUrl)
  })

  it('should preserve external HTTP URLs not matching /view', () => {
    const externalUrl = 'https://example.com/images/sample.jpg'
    expect(toThumbnailUrl(externalUrl)).toBe(externalUrl)
  })
})
