// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseAspectRatio, ASPECT_RATIO_PRESETS, DEFAULT_ASPECT_RATIO_ID } from '../aspectRatio'

describe('aspectRatio utility', () => {
  it('has presets including standard 3:4 default', () => {
    expect(DEFAULT_ASPECT_RATIO_ID).toBe('3:4')
    const preset34 = ASPECT_RATIO_PRESETS.find(p => p.id === '3:4')
    expect(preset34).toBeDefined()
    expect(preset34?.ratioStr).toBe('3 / 4')
    expect(preset34?.numericRatio).toBe(0.75)
  })

  it('parses preset aspect ratio correctly', () => {
    const res11 = parseAspectRatio('1:1')
    expect(res11).toEqual({
      presetId: '1:1',
      ratioStr: '1 / 1',
      numericRatio: 1,
    })

    const res169 = parseAspectRatio('16:9')
    expect(res169.ratioStr).toBe('16 / 9')
    expect(res169.numericRatio).toBeCloseTo(16 / 9)
  })

  it('parses custom ratio W:H and W/H formats correctly', () => {
    const resColon = parseAspectRatio('custom', '5:7')
    expect(resColon).toEqual({
      presetId: 'custom',
      ratioStr: '5 / 7',
      numericRatio: 5 / 7,
    })

    const resSlash = parseAspectRatio('custom', ' 7 / 9 ')
    expect(resSlash).toEqual({
      presetId: 'custom',
      ratioStr: '7 / 9',
      numericRatio: 7 / 9,
    })
  })

  it('parses decimal custom ratio correctly', () => {
    const resDec = parseAspectRatio('custom', '0.75')
    expect(resDec).toEqual({
      presetId: 'custom',
      ratioStr: '0.75 / 1',
      numericRatio: 0.75,
    })
  })

  it('falls back to default 3:4 on invalid inputs', () => {
    const invalidPreset = parseAspectRatio('invalid_preset')
    expect(invalidPreset).toEqual({
      presetId: '3:4',
      ratioStr: '3 / 4',
      numericRatio: 3 / 4,
    })

    const invalidCustom = parseAspectRatio('custom', 'invalid:xyz')
    expect(invalidCustom).toEqual({
      presetId: '3:4',
      ratioStr: '3 / 4',
      numericRatio: 3 / 4,
    })
  })
})