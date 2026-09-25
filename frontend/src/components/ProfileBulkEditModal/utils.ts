import type { WorkflowPreset } from '../../api/types';
import type { PresetLoraSlot } from './types';
import { DEFAULT_SAMPLERS, DEFAULT_SCHEDULERS } from '../../pages/GeneratePage/components/ParamPanel';

export function parseTagWeight(tag: string): { base: string; weight: number | null; isParenthesized: boolean } {
  const trimmed = tag.trim();
  const weightedMatch = trimmed.match(/^\(\s*(.+?)\s*:\s*([0-9.]+)\s*\)$/);
  if (weightedMatch) {
    return {
      base: weightedMatch[1].trim(),
      weight: parseFloat(weightedMatch[2]),
      isParenthesized: true,
    };
  }
  const parenMatch = trimmed.match(/^\((.+?)\)$/);
  if (parenMatch) {
    return {
      base: parenMatch[1].trim(),
      weight: null,
      isParenthesized: true,
    };
  }
  return {
    base: trimmed,
    weight: null,
    isParenthesized: false,
  };
}

export function formatTagWithWeight(base: string, weight: number | null): string {
  if (weight === null || isNaN(weight) || weight === 1.0) {
    return base;
  }
  return `(${base}:${weight})`;
}

// 選択中プリセットおよび選択された対象プロンプトロールから共通するタグを抽出する純粋関数
export function computeCommonTags(
  presets: WorkflowPreset[],
  targetRoles: string[]
): string[] {
  if (presets.length === 0 || targetRoles.length === 0) return [];

  // 各プリセットについて、選択された対象ロール内のタグを抽出して (base名小文字 -> 元の文字列表現) Map 化
  const presetTagMaps: Map<string, string>[] = presets.map((preset) => {
    const map = new Map<string, string>();
    targetRoles.forEach((role) => {
      const val = preset.param_values?.[role];
      if (typeof val === 'string' && val.trim()) {
        val
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .forEach((t) => {
            const { base } = parseTagWeight(t);
            const lowerBase = base.toLowerCase();
            if (!map.has(lowerBase)) {
              map.set(lowerBase, t);
            }
          });
      }
    });
    return map;
  });

  // 全てのプリセットに含まれるタグ（積集合）を算出
  const firstMap = presetTagMaps[0];
  if (!firstMap) return [];
  const common: string[] = [];

  firstMap.forEach((originalRepresentation, lowerBase) => {
    const isCommonInAll = presetTagMaps.every((map) => map.has(lowerBase));
    if (isCommonInAll) {
      common.push(originalRepresentation);
    }
  });

  return common;
}

export function computeCommonLoras(presets: WorkflowPreset[], role: string): PresetLoraSlot[] {
  if (!presets || presets.length === 0) return [];

  // For each preset, extract list of lora slots for this role
  const presetSlotLists: PresetLoraSlot[][] = presets.map(p => {
    const vals = p.param_values || {};
    const count = parseInt(vals[`${role}_lora_count`] || '0', 10);
    const slots: PresetLoraSlot[] = [];
    for (let i = 1; i <= count; i++) {
      const name = vals[`${role}_lora_name_${i}`];
      if (name && name.trim()) {
        slots.push({
          name: name.trim(),
          weight: vals[`${role}_lora_wt_${i}`] ?? '1.0',
          modelStrength: vals[`${role}_model_str_${i}`] ?? '1.0',
          clipStrength: vals[`${role}_clip_str_${i}`] ?? '1.0',
        });
      }
    }
    return slots;
  });

  const firstSlots = presetSlotLists[0];
  if (!firstSlots || firstSlots.length === 0) return [];

  const common: PresetLoraSlot[] = [];
  for (const slot of firstSlots) {
    const slotNameLower = slot.name.toLowerCase();
    // Check if slot exists in all other presets
    const isCommon = presetSlotLists.every(list =>
      list.some(s => s.name.toLowerCase() === slotNameLower)
    );
    if (isCommon) {
      common.push(slot);
    }
  }

  return common;
}

export function getSamplerOptions(comfyObjectInfo?: Record<string, any>): string[] {
  const opts = comfyObjectInfo?.KSampler?.input?.required?.sampler_name?.[0] ?? 
               comfyObjectInfo?.KSamplerAdvanced?.input?.required?.sampler_name?.[0];
  return (opts && opts.length > 0) ? opts : DEFAULT_SAMPLERS;
}

export function getSchedulerOptions(comfyObjectInfo?: Record<string, any>): string[] {
  const opts = comfyObjectInfo?.KSampler?.input?.required?.scheduler?.[0] ?? 
               comfyObjectInfo?.KSamplerAdvanced?.input?.required?.scheduler?.[0];
  return (opts && opts.length > 0) ? opts : DEFAULT_SCHEDULERS;
}
