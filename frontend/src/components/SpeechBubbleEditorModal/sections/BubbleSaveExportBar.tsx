import React from 'react'
import { Loader2, Save } from 'lucide-react'

export interface BubbleSaveExportBarProps {
  saveMode: 'new' | 'overwrite'
  setSaveMode: (mode: 'new' | 'overwrite') => void
  targetAlbumId: number | 'new' | ''
  setTargetAlbumId: (id: number | 'new' | '') => void
  newAlbumName: string
  setNewAlbumName: (name: string) => void
  albums: any[]
  isSaving: boolean
  bubblesCount: number
  onClose: () => void
  onSave: () => Promise<void> | void
}

export const BubbleSaveExportBar: React.FC<BubbleSaveExportBarProps> = ({
  saveMode,
  setSaveMode,
  targetAlbumId,
  setTargetAlbumId,
  newAlbumName,
  setNewAlbumName,
  albums,
  isSaving,
  bubblesCount,
  onClose,
  onSave,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[rgba(255,255,255,0.08)]">
      {/* Save Options */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-2 bg-white/5 p-1 rounded-lg border border-zinc-800">
          <label className="text-zinc-400 font-medium px-1">保存方法:</label>
          <button
            type="button"
            data-testid="save-mode-new"
            onClick={() => setSaveMode('new')}
            className={`px-2.5 py-1 rounded transition-colors ${
              saveMode === 'new'
                ? 'bg-accent-green text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            新規保存
          </button>
          <button
            type="button"
            data-testid="save-mode-overwrite"
            onClick={() => setSaveMode('overwrite')}
            className={`px-2.5 py-1 rounded transition-colors ${
              saveMode === 'overwrite'
                ? 'bg-accent-green text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            上書き保存
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-zinc-400 font-medium">保存先アルバム:</label>
          <select
            data-testid="save-album-select"
            value={targetAlbumId}
            onChange={(e) => {
              const val = e.target.value
              if (val === 'new') setTargetAlbumId('new')
              else if (val === '') setTargetAlbumId('')
              else setTargetAlbumId(Number(val))
            }}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green"
          >
            <option value="new">+ 新規アルバムを作成</option>
            <option value="">なし (アルバムに追加しない)</option>
            {albums.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.items?.length ?? 0}件)
              </option>
            ))}
          </select>

          {targetAlbumId === 'new' && (
            <input
              type="text"
              data-testid="new-album-name-input"
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              placeholder="新規アルバム名を入力"
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green"
            />
          )}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-white bg-transparent hover:bg-white/5 border border-zinc-800 hover:border-zinc-700 rounded-lg transition-all"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={() => {
            void onSave()
          }}
          disabled={isSaving || bubblesCount === 0}
          data-testid="speech-bubble-save-btn"
          className="flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-accent-green hover:bg-accent-green-hover rounded-lg transition-all disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {saveMode === 'overwrite' ? '上書き保存' : '新規保存して履歴へ追加'} ({bubblesCount})
        </button>
      </div>
    </div>
  )
}
