import React, { useState } from 'react'
import { X, Languages, Copy, Check, ArrowRight, CornerDownLeft, RefreshCw, AlertCircle } from 'lucide-react'
import { Modal } from '../../../components/common/Modal'

export interface PromptTranslationModalProps {
  isOpen: boolean
  onClose: () => void
  roleDisplayName: string
  mode: 'en_to_ja' | 'ja_to_en'
  onModeChange: (mode: 'en_to_ja' | 'ja_to_en') => void
  sourceText: string
  onSourceTextChange: (text: string) => void
  translatedText: string
  meta: {
    total_chunks: number
    cached_chunks: number
    api_requested_chunks: number
    billed_characters: number
    provider?: string
  } | null
  isTranslating: boolean
  error: string | null
  onTranslate: () => void
  onApply: (mode: 'append' | 'replace') => void
}

export const PromptTranslationModal: React.FC<PromptTranslationModalProps> = ({
  isOpen,
  onClose,
  roleDisplayName,
  mode,
  onModeChange,
  sourceText,
  onSourceTextChange,
  translatedText,
  meta,
  isTranslating,
  error,
  onTranslate,
  onApply,
}) => {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const handleCopy = () => {
    if (!translatedText) return
    navigator.clipboard.writeText(translatedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSourceKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || !event.ctrlKey) return

    event.preventDefault()
    event.stopPropagation()
    if (event.nativeEvent.isComposing || event.repeat || isTranslating || !sourceText.trim()) return

    onTranslate()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      ariaLabel="プロンプト翻訳"
      closeOnBackdropClick={false}
      closeOnEsc={false}
      dialogClassName="bg-surface overflow-hidden"
    >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-2">
            <Languages size={18} className="text-[#7C6FDD]" />
            <h3 className="text-sm font-semibold text-zinc-100">
              プロンプト翻訳: <span className="text-[#7C6FDD]">{roleDisplayName}</span>
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-200 p-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-[rgba(255,255,255,0.06)] bg-surface-2/50 px-4 pt-2 gap-2">
          <button
            type="button"
            onClick={() => onModeChange('en_to_ja')}
            className={`min-h-[44px] px-3 py-1.5 text-xs font-medium border-b-2 transition-all ${
              mode === 'en_to_ja'
                ? 'border-[#7C6FDD] text-[#7C6FDD]'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            英 → 日 (意味の確認)
          </button>
          <button
            type="button"
            onClick={() => onModeChange('ja_to_en')}
            className={`min-h-[44px] px-3 py-1.5 text-xs font-medium border-b-2 transition-all ${
              mode === 'ja_to_en'
                ? 'border-[#7C6FDD] text-[#7C6FDD]'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            日 → 英 (作成・追記)
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-900/30 border border-red-800/50 flex items-center gap-2 text-xs text-red-200">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Source input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400">
                {mode === 'en_to_ja' ? '英語原文 (対象プロンプト)' : '日本語入力 (自由入力)'}
              </label>
              <button
                type="button"
                onClick={() => onTranslate()}
                disabled={isTranslating || !sourceText.trim()}
                className="min-h-[44px] flex items-center gap-1.5 px-3 py-1 bg-[#7C6FDD] hover:bg-[#7C6FDD]/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded shadow-sm transition-all"
              >
                {isTranslating ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : (
                  <ArrowRight size={12} />
                )}
                <span>{isTranslating ? '翻訳中...' : '翻訳する'}</span>
              </button>
            </div>
            <textarea
              value={sourceText}
              onChange={(e) => onSourceTextChange(e.target.value)}
              onKeyDown={handleSourceKeyDown}
              placeholder={
                mode === 'en_to_ja'
                  ? '英語プロンプトを入力または自動セット...'
                  : '例: 青い空、白いワンピースを着た金髪の少女、微笑み'
              }
              rows={4}
              className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#7C6FDD]/50 resize-y custom-scrollbar"
            />
          </div>

          {/* Translation Result */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400">
                {mode === 'en_to_ja' ? '日本語訳 (プレビュー)' : '英語翻訳結果'}
              </label>
              {translatedText && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {copied ? <Check size={12} className="text-accent-green" /> : <Copy size={12} />}
                  <span>{copied ? 'コピー完了' : 'コピー'}</span>
                </button>
              )}
            </div>

            <div className="min-h-[80px] p-2.5 bg-surface-2/60 border border-[rgba(255,255,255,0.06)] rounded-lg text-xs text-zinc-200 whitespace-pre-wrap select-text custom-scrollbar">
              {translatedText ? (
                translatedText
              ) : (
                <span className="text-zinc-500 italic">
                  {isTranslating ? '翻訳結果を取得中...' : '翻訳ボタンを押すとここに結果が表示されます'}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons for ja_to_en */}
          {mode === 'ja_to_en' && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
              <button
                type="button"
                onClick={() => onApply('replace')}
                disabled={!translatedText.trim()}
                className="min-h-[44px] px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-all"
              >
                プロンプトを上書き
              </button>
              <button
                type="button"
                onClick={() => onApply('append')}
                disabled={!translatedText.trim()}
                className="min-h-[44px] px-3.5 py-1.5 flex items-center gap-1 bg-accent-green hover:bg-accent-green/80 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-medium rounded-lg shadow-sm transition-all"
              >
                <CornerDownLeft size={13} />
                <span>末尾に追記</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer with metadata */}
        {meta && (
          <div className="px-4 py-2 bg-surface-2 border-t border-[rgba(255,255,255,0.06)] text-[11px] text-zinc-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-zinc-300">{meta.provider || 'google_cloud'}</span>
              <span>•</span>
              <span>
                全 {meta.total_chunks} チャンク (キャッシュ: {meta.cached_chunks} / API要求:{' '}
                {meta.api_requested_chunks})
              </span>
            </div>
            <span>API消費: {meta.billed_characters} 文字</span>
          </div>
        )}
    </Modal>
  )
}
