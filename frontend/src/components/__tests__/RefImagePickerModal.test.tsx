import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { RefImagePickerModal } from '../RefImagePickerModal'
import { resetTestStore } from '../../test/utils/storeHelpers'
import { createTestQueryClient } from '../../test/utils/queryHelpers'

const TOKEN = `refimg:${'a'.repeat(64)}.png`
const REF_READ = { ref_id: `${'a'.repeat(64)}.png`, token: TOKEN, width: 10, height: 10, size_bytes: 5 }

function jsonRes(status: number, body: unknown) {
  const text = JSON.stringify(body)
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => body }
}

function renderPicker(props: Partial<React.ComponentProps<typeof RefImagePickerModal>> = {}) {
  const onClose = vi.fn()
  const onSelected = vi.fn()
  const client = createTestQueryClient()
  render(
    <QueryClientProvider client={client}>
      <RefImagePickerModal isOpen onClose={onClose} onSelected={onSelected} {...props} />
    </QueryClientProvider>,
  )
  return { onClose, onSelected }
}

describe('RefImagePickerModal', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  const original = global.fetch

  const importResponse = (status: number, body: unknown) => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/snapshots') ? jsonRes(200, []) : jsonRes(status, body))
  }

  beforeEach(() => {
    resetTestStore({ comfyHistoryImages: ['/view?filename=a.png&subfolder=s&type=output&t=1'] })
    fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })
  afterEach(() => {
    global.fetch = original
  })

  it('[REQ-427/AC-4] history tile import posts history body then calls onSelected and onClose', async () => {
    importResponse(201, REF_READ)
    const { onClose, onSelected } = renderPicker()
    fireEvent.click(screen.getByTestId('ref-picker-history-0'))
    await waitFor(() => expect(onSelected).toHaveBeenCalledWith(REF_READ))
    expect(onClose).toHaveBeenCalled()
    const importCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/ref-images/import'))!
    expect(JSON.parse(importCall[1].body)).toEqual({ source: 'history', filename: 'a.png', subfolder: 's', type: 'output' })
  })

  it('[REQ-427/AC-4] snapshot tab import posts snapshot body then calls onSelected', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/snapshots')) {
        return jsonRes(200, [
          { id: 7, image_path: '/img/7.png', thumbnail_path: '/img/7t.png', created_at: '2026-01-01T00:00:00Z' },
          { id: 8, image_path: null, created_at: '2026-01-01T00:00:00Z' },
        ])
      }
      return jsonRes(201, REF_READ)
    })
    const { onSelected } = renderPicker()
    fireEvent.click(screen.getByRole('tab', { name: 'スナップショット' }))
    const tile = await screen.findByTestId('ref-picker-snapshot-7')
    expect(screen.queryByTestId('ref-picker-snapshot-8')).not.toBeInTheDocument()
    fireEvent.click(tile)
    await waitFor(() => expect(onSelected).toHaveBeenCalledWith(REF_READ))
    const importCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/ref-images/import'))!
    expect(JSON.parse(importCall[1].body)).toEqual({ source: 'snapshot', snapshot_id: 7 })
  })

  it('[REQ-427/AC-4] import 404 shows alert inside modal, keeps it open, no onSelected', async () => {
    importResponse(404, { detail: 'not found' })
    const { onClose, onSelected } = renderPicker()
    fireEvent.click(screen.getByTestId('ref-picker-history-0'))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSelected).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('[REQ-427/AC-4] shows empty state text for empty history', () => {
    resetTestStore({ comfyHistoryImages: [] })
    renderPicker()
    expect(screen.getByText('生成履歴がありません')).toBeInTheDocument()
  })

  it('[REQ-427/AC-3] tabs and tiles carry 44px classes and scroll area has overscroll-contain', () => {
    renderPicker()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBe(2)
    tabs.forEach((t) => {
      expect(t.className).toContain('min-h-11')
      expect(t.className).toContain('touch-manipulation')
    })
    const tile = screen.getByTestId('ref-picker-history-0')
    expect(tile.className).toContain('aspect-square')
    expect(tile.className).toContain('touch-manipulation')
    expect(screen.getByTestId('ref-picker-scroll').className).toContain('overscroll-contain')
    expect(screen.getByRole('dialog').className).toContain('max-h-[85dvh]')
  })
})
