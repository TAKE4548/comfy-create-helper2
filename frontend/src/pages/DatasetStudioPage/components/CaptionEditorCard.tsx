import React from 'react'

interface CaptionEditorCardProps {
  itemId: number
  slotIndex: number
  caption: string
  onChange: (newCaption: string) => void
}

export const CaptionEditorCard: React.FC<CaptionEditorCardProps> = ({
  itemId,
  slotIndex,
  caption,
  onChange,
}) => {
  return (
    <div className="flex flex-col gap-1.5 p-2 bg-slate-900/50 rounded border border-slate-700/60 text-xs">
      <div className="flex items-center justify-between text-slate-400 font-mono">
        <span>Caption #{slotIndex + 1}</span>
        <span className="text-[10px] text-slate-500">ID: {itemId}</span>
      </div>
      <textarea
        data-testid={`caption-editor-${itemId}`}
        className="w-full h-20 p-1.5 bg-slate-950/80 border border-slate-700 rounded text-slate-200 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none font-mono"
        value={caption}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter caption..."
      />
    </div>
  )
}
