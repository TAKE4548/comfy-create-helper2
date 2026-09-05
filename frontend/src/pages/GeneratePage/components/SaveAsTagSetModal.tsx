import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Save, AlertTriangle } from 'lucide-react';
import { tagSetsApi, tagsetCategoriesApi } from '../../../api/client';
import type { TagSetCreate } from '../../../api/types';

export interface SaveAsTagSetModalProps {
  role: string;
  promptText: string;
  onClose: () => void;
}

export const extractTagsFromPrompt = (promptText: string): string[] => {
  return promptText
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
};

export const SaveAsTagSetModal: React.FC<SaveAsTagSetModalProps> = ({
  role,
  promptText,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'create' | 'update'>('create');

  // Form states - Create
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState('');

  // Form states - Update
  const [selectedTagSetId, setSelectedTagSetId] = useState<number | null>(null);
  const [updateMode, setUpdateMode] = useState<'overwrite_tags' | 'append_tags'>('overwrite_tags');
  const [searchFilter, setSearchFilter] = useState('');
  const [isConfirmingOverwrite, setIsConfirmingOverwrite] = useState(false);

  const tags = extractTagsFromPrompt(promptText);

  // Queries
  const { data: categories = [] } = useQuery({
    queryKey: ['tagsetCategories'],
    queryFn: () => tagsetCategoriesApi.list(),
  });

  const { data: tagSets = [], isLoading: isLoadingTagSets } = useQuery({
    queryKey: ['tagSets'],
    queryFn: () => tagSetsApi.list(),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: TagSetCreate) => tagSetsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagSets'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) => tagSetsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagSets'] });
      onClose();
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || tags.length === 0) return;
    createMutation.mutate({
      name: name.trim(),
      tags,
      category_id: categoryId ?? undefined,
      description: description.trim() || undefined,
    });
  };

  const handleUpdateSubmit = () => {
    if (!selectedTagSetId) return;
    const targetTagSet = tagSets.find((t) => t.id === selectedTagSetId);
    if (!targetTagSet) return;

    let finalTags: string[];
    if (updateMode === 'overwrite_tags') {
      finalTags = tags;
    } else {
      const set = new Set(targetTagSet.tags);
      tags.forEach((t) => set.add(t));
      finalTags = Array.from(set);
    }

    updateMutation.mutate({
      id: selectedTagSetId,
      data: {
        name: targetTagSet.name,
        tags: finalTags,
        category_id: targetTagSet.category_id,
        description: targetTagSet.description,
        subsets: targetTagSet.subsets,
      },
    });
  };

  const filteredTagSets = tagSets.filter((ts) =>
    ts.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const selectedTagSet = tagSets.find((ts) => ts.id === selectedTagSetId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#18181C] p-6 shadow-2xl text-zinc-200 select-none flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] pb-3">
          <div>
            <h2 className="text-base font-semibold text-white">タグセットとして保存</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              セクション「{role}」のプロンプトをタグセットとして保存または上書きします。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-[#27272F] hover:text-white transition-colors"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>

        {/* Parsed Tags Preview */}
        <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-[#1F1F25] border border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>対象タグ一覧 ({tags.length} 件)</span>
          </div>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
            {tags.length === 0 ? (
              <span className="text-xs text-zinc-500">タグが空です</span>
            ) : (
              tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded bg-[#27272F] text-zinc-300 text-xs border border-[rgba(255,255,255,0.06)]"
                >
                  {tag}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#1F1F25] rounded-lg border border-[rgba(255,255,255,0.06)]">
          <button
            type="button"
            onClick={() => {
              setActiveTab('create');
              setIsConfirmingOverwrite(false);
            }}
            className={`py-1.5 text-center rounded-md text-xs font-medium transition-colors ${
              activeTab === 'create'
                ? 'bg-[#7C6FDD] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            新規作成
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('update');
              setIsConfirmingOverwrite(false);
            }}
            className={`py-1.5 text-center rounded-md text-xs font-medium transition-colors ${
              activeTab === 'update'
                ? 'bg-[#7C6FDD] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            既存セットに反映
          </button>
        </div>

        {/* Tab Content: Create */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateSubmit} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-300">
                タグセット名 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: アニメ風・青空・背景"
                className="w-full px-3 py-2 bg-[#1F1F25] border border-[rgba(255,255,255,0.12)] rounded-lg text-sm text-white focus:outline-none focus:border-[#7C6FDD]"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-300">カテゴリ</label>
              <select
                value={categoryId ?? ''}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 bg-[#1F1F25] border border-[rgba(255,255,255,0.12)] rounded-lg text-sm text-white focus:outline-none focus:border-[#7C6FDD]"
              >
                <option value="">未分類</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-300">説明 (オプション)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="タグセットの用途や詳細メモ"
                className="w-full px-3 py-2 bg-[#1F1F25] border border-[rgba(255,255,255,0.12)] rounded-lg text-sm text-white focus:outline-none focus:border-[#7C6FDD] resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[rgba(255,255,255,0.08)]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-[#27272F] hover:bg-[#32323D] text-xs font-medium text-zinc-300 hover:text-white transition-colors"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={!name.trim() || tags.length === 0 || createMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7C6FDD] hover:bg-[#6b5ec7] disabled:opacity-40 text-xs font-medium text-white transition-colors"
              >
                <Plus size={14} />
                <span>{createMutation.isPending ? '保存中...' : '新規保存'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab Content: Update */}
        {activeTab === 'update' && (
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-300">更新するタグセットを選択</label>
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="タグセットを検索..."
                className="w-full px-3 py-1.5 bg-[#1F1F25] border border-[rgba(255,255,255,0.12)] rounded-lg text-xs text-white focus:outline-none focus:border-[#7C6FDD]"
              />
              <div className="max-h-40 overflow-y-auto flex flex-col gap-1 border border-[rgba(255,255,255,0.08)] rounded-lg p-1 bg-[#1F1F25]">
                {isLoadingTagSets ? (
                  <div className="p-3 text-center text-xs text-zinc-500">読み込み中...</div>
                ) : filteredTagSets.length === 0 ? (
                  <div className="p-3 text-center text-xs text-zinc-500">見つかりません</div>
                ) : (
                  filteredTagSets.map((ts) => (
                    <button
                      key={ts.id}
                      type="button"
                      onClick={() => {
                        setSelectedTagSetId(ts.id);
                        setIsConfirmingOverwrite(false);
                      }}
                      className={`px-3 py-2 rounded text-left text-xs transition-colors flex items-center justify-between ${
                        selectedTagSetId === ts.id
                          ? 'bg-[#7C6FDD] text-white font-medium'
                          : 'text-zinc-300 hover:bg-[#27272F]'
                      }`}
                    >
                      <span className="truncate">{ts.name}</span>
                      <span className="text-[10px] opacity-75 shrink-0 ml-2">
                        {ts.tags.length} tags
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {selectedTagSet && (
              <div className="flex flex-col gap-2 p-3 rounded-lg bg-[#1F1F25] border border-[rgba(255,255,255,0.06)] text-xs">
                <span className="font-medium text-zinc-300">反映方法</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUpdateMode('overwrite_tags');
                      setIsConfirmingOverwrite(false);
                    }}
                    className={`py-1.5 px-2 rounded border text-center transition-colors ${
                      updateMode === 'overwrite_tags'
                        ? 'border-[#7C6FDD] bg-[#7C6FDD]/20 text-white font-medium'
                        : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    タグを完全上書き
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUpdateMode('append_tags');
                      setIsConfirmingOverwrite(false);
                    }}
                    className={`py-1.5 px-2 rounded border text-center transition-colors ${
                      updateMode === 'append_tags'
                        ? 'border-[#7C6FDD] bg-[#7C6FDD]/20 text-white font-medium'
                        : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    既存タグに追加
                  </button>
                </div>
              </div>
            )}

            {isConfirmingOverwrite && selectedTagSet && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-xs text-amber-200">
                <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="font-medium">
                    「{selectedTagSet.name}」のタグを
                    {updateMode === 'overwrite_tags' ? '上書き' : '追加更新'}
                    しますか？
                  </span>
                  <span className="text-[11px] text-amber-300/80">
                    この操作は元に戻せません。
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[rgba(255,255,255,0.08)]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-[#27272F] hover:bg-[#32323D] text-xs font-medium text-zinc-300 hover:text-white transition-colors"
              >
                キャンセル
              </button>
              {isConfirmingOverwrite ? (
                <button
                  type="button"
                  onClick={handleUpdateSubmit}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-medium text-white transition-colors"
                >
                  <Save size={14} />
                  <span>{updateMutation.isPending ? '更新中...' : '確定して反映'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!selectedTagSetId || tags.length === 0}
                  onClick={() => setIsConfirmingOverwrite(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7C6FDD] hover:bg-[#6b5ec7] disabled:opacity-40 text-xs font-medium text-white transition-colors"
                >
                  <Save size={14} />
                  <span>反映を確認</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
