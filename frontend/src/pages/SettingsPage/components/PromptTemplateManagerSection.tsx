import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  Plus,
  Pencil,
  Copy,
  Trash2,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  X,
  Check,
  RefreshCw,
} from 'lucide-react'
import { promptTemplatesApi } from '../../../api/client'
import type {
  PromptTemplate,
  PromptTemplateSection,
  PromptTemplateBlock,
} from '../../../api/types'
import { Modal } from '../../../components/common/Modal'

export interface PromptTemplateManagerSectionProps {
  isExpanded?: boolean
  onToggle?: () => void
}

interface TemplateFormState {
  id?: number
  name: string
  description: string
  sections: PromptTemplateSection[]
}

const inputCls =
  'w-full min-h-11 min-w-0 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FDD] focus:border-[#7C6FDD]/40'
const iconActionCls =
  'relative inline-flex touch-manipulation before:absolute before:-inset-2 min-h-11 min-w-11 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FDD]'
const modalActionCls =
  'min-h-11 touch-manipulation rounded-lg px-3.5 py-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FDD]'

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function PromptTemplateManagerSection({
  isExpanded: controlledExpanded,
  onToggle,
}: PromptTemplateManagerSectionProps) {
  const qc = useQueryClient()
  const [localExpanded, setLocalExpanded] = useState(true)
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : localExpanded
  const handleToggle = onToggle ?? (() => setLocalExpanded((prev) => !prev))

  const [showModal, setShowModal] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState<TemplateFormState>({
    name: '',
    description: '',
    sections: [],
  })

  // Queries
  const { data: templates = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['prompt-templates'],
    queryFn: () => promptTemplatesApi.list(),
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: promptTemplatesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompt-templates'] })
      setShowModal(false)
      setFormError('')
    },
    onError: (err: any) => {
      setFormError(err.message || 'テンプレートの作成に失敗しました')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      promptTemplatesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompt-templates'] })
      setShowModal(false)
      setFormError('')
    },
    onError: (err: any) => {
      setFormError(err.message || 'テンプレートの更新に失敗しました')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => promptTemplatesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompt-templates'] })
    },
  })

  const handleOpenCreate = () => {
    setForm({
      name: '',
      description: '',
      sections: [
        {
          id: generateId('sec'),
          name: '基本セクション',
          is_repeatable: false,
          blocks: [
            { id: generateId('blk'), label: 'プロンプトブロック' },
          ],
        },
      ],
    })
    setFormError('')
    setShowModal(true)
  }

  const handleOpenEdit = (template: PromptTemplate) => {
    setForm({
      id: template.id,
      name: template.name,
      description: template.description || '',
      sections: JSON.parse(JSON.stringify(template.structure?.sections || [])),
    })
    setFormError('')
    setShowModal(true)
  }

  const handleDuplicate = (template: PromptTemplate) => {
    createMutation.mutate({
      name: `${template.name} (コピー)`,
      description: template.description,
      structure: JSON.parse(JSON.stringify(template.structure || { sections: [] })),
    })
  }

  const handleDelete = (template: PromptTemplate) => {
    if (window.confirm(`「${template.name}」を削除しますか？`)) {
      deleteMutation.mutate(template.id)
    }
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      setFormError('テンプレート名を入力してください')
      return
    }
    setFormError('')
    if (form.id) {
      updateMutation.mutate({
        id: form.id,
        data: {
          name: form.name.trim(),
          description: form.description,
          structure: { sections: form.sections },
        },
      })
    } else {
      createMutation.mutate({
        name: form.name.trim(),
        description: form.description,
        structure: { sections: form.sections },
      })
    }
  }

  // Section operations
  const addSection = () => {
    setForm((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          id: generateId('sec'),
          name: `セクション ${prev.sections.length + 1}`,
          is_repeatable: false,
          blocks: [],
        },
      ],
    }))
  }

  const removeSection = (sIdx: number) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== sIdx),
    }))
  }

  const moveSection = (sIdx: number, direction: 'up' | 'down') => {
    setForm((prev) => {
      const next = [...prev.sections]
      const targetIdx = direction === 'up' ? sIdx - 1 : sIdx + 1
      if (targetIdx < 0 || targetIdx >= next.length) return prev
      const temp = next[sIdx]
      next[sIdx] = next[targetIdx]
      next[targetIdx] = temp
      return { ...prev, sections: next }
    })
  }

  const updateSection = (sIdx: number, patch: Partial<PromptTemplateSection>) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => (i === sIdx ? { ...s, ...patch } : s)),
    }))
  }

  // Block operations
  const addBlock = (sIdx: number) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => {
        if (i !== sIdx) return s
        return {
          ...s,
          blocks: [
            ...s.blocks,
            {
              id: generateId('blk'),
              label: `ブロック ${s.blocks.length + 1}`,
            },
          ],
        }
      }),
    }))
  }

  const removeBlock = (sIdx: number, bIdx: number) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => {
        if (i !== sIdx) return s
        return {
          ...s,
          blocks: s.blocks.filter((_, j) => j !== bIdx),
        }
      }),
    }))
  }

  const moveBlock = (sIdx: number, bIdx: number, direction: 'up' | 'down') => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => {
        if (i !== sIdx) return s
        const nextBlocks = [...s.blocks]
        const targetIdx = direction === 'up' ? bIdx - 1 : bIdx + 1
        if (targetIdx < 0 || targetIdx >= nextBlocks.length) return s
        const temp = nextBlocks[bIdx]
        nextBlocks[bIdx] = nextBlocks[targetIdx]
        nextBlocks[targetIdx] = temp
        return { ...s, blocks: nextBlocks }
      }),
    }))
  }

  const updateBlock = (
    sIdx: number,
    bIdx: number,
    patch: Partial<PromptTemplateBlock>
  ) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => {
        if (i !== sIdx) return s
        return {
          ...s,
          blocks: s.blocks.map((b, j) => (j === bIdx ? { ...b, ...patch } : b)),
        }
      }),
    }))
  }

  return (
    <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-[#7C6FDD]" />
          <h2 className="text-sm font-semibold text-zinc-300">
            Prompt Template Settings
          </h2>
          <span className="text-xs text-zinc-600">
            — プロンプト構造テンプレート管理
          </span>
        </div>
        <ChevronDown
          size={16}
          className={`text-zinc-500 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isExpanded && (
        <div className="border-t border-[rgba(255,255,255,0.06)] bg-surface/30 p-3 md:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-400">
              登録数: {templates.length}件
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                aria-label="テンプレート一覧を更新"
                className={iconActionCls}
                title="一覧を更新"
              >
                <RefreshCw
                  size={15}
                  className={`text-zinc-400 ${isFetching ? 'animate-spin' : ''}`}
                />
              </button>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="flex items-center gap-1.5 min-h-11 px-3.5 py-2 rounded-lg bg-[#7C6FDD] text-white text-xs font-medium hover:bg-[#6b5ec8] transition-colors"
              >
                <Plus size={15} />
                <span>新規テンプレート作成</span>
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              読み込み中…
            </div>
          ) : templates.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
              テンプレートが登録されていません
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((tpl) => {
                const sectionsCount = tpl.structure?.sections?.length || 0
                const blocksCount =
                  tpl.structure?.sections?.reduce(
                    (acc, s) => acc + (s.blocks?.length || 0),
                    0
                  ) || 0
                return (
                  <div
                    key={tpl.id}
                    data-testid={`prompt-template-card-${tpl.id}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2/40 gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-zinc-200 truncate">
                          {tpl.name}
                        </span>
                        {tpl.is_builtin && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">
                            組込
                          </span>
                        )}
                      </div>
                      {tpl.description && (
                        <p className="text-xs text-zinc-500 line-clamp-1">
                          {tpl.description}
                        </p>
                      )}
                      <p className="text-[11px] text-zinc-600">
                        {sectionsCount} セクション / {blocksCount} ブロック
                      </p>
                    </div>

                    <div className="flex items-center gap-1 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(tpl)}
                        aria-label={`テンプレート編集 ${tpl.name}`}
                        className={iconActionCls}
                        title="編集"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(tpl)}
                        aria-label={`テンプレート複製 ${tpl.name}`}
                        className={iconActionCls}
                        title="複製"
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(tpl)}
                        aria-label={`テンプレート削除 ${tpl.name}`}
                        className={iconActionCls}
                        title="削除"
                      >
                        <Trash2 size={15} className="text-red-400/80 hover:text-red-300" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Template Edit / Create Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        ariaLabel="プロンプト構造テンプレート編集"
        size="lg"
      >
        <div className="p-4 md:p-6 space-y-4 max-h-[85dvh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="text-sm font-semibold text-zinc-200">
              {form.id ? 'テンプレートを編集' : '新規テンプレート作成'}
            </h3>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className={iconActionCls}
              aria-label="閉じる"
            >
              <X size={16} />
            </button>
          </div>

          {formError && (
            <p role="alert" className="text-xs text-red-400 bg-red-950/30 border border-red-800/40 p-2 rounded">
              {formError}
            </p>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                テンプレート名 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                aria-label="テンプレート名"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="例: Anima 標準テンプレート"
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                説明
              </label>
              <input
                type="text"
                aria-label="テンプレート説明"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="例: アニメ・イラスト制作向けの標準プロンプト構造"
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">
                セクション構成 ({form.sections.length}件)
              </label>
              <button
                type="button"
                onClick={addSection}
                className="flex items-center gap-1 min-h-11 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium"
              >
                <Plus size={14} />
                <span>セクション追加</span>
              </button>
            </div>

            {form.sections.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center border border-dashed border-zinc-800 rounded">
                セクションがありません。「セクション追加」から作成してください。
              </p>
            ) : (
              <div className="space-y-3">
                {form.sections.map((section, sIdx) => (
                  <div
                    key={section.id || sIdx}
                    data-testid={`section-editor-${sIdx}`}
                    className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-900 pb-2">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          aria-label="セクション名"
                          value={section.name}
                          onChange={(e) => updateSection(sIdx, { name: e.target.value })}
                          placeholder="セクション名"
                          className={inputCls}
                        />
                        <input
                          type="text"
                          aria-label="セクションID"
                          value={section.id}
                          onChange={(e) => updateSection(sIdx, { id: e.target.value })}
                          placeholder="セクションID (例: style_quality)"
                          className={inputCls}
                        />
                      </div>
                      <div className="flex items-center gap-1 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => moveSection(sIdx, 'up')}
                          disabled={sIdx === 0}
                          aria-label="セクションを上へ"
                          className={iconActionCls}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(sIdx, 'down')}
                          disabled={sIdx === form.sections.length - 1}
                          aria-label="セクションを下へ"
                          className={iconActionCls}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSection(sIdx)}
                          aria-label="セクション削除"
                          className={iconActionCls}
                        >
                          <Trash2 size={14} className="text-red-400" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          aria-label="Repeat可能セクション"
                          checked={section.is_repeatable}
                          onChange={(e) => updateSection(sIdx, { is_repeatable: e.target.checked })}
                          className="rounded border-zinc-700 text-[#7C6FDD] focus:ring-[#7C6FDD]"
                        />
                        <span>Repeatセクション (複数インスタンス追加可能)</span>
                      </label>
                    </div>

                    {/* Blocks in section */}
                    <div className="space-y-2 pl-2 sm:pl-4 border-l-2 border-zinc-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-zinc-400 font-medium">
                          ブロック ({section.blocks.length}件)
                        </span>
                        <button
                          type="button"
                          onClick={() => addBlock(sIdx)}
                          className="flex items-center gap-1 min-h-11 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs"
                        >
                          <Plus size={13} />
                          <span>ブロック追加</span>
                        </button>
                      </div>

                      {section.blocks.map((block, bIdx) => (
                        <div
                          key={block.id || bIdx}
                          data-testid={`block-editor-${sIdx}-${bIdx}`}
                          className="flex items-center gap-2 bg-surface/40 p-2 rounded border border-[rgba(255,255,255,0.04)]"
                        >
                          <input
                            type="text"
                            aria-label="ブロック表示名"
                            value={block.label}
                            onChange={(e) =>
                              updateBlock(sIdx, bIdx, { label: e.target.value })
                            }
                            placeholder="表示名"
                            className={inputCls}
                          />
                          <input
                            type="text"
                            aria-label="ブロックID"
                            value={block.id}
                            onChange={(e) =>
                              updateBlock(sIdx, bIdx, { id: e.target.value })
                            }
                            placeholder="ID"
                            className={inputCls}
                          />
                          <button
                            type="button"
                            onClick={() => moveBlock(sIdx, bIdx, 'up')}
                            disabled={bIdx === 0}
                            aria-label="ブロックを上へ"
                            className={iconActionCls}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveBlock(sIdx, bIdx, 'down')}
                            disabled={bIdx === section.blocks.length - 1}
                            aria-label="ブロックを下へ"
                            className={iconActionCls}
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeBlock(sIdx, bIdx)}
                            aria-label="ブロック削除"
                            className={iconActionCls}
                          >
                            <Trash2 size={13} className="text-red-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-4">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className={`${modalActionCls} bg-zinc-800 text-zinc-300 hover:bg-zinc-700`}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className={`${modalActionCls} bg-[#7C6FDD] text-white hover:bg-[#6b5ec8] disabled:opacity-50 flex items-center gap-1.5`}
            >
              <Check size={15} />
              <span>{createMutation.isPending || updateMutation.isPending ? '保存中…' : '保存'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
