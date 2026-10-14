import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PromptTranslationModal } from '../PromptTranslationModal'

function renderModal(options: { isTranslating?: boolean } = {}) {
  const onClose = vi.fn()
  const onTranslate = vi.fn()
  const onApply = vi.fn()
  const parentKeyDown = vi.fn()

  function Harness() {
    const [sourceText, setSourceText] = useState('blue sky')
    return (
      <div onKeyDown={parentKeyDown}>
        <PromptTranslationModal
          isOpen
          onClose={onClose}
          roleDisplayName="Test role"
          mode="ja_to_en"
          onModeChange={vi.fn()}
          sourceText={sourceText}
          onSourceTextChange={setSourceText}
          translatedText="blue sky translation"
          meta={null}
          isTranslating={options.isTranslating ?? false}
          error={null}
          onTranslate={onTranslate}
          onApply={onApply}
        />
      </div>
    )
  }

  render(<Harness />)
  return { onClose, onTranslate, onApply, parentKeyDown }
}

describe('PromptTranslationModal Ctrl+Enter', () => {
  it('uses the shared labelled mobile sheet and capped desktop dialog', () => {
    const { onClose } = renderModal()
    const dialog = screen.getByRole('dialog', { name: 'プロンプト翻訳' })

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveClass('md:max-w-[min(90vw,36.25rem)]', 'lg:max-w-[36.25rem]')
    expect(dialog.parentElement).toHaveClass('items-end', 'md:items-center', 'md:p-4')
    expect(dialog.querySelector('[aria-hidden="true"]')).toHaveClass('md:hidden')
    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveClass('min-h-[44px]', 'min-w-[44px]')
    expect(screen.getByRole('button', { name: '日 → 英 (作成・追記)' })).toHaveClass('min-h-[44px]')
    expect(screen.getByRole('button', { name: '翻訳する' })).toHaveClass('min-h-[44px]')
    expect(screen.getByRole('button', { name: 'プロンプトを上書き' })).toHaveClass('min-h-[44px]')
    expect(screen.getByRole('button', { name: '末尾に追記' })).toHaveClass('min-h-[44px]')
    fireEvent.click(dialog.parentElement!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('translates once and stops the shortcut from reaching the parent', () => {
    const { onTranslate, parentKeyDown } = renderModal()
    const input = screen.getByPlaceholderText(/例:/)

    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    expect(onTranslate).toHaveBeenCalledTimes(1)
    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it.each([
    ['IME composition', { isComposing: true }],
    ['repeated keydown', { repeat: true }],
  ])('does not translate on %s', (_label, extraKeyEvent) => {
    const { onTranslate, parentKeyDown } = renderModal()
    fireEvent.keyDown(screen.getByPlaceholderText(/例:/), {
      key: 'Enter',
      ctrlKey: true,
      ...extraKeyEvent,
    })

    expect(onTranslate).not.toHaveBeenCalled()
    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it('does not enqueue another translation while one is pending', () => {
    const { onTranslate, parentKeyDown } = renderModal({ isTranslating: true })
    fireEvent.keyDown(screen.getByPlaceholderText(/例:/), { key: 'Enter', ctrlKey: true })

    expect(onTranslate).not.toHaveBeenCalled()
    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it('keeps controlled draft edits and existing apply actions working', () => {
    const { onApply } = renderModal()
    const input = screen.getByPlaceholderText(/例:/)
    fireEvent.change(input, { target: { value: '新しい日本語' } })
    expect(input).toHaveValue('新しい日本語')

    fireEvent.click(screen.getByRole('button', { name: '末尾に追記' }))
    expect(onApply).toHaveBeenCalledWith('append')
  })
})
