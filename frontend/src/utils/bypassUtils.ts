/**
 * Applies bypass logic to the given workflow for specified nodes.
 *
 * @param workflow The original workflow object.
 * @param bypassedNodeIds List of node IDs to bypass.
 * @param comfyObjectInfo Object containing class type information for ComfyUI nodes.
 * @returns A new workflow object with specified nodes bypassed.
 */
export function applyBypass(
  workflow: Record<string, any>,
  bypassedNodeIds: string[],
  comfyObjectInfo: any
): Record<string, any> {
  // Deep copy the workflow to avoid mutating the original
  const wf = JSON.parse(JSON.stringify(workflow));

  for (const B of bypassedNodeIds) {
    const node = wf[B];
    if (!node) {
      continue;
    }

    const classType = node.class_type;
    const nodeInfo = comfyObjectInfo?.[classType];
    
    // nodeInfo がない場合は必須入力リンクを誤削除せずスキップする安全ガード
    if (!nodeInfo) {
      console.warn(`[applyBypass] Schema info for node class '${classType}' not found. Skipping bypass for this node to prevent connection corruption.`);
      continue;
    }

    // If we have class type info, try to map output slots to input slots of matching type
    const mapping: Record<number, string> = {};
    if (nodeInfo) {
      const outputs: string[] = nodeInfo.output || [];
      const inputs: Record<string, string> = {};

      const inputConfig = nodeInfo.input || {};
      const inputSources = [inputConfig.required, inputConfig.optional];
      for (const source of inputSources) {
        if (source) {
          for (const [key, value] of Object.entries(source)) {
            if (Array.isArray(value) && typeof value[0] === 'string') {
              inputs[key] = value[0];
            }
          }
        }
      }

      const matchedInputs = new Set<string>();
      for (let outIdx = 0; outIdx < outputs.length; outIdx++) {
        const outType = outputs[outIdx];
        let foundSlot: string | null = null;
        for (const [inName, inType] of Object.entries(inputs)) {
          if (inType === outType && !matchedInputs.has(inName)) {
            foundSlot = inName;
            break;
          }
        }
        if (foundSlot !== null) {
          mapping[outIdx] = foundSlot;
          matchedInputs.add(foundSlot);
        }
      }
    }

    // Traverse all other nodes in the workflow to redirect their inputs
    for (const key of Object.keys(wf)) {
      if (key === B) {
        continue;
      }
      const otherNode = wf[key];
      if (otherNode && otherNode.inputs) {
        for (const inputSlot of Object.keys(otherNode.inputs)) {
          const val = otherNode.inputs[inputSlot];
          if (Array.isArray(val) && val.length === 2 && val[0] === B) {
            const outputIndex = val[1];
            const mappedInputSlotName = mapping[outputIndex];
            
            if (mappedInputSlotName !== undefined && node.inputs) {
              const sourceConnection = node.inputs[mappedInputSlotName];
              if (Array.isArray(sourceConnection) && sourceConnection.length === 2) {
                otherNode.inputs[inputSlot] = sourceConnection;
              } else {
                delete otherNode.inputs[inputSlot];
              }
            } else {
              delete otherNode.inputs[inputSlot];
            }
          }
        }
      }
    }

    // Finally, remove the bypassed node itself
    delete wf[B];
  }

  return wf;
}
