import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  OutfitMasterModal,
  distributeAltOutfits,
} from '../components/OutfitMasterModal'
import { OutfitPresetBadge } from '../components/OutfitPresetBadge'
import { MatrixGenerationStep } from '../components/MatrixGenerationStep'
import { useStudioStore } from '../useStudioStore'
import { datasetApi, workflowsApi } from '../../../api/client'
import type { OutfitMasterPreset } from '../../../api/types'

vi.mock('../../../api/client', () => ({
  datasetApi: {
    getOutfitMasters: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    calculateMatrix: vi.fn(),
  },
  workflowsApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
}))

describe('distributeAltOutfits', () => {
  const p1: OutfitMasterPreset = {
    id: 1,
    name: 'Casual Street',
    category: 'casual',
    prompt_tags: 'hoodie, jeans',
    is_builtin: true,
  }
  const p2: OutfitMasterPreset = {
    id: 2,
    name: 'Roomwear',
    category: 'roomwear',
    prompt_tags: 't-shirt, sweatpants',
    is_builtin: true,
  }
  const p3: OutfitMasterPreset = {
    id: 3,
    name: 'Swimsuit',
    category: 'swimsuit',
    prompt_tags: 'bikini',
    is_builtin: true,
  }

  it('returns empty array when no outfits selected', () => {
    expect(distributeAltOutfits([], 5)).toEqual([])
  })

  it('distributes 1 outfit across 5 slots', () => {
    const res = distributeAltOutfits([p1], 5)
    expect(res).toHaveLength(5)
    expect(res.every((o) => o.id === 1)).toBe(true)
  })

  it('evenly distributes 2 outfits across 5 slots (3 and 2)', () => {
    const res = distributeAltOutfits([p1, p2], 5)
    expect(res).toHaveLength(5)
    const p1Count = res.filter((o) => o.id === 1).length
    const p2Count = res.filter((o) => o.id === 2).length
    expect(p1Count).toBe(3)
    expect(p2Count).toBe(2)
  })

  it('evenly distributes 3 outfits across 5 slots (2, 2, 1)', () => {
    const res = distributeAltOutfits([p1, p2, p3], 5)
    expect(res).toHaveLength(5)
    expect(res.filter((o) => o.id === 1).length).toBe(2)
    expect(res.filter((o) => o.id === 2).length).toBe(2)
    expect(res.filter((o) => o.id === 3).length).toBe(1)
  })
})

describe('OutfitPresetBadge', () => {
  const mockPreset: OutfitMasterPreset = {
    id: 42,
    name: 'Test Armor',
    category: 'fantasy',
    prompt_tags: 'silver plate armor',
    is_builtin: false,
  }

  it('renders badge name and count', () => {
    render(<OutfitPresetBadge outfit={mockPreset} count={3} />)
    expect(screen.getByTestId('outfit-badge-42')).toBeInTheDocument()
    expect(screen.getByText('Test Armor')).toBeInTheDocument()
    expect(screen.getByText('3枠')).toBeInTheDocument()
  })

  it('calls onRemove when clicking remove button', () => {
    const mockRemove = vi.fn()
    render(<OutfitPresetBadge outfit={mockPreset} count={2} onRemove={mockRemove} />)
    const removeBtn = screen.getByTestId('remove-outfit-42')
    fireEvent.click(removeBtn)
    expect(mockRemove).toHaveBeenCalledWith(42)
  })
})

describe('OutfitMasterModal', () => {
  const mockPresets: OutfitMasterPreset[] = [
    { id: 1, name: 'Casual Street', category: 'casual', prompt_tags: 'hoodie, jeans', is_builtin: true },
    { id: 2, name: 'Roomwear', category: 'roomwear', prompt_tags: 't-shirt, sweatpants', is_builtin: true },
    { id: 3, name: 'Swimsuit', category: 'swimsuit', prompt_tags: 'bikini', is_builtin: true },
    { id: 4, name: 'Business Suit', category: 'formal', prompt_tags: 'suit, necktie', is_builtin: true },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(datasetApi.getOutfitMasters).mockResolvedValue(mockPresets)
  })

  it('loads and renders builtin presets on open', async () => {
    render(
      <OutfitMasterModal
        isOpen={true}
        onClose={vi.fn()}
        selectedOutfitIds={[]}
        onSelectOutfits={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('preset-item-1')).toBeInTheDocument()
      expect(screen.getByText('Casual Street')).toBeInTheDocument()
      expect(screen.getByText('Swimsuit')).toBeInTheDocument()
      expect(screen.getByText('Business Suit')).toBeInTheDocument()
    })
  })

  it('allows selecting presets and applying them', async () => {
    const handleSelectOutfits = vi.fn()
    const handleClose = vi.fn()

    render(
      <OutfitMasterModal
        isOpen={true}
        onClose={handleClose}
        selectedOutfitIds={[1]}
        onSelectOutfits={handleSelectOutfits}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('preset-item-2')).toBeInTheDocument()
    })

    // Click preset 2 to toggle selection
    fireEvent.click(screen.getByTestId('preset-item-2'))

    // Click apply button
    fireEvent.click(screen.getByTestId('apply-outfits-button'))

    expect(handleSelectOutfits).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 2 }),
      ])
    )
    expect(handleClose).toHaveBeenCalled()
  })

  it('allows adding a custom outfit preset', async () => {
    const handleSelectOutfits = vi.fn()

    render(
      <OutfitMasterModal
        isOpen={true}
        onClose={vi.fn()}
        selectedOutfitIds={[]}
        onSelectOutfits={handleSelectOutfits}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('toggle-add-custom-button')).toBeInTheDocument()
    })

    // Open add custom form
    fireEvent.click(screen.getByTestId('toggle-add-custom-button'))

    fireEvent.change(screen.getByTestId('custom-outfit-name-input'), {
      target: { value: 'Leather Jacket' },
    })
    fireEvent.change(screen.getByTestId('custom-outfit-category-input'), {
      target: { value: 'punk' },
    })
    fireEvent.change(screen.getByTestId('custom-outfit-tags-input'), {
      target: { value: 'black leather jacket, studs' },
    })

    fireEvent.click(screen.getByTestId('save-custom-outfit-button'))

    // The newly created preset should appear and be selected
    expect(screen.getByText('Leather Jacket')).toBeInTheDocument()
  })
})

describe('MatrixGenerationStep with Outfit Integration', () => {
  const mockPresets: OutfitMasterPreset[] = [
    { id: 1, name: 'Casual Street', category: 'casual', prompt_tags: 'hoodie, jeans', is_builtin: true },
    { id: 2, name: 'Roomwear', category: 'roomwear', prompt_tags: 't-shirt, sweatpants', is_builtin: true },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    useStudioStore.getState().resetStudio()
    vi.mocked(workflowsApi.list).mockResolvedValue([
      { id: 1, name: 'Default Anima 2B Generator' } as any,
    ])
    vi.mocked(datasetApi.getOutfitMasters).mockResolvedValue(mockPresets)
    vi.mocked(datasetApi.createProject).mockResolvedValue({
      id: 1,
      name: 'Test Project',
      character_trigger: 'char_a',
      outfit_trigger: 'char_a_outfit',
      workflow_id: 1,
      prompt_meta: '1girl',
      prompt_physical: 'silver hair',
      prompt_exclusive_outfit: 'dress',
      selected_alt_outfits: '[]',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    })
    vi.mocked(datasetApi.calculateMatrix).mockResolvedValue([])
  })

  it('renders Alt Outfits section and handles opening modal and displaying badges', async () => {
    render(<MatrixGenerationStep />)

    expect(screen.getByTestId('open-outfit-library-button')).toBeInTheDocument()
    expect(screen.getByTestId('alt-outfits-empty-state')).toBeInTheDocument()

    // Open library modal
    fireEvent.click(screen.getByTestId('open-outfit-library-button'))
    expect(screen.getByTestId('outfit-master-modal')).toBeInTheDocument()

    // Wait for presets in modal and select both
    await waitFor(() => {
      expect(screen.getByTestId('preset-item-1')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('preset-item-1'))
    fireEvent.click(screen.getByTestId('preset-item-2'))

    // Apply
    fireEvent.click(screen.getByTestId('apply-outfits-button'))

    // Badges should be displayed in MatrixGenerationStep
    await waitFor(() => {
      expect(screen.getByTestId('outfit-badge-1')).toBeInTheDocument()
      expect(screen.getByTestId('outfit-badge-2')).toBeInTheDocument()
      expect(screen.getByTestId('alt-outfit-distribution-summary')).toBeInTheDocument()
    })

    // Verify 5 slots distribution summary
    expect(screen.getByTestId('alt-outfit-distribution-summary')).toHaveTextContent(
      'Casual Street 3件, Roomwear 2件'
    )
  })

  it('passes selected_alt_outfits to createProject on calculateMatrix', async () => {
    useStudioStore.getState().setSelectedAltOutfits(mockPresets)

    render(<MatrixGenerationStep />)

    const calcBtn = screen.getByTestId('calculate-matrix-button')
    fireEvent.click(calcBtn)

    await waitFor(() => {
      expect(datasetApi.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          selected_alt_outfits: JSON.stringify([
            { id: 1, name: 'Casual Street', prompt_tags: 'hoodie, jeans' },
            { id: 2, name: 'Roomwear', prompt_tags: 't-shirt, sweatpants' },
          ]),
        })
      )
    })
  })
})
