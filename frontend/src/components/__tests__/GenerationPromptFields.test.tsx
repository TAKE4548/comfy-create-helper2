import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerationPromptFields, type PromptFieldView } from '../GenerationPromptFields'

const fields: PromptFieldView[] = [
  { key: 'p1', name: 'Prompt', role: 'positive', nodeId: '6', recorded: true, value: '猫\r\n😀e\u0301', status: 'submitted' },
  { key: 'p2', name: 'Prompt', role: 'negative', nodeId: '7', recorded: true, value: '', status: 'submitted' },
  { key: 'p3', name: 'Style', role: null, nodeId: '8', recorded: false, value: null, status: 'missing' },
]
const populatedFields = fields.map((field) => ({ ...field, recorded: true, value: field.key === 'p1' ? field.value : field.name, status: 'submitted' as const }))

describe('GenerationPromptFields', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('renders every field with identity and dynamic grapheme counts', () => {
    render(<GenerationPromptFields fields={fields} warning={null} />)
    expect(screen.getByText('Prompt欄 (3)')).toBeTruthy()
    expect(screen.getByText('positive / Node 6')).toBeTruthy()
    expect(screen.getByText('negative / Node 7')).toBeTruthy()
    expect(screen.getByText('未記録')).toBeTruthy()
    expect(screen.getByText('文字数: 4')).toBeTruthy()
    expect(screen.getByText('空欄')).toBeTruthy()
    const updated = [...fields, { ...fields[0], key: 'p4', name: 'Second', value: 'abc' }]
    const { rerender } = render(<GenerationPromptFields fields={fields} warning={null} />)
    rerender(<GenerationPromptFields fields={updated} warning={null} />)
    expect(screen.getByText('Prompt欄 (4)')).toBeTruthy()
    expect(screen.getByText('文字数: 3')).toBeTruthy()
  })

  it('opens and closes individual fields and all fields', () => {
    render(<GenerationPromptFields fields={fields} warning={null} />)
    expect(document.querySelector('pre')?.textContent).toBe('猫\r\n😀e\u0301')
    expect(screen.queryByText('negative欄に記録されたテキストはありません')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Prompt (negative)を展開' }))
    expect(screen.getByText('negative欄に記録されたテキストはありません')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'すべて折りたたむ' }))
    expect(document.querySelector('pre')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'すべて展開' }))
    expect(document.querySelector('pre')?.textContent).toBe('猫\r\n😀e\u0301')
  })

  it('keeps other fields collapsed after expanding one field from the all-collapsed state', () => {
    render(<GenerationPromptFields fields={populatedFields} warning={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'すべて折りたたむ' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prompt (positive)を展開' }))
    expect(screen.getByRole('button', { name: 'Prompt (positive)を折りたたむ' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Prompt (negative)を展開' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: 'Style (Node 8)を展開' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps other fields expanded after collapsing one field from the all-expanded state', () => {
    render(<GenerationPromptFields fields={populatedFields} warning={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'すべて展開' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prompt (positive)を折りたたむ' }))
    expect(screen.getByRole('button', { name: 'Prompt (positive)を展開' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: 'Prompt (negative)を折りたたむ' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Style (Node 8)を折りたたむ' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('copies exact text and reports clipboard rejection in Japanese', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<GenerationPromptFields fields={fields} warning={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Prompt (positive)をコピー' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('猫\r\n😀e\u0301'))
    writeText.mockRejectedValueOnce(new Error('denied'))
    fireEvent.click(screen.getByRole('button', { name: 'Prompt (positive)をコピー' }))
    expect(await screen.findByText('コピーに失敗しました。ブラウザーのクリップボード権限を確認してください。')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Style (Node 8)をコピー' }).hasAttribute('disabled')).toBe(true)
  })

  it('keeps and counts the full 2000-character prompt including its ending', () => {
    const longText = `${'長'.repeat(1998)}末尾`
    render(<GenerationPromptFields fields={[{ ...fields[0], key: 'long', value: longText }]} warning={null} />)
    expect(document.querySelector('pre')?.textContent).toBe(longText)
    expect(screen.getByText('文字数: 2000')).toBeTruthy()
  })
})
