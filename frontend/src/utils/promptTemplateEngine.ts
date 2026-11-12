import type {
  PromptOutputGroup,
  PromptTemplateSection,
  PromptTemplateStructure,
  WorkflowPromptTemplateConfig,
} from '../api/types'
import {
  parseToChips,
  chipsToString,
  splitTags,
  type TagChip,
} from '../components/TagChipEditor/useChipParser'

export const PROMPT_TEMPLATE_STATE_KEY = '__prompt_template_state_v1'

export interface PromptTemplateInstanceState {
  instanceId: string
  blocks: Record<string, TagChip[]> // includes enabled: true and enabled: false chips
}

export interface PromptTemplatePresetState {
  version: 1
  templateId: number | null
  sections: Record<string, { instances: PromptTemplateInstanceState[] }>
}

export interface SanitizedPromptTemplateRecord {
  version: 1
  template_id: number | null
  template_snapshot: PromptTemplateStructure
  sections: Array<{
    section_id: string
    section_name: string
    is_repeatable: boolean
    instances: Array<{
      instance_index: number
      blocks: Array<{
        block_id: string
        block_label: string
        value: string
      }>
    }>
  }>
}

/**
 * Check whether a workflow prompt template configuration is active.
 * Active if output_groups is non-empty and either template_id or template_snapshot sections exist.
 */
export function isWorkflowTemplateActive(config?: WorkflowPromptTemplateConfig | null): boolean {
  if (!config) return false
  const hasOutputGroups = Array.isArray(config.output_groups) && config.output_groups.length > 0
  const hasTemplate =
    config.template_id != null ||
    (Array.isArray(config.template_snapshot?.sections) && config.template_snapshot.sections.length > 0)
  return Boolean(hasOutputGroups && hasTemplate)
}

/**
 * Normalize prompt segment:
 * Trims leading/trailing whitespace and commas, removes empty comma-separated tokens,
 * and joins with ", ". If raw is empty or commas only, returns "".
 */
export function normalizePromptSegment(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''
  const tags = splitTags(raw)
  const cleanTags = tags
    .map((t) => t.trim().replace(/^[\s,]+|[\s,]+$/g, '').trim())
    .filter((t) => t.length > 0)
  return cleanTags.join(', ')
}

/**
 * Formats enabled block chips:
 * Filters out chips with enabled === false, formats non-disabled chips into a prompt string,
 * and normalizes via normalizePromptSegment. Returns "" if all chips are disabled or empty.
 */
export function formatEnabledBlockChips(chips: TagChip[] | undefined): string {
  if (!chips || !Array.isArray(chips) || chips.length === 0) return ''
  const enabledChips = chips.filter((c) => c && c.enabled !== false)
  if (enabledChips.length === 0) return ''
  const rawJoined = enabledChips.map((c) => c.text).join(', ')
  return normalizePromptSegment(rawJoined)
}

/**
 * Join prompt output group according to structure, preset state, and repeat filter.
 * Chunks continuous blockIds belonging to the same section.
 * - Non-repeatable sections: evaluate instances[0]
 * - Repeatable sections:
 *   - mode === 'index': evaluate only instances[(repeat_filter.index ?? 1) - 1].
 *     If instance does not exist, safely skips without error or extra commas (AC-10).
 *   - mode === 'all': evaluate instances 0..N-1 in order.
 * Skips empty and disabled blocks. Ensures no leading, trailing, or double commas (AC-6, AC-10).
 */
export function joinOutputGroup(
  structure: PromptTemplateStructure,
  state: PromptTemplatePresetState,
  group: PromptOutputGroup
): string {
  if (
    !structure ||
    !Array.isArray(structure.sections) ||
    !state ||
    !state.sections ||
    !group ||
    !Array.isArray(group.block_ids)
  ) {
    return ''
  }

  const blockIdToSection = new Map<string, PromptTemplateSection>()
  for (const sec of structure.sections) {
    if (Array.isArray(sec.blocks)) {
      for (const blk of sec.blocks) {
        blockIdToSection.set(blk.id, sec)
      }
    }
  }

  const chunks: Array<{ section: PromptTemplateSection; blockIds: string[] }> = []
  for (const blkId of group.block_ids) {
    const section = blockIdToSection.get(blkId)
    if (!section) continue

    const lastChunk = chunks[chunks.length - 1]
    if (lastChunk && lastChunk.section.id === section.id) {
      lastChunk.blockIds.push(blkId)
    } else {
      chunks.push({ section, blockIds: [blkId] })
    }
  }

  const segments: string[] = []

  for (const chunk of chunks) {
    const section = chunk.section
    const secState = state.sections[section.id]
    const instances = secState?.instances ?? []

    if (!section.is_repeatable) {
      const instance = instances[0]
      if (instance && instance.blocks) {
        for (const blkId of chunk.blockIds) {
          const val = formatEnabledBlockChips(instance.blocks[blkId])
          if (val.length > 0) {
            segments.push(val)
          }
        }
      }
    } else {
      const mode = group.repeat_filter?.mode ?? 'all'
      if (mode === 'index') {
        const targetIndex = group.repeat_filter?.index ?? 1
        if (targetIndex >= 1 && targetIndex <= instances.length) {
          const instance = instances[targetIndex - 1]
          if (instance && instance.blocks) {
            for (const blkId of chunk.blockIds) {
              const val = formatEnabledBlockChips(instance.blocks[blkId])
              if (val.length > 0) {
                segments.push(val)
              }
            }
          }
        }
        // If target instance does not exist, safely skips (AC-10)
      } else {
        // mode === 'all'
        for (const instance of instances) {
          if (instance && instance.blocks) {
            for (const blkId of chunk.blockIds) {
              const val = formatEnabledBlockChips(instance.blocks[blkId])
              if (val.length > 0) {
                segments.push(val)
              }
            }
          }
        }
      }
    }
  }

  return segments.join(', ')
}

/**
 * Compute joined values for all output groups, returning a map of target_role -> joined string.
 */
export function computeAllOutputGroupValues(
  structure: PromptTemplateStructure,
  state: PromptTemplatePresetState,
  outputGroups: PromptOutputGroup[]
): Record<string, string> {
  const result: Record<string, string> = {}
  if (!outputGroups || !Array.isArray(outputGroups)) return result
  for (const group of outputGroups) {
    if (!group.target_role) continue
    result[group.target_role] = joinOutputGroup(structure, state, group)
  }
  return result
}

/**
 * Create a default preset state with 1 instance per section from the given structure.
 */
export function createDefaultPresetState(
  structure?: PromptTemplateStructure | null,
  templateId?: number | null
): PromptTemplatePresetState {
  const sections: Record<string, { instances: PromptTemplateInstanceState[] }> = {}
  if (structure?.sections && Array.isArray(structure.sections)) {
    for (const sec of structure.sections) {
      const blocks: Record<string, TagChip[]> = {}
      if (Array.isArray(sec.blocks)) {
        for (const blk of sec.blocks) {
          blocks[blk.id] = blk.default_value ? parseToChips(blk.default_value) : []
        }
      }
      sections[sec.id] = {
        instances: [
          {
            instanceId: `${sec.id}-1`,
            blocks,
          },
        ],
      }
    }
  }
  return {
    version: 1,
    templateId: templateId ?? null,
    sections,
  }
}

/**
 * Serialize preset state to JSON string (preserves enabled: false chips, AC-7).
 */
export function serializePresetState(state: PromptTemplatePresetState): string {
  return JSON.stringify(state)
}

/**
 * Parse preset state from raw JSON string, preserving enabled: false chips (AC-7).
 * If raw is undefined or invalid, falls back to default state and optionally populates
 * fallback values for target roles into the first block of corresponding output groups.
 */
export function parsePresetState(
  raw: string | undefined,
  structure?: PromptTemplateStructure | null,
  fallbackRoleValues?: Record<string, string>,
  outputGroups?: PromptOutputGroup[]
): PromptTemplatePresetState {
  if (raw && typeof raw === 'string' && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.version === 1 && parsed.sections && typeof parsed.sections === 'object') {
        return parsed as PromptTemplatePresetState
      }
    } catch {
      // fallback
    }
  }

  const defaultState = createDefaultPresetState(structure)

  if (fallbackRoleValues && outputGroups && structure?.sections) {
    for (const group of outputGroups) {
      const fallbackVal = fallbackRoleValues[group.target_role]
      if (
        typeof fallbackVal === 'string' &&
        fallbackVal.trim().length > 0 &&
        Array.isArray(group.block_ids) &&
        group.block_ids.length > 0
      ) {
        const firstBlockId = group.block_ids[0]
        for (const sec of structure.sections) {
          if (Array.isArray(sec.blocks) && sec.blocks.some((b) => b.id === firstBlockId)) {
            const instance = defaultState.sections[sec.id]?.instances[0]
            if (instance && (!instance.blocks[firstBlockId] || instance.blocks[firstBlockId].length === 0)) {
              instance.blocks[firstBlockId] = parseToChips(fallbackVal)
            }
            break
          }
        }
      }
    }
  }

  return defaultState
}

/**
 * Build sanitized template record for generation history and snapshots.
 * Contains ONLY enabled chip text; completely excludes disabled chips (AC-8).
 */
export function buildSanitizedTemplateRecord(
  structure: PromptTemplateStructure,
  state: PromptTemplatePresetState,
  templateId?: number | null
): SanitizedPromptTemplateRecord {
  const sections: SanitizedPromptTemplateRecord['sections'] = []

  if (structure?.sections && Array.isArray(structure.sections)) {
    for (const sec of structure.sections) {
      const secState = state?.sections?.[sec.id]
      const instances = secState?.instances ?? []
      const recordInstances: SanitizedPromptTemplateRecord['sections'][0]['instances'] = []

      for (let idx = 0; idx < instances.length; idx++) {
        const inst = instances[idx]
        const recordBlocks: Array<{ block_id: string; block_label: string; value: string }> = []

        if (Array.isArray(sec.blocks)) {
          for (const blk of sec.blocks) {
            const chips = inst.blocks?.[blk.id]
            const val = formatEnabledBlockChips(chips)
            recordBlocks.push({
              block_id: blk.id,
              block_label: blk.label,
              value: val,
            })
          }
        }

        recordInstances.push({
          instance_index: idx + 1,
          blocks: recordBlocks,
        })
      }

      sections.push({
        section_id: sec.id,
        section_name: sec.name,
        is_repeatable: sec.is_repeatable,
        instances: recordInstances,
      })
    }
  }

  return {
    version: 1,
    template_id: templateId ?? state.templateId ?? null,
    template_snapshot: structure,
    sections,
  }
}

/**
 * Restore preset state from a sanitized record (snapshot restoration).
 * All restored chips have enabled: true (AC-8).
 */
export function restorePresetStateFromSanitizedRecord(
  record: SanitizedPromptTemplateRecord
): PromptTemplatePresetState {
  const sections: Record<string, { instances: PromptTemplateInstanceState[] }> = {}

  if (record?.sections && Array.isArray(record.sections)) {
    for (const sec of record.sections) {
      const instances: PromptTemplateInstanceState[] = []
      if (Array.isArray(sec.instances)) {
        for (const inst of sec.instances) {
          const blocks: Record<string, TagChip[]> = {}
          if (Array.isArray(inst.blocks)) {
            for (const blk of inst.blocks) {
              blocks[blk.block_id] = blk.value ? parseToChips(blk.value) : []
            }
          }
          instances.push({
            instanceId: `${sec.section_id}-${inst.instance_index}`,
            blocks,
          })
        }
      }
      sections[sec.section_id] = { instances }
    }
  }

  return {
    version: 1,
    templateId: record?.template_id ?? null,
    sections,
  }
}

/**
 * Add a new repeat instance to a repeatable section.
 */
export function addRepeatInstance(
  state: PromptTemplatePresetState,
  sectionId: string,
  structure?: PromptTemplateStructure | null
): PromptTemplatePresetState {
  const currentSection = state.sections[sectionId] ?? { instances: [] }
  const newIndex = currentSection.instances.length + 1
  const sectionDef = structure?.sections?.find((s) => s.id === sectionId)

  const blocks: Record<string, TagChip[]> = {}
  if (sectionDef?.blocks) {
    for (const blk of sectionDef.blocks) {
      blocks[blk.id] = blk.default_value ? parseToChips(blk.default_value) : []
    }
  }

  const newInstance: PromptTemplateInstanceState = {
    instanceId: `${sectionId}-${newIndex}-${Date.now()}`,
    blocks,
  }

  return {
    ...state,
    sections: {
      ...state.sections,
      [sectionId]: {
        instances: [...currentSection.instances, newInstance],
      },
    },
  }
}

/**
 * Remove a repeat instance from a section without leaving empty slots (AC-5).
 */
export function removeRepeatInstance(
  state: PromptTemplatePresetState,
  sectionId: string,
  instanceIndex: number
): PromptTemplatePresetState {
  const currentSection = state.sections[sectionId]
  if (!currentSection || !Array.isArray(currentSection.instances)) return state
  if (instanceIndex < 0 || instanceIndex >= currentSection.instances.length) return state

  const updated = [...currentSection.instances]
  updated.splice(instanceIndex, 1)

  return {
    ...state,
    sections: {
      ...state.sections,
      [sectionId]: {
        instances: updated,
      },
    },
  }
}

/**
 * Update chips for a single block in a specific instance (AC-5).
 */
export function updateBlockChips(
  state: PromptTemplatePresetState,
  sectionId: string,
  instanceIndex: number,
  blockId: string,
  chips: TagChip[]
): PromptTemplatePresetState {
  const currentSection = state.sections[sectionId]
  if (!currentSection || !Array.isArray(currentSection.instances)) return state
  if (instanceIndex < 0 || instanceIndex >= currentSection.instances.length) return state

  const updatedInstances = currentSection.instances.map((inst, idx) => {
    if (idx !== instanceIndex) return inst
    return {
      ...inst,
      blocks: {
        ...inst.blocks,
        [blockId]: chips,
      },
    }
  })

  return {
    ...state,
    sections: {
      ...state.sections,
      [sectionId]: {
        instances: updatedInstances,
      },
    },
  }
}

export { parseToChips as parsePromptToChips, chipsToString as chipsToPrompt }
