import { useState, useCallback } from 'react'
import { translateApi } from '../../../api/client'
import type { TranslateMeta, TranslationMode } from '../../../api/types'

interface UsePromptTranslationProps {
  paramValues: Record<string, string>
  setParamValues: (values: Record<string, string>) => void
}

export function usePromptTranslation({ paramValues, setParamValues }: UsePromptTranslationProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeRole, setActiveRole] = useState<string | null>(null)
  const [mode, setMode] = useState<TranslationMode>('en_to_ja')
  const [sourceText, setSourceText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [meta, setMeta] = useState<TranslateMeta | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openTranslation = useCallback((role: string, currentPromptValue: string) => {
    setActiveRole(role)
    setIsOpen(true)
    setMode('en_to_ja')
    setSourceText(currentPromptValue || '')
    setTranslatedText('')
    setMeta(null)
    setError(null)
    setIsTranslating(false)
  }, [])

  const closeTranslation = useCallback(() => {
    setIsOpen(false)
    setActiveRole(null)
    setSourceText('')
    setTranslatedText('')
    setMeta(null)
    setError(null)
    setIsTranslating(false)
  }, [])

  const executeTranslate = useCallback(
    async (customText?: string) => {
      const textToTranslate = typeof customText === 'string' ? customText : sourceText
      if (!textToTranslate || !textToTranslate.trim()) {
        setTranslatedText('')
        setMeta(null)
        return
      }

      setIsTranslating(true)
      setError(null)

      try {
        const source_lang = mode === 'en_to_ja' ? 'en' : 'ja'
        const target_lang = mode === 'en_to_ja' ? 'ja' : 'en'

        const response = await translateApi.translatePrompt({
          prompt: textToTranslate,
          source_lang,
          target_lang,
        })

        setTranslatedText(response.translated_prompt)
        setMeta(response.meta)
      } catch (err: any) {
        setError(err.message || 'Translation failed')
      } finally {
        setIsTranslating(false)
      }
    },
    [sourceText, mode]
  )

  const applyToPrompt = useCallback(
    (actionType: 'append' | 'replace') => {
      if (!activeRole || !translatedText) return

      const currentVal = typeof paramValues[activeRole] === 'string' ? paramValues[activeRole] : ''
      let newVal = ''

      if (actionType === 'replace') {
        newVal = translatedText
      } else if (actionType === 'append') {
        const trimmed = currentVal.trim().replace(/,\s*$/, '')
        if (!trimmed) {
          newVal = translatedText
        } else {
          newVal = `${trimmed}, ${translatedText}`
        }
      }

      setParamValues({
        ...paramValues,
        [activeRole]: newVal,
      })

      closeTranslation()
    },
    [activeRole, translatedText, closeTranslation, paramValues, setParamValues]
  )

  return {
    isOpen,
    activeRole,
    mode,
    sourceText,
    translatedText,
    meta,
    isTranslating,
    error,
    setMode,
    setSourceText,
    openTranslation,
    closeTranslation,
    executeTranslate,
    applyToPrompt,
  }
}
