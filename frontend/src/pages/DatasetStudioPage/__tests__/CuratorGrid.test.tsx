import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { decoupleCaption } from '../utils/captionDecoupler'
import { CuratorGrid } from '../components/CuratorGrid'
import { useStudioStore } from '../useStudioStore'
import { datasetApi } from '../../../api/client'
import type { DatasetItem, DatasetProject } from '../../../api/types'

vi.mock('../../../api/client', () => ({
  datasetApi: {
    exportDataset: vi.fn(),
  },
}))

describe('captionDecoupler', () => {
  const baseParams = {
    rawPrompt: '1girl, solo, silver hair, red eyes, knight armor, gauntlets, smiling, outdoor',
    characterTrigger: 'char_alice',
    outfitTrigger: 'outfit_knight',
    physicalTags: ['silver hair', 'red eyes'],
    exclusiveOutfitTags: ['knight armor', 'gauntlets'],
  }

  it('strips physical and exclusive outfit tags on default outfit slot and adds triggers', () => {
    const result = decoupleCaption({
      ...baseParams,
      isDefaultOutfit: true,
    })

    expect(result).toContain('char_alice')
    expect(result).toContain('outfit_knight')
    expect(result).not.toContain('silver hair')
    expect(result).not.toContain('red eyes')
    expect(result).not.toContain('knight armor')
    expect(result).not.toContain('gauntlets')
    expect(result).toContain('1girl')
    expect(result).toContain('smiling')
    expect(result).toContain('outdoor')
  })

  it('strips physical tags but preserves alt outfit tags and never injects outfitTrigger on alt slot', () => {
    const altParams = {
      rawPrompt: '1girl, silver hair, maid dress, apron, holding tray',
      characterTrigger: 'char_alice',
      outfitTrigger: 'outfit_knight',
      physicalTags: ['silver hair'],
      exclusiveOutfitTags: ['knight armor', 'gauntlets'],
      isDefaultOutfit: false,
    }

    const result = decoupleCaption(altParams)

    expect(result).toContain('char_alice')
    expect(result).not.toContain('outfit_knight')
    expect(result).not.toContain('silver hair')
    expect(result).toContain('maid dress')
    expect(result).toContain('apron')
    expect(result).toContain('holding tray')
  })
})

describe('CuratorGrid', () => {
  const mockProject: DatasetProject = {
    id: 10,
    name: 'Test Project',
    character_trigger: 'char_alice',
    outfit_trigger: 'outfit_knight',
    physical_tags: 'silver hair',
    exclusive_outfit_tags: 'knight armor',
    step: 2,
    created_at: '2026-10-07T00:00:00Z',
    updated_at: '2026-10-07T00:00:00Z',
  }

  const mockItems: DatasetItem[] = [
    {
      id: 1,
      project_id: 10,
      slot_index: 0,
      factors_json: JSON.stringify({ shot: 'close-up', outfit_type: 'default' }),
      raw_prompt: '1girl, silver hair, knight armor, smiling',
      caption_text: 'char_alice, outfit_knight, 1girl, smiling',
      image_path: '/images/slot_0.png',
      seed: 12345,
      status: 'APPROVED',
    },
    {
      id: 2,
      project_id: 10,
      slot_index: 1,
      factors_json: JSON.stringify({ shot: 'full body', outfit_type: 'alt' }),
      raw_prompt: '1girl, silver hair, maid dress, standing',
      caption_text: 'char_alice, 1girl, maid dress, standing',
      image_path: '/images/slot_1.png',
      seed: 67890,
      status: 'APPROVED',
    },
  ]

  beforeEach(() => {
    useStudioStore.setState({
      activeProject: mockProject,
      items: mockItems,
    })
    vi.clearAllMocks()
  })

  it('renders slots with thumbnails, status badges, and captions', () => {
    render(<CuratorGrid />)

    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getByTestId('caption-editor-1')).toHaveValue('char_alice, outfit_knight, 1girl, smiling')
    expect(screen.getByTestId('caption-editor-2')).toHaveValue('char_alice, 1girl, maid dress, standing')
  })

  it('toggles item status between APPROVED and REJECTED', () => {
    render(<CuratorGrid />)

    const badge1 = screen.getByTestId('status-badge-1')
    expect(badge1).toHaveTextContent('APPROVED')

    fireEvent.click(badge1)
    expect(useStudioStore.getState().items[0].status).toBe('REJECTED')
  })

  it('preserves existing decisions and exposes the requested responsive columns', () => {
    useStudioStore.setState({
      items: mockItems.map((item, index) => ({ ...item, status: index === 0 ? 'REJECTED' : 'APPROVED' })),
    })
    const { unmount } = render(<CuratorGrid />)

    expect(useStudioStore.getState().items.map((item) => item.status)).toEqual(['REJECTED', 'APPROVED'])
    expect(screen.getByTestId('curator-grid')).toHaveClass('grid-cols-2', 'md:grid-cols-3', 'xl:grid-cols-4')
    expect(screen.getByTestId('curator-item-1')).toHaveClass('border-amber-500/70')
    expect(screen.getByTestId('status-badge-1')).toHaveTextContent('REJECTED')

    unmount()
    render(<CuratorGrid />)
    expect(useStudioStore.getState().items[0].status).toBe('REJECTED')
  })

  it('supports card keyboard decisions, bounded navigation, and image preview', () => {
    render(<CuratorGrid />)
    const firstCard = screen.getByTestId('curator-item-1')
    const secondCard = screen.getByTestId('curator-item-2')

    firstCard.focus()
    fireEvent.keyDown(firstCard, { key: 'x' })
    expect(useStudioStore.getState().items[0].status).toBe('REJECTED')
    fireEvent.keyDown(firstCard, { key: 'ArrowUp' })
    expect(useStudioStore.getState().items[0].status).toBe('APPROVED')
    fireEvent.keyDown(firstCard, { key: 'ArrowDown' })
    expect(useStudioStore.getState().items[0].status).toBe('REJECTED')

    fireEvent.keyDown(firstCard, { key: 'ArrowLeft' })
    expect(firstCard).toHaveFocus()
    fireEvent.keyDown(firstCard, { key: 'ArrowRight' })
    expect(secondCard).toHaveFocus()
    fireEvent.keyDown(secondCard, { key: 'ArrowRight' })
    expect(secondCard).toHaveFocus()

    fireEvent.keyDown(secondCard, { key: ' ' })
    expect(screen.getByRole('img', { name: 'Slot 2 preview' })).toBeInTheDocument()
  })

  it('does not hijack keyboard shortcuts from caption controls', () => {
    render(<CuratorGrid />)
    const textarea = screen.getByTestId('caption-editor-1')

    fireEvent.keyDown(textarea, { key: 'x' })
    fireEvent.keyDown(textarea, { key: ' ' })
    expect(useStudioStore.getState().items[0].status).toBe('APPROVED')
    expect(screen.queryByRole('img', { name: 'Slot 1 preview' })).not.toBeInTheDocument()
  })

  it('updates caption text when edited', () => {
    render(<CuratorGrid />)

    const textarea = screen.getByTestId('caption-editor-1')
    fireEvent.change(textarea, { target: { value: 'custom edited caption' } })

    expect(useStudioStore.getState().items[0].caption_text).toBe('custom edited caption')
  })

  it('executes single reroll and updates image in-place', async () => {
    const mockRerollPrompt = vi.fn().mockResolvedValue({ image_path: '/images/rerolled_0.png' })
    render(<CuratorGrid onRerollPrompt={mockRerollPrompt} />)

    const rerollBtn = screen.getByTestId('reroll-button-1')
    fireEvent.click(rerollBtn)

    await waitFor(() => {
      expect(mockRerollPrompt).toHaveBeenCalledWith('1girl, silver hair, knight armor, smiling', expect.any(Number))
    })

    await waitFor(() => {
      expect(useStudioStore.getState().items[0].image_path).toBe('/images/rerolled_0.png')
      expect(useStudioStore.getState().items[0].status).toBe('APPROVED')
    })
  })

  it('calls exportDataset on export button click', async () => {
    vi.mocked(datasetApi.exportDataset).mockResolvedValueOnce({
      status: 'ok',
      project_id: 10,
      item_count: 2,
      export_dir: '/output/dataset_10',
      exported_files: ['001.png', '001.txt', '002.png', '002.txt'],
    } as any)

    render(<CuratorGrid />)

    const exportBtn = screen.getByTestId('export-dataset-button')
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(datasetApi.exportDataset).toHaveBeenCalledWith(10)
      expect(screen.getByTestId('export-message')).toHaveTextContent('エクスポート完了: 2件 (/output/dataset_10)')
    })
  })
})
