/**
 * Computes a mapping from output slot indices to input slot names
 * for a given ComfyUI node schema info.
 */
function computeOutputToInputMapping(nodeInfo: any): Record<number, string> {
  const mapping: Record<number, string> = {}
  if (!nodeInfo) return mapping

  const outputs: string[] = nodeInfo.output || []
  const inputs: Record<string, string> = {}

  const inputConfig = nodeInfo.input || {}
  const inputSources = [inputConfig.required, inputConfig.optional]
  for (const source of inputSources) {
    if (source) {
      for (const [key, value] of Object.entries(source)) {
        if (Array.isArray(value) && typeof value[0] === 'string') {
          inputs[key] = value[0]
        }
      }
    }
  }

  const matchedInputs = new Set<string>()
  for (let outIdx = 0; outIdx < outputs.length; outIdx++) {
    const outType = outputs[outIdx]
    let foundSlot: string | null = null
    for (const [inName, inType] of Object.entries(inputs)) {
      if (inType === outType && !matchedInputs.has(inName)) {
        foundSlot = inName
        break
      }
    }
    if (foundSlot !== null) {
      mapping[outIdx] = foundSlot
      matchedInputs.add(foundSlot)
    }
  }
  return mapping
}

/**
 * Applies bypass logic to the given workflow for specified nodes using
 * order-independent transitive link resolution.
 *
 * @param workflow The original workflow object.
 * @param bypassedNodeIds List of node IDs to bypass.
 * @param comfyObjectInfo Object containing class type information for ComfyUI nodes.
 * @returns A new workflow object with specified nodes bypassed and connections safely rewired.
 */
export function applyBypass(
  workflow: Record<string, any>,
  bypassedNodeIds: string[],
  comfyObjectInfo: any
): Record<string, any> {
  const wf = JSON.parse(JSON.stringify(workflow || {}))
  if (!bypassedNodeIds || bypassedNodeIds.length === 0) return wf

  // 1. スキーマが存在し、かつワークフロー内に存在するノードのみをバイパス対象として抽出
  const validBypassSet = new Set<string>()
  const nodeMappings: Record<string, Record<number, string>> = {}

  for (const nodeId of bypassedNodeIds) {
    const node = wf[nodeId]
    if (!node) continue

    const classType = node.class_type
    const nodeInfo = comfyObjectInfo?.[classType]
    if (!nodeInfo) {
      console.warn(
        `[applyBypass] Schema info for node class '${classType}' not found. Skipping bypass for this node to prevent connection corruption.`
      )
      continue
    }

    validBypassSet.add(nodeId)
    nodeMappings[nodeId] = computeOutputToInputMapping(nodeInfo)
  }

  if (validBypassSet.size === 0) return wf

  // 2. 全ノードの inputs を走査し、バイパス対象ノードへの接続を推移的に解決
  for (const key of Object.keys(wf)) {
    if (validBypassSet.has(key)) continue
    const otherNode = wf[key]
    if (!otherNode || !otherNode.inputs) continue

    for (const inputSlot of Object.keys(otherNode.inputs)) {
      let currentConn = otherNode.inputs[inputSlot]
      const visited = new Set<string>()

      while (
        Array.isArray(currentConn) &&
        currentConn.length === 2 &&
        typeof currentConn[0] === 'string' &&
        validBypassSet.has(currentConn[0])
      ) {
        const targetNodeId = currentConn[0]
        const outputIndex = currentConn[1]

        if (visited.has(targetNodeId)) {
          // 循環参照検出時は切断
          currentConn = null
          break
        }
        visited.add(targetNodeId)

        const targetNode = wf[targetNodeId]
        const mapping = nodeMappings[targetNodeId] || {}
        const mappedInputSlotName = mapping[outputIndex]

        if (mappedInputSlotName !== undefined && targetNode?.inputs) {
          const sourceConn = targetNode.inputs[mappedInputSlotName]
          if (Array.isArray(sourceConn) && sourceConn.length === 2) {
            currentConn = sourceConn
          } else {
            currentConn = null
            break
          }
        } else {
          currentConn = null
          break
        }
      }

      if (currentConn !== null) {
        otherNode.inputs[inputSlot] = currentConn
      } else {
        delete otherNode.inputs[inputSlot]
      }
    }
  }

  // 3. 有効なバイパス対象ノードを削除
  for (const nodeId of validBypassSet) {
    delete wf[nodeId]
  }

  return wf
}
