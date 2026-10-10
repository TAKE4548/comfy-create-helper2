import { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronDown, Loader2, BookOpen, Plus } from 'lucide-react'
import { useAlbums } from '../hooks/useAlbums'
import { Modal } from './common/Modal'

interface AddSnapshotToAlbumModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (data: { albumId: number | null; newAlbumName?: string }) => Promise<void> | void
  isPending?: boolean
  confirmText?: string
  title?: string
  allowNone?: boolean
  storageKey?: string
}

export function AddSnapshotToAlbumModal({
  isOpen,
  onClose,
  onConfirm,
  isPending = false,
  confirmText = '保存',
  title = 'スナップショットをアルバムに追加',
  allowNone = true,
  storageKey,
}: AddSnapshotToAlbumModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | 'new' | ''>(allowNone ? '' : 'new')
  const [newAlbumName, setNewAlbumName] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const { albums, isLoading } = useAlbums(isOpen)

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
      if (storageKey) {
        const saved = localStorage.getItem(storageKey)
        if (saved === '' || saved === 'none') {
          setSelectedAlbumId(allowNone ? '' : 'new')
        } else if (saved !== null && !isNaN(Number(saved)) && Number(saved) > 0) {
          setSelectedAlbumId(Number(saved))
        } else {
          setSelectedAlbumId(allowNone ? '' : 'new')
        }
      } else {
        setSelectedAlbumId(allowNone ? '' : 'new')
      }
      setNewAlbumName('')
      setSearchQuery('')
      setIsDropdownOpen(false)
      setSubmitError(null)
      setIsSubmitting(false)
    }
  }, [isOpen, allowNone, storageKey])

  // アルバム存在確認とフォールバック
  useEffect(() => {
    if (isOpen && albums && albums.length > 0 && typeof selectedAlbumId === 'number') {
      const exists = albums.some((a) => a.id === selectedAlbumId)
      if (!exists) {
        setSelectedAlbumId(allowNone ? '' : 'new')
      }
    }
  }, [isOpen, albums, selectedAlbumId, allowNone])

  if (!isOpen) return null

  const filteredAlbums = albums?.filter((album) =>
    album.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  const handleSelectAlbum = (value: number | 'new' | '') => {
    setSelectedAlbumId(value)
    setIsDropdownOpen(false)
    setSearchQuery('')
  }

  const handleClose = () => {
    if (isPending || isSubmitting) return
    onClose()
  }

  const handleConfirm = async () => {
    if (isPending || isSubmitting || (selectedAlbumId === 'new' && !newAlbumName.trim())) return
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      await onConfirm({
        albumId: typeof selectedAlbumId === 'number' ? selectedAlbumId : null,
        newAlbumName: selectedAlbumId === 'new' ? newAlbumName.trim() : undefined,
      })
      if (storageKey) {
        if (typeof selectedAlbumId === 'number') localStorage.setItem(storageKey, String(selectedAlbumId))
        else if (selectedAlbumId === '') localStorage.setItem(storageKey, '')
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'アルバムへの追加に失敗しました。')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Determine label for the selector trigger button
  const getSelectorLabel = () => {
    if (selectedAlbumId === '') return 'アルバムを選択しない (None)'
    if (selectedAlbumId === 'new') return '新規アルバム作成 (Create New Album)'
    const matched = albums?.find((a) => a.id === selectedAlbumId)
    return matched ? matched.name : `アルバム (ID: ${selectedAlbumId})`
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="sm"
      ariaLabel={title}
      dialogClassName="p-5 sm:p-6 space-y-5 relative"
    >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-200">{title}</h3>
          <button
            id="close-add-album-modal-btn"
            aria-label="閉じる"
            disabled={isPending || isSubmitting}
            onClick={handleClose}
            className="min-h-11 min-w-11 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors p-1"
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
              disabled={isPending || isSubmitting}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="min-h-11 w-full bg-surface border border-[rgba(255,255,255,0.08)] rounded-lg px-3.5 py-2.5 text-sm text-zinc-300 flex items-center justify-between hover:border-zinc-700 transition-all text-left focus:outline-none"
            >
              <span className="truncate flex items-center gap-2">
                <BookOpen size={15} className="text-zinc-500 flex-shrink-0" />
                {getSelectorLabel()}
              </span>
              <ChevronDown size={16} className="text-zinc-500 flex-shrink-0" />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-[calc(100%+4px)] left-0 w-full z-50 bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg shadow-xl overflow-hidden flex flex-col max-h-96 animate-fade-in">
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
                    disabled={isPending || isSubmitting}
                    className="min-h-11 w-full bg-transparent border-none text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none"
                  />
                </div>

                <div className="overflow-y-auto custom-scrollbar p-1.5 space-y-1 max-h-80">
                  {/* None Option */}
                  {allowNone && (
                    <button
                      type="button"
                      disabled={isPending || isSubmitting}
                      onClick={() => handleSelectAlbum('')}
                      className={`min-h-11 w-full text-left px-3 py-2 text-xs rounded-md transition-colors ${
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
                    disabled={isPending || isSubmitting}
                    onClick={() => handleSelectAlbum('new')}
                    className={`min-h-11 w-full flex items-center gap-2 text-left px-3 py-2 text-xs rounded-md transition-colors ${
                      selectedAlbumId === 'new'
                        ? 'bg-accent-green/10 text-accent-green font-medium'
                        : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Plus size={14} aria-hidden="true" />
                    <span>新規アルバム作成 (Create New Album)</span>
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
                        disabled={isPending || isSubmitting}
                        onClick={() => handleSelectAlbum(album.id)}
                        className={`min-h-11 w-full text-left px-3 py-2 text-xs rounded-md transition-colors truncate ${
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
              <label htmlFor="new-album-name-field" className="text-xs font-medium text-zinc-400">新規アルバム名</label>
              <input
                type="text"
                id="new-album-name-field"
                placeholder="新規アルバム名を入力してください..."
                value={newAlbumName}
                disabled={isPending || isSubmitting}
                onChange={(e) => setNewAlbumName(e.target.value)}
                className="min-h-11 w-full bg-surface border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-accent-green/50 transition-all"
              />
            </div>
          )}
        </div>

        {submitError && <p role="alert" className="text-sm text-red-400">{submitError}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            id="cancel-add-album-modal-btn"
            disabled={isPending || isSubmitting}
            onClick={handleClose}
            className="min-h-11 px-4 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm font-medium hover:bg-white/5 transition-all"
          >
            キャンセル
          </button>
          <button
            id="confirm-add-album-modal-btn"
            onClick={handleConfirm}
            disabled={isPending || isSubmitting || (selectedAlbumId === 'new' && !newAlbumName.trim())}
            className="min-h-11 px-5 py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-40 transition-all glow-green flex items-center gap-2"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            {isPending ? '処理中…' : confirmText}
          </button>
        </div>
    </Modal>
  )
}
