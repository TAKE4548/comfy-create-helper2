// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyBypass } from '../bypassUtils'

const comfyObjectInfo = {
  KSampler: {
    input: {
      required: {
        model: ['MODEL', {}],
        positive: ['CONDITIONING', {}],
        negative: ['CONDITIONING', {}],
        latent_image: ['LATENT', {}],
      },
    },
    output: ['LATENT'],
  },
  VAEDecode: {
    input: {
      required: {
        samples: ['LATENT', {}],
        vae: ['VAE', {}],
      },
    },
    output: ['IMAGE'],
  },
  LoadCheckpoint: {
    output: ['MODEL', 'CLIP', 'VAE'],
  },
  EmptyLatentImage: {
    output: ['LATENT'],
  },
}

describe('bypassUtils', () => {
  it('should successfully bypass a single node with type matching', () => {
    // 5 (EmptyLatentImage) -> 3 (KSampler) -> 6 (VAEDecode)
    const workflow = {
      '3': {
        inputs: {
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['2', 1],
          latent_image: ['5', 0],
        },
        class_type: 'KSampler',
      },
      '5': {
        inputs: {},
        class_type: 'EmptyLatentImage',
      },
      '6': {
        inputs: {
          samples: ['3', 0],
          vae: ['1', 2],
        },
        class_type: 'VAEDecode',
      },
    }

    // Bypass KSampler (node "3")
    const result = applyBypass(workflow, ['3'], comfyObjectInfo)

    expect(result['3']).toBeUndefined()
    expect(result['5']).toBeDefined()
    expect(result['6']).toBeDefined()
    expect(result['6'].inputs.samples).toEqual(['5', 0])
    // The "vae" input of VAEDecode should remain unchanged
    expect(result['6'].inputs.vae).toEqual(['1', 2])
  })

  it('should sever connections when types do not match (type mismatch)', () => {
    const customComfyInfo = {
      ...comfyObjectInfo,
      MismatchNode: {
        input: {
          required: {
            input_val: ['TEXT', {}],
          },
        },
        output: ['IMAGE'],
      },
    }

    const workflow = {
      '2': {
        inputs: {
          input_val: 'hello',
        },
        class_type: 'MismatchNode',
      },
      '6': {
        inputs: {
          samples: ['2', 0],
          vae: ['1', 2],
        },
        class_type: 'VAEDecode',
      },
    }

    const result = applyBypass(workflow, ['2'], customComfyInfo)

    expect(result['2']).toBeUndefined()
    expect(result['6'].inputs.samples).toBeUndefined()
    expect(result['6'].inputs.vae).toEqual(['1', 2])
  })

  it('should successfully bypass multiple nodes in sequence (chain)', () => {
    // 5 (EmptyLatentImage) -> 3 (KSampler) -> 4 (KSampler) -> 6 (VAEDecode)
    const workflow = {
      '3': {
        inputs: {
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['2', 1],
          latent_image: ['5', 0],
        },
        class_type: 'KSampler',
      },
      '4': {
        inputs: {
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['2', 1],
          latent_image: ['3', 0],
        },
        class_type: 'KSampler',
      },
      '5': {
        inputs: {},
        class_type: 'EmptyLatentImage',
      },
      '6': {
        inputs: {
          samples: ['4', 0],
          vae: ['1', 2],
        },
        class_type: 'VAEDecode',
      },
    }

    // Bypass both KSamplers ("3" and "4") in forward order
    const result = applyBypass(workflow, ['3', '4'], comfyObjectInfo)

    expect(result['3']).toBeUndefined()
    expect(result['4']).toBeUndefined()
    expect(result['5']).toBeDefined()
    expect(result['6']).toBeDefined()
    expect(result['6'].inputs.samples).toEqual(['5', 0])
  })

  it('should successfully bypass multiple nodes in reverse order without link breakage', () => {
    // 5 (EmptyLatentImage) -> 3 (KSampler) -> 4 (KSampler) -> 6 (VAEDecode)
    const workflow = {
      '3': {
        inputs: {
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['2', 1],
          latent_image: ['5', 0],
        },
        class_type: 'KSampler',
      },
      '4': {
        inputs: {
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['2', 1],
          latent_image: ['3', 0],
        },
        class_type: 'KSampler',
      },
      '5': {
        inputs: {},
        class_type: 'EmptyLatentImage',
      },
      '6': {
        inputs: {
          samples: ['4', 0],
          vae: ['1', 2],
        },
        class_type: 'VAEDecode',
      },
    }

    // Bypass both KSamplers in REVERSE order ("4" then "3")
    const result = applyBypass(workflow, ['4', '3'], comfyObjectInfo)

    expect(result['3']).toBeUndefined()
    expect(result['4']).toBeUndefined()
    expect(result['5']).toBeDefined()
    expect(result['6']).toBeDefined()
    expect(result['6'].inputs.samples).toEqual(['5', 0])
  })

  it('should handle cycle connections gracefully by severing looped links', () => {
    // Self/Mutual cycle: 3 -> 4 -> 3
    const workflow = {
      '3': {
        inputs: {
          latent_image: ['4', 0],
        },
        class_type: 'KSampler',
      },
      '4': {
        inputs: {
          latent_image: ['3', 0],
        },
        class_type: 'KSampler',
      },
      '6': {
        inputs: {
          samples: ['4', 0],
        },
        class_type: 'VAEDecode',
      },
    }

    const result = applyBypass(workflow, ['3', '4'], comfyObjectInfo)
    expect(result['3']).toBeUndefined()
    expect(result['4']).toBeUndefined()
    expect(result['6']).toBeDefined()
    // Looped connection should be severed (deleted) rather than hanging in infinite loop
    expect(result['6'].inputs.samples).toBeUndefined()
  })

  it('should not corrupt or delete required input connections if nodeInfo is missing', () => {
    const workflow = {
      '10': {
        inputs: {
          image: ['9', 0],
          detailer_pipe: ['8', 0],
        },
        class_type: 'UnknownBypassedNode',
      },
      '11': {
        inputs: {
          image: ['10', 0],
          detailer_pipe: ['10', 1],
        },
        class_type: 'EditDetailerPipe',
      },
    }

    // Missing schema info for UnknownBypassedNode
    const result = applyBypass(workflow, ['10'], {})

    // Node 10 is skipped for bypass rewiring to prevent input connection corruption
    expect(result['10']).toBeDefined()
    expect(result['11'].inputs.detailer_pipe).toEqual(['10', 1])
  })
})
