import { useState, useEffect } from 'react'
import { useGenerationStore } from '../../../store/useGenerationStore'

export function useGeneratePageModals() {
  const { comfyUrl } = useGenerationStore()
  const [isMobile, setIsMobile] = useState(() =>
    window.location.pathname.startsWith('/mobile') || window.innerWidth < 768
  )

  useEffect(() => {
    const handleResize = () =>
      setIsMobile(window.location.pathname.startsWith('/mobile') || window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const [rescanOpen, setRescanOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [localComfyUrl, setLocalComfyUrl] = useState('')
  const [thumbnailTab, setThumbnailTab] = useState<'history' | 'snapshots'>('history')
  const [isJobModalOpen, setIsJobModalOpen] = useState(false)
  const [isSceneGeneratorOpen, setIsSceneGeneratorOpen] = useState(false)

  useEffect(() => {
    if (comfyUrl) setLocalComfyUrl(comfyUrl)
  }, [comfyUrl])

  return {
    isMobile,
    rescanOpen,
    setRescanOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    localComfyUrl,
    setLocalComfyUrl,
    thumbnailTab,
    setThumbnailTab,
    isJobModalOpen,
    setIsJobModalOpen,
    isSceneGeneratorOpen,
    setIsSceneGeneratorOpen,
  }
}
