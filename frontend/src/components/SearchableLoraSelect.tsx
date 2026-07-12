import React, { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { baseModelsApi, loraCategoriesApi } from '../api/client'
import type { Lora, ComfyLoraModel } from '../api/types'
import { ChevronDown, Search, X } from 'lucide-react'

interface SearchableLoraSelectProps {
  value: string
  onChange: (value: string) => void
  comfyModels?: ComfyLoraModel[]
  loras?: Lora[]
  activeBaseModelId?: number | null
  placeholder?: string
  className?: string
}

export function SearchableLoraSelect({
  value,
  onChange,
  comfyModels,
  loras,
  activeBaseModelId,
  placeholder = 'Select LoRA…',
  className = '',
}: SearchableLoraSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBaseModelId, setSelectedBaseModelId] = useState<number | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Initialize base model filter from activeBaseModelId
  useEffect(() => {
    if (activeBaseModelId !== undefined && activeBaseModelId !== null) {
      setSelectedBaseModelId(activeBaseModelId)
    }
  }, [activeBaseModelId])

  // Click outside handler to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Reset filters when dropdown opens/closes (optional, but keep query clean)
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('')
    }
  }, [isOpen])

  // Queries for filters
  const { data: baseModels } = useQuery({
    queryKey: ['base-models'],
    queryFn: baseModelsApi.list,
  })

  const { data: categories } = useQuery({
    queryKey: ['lora-categories'],
    queryFn: loraCategoriesApi.list,
  })

  // Normalize options
  const options = React.useMemo(() => {
    if (comfyModels) {
      return comfyModels.map((model) => {
        const registered = loras?.find((l) => l.id === model.lora_id)
        return {
          value: model.file_path,
          displayName: registered?.description ? registered.description : model.file_path,
          loraId: model.lora_id,
          modelName: registered?.model_name || '',
          filePath: model.file_path,
          description: registered?.description || null,
          isRegistered: model.is_registered,
          lora: registered,
        }
      })
    } else {
      return (loras || []).map((lora) => {
        return {
          value: lora.model_name,
          displayName: lora.description || lora.model_name,
          loraId: lora.id,
          modelName: lora.model_name,
          filePath: lora.file_path || '',
          description: lora.description || null,
          isRegistered: true,
          lora: lora,
        }
      })
    }
  }, [comfyModels, loras])

  // Find currently selected option's display name
  const currentOption = options.find((opt) => opt.value === value)
  const displayLabel = currentOption ? currentOption.displayName : placeholder

  // Filter options
  const filteredOptions = React.useMemo(() => {
    return options.filter((opt) => {
      // 1. Search Query
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase()
        const nameMatch = opt.modelName?.toLowerCase().includes(searchLower)
        const pathMatch = opt.filePath?.toLowerCase().includes(searchLower)
        const descMatch = opt.description?.toLowerCase().includes(searchLower)
        if (!nameMatch && !pathMatch && !descMatch) return false
      }

      // 2. Base Model Filter
      if (selectedBaseModelId) {
        if (!opt.isRegistered || !opt.lora) return false
        const targetIds = opt.lora.target_base_model_ids
        if (targetIds && targetIds.length > 0 && !targetIds.includes(selectedBaseModelId)) {
          return false
        }
      }

      // 3. Category Filter
      if (selectedCategoryId) {
        if (!opt.isRegistered || !opt.lora || opt.lora.category_id !== selectedCategoryId) {
          return false
        }
      }

      return true
    })
  }, [options, searchQuery, selectedBaseModelId, selectedCategoryId])

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 min-w-0 transition-all text-left"
      >
        <span className="truncate pr-2">{displayLabel}</span>
        <ChevronDown size={14} className="text-zinc-400 flex-shrink-0" />
      </button>

      {/* Dropdown Container */}
      {isOpen && (
        <div className="absolute left-0 mt-1 w-80 bg-surface border border-[rgba(255,255,255,0.08)] rounded-md shadow-lg z-50 flex flex-col max-h-96">
          {/* Sticky Header */}
          <div className="sticky top-0 bg-surface z-10 p-2 border-b border-[rgba(255,255,255,0.08)] space-y-2">
            {/* Search Input */}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-2.5 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, desc, path..."
                className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded pl-7 pr-7 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-200"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter Selects */}
            <div className="grid grid-cols-2 gap-1.5">
              {/* Base Model Selector */}
              <select
                value={selectedBaseModelId || ''}
                onChange={(e) => setSelectedBaseModelId(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded px-1.5 py-1 text-[10px] text-zinc-200 focus:outline-none focus:border-accent-green/40"
              >
                <option value="">All Base Models</option>
                {baseModels?.map((bm) => (
                  <option key={bm.id} value={bm.id}>
                    {bm.name}
                  </option>
                ))}
              </select>

              {/* Category Selector */}
              <select
                value={selectedCategoryId || ''}
                onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded px-1.5 py-1 text-[10px] text-zinc-200 focus:outline-none focus:border-accent-green/40"
              >
                <option value="">All Categories</option>
                {categories?.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Scrollable Options List */}
          <div className="flex-1 overflow-y-auto py-1 max-h-60 custom-scrollbar">
            <button
              type="button"
              onClick={() => {
                onChange('')
                setIsOpen(false)
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:bg-surface-2 transition-colors italic border-b border-[rgba(255,255,255,0.04)]"
            >
              Clear selection
            </button>

            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-xs text-zinc-500 italic text-center">
                No matching LoRAs.
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value)
                      setIsOpen(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors flex flex-col gap-0.5 border-b border-[rgba(255,255,255,0.02)] ${
                      isSelected
                        ? 'bg-accent-green/10 text-accent-green font-medium'
                        : 'text-zinc-200 hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{opt.displayName}</span>
                      {!opt.isRegistered && (
                        <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1 rounded flex-shrink-0">
                          Unregistered
                        </span>
                      )}
                    </div>
                    {opt.isRegistered && opt.description && (
                      <span className="text-[10px] text-zinc-400 truncate">
                        {opt.description}
                      </span>
                    )}
                    <span className="text-[9px] text-zinc-500 truncate">
                      {opt.filePath}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
