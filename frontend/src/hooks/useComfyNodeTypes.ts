import { useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { comfyApi } from '../api/client'

export interface UseComfyNodeTypesResult {
  classNames: string[]
  isLoading: boolean
  isError: boolean
  filterClassTypes: (query: string, exclude?: string[]) => string[]
}

export function useComfyNodeTypes(): UseComfyNodeTypesResult {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['comfy-object-info-all'],
    queryFn: () => comfyApi.getObjectInfoAll(),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  })

  const classNames = useMemo<string[]>(() => {
    if (!data || typeof data !== 'object') {
      return []
    }
    return Object.keys(data).sort((a, b) => a.localeCompare(b))
  }, [data])

  const filterClassTypes = useCallback(
    (query: string, exclude: string[] = []): string[] => {
      const trimmed = query.trim()
      if (!trimmed) {
        return []
      }

      const excludeSet = new Set(exclude)
      const candidateNames = classNames.filter((name) => !excludeSet.has(name))

      const lowerQuery = trimmed.toLowerCase()
      const prefixMatches: string[] = []
      const partialMatches: string[] = []

      for (const name of candidateNames) {
        const lowerName = name.toLowerCase()
        if (lowerName.startsWith(lowerQuery)) {
          prefixMatches.push(name)
        } else if (lowerName.includes(lowerQuery)) {
          partialMatches.push(name)
        }
      }

      return [...prefixMatches, ...partialMatches].slice(0, 15)
    },
    [classNames]
  )

  return {
    classNames,
    isLoading,
    isError,
    filterClassTypes,
  }
}
