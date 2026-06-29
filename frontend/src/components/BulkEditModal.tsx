import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';

export interface BulkEditField {
  key: string;
  label: string;
  type: 'category' | 'strength_range' | 'text' | 'select';
  options?: { id: number | string; name: string }[];
}

export interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  fields: BulkEditField[];
  selectedCount: number;
  onApply: (values: Record<string, unknown>) => void;
  isApplying?: boolean;
}

export function BulkEditModal({
  isOpen,
  onClose,
  fields,
  selectedCount,
  onApply,
  isApplying = false,
}: BulkEditModalProps) {
  const [formValues, setFormValues] = useState<Record<string, any>>({});

  // Initialize values when modal opens
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, any> = {};
      fields.forEach((field) => {
        if (field.type === 'strength_range') {
          initial[`${field.key}_min`] = '';
          initial[`${field.key}_max`] = '';
        } else {
          initial[field.key] = '__NO_CHANGE__';
        }
      });
      setFormValues(initial);
    }
  }, [isOpen, fields]);

  if (!isOpen) return null;

  const handleChange = (key: string, value: any) => {
    setFormValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, any> = {};

    fields.forEach((field) => {
      if (field.type === 'strength_range') {
        const minVal = formValues[`${field.key}_min`];
        const maxVal = formValues[`${field.key}_max`];

        if (minVal !== undefined && minVal !== '') {
          payload[`${field.key}_min`] = Number(minVal);
        }
        if (maxVal !== undefined && maxVal !== '') {
          payload[`${field.key}_max`] = Number(maxVal);
        }
      } else {
        const val = formValues[field.key];
        if (val !== '__NO_CHANGE__') {
          // If the field type is category/select and numeric options are present, convert to number
          if ((field.type === 'category' || field.type === 'select') && val !== '') {
            const num = Number(val);
            payload[field.key] = isNaN(num) ? val : num;
          } else {
            payload[field.key] = val === '' ? null : val;
          }
        }
      }
    });

    onApply(payload);
  };

  return (
    <div className="modal-backdrop">
      <div 
        className="relative w-full max-w-md overflow-hidden bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-2xl transition-all max-h-full lg:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
          <h3 className="text-lg font-semibold text-white">
            一括編集 <span className="text-[#3ECF8E] font-bold">{selectedCount}</span> 件に適用
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
            {fields.map((field) => {
              if (field.type === 'strength_range') {
                return (
                  <div key={field.key} className="space-y-2">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      {field.label}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-gray-500 block mb-1">最小値</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="変更なし"
                          value={formValues[`${field.key}_min`] ?? ''}
                          onChange={(e) => handleChange(`${field.key}_min`, e.target.value)}
                          className="w-full px-3 py-2 text-sm text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-md focus:outline-none focus:border-[#3ECF8E] transition-colors"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 block mb-1">最大値</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="変更なし"
                          value={formValues[`${field.key}_max`] ?? ''}
                          onChange={(e) => handleChange(`${field.key}_max`, e.target.value)}
                          className="w-full px-3 py-2 text-sm text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-md focus:outline-none focus:border-[#3ECF8E] transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                );
              }

              if (field.type === 'category' || field.type === 'select') {
                return (
                  <div key={field.key} className="flex flex-col space-y-2">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      {field.label}
                    </label>
                    <select
                      value={formValues[field.key] ?? '__NO_CHANGE__'}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className="w-full px-3 py-2 text-sm text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-md focus:outline-none focus:border-[#3ECF8E] transition-colors"
                    >
                      <option value="__NO_CHANGE__">（変更しない）</option>
                      <option value="">（未設定 / クリア）</option>
                      {field.options?.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              // Default: text
              return (
                <div key={field.key} className="flex flex-col space-y-2">
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {field.label}
                  </label>
                  <input
                    type="text"
                    placeholder="変更しない"
                    value={formValues[field.key] === '__NO_CHANGE__' ? '' : (formValues[field.key] ?? '')}
                    onChange={(e) => handleChange(field.key, e.target.value || '__NO_CHANGE__')}
                    className="w-full px-3 py-2 text-sm text-white bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-md focus:outline-none focus:border-[#3ECF8E] transition-colors"
                  />
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-[#1F1F25] border-t border-[rgba(255,255,255,0.08)] rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-transparent border border-transparent rounded-md hover:bg-white/5 transition-all disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isApplying}
              className="flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-[#18181C] bg-[#3ECF8E] hover:bg-[#34b279] rounded-md shadow-lg transition-all disabled:opacity-50"
            >
              {isApplying && <Loader2 size={16} className="animate-spin" />}
              適用する
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
