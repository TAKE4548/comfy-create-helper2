import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Modal } from './common/Modal';

export type WorkflowManageModalProps = {
  mode: 'rename' | 'copy';
  currentName: string;
  onSubmit: (newName: string) => Promise<void>;
  onClose: () => void;
  isPending: boolean;
};

export function WorkflowManageModal({
  mode,
  currentName,
  onSubmit,
  onClose,
  isPending: parentPending,
}: WorkflowManageModalProps) {
  const defaultName = mode === 'copy' ? `${currentName}_copy` : currentName;
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [localPending, setLocalPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isPending = parentPending || localPending;

  useEffect(() => {
    // Focus the input when mounted
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('名前を入力してください');
      return;
    }
    setError(null);
    setLocalPending(true);
    try {
      await onSubmit(trimmed);
    } catch (err: any) {
      const errMsg = err.message || '';
      if (errMsg.includes('409') || errMsg.toLowerCase().includes('conflict') || errMsg.includes('already exists')) {
        setError('その名前はすでに使われています');
      } else {
        setError(errMsg || 'エラーが発生しました');
      }
    } finally {
      setLocalPending(false);
    }
  };

  const title = mode === 'rename' ? 'ワークフロー名の変更' : 'ワークフローのコピー';
  const label = mode === 'rename' ? '新しい名前' : 'コピー名';
  const submitText = mode === 'rename' ? '保存' : 'コピーを作成';

  return (
    <Modal isOpen onClose={onClose} size="sm" ariaLabel={title} sheetMaxHeightClass="max-h-[85dvh]">
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 pt-2 md:pt-6 pb-3">
        <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          aria-label="閉じる"
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] touch-manipulation text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-white/5 transition-all"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 px-4 md:px-6 pb-4 md:pb-6">
        <div>
          <label className="block text-xs font-medium text-zinc-450 mb-1.5">
            {label}
          </label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            disabled={isPending}
            className="w-full min-h-[44px] md:min-h-0 bg-zinc-900/60 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent-green/40 focus:ring-1 focus:ring-accent-green/20 disabled:opacity-50 transition-all"
            placeholder="名前を入力してください"
          />
          {error && (
            <p className="mt-1.5 text-xs text-red-400 font-medium animate-fade-in">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="min-h-[44px] md:min-h-0 touch-manipulation px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-white/5 disabled:opacity-50 transition-all border border-transparent"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={isPending || !name.trim()}
            className="flex items-center gap-2 min-h-[44px] md:min-h-0 touch-manipulation px-4 py-2 text-xs font-semibold text-zinc-950 bg-accent-green hover:bg-accent-green-hover disabled:opacity-40 rounded-lg disabled:cursor-not-allowed transition-all"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            {submitText}
          </button>
        </div>
      </form>
    </Modal>
  );
}
