import { useQuery } from '@tanstack/react-query'
import { mappingMastersApi } from '../api/client'
import { stageMastersApi } from '../api/domains/stageMasters'
import type { MappingMaster, MappingMasterV2, StageMaster, WorkflowMapping } from '../utils/mappingStageGroups'
import { groupMappingsByStage } from '../utils/mappingStageGroups'

export function useMappingStageGroups(
  mappings: readonly WorkflowMapping[],
  masters?: readonly (MappingMaster | MappingMasterV2)[],
  enabled = true,
) {
  const stageQuery = useQuery({
    queryKey: ['stage-masters'],
    queryFn: () => stageMastersApi.list(true),
    enabled,
  })
  const masterQuery = useQuery({
    queryKey: ['mapping-masters'],
    queryFn: () => mappingMastersApi.list() as Promise<(MappingMaster | MappingMasterV2)[]>,
    enabled: enabled && masters === undefined,
  })

  const resolvedMasters = masters ?? masterQuery.data ?? []
  const resolvedStages: readonly StageMaster[] = stageQuery.data ?? []

  return enabled
    ? groupMappingsByStage(mappings, resolvedMasters, resolvedStages)
    : []
}
