import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, Trash2, Download, BookOpen, ImageOff, X, Plus } from 'lucide-react'
import { snapshotsApi, albumsApi, workflowsApi } from '../api/client'
import type { SnapshotSummary, Album } from '../api/types'

export function HistoryPage() {
  const qc = useQueryClient()
  const [view, setView] = useState<'snapshots' | 'albums'>('snapshots')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [selectedSnap, setSelectedSnap] = useState<number | null>(null)
  const [albumName, setAlbumName] = useState('')
  const [selectedForAlbum, setSelectedForAlbum] = useState<Set<number>>(new Set())
  const [createAlbumMode, setCreateAlbumMode] = useState(false)

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list() as Promise<{ id: number; name: string }[]>,
  })

  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', selectedWorkflowId],
    queryFn: () => snapshotsApi.list(selectedWorkflowId ?? undefined) as Promise<SnapshotSummary[]>,
  })

  const { data: albums } = useQuery({
    queryKey: ['albums'],
    queryFn: () => albumsApi.list() as Promise<Album[]>,
  })

  const deleteSnapshot = useMutation({
    mutationFn: (id: number) => snapshotsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snapshots'] }),
  })

  const createAlbum = useMutation({
    mutationFn: () => albumsApi.create({
      name: albumName,
      snapshot_ids: [...selectedForAlbum],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['albums'] })
      setCreateAlbumMode(false)
      setAlbumName('')
      setSelectedForAlbum(new Set())
    },
  })

  const deleteAlbum = useMutation({
    mutationFn: (id: number) => albumsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['albums'] }),
  })

  const toggleSelectForAlbum = (id: number) => {
    setSelectedForAlbum((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <h1 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
          <Clock size={17} className="text-zinc-400" />
          History
        </h1>
        <div className="flex items-center gap-2">
          {!createAlbumMode && view === 'snapshots' && (
            <button
              id="start-create-album"
              onClick={() => setCreateAlbumMode(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all"
            >
              <BookOpen size={13} />
              New Album
            </button>
          )}
          {/* View Toggle */}
          <div className="flex rounded-lg overflow-hidden border border-[rgba(255,255,255,0.08)]">
            {(['snapshots', 'albums'] as const).map((v) => (
              <button
                key={v}
                id={`view-${v}`}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === v ? 'bg-surface-2 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {v === 'snapshots' ? 'Snapshots' : 'Albums'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Create Album Bar */}
      {createAlbumMode && (
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[rgba(124,111,221,0.3)] bg-[rgba(124,111,221,0.05)] animate-slide-up">
          <BookOpen size={14} className="text-[#7C6FDD] flex-shrink-0" />
          <input
            id="album-name-input"
            value={albumName}
            onChange={(e) => setAlbumName(e.target.value)}
            placeholder="Album name…"
            className="flex-1 bg-transparent text-sm text-zinc-200 focus:outline-none placeholder-zinc-600"
          />
          <span className="text-xs text-zinc-500">{selectedForAlbum.size} selected</span>
          <button
            id="save-album-btn"
            onClick={() => createAlbum.mutate()}
            disabled={!albumName || selectedForAlbum.size === 0 || createAlbum.isPending}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#7C6FDD] text-white font-medium disabled:opacity-50 transition-all"
          >
            Save Album
          </button>
          <button onClick={() => { setCreateAlbumMode(false); setSelectedForAlbum(new Set()) }}>
            <X size={16} className="text-zinc-500" />
          </button>
        </div>
      )}

      {/* Workflow Filter (snapshots only) */}
      {view === 'snapshots' && (
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[rgba(255,255,255,0.06)] bg-surface/30">
          <select
            id="history-workflow-filter"
            value={selectedWorkflowId ?? ''}
            onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
            className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/40"
          >
            <option value="">All Workflows</option>
            {workflows?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <span className="text-xs text-zinc-600">{snapshots?.length ?? 0} snapshots</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
        {view === 'snapshots' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {snapshots?.map((snap) => (
              <div
                key={snap.id}
                id={`snap-card-${snap.id}`}
                className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                  createAlbumMode && selectedForAlbum.has(snap.id)
                    ? 'border-[#7C6FDD] ring-1 ring-[#7C6FDD]/30'
                    : selectedSnap === snap.id
                      ? 'border-accent-green'
                      : 'border-transparent hover:border-zinc-700'
                }`}
                onClick={() => createAlbumMode ? toggleSelectForAlbum(snap.id) : setSelectedSnap(snap.id === selectedSnap ? null : snap.id)}
              >
                <div className="aspect-square bg-surface-2">
                  {snap.image_path ? (
                    <img src={snap.image_path} alt={`Snapshot ${snap.id}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <ImageOff size={20} strokeWidth={1} />
                    </div>
                  )}
                </div>
                <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  {snap.image_path && (
                    <a
                      href={snap.image_path}
                      download
                      id={`snap-download-${snap.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-md bg-surface/80 text-zinc-300 hover:text-white"
                    >
                      <Download size={12} />
                    </a>
                  )}
                  <button
                    id={`snap-delete-${snap.id}`}
                    onClick={(e) => { e.stopPropagation(); if (confirm('Delete snapshot?')) deleteSnapshot.mutate(snap.id) }}
                    className="p-1.5 rounded-md bg-surface/80 text-zinc-400 hover:text-red-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-xs text-zinc-300">
                    {new Date(snap.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            {(snapshots?.length === 0) && (
              <div className="col-span-full flex flex-col items-center py-20 text-zinc-600">
                <Clock size={40} strokeWidth={1} />
                <p className="mt-3 text-sm">No snapshots yet.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {albums?.map((album) => (
              <div
                key={album.id}
                id={`album-card-${album.id}`}
                className="group rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden hover:border-[rgba(255,255,255,0.1)] transition-all"
              >
                {/* Album thumbnail grid */}
                <div className="grid grid-cols-3 gap-0.5 aspect-[3/1] bg-surface-2">
                  {album.items.slice(0, 3).map((item, i) => (
                    <div key={i} className="bg-surface-2 overflow-hidden">
                      {item.image_path ? (
                        <img src={item.image_path} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-700">
                          <ImageOff size={16} strokeWidth={1} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{album.name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{album.items.length} images</p>
                  </div>
                  <button
                    id={`album-delete-${album.id}`}
                    onClick={() => { if (confirm('Delete album?')) deleteAlbum.mutate(album.id) }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {(albums?.length === 0) && (
              <div className="col-span-full flex flex-col items-center py-20 text-zinc-600">
                <BookOpen size={40} strokeWidth={1} />
                <p className="mt-3 text-sm">No albums yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
