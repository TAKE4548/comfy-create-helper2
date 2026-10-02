import type {
  CommonTagOp,
  PresetLoraSlot,
  LoraStackOp,
  BulkEditPayload,
  BuildPayloadParams,
} from './types';
import { parseTagWeight } from './utils';

export type { BuildPayloadParams } from './types';

export function buildBulkEditPayload(p: BuildPayloadParams): BulkEditPayload | null {
  const payload: BulkEditPayload = {};
  const targetFields = p.promptTargetAll ? null : Array.from(p.promptTargetFields);

  if (p.promptOp === 'search_replace') {
    if (p.promptFindText) {
      payload.promptOps = [{
        op: 'search_replace',
        fields: targetFields,
        find: p.promptFindText,
        replace: p.promptReplaceText,
      }];
    }
  } else if (p.promptOp === 'remove_tags') {
    const ops: CommonTagOp[] = [];
    const legacyRemovedTags: string[] = [];

    p.commonTagItems.forEach(item => {
      const isRemoved = !item.enabled || p.tagsToRemove.has(item.text) || p.tagsToRemove.has(item.originalBase);
      if (isRemoved) {
        ops.push({ originalBase: item.originalBase, newFormattedTag: item.text, action: 'remove' });
        legacyRemovedTags.push(item.text);
      } else {
        ops.push({ originalBase: item.originalBase, newFormattedTag: item.text, action: 'update' });
      }
    });

    p.tagsToRemove.forEach(tag => {
      const { base } = parseTagWeight(tag);
      const lowerBase = base.toLowerCase();
      if (!ops.some(o => o.originalBase === lowerBase)) {
        ops.push({ originalBase: lowerBase, newFormattedTag: tag, action: 'remove' });
        if (!legacyRemovedTags.includes(tag)) legacyRemovedTags.push(tag);
      }
    });

    const hasModifications = ops.some(o => o.action === 'remove' || o.action === 'update');
    if (hasModifications || legacyRemovedTags.length > 0) {
      payload.promptOps = [{
        op: 'remove_tags',
        fields: targetFields,
        tags: legacyRemovedTags.length > 0 ? legacyRemovedTags : Array.from(p.tagsToRemove),
        commonTagOps: ops,
      }];
    }

    if (p.subsetPresetIds) {
      payload.targetPresetIds = Array.from(p.subsetPresetIds);
    }
  } else {
    if (p.promptValue) {
      payload.promptOps = [{
        op: p.promptOp,
        fields: targetFields ?? p.textareaRoles.map(m => m.role),
        value: p.promptValue,
      }];
    }
  }

  if (p.assetOps.length > 0) payload.assetOps = p.assetOps;

  const loraStackRoleSet = new Set(p.loraRoles.map(m => m.role));
  const filteredParams: Record<string, string> = {};
  p.enabledParams.forEach((role) => {
    if (!loraStackRoleSet.has(role) && p.paramPatch[role] !== undefined && p.paramPatch[role] !== '') {
      filteredParams[role] = p.paramPatch[role];
    }
  });
  if (Object.keys(filteredParams).length > 0) payload.paramPatch = filteredParams;
  if (p.batchSizeEnabled && p.batchSizeInput !== '') {
    const n = parseInt(p.batchSizeInput, 10);
    if (!isNaN(n) && n > 0) payload.batchSize = n;
  }

  const loraOpsList: LoraStackOp[] = [];
  p.loraRoles.forEach((m) => {
    if (!p.enabledParams.has(m.role)) return;
    const mode = p.loraStackModes[m.role] || 'differential';
    if (mode === 'overwrite') {
      const cnt = parseInt(p.paramPatch[`${m.role}_lora_count`] || '0', 10);
      const slots: PresetLoraSlot[] = [];
      for (let i = 1; i <= cnt; i++) {
        slots.push({
          name: p.paramPatch[`${m.role}_lora_name_${i}`] ?? '',
          weight: p.paramPatch[`${m.role}_lora_wt_${i}`] ?? '0.0',
          modelStrength: p.paramPatch[`${m.role}_model_str_${i}`] ?? '1.0',
          clipStrength: p.paramPatch[`${m.role}_clip_str_${i}`] ?? '1.0',
        });
      }
      loraOpsList.push({ role: m.role, mode: 'overwrite', slots });
    } else {
      loraOpsList.push({
        role: m.role,
        mode: 'differential',
        commonOps: p.commonLoraOps[m.role] ?? [],
        addSlots: p.addLoraSlots[m.role] ?? [],
      });
    }
  });
  if (loraOpsList.length > 0) payload.loraStackOps = loraOpsList;

  return Object.keys(payload).length > 0 ? payload : null;
}
