/**
 * useWorkflowUpload — handles JSON file drag-and-drop and upload modal state.
 */

import { useState } from 'react'

export function useWorkflowUpload() {
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadedJson, setUploadedJson] = useState<Record<string, unknown> | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const handleFileSelect = (file: File) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.json')) {
      alert('JSONファイルをアップロードしてください。')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string)
        const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name
        setUploadedJson(json)
        setUploadedFileName(nameWithoutExt)
        setUploadModalOpen(true)
      } catch {
        alert('JSONファイルの解析に失敗しました。')
      }
    }
    reader.readAsText(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  return {
    uploadModalOpen,
    setUploadModalOpen,
    uploadedJson,
    uploadedFileName,
    dragOver,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}
