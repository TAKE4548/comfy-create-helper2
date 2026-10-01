import { useQuery } from '@tanstack/react-query'
import { configApi } from '../api/client'
import { STALE_TIMES } from '../constants/staleTimes'
import type { AppConfig } from '../api/types'

export function useConfig() {
  return useQuery<AppConfig>({
    queryKey: ['config'],
    queryFn: () => configApi.get(),
    staleTime: STALE_TIMES.CONFIG,
  })
}
