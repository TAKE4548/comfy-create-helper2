// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { resolveNodeMetadata, getNodeLabel, rankWorkflowNodeCandidates } from '../workflowNodeUtils'

describe('workflowNodeUtils', () => {
  describe('resolveNodeMetadata', () => {
    it('TC-UTIL-01: extracts metadata from API prompt format with _meta.title', () => {
      const workflowJson = {
        '10': {
          class_type: 'KSampler',
          _meta: { title: 'Main KSampler' },
        },
      }
      const result = resolveNodeMetadata('10', workflowJson)
      expect(result).toEqual({
        id: '10',
        title: 'Main KSampler',
        classType: 'KSampler',
      })
    })

    it('TC-UTIL-02: falls back to class_type when title is missing in API prompt format', () => {
      const workflowJson = {
        '11': {
          class_type: 'CLIPTextEncode',
        },
      }
      const result = resolveNodeMetadata('11', workflowJson)
      expect(result).toEqual({
        id: '11',
        title: 'CLIPTextEncode',
        classType: 'CLIPTextEncode',
      })
    })

    it('TC-UTIL-03: falls back to node.title when _meta is missing', () => {
      const workflowJson = {
        '12': {
          class_type: 'VAEDecode',
          title: 'Output VAE',
        },
      }
      const result = resolveNodeMetadata('12', workflowJson)
      expect(result).toEqual({
        id: '12',
        title: 'Output VAE',
        classType: 'VAEDecode',
      })
    })

    it('TC-UTIL-04: extracts metadata from UI graph format (array in workflow.nodes)', () => {
      const workflowJson = {
        nodes: [
          {
            id: 15,
            type: 'PrimitiveNode',
            title: 'Seed Value',
          },
        ],
      }
      const result = resolveNodeMetadata('15', workflowJson)
      expect(result).toEqual({
        id: '15',
        title: 'Seed Value',
        classType: 'PrimitiveNode',
      })
    })

    it('TC-UTIL-05: returns empty metadata for non-existent node ID', () => {
      const workflowJson = {}
      const result = resolveNodeMetadata('999', workflowJson)
      expect(result).toEqual({
        id: '999',
        title: '',
        classType: '',
      })
    })

    it('TC-UTIL-06: safely handles null or undefined workflowJson', () => {
      expect(resolveNodeMetadata('10', null)).toEqual({
        id: '10',
        title: '',
        classType: '',
      })
      expect(resolveNodeMetadata('10', undefined)).toEqual({
        id: '10',
        title: '',
        classType: '',
      })
    })

    it('TC-RED-01: matches string ID against numeric ID in UI graph format', () => {
      const workflowJson = {
        nodes: [
          {
            id: 42,
            type: 'CheckpointLoaderSimple',
            _meta: { title: 'Base Checkpoint' },
          },
        ],
      }
      const result = resolveNodeMetadata('42', workflowJson)
      expect(result).toEqual({
        id: '42',
        title: 'Base Checkpoint',
        classType: 'CheckpointLoaderSimple',
      })
    })

    it('TC-RED-02: safely handles corrupt or malformed node entries', () => {
      const workflowJson = {
        '10': null,
        nodes: [null, undefined, { id: 20 }],
      }
      expect(resolveNodeMetadata('10', workflowJson as any)).toEqual({
        id: '10',
        title: '',
        classType: '',
      })
      expect(resolveNodeMetadata('20', workflowJson as any)).toEqual({
        id: '20',
        title: '',
        classType: '',
      })
    })
  })

  describe('getNodeLabel', () => {
    it('TC-UTIL-01: formats label with both title and classType', () => {
      const workflowJson = {
        '10': {
          class_type: 'KSampler',
          _meta: { title: 'Main KSampler' },
        },
      }
      expect(getNodeLabel('10', workflowJson)).toBe('10 - [Main KSampler] (KSampler)')
    })

    it('TC-UTIL-02: formats label with classType fallback title', () => {
      const workflowJson = {
        '11': {
          class_type: 'CLIPTextEncode',
        },
      }
      expect(getNodeLabel('11', workflowJson)).toBe('11 - [CLIPTextEncode] (CLIPTextEncode)')
    })

    it('TC-UTIL-03: formats label with direct node.title and classType', () => {
      const workflowJson = {
        '12': {
          class_type: 'VAEDecode',
          title: 'Output VAE',
        },
      }
      expect(getNodeLabel('12', workflowJson)).toBe('12 - [Output VAE] (VAEDecode)')
    })

    it('TC-UTIL-04: formats label from UI graph node', () => {
      const workflowJson = {
        nodes: [
          {
            id: 15,
            type: 'PrimitiveNode',
            title: 'Seed Value',
          },
        ],
      }
      expect(getNodeLabel('15', workflowJson)).toBe('15 - [Seed Value] (PrimitiveNode)')
    })

    it('TC-UTIL-05: returns raw ID if node is not found', () => {
      expect(getNodeLabel('999', {})).toBe('999')
    })

    it('TC-UTIL-06: returns raw ID if workflowJson is null or undefined', () => {
      expect(getNodeLabel('10', null)).toBe('10')
      expect(getNodeLabel('10', undefined)).toBe('10')
    })

    it('TC-RED-01: handles numeric ID string matching', () => {
      const workflowJson = {
        nodes: [
          {
            id: 100,
            type: 'SaveImage',
            title: 'Final Output',
          },
        ],
      }
      expect(getNodeLabel('100', workflowJson)).toBe('100 - [Final Output] (SaveImage)')
    })
  })

  describe('REQ-358/RANK', () => {
    it('scores stage affinity including shared Detailer names without crossing recommendation bands', () => {
      const result = rankWorkflowNodeCandidates({
        face: { class_type: 'Sampler', title: 'Face Detailer' },
        hand: { class_type: 'Sampler', title: 'Hand Detailer' },
        unrelated: { class_type: 'Sampler', title: 'XYZ' },
        exact: { class_type: 'Sampler', title: 'Main Sampler' },
        normalized: { class_type: 'Sampler', title: 'main_sampler' },
        parameter: { class_type: 'Other', inputs: { seed: 1 }, title: 'Face Detailer' },
        other: { class_type: 'Other', title: 'Face Detailer' },
      }, { expectedClassTypes: ['Sampler'], titlePatterns: ['Main Sampler'], paramNames: ['seed'] }, 'FaceDetailer', ['FaceDetailer', 'HandDetailer', 'Main'])
      expect(result.map((x) => x.id)).toEqual(['exact', 'normalized', 'face', 'hand', 'unrelated', 'parameter', 'other'])
      expect(result.every((x) => x.score! >= 0 && x.score! <= 100)).toBe(true)
      expect(result.every((x, i) => i === 0 || result[i - 1].score! >= x.score!)).toBe(true)
      expect(result.find((x) => x.id === 'hand')!.score).toBeGreaterThan(result.find((x) => x.id === 'unrelated')!.score!)
      expect(result.find((x) => x.id === 'face')!.score).toBeGreaterThan(result.find((x) => x.id === 'hand')!.score!)
    })

    it('prefers the current stage over raw-exact spelling and treats normalized title variants equally', () => {
      const result = rankWorkflowNodeCandidates({
        hand: { class_type: 'Sampler', title: 'Hand Detailer' },
        face: { class_type: 'Sampler', title: 'face_detailer' },
        exact: { class_type: 'Sampler', title: 'Face Detailer' },
      }, { expectedClassTypes: ['Sampler'], titlePatterns: ['Face Detailer', 'Hand Detailer'], paramNames: [] }, 'FaceDetailer', ['FaceDetailer', 'HandDetailer'])
      expect(result.map((x) => x.id)).toEqual(['exact', 'face', 'hand'])
      expect(result[0].score).toBe(result[1].score)
      expect(result[1].score).toBeGreaterThan(result[2].score!)
      expect(result.every((x) => x.recommended)).toBe(true)
    })

    it('gives equivalent normalized stage titles equal scores and uses IDs to break ties', () => {
      const result = rankWorkflowNodeCandidates({
        b: { class_type: 'Sampler', title: 'face_detailer' },
        a: { class_type: 'Sampler', title: 'FaceDetailer' },
        c: { class_type: 'Sampler', title: 'Face-Detailer' },
      }, { expectedClassTypes: ['Sampler'], titlePatterns: [], paramNames: [] }, 'Face Detailer', ['Face Detailer'])
      expect(result.map((x) => x.id)).toEqual(['a', 'b', 'c'])
      expect(new Set(result.map((x) => x.score)).size).toBe(1)
    })
    const definition = {
      expectedClassTypes: ['Sampler'],
      titlePatterns: ['Main Sampler', 'Sampler', 'Upscaler Sampler', 'FaceDetailer Sampler'],
      paramNames: ['seed'],
    }
    const ranked = (titles: string[], stage = 'Main', stages = ['Main', 'Upscaler', 'FaceDetailer']) =>
      rankWorkflowNodeCandidates(Object.fromEntries(titles.map((title, i) => [String(i + 1), {
        class_type: 'Sampler', _meta: { title }, inputs: { seed: 1 },
      }])), definition, stage, stages)

    it('[REQ-358/AC-1] keeps all nodes available and sorts by tier, stage rank, then id', () => {
      const result = rankWorkflowNodeCandidates({
        '9': { class_type: 'Other', inputs: {} },
        '2': { class_type: 'Sampler', _meta: { title: 'Main_Sampler' }, inputs: {} },
        '1': { class_type: 'Sampler', _meta: { title: 'Main Sampler' }, inputs: {} },
        '3': { class_type: 'Sampler', _meta: { title: 'Unknown' }, inputs: {} },
        '8': { class_type: 'Other', inputs: { seed: 1 } },
      }, definition, 'Main', ['Main', 'Upscaler'])
      expect(result.map(({ id, tier, recommended }) => [id, tier, recommended])).toEqual([
        ['1', 0, true], ['2', 1, true], ['3', 2, false], ['8', 3, false], ['9', 4, false],
      ])
    })

    it('[REQ-358/AC-2] reads API prompts, node dictionaries, and UI node arrays', () => {
      const cases = [
        { '1': { class_type: 'Sampler', _meta: { title: 'Main Sampler' }, inputs: {} } },
        { nodes: { '1': { class_type: 'Sampler', _meta: { title: 'Main Sampler' }, inputs: {} } } },
        { nodes: [{ id: 1, type: 'Sampler', title: 'Main Sampler', inputs: {} }] },
      ]
      for (const graph of cases) expect(rankWorkflowNodeCandidates(graph, definition, 'Main', ['Main'])[0].tier).toBe(0)
    })

    it('[REQ-358/AC-3] matches parameter names from object keys or named arrays', () => {
      const result = rankWorkflowNodeCandidates({
        a: { class_type: 'Other', inputs: { seed: 5 } },
        b: { class_type: 'Other', inputs: [{ name: 'seed', value: 5 }] },
      }, definition, 'Main', ['Main'])
      expect(result.map((candidate) => candidate.tier)).toEqual([3, 3])
    })

    it('[REQ-358/AC-4] assigns stage rank for Main candidates', () => {
      expect(ranked(['Main Sampler', 'Sampler', 'Upscaler Sampler']).map((x) => x.stageRank)).toEqual([0, 1, 2])
    })

    it('[REQ-358/AC-5] assigns stage rank for Upscaler candidates', () => {
      expect(ranked(['Upscaler Sampler', 'Sampler', 'Main Sampler'], 'Upscaler').map((x) => x.stageRank)).toEqual([0, 1, 2])
    })

    it('[REQ-358/AC-6] assigns stage rank for FaceDetailer candidates', () => {
      const result = ranked(['FaceDetailer Sampler', 'SAMPLER', 'Main Sampler'], 'FaceDetailer')
      expect(Object.fromEntries(result.map((x) => [x.title, x.stageRank]))).toEqual({
        'FaceDetailer Sampler': 0, 'Main Sampler': 2, SAMPLER: 1,
      })
    })

    it('[REQ-358/AC-7] uses continuous normalized stage containment only', () => {
      const title = 'Face\tDetailer-Sampler'
      expect(ranked([title], 'Face Detailer', ['Face Detailer'])[0].stageRank).toBe(0)
      expect(ranked(['FaceDetailer Sampler'], 'Face Detailer', ['Face Detailer'])[0].stageRank).toBe(0)
      expect(ranked(['Face Detailer Sampler'], 'Face Detailer', ['Face Detailer'])[0].stageRank).toBe(1)
      expect(ranked(['Face　Detailer Sampler'], 'Face Detailer', ['Face Detailer'])[0].stageRank).toBe(1)
      expect(ranked(['Face—Detailer Sampler'], 'Face Detailer', ['Face Detailer'])[0].stageRank).toBe(1)
    })

    it('[REQ-358/AC-8] keeps non-recommended tiers at stage rank 1 and node id order', () => {
      const result = rankWorkflowNodeCandidates({
        '10': { class_type: 'Other', inputs: {} },
        '2': { class_type: 'Other', inputs: {} },
      }, definition, 'Main', ['Main'])
      expect(result.map(({ id, tier, stageRank }) => [id, tier, stageRank])).toEqual([
        ['10', 4, 1], ['2', 4, 1],
      ])
    })

    it('[REQ-358/AC-9] prefers current stage even when another registered stage also matches', () => {
      const result = rankWorkflowNodeCandidates({ a: {
        class_type: 'Sampler', _meta: { title: 'Main Upscaler Sampler' }, inputs: {},
      } }, { ...definition, titlePatterns: ['Main Upscaler Sampler'] }, 'Main', ['Main', 'Upscaler'])
      expect(result[0].stageRank).toBe(0)
    })

    it('[REQ-358/AC-10] never gives an empty current stage rank zero', () => {
      expect(ranked(['Sampler'], '', ['Main', 'Upscaler'])[0].stageRank).toBe(1)
      expect(ranked(['Main Sampler'], '_-', ['Main', 'Upscaler'])[0].stageRank).toBe(2)
    })

    it('[REQ-358/AC-11] treats a title without a stage match as unknown', () => {
      expect(ranked(['Sampler'], 'Main', ['Main'])[0].stageRank).toBe(1)
    })

    it('[REQ-358/AC-12] does not mutate the workflow and is independent of object insertion order', () => {
      fc.assert(fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 40 }), { minLength: 1 }), (ids) => {
        const makeGraph = (order: number[]) => Object.fromEntries(order.map((id) => [String(id), {
          class_type: 'Sampler', _meta: { title: id % 2 ? 'Main Sampler' : 'Upscaler Sampler' }, inputs: { seed: id },
        }]))
        const before = makeGraph(ids)
        const snapshot = structuredClone(before)
        const forward = rankWorkflowNodeCandidates(before, definition, 'Main', ['Main', 'Upscaler'])
        const reverse = rankWorkflowNodeCandidates(makeGraph([...ids].reverse()), definition, 'Main', ['Main', 'Upscaler'])
        expect(forward).toEqual(reverse)
        expect(new Set(forward.map((x) => x.id)).size).toBe(ids.length)
        expect(before).toEqual(snapshot)
      }), { numRuns: 100 })
    })

    it('[REQ-358/AC-36] does not infer a Main stage from Main (V2)', () => {
      expect(ranked(['Main Sampler'], 'Main (V2)', ['Main (V2)'])[0].stageRank).toBe(1)
    })

    it('[REQ-358/AC-37] normalizes stage case, whitespace, underscore, and hyphen', () => {
      expect(ranked(['FaceDetailer Sampler'], 'face_detailer', ['Face Detailer'])[0].stageRank).toBe(0)
    })

    it('[REQ-358/AC-38] checks current stage before another matching stage', () => {
      const result = rankWorkflowNodeCandidates({ a: {
        class_type: 'Sampler', _meta: { title: 'Main Upscaler Sampler' }, inputs: {},
      } }, { ...definition, titlePatterns: ['Main Upscaler Sampler'] }, 'Main', ['Upscaler'])
      expect(result[0].stageRank).toBe(0)
    })
  })
})
