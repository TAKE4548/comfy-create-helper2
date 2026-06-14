import { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronDown, Loader2, BookOpen } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { albumsApi } from '../api/client'
import type { AlbumSummary } from '../api/types'

interface AddSnapshotToAlbumModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (data: { albumId: number | null; newAlbumName?: string }) => Promise<void> | void
  isPending?: boolean
  confirmText?: string
  title?: string
  allowNone?: boolean
}

export function AddSnapshotToAlbumModal({
  isOpen,
  onClose,
  onConfirm,
  isPending = false,
  confirmText = '保存',
  title = 'スナップショットをアルバムに追加',
  allowNone = true,
}: AddSnapshotToAlbumModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | 'new' | ''>(allowNone ? '' : 'new')
  const [newAlbumName, setNewAlbumName] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const { data: albums, isLoading } = useQuery<AlbumSummary[]>({
    queryKey: ['albums'],
    queryFn: () => albumsApi.list() as Promise<AlbumSummary[]>,
    enabled: isOpen,
  })

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (isDropdownOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isDropdownOpen])

  // Initialize selection when opening
  useEffect(() => {
    if (isOpen) {
      setSelectedAlbumId(allowNone ? '' : 'new')
      setNewAlbumName('')
      setSearchQuery('')
      setIsDropdownOpen(false)
    }
  }, [isOpen, allowNone])

  if (!isOpen) return null

  const filteredAlbums = albums?.filter((album) =>
    album.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  const handleSelectAlbum = (value: number | 'new' | '') => {
    setSelectedAlbumId(value)
    setIsDropdownOpen(false)
    setSearchQuery('')
  }

  const handleConfirm = () => {
    if (selectedAlbumId === 'new' && !newAlbumName.trim()) return
    onConfirm({
      albumId: typeof selectedAlbumId === 'number' ? selectedAlbumId : null,
      newAlbumName: selectedAlbumId === 'new' ? newAlbumName.trim() : undefined,
    })
  }

  // Determine label for the selector trigger button
  const getSelectorLabel = () => {
    if (selectedAlbumId === '') return 'アルバムを選択しない (None)'
    if (selectedAlbumId === 'new') return '新規アルバム作成 (Create New Album)'
    const matched = albums?.find((a) => a.id === selectedAlbumId)
    return matched ? matched.name : `アルバム (ID: ${selectedAlbumId})`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-2xl p-6 space-y-5 shadow-2xl relative animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-200">{title}</h3>
          <button
            id="close-add-album-modal-btn"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Dropdown Selector */}
          <div className="space-y-1.5 relative" ref={dropdownRef}>
            <label className="text-xs font-medium text-zinc-400">保存先アルバム</label>
            <button
              type="button"
              id="album-selector-trigger"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full bg-surface border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-300 flex items-center justify-between hover:border-zinc-700 transition-all text-left focus:outline-none"
            >
              <span className="truncate flex items-center gap-2">
                <BookOpen size={14} className="text-zinc-500 flex-shrink-0" />
                {getSelectorLabel()}
              </span>
              <ChevronDown size={16} className="text-zinc-500 flex-shrink-0" />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-[calc(100%+4px)] left-0 w-full z-50 bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg shadow-xl overflow-hidden flex flex-col max-h-60 animate-fade-in">
                {/* Search Box */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(255,255,255,0.06)] bg-surface/50">
                  <Search size={14} className="text-zinc-500 flex-shrink-0" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    id="album-search-input"
                    placeholder="アルバム名を検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border-none text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none"
                  />
                </div>

                <div className="overflow-y-auto custom-scrollbar p-1 space-y-0.5">
                  {/* None Option */}
                  {allowNone && (
                    <button
                      type="button"
                      onClick={() => handleSelectAlbum('')}
                      className={`w-full text-left px-3 py-2 text-xs rounded-md transition-colors ${
                        selectedAlbumId === ''
                          ? 'bg-accent-green/10 text-accent-green font-medium'
                          : 'text-zinc-400 hover:bg-white/5'
                      }`}
                    >
                      アルバムを選択しない (None)
                    </button>
                  )}

                  {/* Create New Album Option */}
                  <button
                    type="button"
                    onClick={() => handleSelectAlbum('new')}
                    className={`w-full text-left px-3 py-2 text-xs rounded-md transition-colors ${
                      selectedAlbumId === 'new'
                        ? 'bg-accent-green/10 text-accent-green font-medium'
                        : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    + 新規アルバム作成 (Create New Album)
                  </button>

                  {/* Separator */}
                  <div className="h-[1px] bg-[rgba(255,255,255,0.06)] my-1" />

                  {/* Existing Albums */}
                  {isLoading ? (
                    <div className="flex items-center justify-center py-4 gap-2 text-zinc-500 text-xs">
                      <Loader2 size={12} className="animate-spin text-accent-green" />
                      <span>読み込み中...</span>
                    </div>
                  ) : filteredAlbums.length > 0 ? (
                    filteredAlbums.map((album) => (
                      <button
                        key={album.id}
                        type="button"
                        onClick={() => handleSelectAlbum(album.id)}
                        className={`w-full text-left px-3 py-2 text-xs rounded-md transition-colors truncate ${
                          selectedAlbumId === album.id
                            ? 'bg-accent-green/10 text-accent-green font-medium'
                            : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {album.name}
                      </button>
                    ))
                  ) : (
                    <div className="text-zinc-600 text-[11px] italic text-center py-3">
                      該当するアルバムがありません
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* New Album Name Input */}
          {selectedAlbumId === 'new' && (
            <div className="space-y-1.5 animate-slide-up">
              <label className="text-xs font-medium text-zinc-400">新規アルバム名</label>
              <input
                type="text"
                id="new-album-name-field"
                placeholder="新規アルバム名を入力してください..."
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                className="w-full bg-surface border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-accent-green/50 transition-all"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            id="cancel-add-album-modal-btn"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm font-medium hover:bg-white/5 transition-all"
          >
            キャンセル
          </button>
          <button
            id="confirm-add-album-modal-btn"
            onClick={handleConfirm}
            disabled={isPending || (selectedAlbumId === 'new' && !newAlbumName.trim())}
            className="px-5 py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-40 transition-all glow-green flex items-center gap-2"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            {isPending ? '処理中…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
