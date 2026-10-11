import { describe, it, expect } from 'vitest'
import { resolveNodeMetadata, getNodeLabel } from '../workflowNodeUtils'

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
})
