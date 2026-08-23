import { describe, it, expect } from 'vitest';
import { applyBypass } from '../bypassUtils';

const comfyObjectInfo = {
  KSampler: {
    input: {
      required: {
        model: ["MODEL", {}],
        positive: ["CONDITIONING", {}],
        negative: ["CONDITIONING", {}],
        latent_image: ["LATENT", {}]
      }
    },
    output: ["LATENT"]
  },
  VAEDecode: {
    input: {
      required: {
        samples: ["LATENT", {}],
        vae: ["VAE", {}]
      }
    },
    output: ["IMAGE"]
  },
  LoadCheckpoint: {
    output: ["MODEL", "CLIP", "VAE"]
  },
  EmptyLatentImage: {
    output: ["LATENT"]
  }
};

describe('bypassUtils', () => {
  it('should successfully bypass a single node with type matching', () => {
    // 5 (EmptyLatentImage) -> 3 (KSampler) -> 6 (VAEDecode)
    const workflow = {
      "3": {
        "inputs": {
          "model": ["1", 0],
          "positive": ["2", 0],
          "negative": ["2", 1],
          "latent_image": ["5", 0]
        },
        "class_type": "KSampler"
      },
      "5": {
        "inputs": {},
        "class_type": "EmptyLatentImage"
      },
      "6": {
        "inputs": {
          "samples": ["3", 0],
          "vae": ["1", 2]
        },
        "class_type": "VAEDecode"
      }
    };

    // Bypass KSampler (node "3")
    // KSampler output at index 0 is "LATENT".
    // KSampler input of type "LATENT" is "latent_image", which is connected to ["5", 0].
    // So node "6"'s "samples" (originally ["3", 0]) should become ["5", 0].
    const result = applyBypass(workflow, ["3"], comfyObjectInfo);

    expect(result["3"]).toBeUndefined();
    expect(result["5"]).toBeDefined();
    expect(result["6"]).toBeDefined();
    expect(result["6"].inputs.samples).toEqual(["5", 0]);
    // The "vae" input of VAEDecode should remain unchanged
    expect(result["6"].inputs.vae).toEqual(["1", 2]);
  });

  it('should sever connections when types do not match (type mismatch)', () => {
    const customComfyInfo = {
      ...comfyObjectInfo,
      // Custom node that has an output but no input of that matching type
      MismatchNode: {
        input: {
          required: {
            input_val: ["TEXT", {}]
          }
        },
        output: ["IMAGE"]
      }
    };

    const workflow = {
      "2": {
        "inputs": {
          "input_val": "hello"
        },
        "class_type": "MismatchNode"
      },
      "6": {
        "inputs": {
          "samples": ["2", 0],
          "vae": ["1", 2]
        },
        "class_type": "VAEDecode"
      }
    };

    // Bypass MismatchNode (node "2")
    // Output "IMAGE" does not match input "TEXT".
    // Therefore, VAEDecode's input "samples" (which was ["2", 0]) should be severed (deleted).
    const result = applyBypass(workflow, ["2"], customComfyInfo);

    expect(result["2"]).toBeUndefined();
    expect(result["6"].inputs.samples).toBeUndefined();
    expect(result["6"].inputs.vae).toEqual(["1", 2]);
  });

  it('should successfully bypass multiple nodes in sequence (chain)', () => {
    // 5 (EmptyLatentImage) -> 3 (KSampler) -> 4 (KSampler) -> 6 (VAEDecode)
    const workflow = {
      "3": {
        "inputs": {
          "model": ["1", 0],
          "positive": ["2", 0],
          "negative": ["2", 1],
          "latent_image": ["5", 0]
        },
        "class_type": "KSampler"
      },
      "4": {
        "inputs": {
          "model": ["1", 0],
          "positive": ["2", 0],
          "negative": ["2", 1],
          "latent_image": ["3", 0]
        },
        "class_type": "KSampler"
      },
      "5": {
        "inputs": {},
        "class_type": "EmptyLatentImage"
      },
      "6": {
        "inputs": {
          "samples": ["4", 0],
          "vae": ["1", 2]
        },
        "class_type": "VAEDecode"
      }
    };

    // Bypass both KSamplers ("3" and "4")
    const result = applyBypass(workflow, ["3", "4"], comfyObjectInfo);

    expect(result["3"]).toBeUndefined();
    expect(result["4"]).toBeUndefined();
    expect(result["5"]).toBeDefined();
    expect(result["6"]).toBeDefined();
    // 6.samples -> 4.latent_image (which was 3.latent_image -> 5.latent_image)
    // So 6.samples should point to ["5", 0]
    expect(result["6"].inputs.samples).toEqual(["5", 0]);
  });

  it('should not corrupt or delete required input connections if nodeInfo is missing', () => {
    const workflow = {
      "10": {
        "inputs": {
          "image": ["9", 0],
          "detailer_pipe": ["8", 0]
        },
        "class_type": "UnknownBypassedNode"
      },
      "11": {
        "inputs": {
          "image": ["10", 0],
          "detailer_pipe": ["10", 1]
        },
        "class_type": "EditDetailerPipe"
      }
    };

    // Missing schema info for UnknownBypassedNode
    const result = applyBypass(workflow, ["10"], {});

    // Node 10 is skipped for bypass rewiring to prevent input connection corruption
    expect(result["10"]).toBeDefined();
    expect(result["11"].inputs.detailer_pipe).toEqual(["10", 1]);
  });
});

