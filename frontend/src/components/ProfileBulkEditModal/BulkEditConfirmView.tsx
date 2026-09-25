import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

export interface BulkEditConfirmViewProps {
  count: number;
  isApplying?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const BulkEditConfirmView: React.FC<BulkEditConfirmViewProps> = ({
  count,
  isApplying = false,
  onCancel,
  onConfirm,
}) => {
  return (
    <div className="modal-backdrop">
      <div
        className="relative w-full max-w-sm bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-2xl p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} className="text-amber-400 flex-shrink-0" />
          <h3 className="text-base font-semibold text-white">一括編集の確認</h3>
        </div>
        <p className="text-sm text-gray-400 leading-relaxed">
          選択した <span className="text-white font-semibold">{count} 件</span>
          のプリセットに変更を適用します。<br />
          <span className="text-amber-400 font-medium">この操作は取り消せません。</span>
        </p>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 text-sm text-gray-400 hover:text-white border border-[rgba(255,255,255,0.1)] rounded-lg hover:bg-white/5 transition-all"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isApplying}
            className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold text-[#18181C] bg-[#3ECF8E] hover:bg-[#34b279] rounded-lg transition-all disabled:opacity-50"
          >
            {isApplying && <Loader2 size={14} className="animate-spin" />}
            適用する
          </button>
        </div>
      </div>
    </div>
  );
};
