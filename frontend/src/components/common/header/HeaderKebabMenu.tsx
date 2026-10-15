import { useState, useRef, useEffect } from 'react'
import { MoreVertical, RefreshCw, Settings, Database } from 'lucide-react'
import { useBrowserStorageUsage } from '../../../hooks/useBrowserStorageUsage'
import { formatStorageUsage } from '../../../utils/browserStorageUsage'

export interface HeaderKebabMenuProps {
  onResyncCache?: () => void
}

export function HeaderKebabMenu({ onResyncCache }: HeaderKebabMenuProps = {}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const storage = useBrowserStorageUsage()

  useEffect(() => {
    if (!isOpen) return
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
    }
  }, [isOpen])

  const handleResync = () => {
    if (onResyncCache) {
      onResyncCache()
    } else {
      window.dispatchEvent(new CustomEvent('cache-resync'))
    }
    setIsOpen(false)
  }

  return (
    <div className="relative inline-flex items-center" ref={menuRef} style={{ zIndex: 10 }}>
      <button
        type="button"
        id="header-kebab-btn"
        data-testid="header-kebab-menu-button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="ヘッダーメニュー"
        aria-expanded={isOpen}
        className="group relative inline-flex items-center justify-center w-11 h-11 -m-2 md:w-[28px] md:h-[28px] md:m-0 touch-manipulation"
      >
        <span
          data-testid="header-kebab-menu-visual"
          className="w-[28px] h-[28px] flex items-center justify-center rounded-md border border-zinc-800 bg-surface-2/60 text-zinc-400 group-hover:text-zinc-200 group-hover:border-zinc-700 transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </span>
      </button>

      {isOpen && (
        <div
          data-testid="header-kebab-dropdown"
          className="absolute right-0 top-full mt-1.5 w-[270px] p-3 rounded-lg border border-zinc-800 bg-surface-1/95 backdrop-blur-md shadow-2xl z-20 text-xs text-zinc-300"
        >
          {/* Storage usage estimation section */}
          <div className="pb-2.5 mb-2.5 border-b border-zinc-800">
            <div className="flex items-center gap-1.5 text-zinc-400 mb-1.5 font-medium">
              <Database className="w-3.5 h-3.5" />
              <span>ストレージ使用量</span>
              <span className="text-[10px] text-zinc-500 font-normal">(推定値 / Estimate Only)</span>
            </div>
            <div className="space-y-1 font-mono text-[11px] text-zinc-300 pl-5">
              <div className="flex justify-between">
                <span className="text-zinc-400">LocalStorage:</span>
                <span>{formatStorageUsage(storage.localStorage)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">SessionStorage:</span>
                <span>{formatStorageUsage(storage.sessionStorage)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-1">
            <button
              type="button"
              data-testid="resync-cache-button"
              onClick={handleResync}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover:bg-surface-2 text-zinc-300 hover:text-zinc-100 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
              <span>キャッシュ再同期</span>
            </button>

            <a
              href="/settings"
              data-testid="header-settings-link"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover:bg-surface-2 text-zinc-300 hover:text-zinc-100 transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-zinc-400" />
              <span>設定</span>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}