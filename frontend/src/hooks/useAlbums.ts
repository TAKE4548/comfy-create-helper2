import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { albumsApi } from '../api/client'
import { STALE_TIMES } from '../constants/staleTimes'
import type { AlbumSummary } from '../api/types'

export function useAlbums(enabled: boolean = true) {
  const query = useQuery<AlbumSummary[]>({
    queryKey: ['albums'],
    queryFn: () => albumsApi.list() as Promise<AlbumSummary[]>,
    staleTime: STALE_TIMES.ALBUMS,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    enabled,
  })

  const albumMap = useMemo(() => {
    const map = new Map<number, string>()
    if (query.data) {
      for (const album of query.data) {
        map.set(album.id, album.name)
      }
    }
    return map
  }, [query.data])

  const getAlbumName = (id: number | null | undefined): string | null => {
    if (id == null) return null
    return albumMap.get(id) ?? null
  }

  return {
    ...query,
    albums: query.data ?? [],
    albumMap,
    getAlbumName,
  }
}
