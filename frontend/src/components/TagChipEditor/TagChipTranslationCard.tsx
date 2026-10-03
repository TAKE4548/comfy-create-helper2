import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Copy, Check, RefreshCw, GripHorizontal } from 'lucide-react';
import { translateApi } from '../../api/client';

export interface TagChipTranslationCardProps {
  text: string;
  onClose: () => void;
  anchorRect?: DOMRect | null;
}

const CARD_WIDTH = 320;
const CARD_HEIGHT_CLAMP = 200;

export const TagChipTranslationCard: React.FC<TagChipTranslationCardProps> = ({
  text,
  onClose,
  anchorRect,
}) => {
  const clampPos = useCallback((x: number, y: number) => {
    const maxX = Math.max(0, window.innerWidth - CARD_WIDTH);
    const maxY = Math.max(0, window.innerHeight - CARD_HEIGHT_CLAMP);
    return {
      x: Math.min(Math.max(0, x), maxX),
      y: Math.min(Math.max(0, y), maxY),
    };
  }, []);

  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    if (anchorRect) {
      let top = anchorRect.bottom + 8;
      if (top + CARD_HEIGHT_CLAMP > window.innerHeight && anchorRect.top - (CARD_HEIGHT_CLAMP + 8) >= 0) {
        top = anchorRect.top - (CARD_HEIGHT_CLAMP + 8);
      }
      return clampPos(anchorRect.left, top);
    }
    return clampPos(
      (window.innerWidth - CARD_WIDTH) / 2,
      (window.innerHeight - CARD_HEIGHT_CLAMP) / 2
    );
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ pointerX: number; pointerY: number; cardX: number; cardY: number }>({
    pointerX: 0,
    pointerY: 0,
    cardX: 0,
    cardY: 0,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState('');
  const [copied, setCopied] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);

  // Resize clamping
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => clampPos(prev.x, prev.y));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPos]);

  // Dragging handlers with Pointer Events
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    dragRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      cardX: position.x,
      cardY: position.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragRef.current.pointerX;
    const deltaY = e.clientY - dragRef.current.pointerY;
    setPosition(clampPos(dragRef.current.cardX + deltaX, dragRef.current.cardY + deltaY));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
      setIsDragging(false);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
      setIsDragging(false);
    }
  };

  // Translation fetching
  const fetchTranslation = useCallback(async (promptText: string) => {
    if (!promptText || !promptText.trim()) {
      setTranslatedText('');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await translateApi.translatePrompt({
        prompt: promptText,
        source_lang: 'en',
        target_lang: 'ja',
        repack: false,
      });
      setTranslatedText(res.translated_prompt);
    } catch (err: any) {
      setError(err?.message || '和訳の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTranslation(text);
  }, [text, fetchTranslation]);

  // Clipboard copy
  const handleCopy = async () => {
    if (!translatedText) return;
    try {
      await navigator.clipboard.writeText(translatedText);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (e) {
      console.error('Failed to copy translation', e);
    }
  };

  // Close triggers: Escape key & Outside click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [onClose]);

  return (
    <div
      ref={cardRef}
      data-testid="translation-card"
      className="fixed z-[100] w-[320px] bg-[#18181C] border border-[rgba(255,255,255,0.15)] rounded-lg shadow-2xl overflow-hidden flex flex-col text-xs text-zinc-200 select-none"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      {/* Header bar */}
      <div
        data-testid="translation-card-header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="flex items-center justify-between px-3 py-2 bg-[#202026] border-b border-[rgba(255,255,255,0.08)] cursor-move select-none touch-none"
      >
        <div className="flex items-center gap-1.5 text-zinc-400 font-medium">
          <GripHorizontal size={14} className="text-zinc-500" />
          <span>和訳プレビュー</span>
        </div>
        <div
          className="flex items-center gap-1 cursor-default select-none"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleCopy}
            disabled={!translatedText || isLoading}
            aria-label="コピー"
            className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {copied ? (
              <Check size={12} className="text-emerald-400" data-testid="check-icon" />
            ) : (
              <Copy size={12} className="text-zinc-400" data-testid="copy-icon" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 rounded transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Content container */}
      <div
        data-testid="translation-card-content"
        onPointerDown={(e) => e.stopPropagation()}
        className="p-3 max-h-[160px] overflow-y-auto select-text font-sans text-xs text-zinc-100 leading-relaxed"
      >
        {isLoading ? (
          <div className="flex items-center gap-2 text-zinc-400 py-2">
            <RefreshCw size={13} className="animate-spin text-zinc-400" />
            <span>和訳を取得中...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col gap-2 py-1 text-zinc-300">
            <div className="text-xs text-rose-400 break-words">{error}</div>
            <button
              type="button"
              onClick={() => fetchTranslation(text)}
              className="self-start px-2 py-1 text-xs bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-200 rounded transition-colors flex items-center gap-1.5"
            >
              <RefreshCw size={11} />
              <span>再試行</span>
            </button>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {translatedText || '訳文がありません'}
          </div>
        )}
      </div>
    </div>
  );
};
