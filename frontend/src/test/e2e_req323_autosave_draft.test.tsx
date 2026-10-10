import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DatasetStudioPage } from '../pages/DatasetStudioPage'
import { useStudioStore } from '../pages/DatasetStudioPage/useStudioStore'
import { datasetApi, workflowsApi } from '../api/client'
import {
  saveStudioDraft,
  loadStudioDraft,
  saveActiveProjectId,
} from '../pages/DatasetStudioPage/utils/studioDraftStorage'
import type { DatasetProject, Workflow } from '../api/types'

vi.mock('../api/client', () => ({
  datasetApi: {
    createProject: vi.fn(),
    updateProject: vi.fn(),
    getProjects: vi.fn(),
    getProject: vi.fn(),
    getItems: vi.fn(),
    calculateMatrix: vi.fn(),
    updateItem: vi.fn(),
    exportDataset: vi.fn(),
    listOutfits: vi.fn(),
  },
  workflowsApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
  trainingApi: {
    createJob: vi.fn(),
    startJob: vi.fn(),
    stopJob: vi.fn(),
    getJobStatus: vi.fn(),
    getJob: vi.fn(),
  },
  benchmarkApi: {
    generatePrompts: vi.fn(),
    evaluate: vi.fn(),
  },
  comfyApi: {
    queuePrompt: vi.fn(),
    getHistory: vi.fn(),
  },
}))

describe('REQ-323: E2E Autosave & Draft Recovery Lifecycle Suite', () => {
  const mockWorkflows: Workflow[] = [
    {
      id: 1,
      name: 'Default SDXL Workflow',
      description: 'Standard SDXL txt2img pipeline',
      is_default: true,
      json_body: {
        '6': { inputs: { text: '' }, class_type: 'CLIPTextEncode' },
        '3': { inputs: { seed: 100 }, class_type: 'KSampler' },
      },
      mappings: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ]

  const mockProject: DatasetProject = {
    id: 10,
    name: 'Original LoRA Project',
    character_trigger: 'original_chara',
    outfit_trigger: 'original_outfit',
    workflow_id: 1,
    prompt_meta: '1girl, solo, anime style, masterpiece, best quality',
    prompt_physical: 'long silver hair, red eyes, cat ears',
    prompt_exclusive_outfit: 'black gothic dress, lace ribbon',
    prompt_negative: 'worst quality, bad anatomy',
    selected_alt_outfits: '[]',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }

  beforeEach(() => {
    sessionStorage.clear()
    useStudioStore.getState().resetStudio()
    vi.clearAllMocks()

    vi.mocked(workflowsApi.list).mockResolvedValue(mockWorkflows)
    vi.mocked(datasetApi.getProjects).mockResolvedValue([mockProject])
    vi.mocked(datasetApi.getProject).mockResolvedValue(mockProject)
    // Existing project fixtures represent persisted server data; newly-created
    // projects have no items until matrix generation runs.
    vi.mocked(datasetApi.getItems).mockImplementation(async (projectId) =>
      projectId === mockProject.id
        ? [{
            id: 501,
            project_id: mockProject.id,
            slot_index: 0,
            factors_json: '{}',
            raw_prompt: '1girl, solo, persisted example',
            caption_text: 'persisted example',
            image_path: null,
            seed: 501,
            status: 'APPROVED',
          }]
        : [],
    )
    vi.mocked(datasetApi.updateProject).mockImplementation(async (id, data) => ({
      ...mockProject,
      ...data,
      id,
      updated_at: new Date().toISOString(),
    }))
  })

  // =========================================================================
  // Test 1 (AC-1, Red Team 3): Project Creation & Error Recovery
  // =========================================================================
  describe('Test 1 (AC-1, Red Team 3): Project Creation & Error Recovery', () => {
    it('creates a new project immediately and reflects it in the header; preserves inputs on failure', async () => {
      render(<DatasetStudioPage />)

      await waitFor(() => {
        expect(screen.getByTestId('open-create-project-modal-btn')).toBeInTheDocument()
      })

      // Open creation modal
      fireEvent.click(screen.getByTestId('open-create-project-modal-btn'))
      expect(screen.getByTestId('create-project-modal')).toBeInTheDocument()

      // Fill in project details
      fireEvent.change(screen.getByTestId('create-project-name-input'), {
        target: { value: 'Candidate Project' },
      })
      fireEvent.change(screen.getByTestId('create-character-trigger-input'), {
        target: { value: 'candidate_trigger' },
      })
      fireEvent.change(screen.getByTestId('create-outfit-trigger-input'), {
        target: { value: 'candidate_outfit' },
      })

      // Red Team 3: Simulate server creation failure (e.g., 500 or validation error)
      vi.mocked(datasetApi.createProject).mockRejectedValueOnce(
        new Error('データベースエラー: プロジェクト作成に失敗しました')
      )

      fireEvent.click(screen.getByTestId('submit-create-project-btn'))

      // Verify error message is shown and input fields are preserved
      await waitFor(() => {
        expect(screen.getByTestId('create-project-error')).toBeInTheDocument()
      })
      expect(screen.getByTestId('create-project-error')).toHaveTextContent(
        'データベースエラー: プロジェクト作成に失敗しました'
      )
      expect(screen.getByTestId('create-project-name-input')).toHaveValue('Candidate Project')
      expect(screen.getByTestId('create-character-trigger-input')).toHaveValue('candidate_trigger')
      expect(screen.getByTestId('create-outfit-trigger-input')).toHaveValue('candidate_outfit')

      // AC-1: Successful retry
      const createdProject: DatasetProject = {
        ...mockProject,
        id: 77,
        name: 'Candidate Project',
        character_trigger: 'candidate_trigger',
        outfit_trigger: 'candidate_outfit',
      }
      vi.mocked(datasetApi.createProject).mockResolvedValueOnce(createdProject)

      fireEvent.click(screen.getByTestId('submit-create-project-btn'))

      // Modal closes and active project is updated
      await waitFor(() => {
        expect(screen.queryByTestId('create-project-modal')).not.toBeInTheDocument()
      })
      expect(useStudioStore.getState().activeProject?.id).toBe(77)

      // Header project selector reflects new active project
      const projectSelector = screen.getByTestId('project-selector') as HTMLSelectElement
      expect(projectSelector.value).toBe('77')
    })
  })

  // =========================================================================
  // Test 2 (AC-2, AC-3, AC-6): Real-time Draft Backup & Debounced Autosave
  // =========================================================================
  describe('Test 2 (AC-2, AC-3, AC-6): Real-time Draft Backup & Debounced Autosave', () => {
    it('backs up form to sessionStorage immediately, indicates unsaved, and autosaves after 750ms', async () => {
      render(<DatasetStudioPage />)

      await waitFor(() => {
        expect(screen.getByTestId('character-trigger-input')).toBeInTheDocument()
        expect(screen.getByTestId('autosave-status')).toHaveTextContent('未保存（下書き保持）')
      })

      // User types a new character trigger
      const triggerInput = screen.getByTestId('character-trigger-input')
      fireEvent.change(triggerInput, { target: { value: 'alice_super_hero' } })

      // AC-3: sessionStorage is updated synchronously with payload and timestamp
      const storedDraftRaw = sessionStorage.getItem('dataset_studio_draft_10')
      expect(storedDraftRaw).not.toBeNull()
      const storedDraft = JSON.parse(storedDraftRaw!)
      expect(storedDraft.character_trigger).toBe('alice_super_hero')
      expect(storedDraft.projectId).toBe(10)
      expect(storedDraft.is_synced).toBe(false)
      expect(storedDraft.updated_at).toBeDefined()

      // AC-6: Immediately reflects unsaved state
      expect(screen.getByTestId('autosave-status')).toHaveTextContent('未保存（下書き保持）')

      // AC-2: Wait for debounced autosave (750ms)
      await waitFor(
        () => {
          expect(datasetApi.updateProject).toHaveBeenCalledWith(
            10,
            expect.objectContaining({ character_trigger: 'alice_super_hero' })
          )
          expect(screen.getByTestId('autosave-status')).toHaveTextContent('自動保存済み')
        },
        { timeout: 3000 }
      )
    })
  })

  // =========================================================================
  // Test 3 (AC-4, AC-5): Unmount & Reload Draft Recovery
  // =========================================================================
  describe('Test 3 (AC-4, AC-5): Unmount & Reload Draft Recovery', () => {
    it('restores un-synced draft upon page re-mount with zero data loss and syncs to server', async () => {
      // Setup draft in sessionStorage as if user left the page before autosave completed
      saveStudioDraft({
        projectId: 10,
        name: 'Auto Restored LoRA',
        character_trigger: 'restored_ninja',
        outfit_trigger: 'ninja_gear',
        workflow_id: 1,
        prompt_meta: '1girl, solo, anime style, masterpiece, best quality',
        prompt_physical: 'black hair, violet eyes, ninja mask',
        prompt_exclusive_outfit: 'ninja suit, kunai',
        prompt_negative: 'worst quality, bad anatomy',
        selected_alt_outfits: '[]',
        updated_at: '2026-03-01T12:00:00.000Z',
        base_server_updated_at: '2026-01-01T00:00:00.000Z',
        is_synced: false,
      })
      saveActiveProjectId(10)

      const { unmount } = render(<DatasetStudioPage />)

      // AC-4: Draft notification alert is displayed and form values are restored
      await waitFor(() => {
        expect(screen.getByTestId('draft-restored-alert')).toBeInTheDocument()
      })
      expect(screen.getByTestId('draft-restored-alert')).toHaveTextContent('未保存の下書きを復元しました')
      expect(screen.getByTestId('project-name-input')).toHaveValue('Auto Restored LoRA')
      expect(screen.getByTestId('character-trigger-input')).toHaveValue('restored_ninja')
      expect(screen.getByTestId('outfit-trigger-input')).toHaveValue('ninja_gear')

      // Unmount simulating page navigation
      unmount()

      // Re-mount: verify session persistence without loss
      render(<DatasetStudioPage />)

      await waitFor(() => {
        expect(screen.getByTestId('project-name-input')).toHaveValue('Auto Restored LoRA')
        expect(screen.getByTestId('character-trigger-input')).toHaveValue('restored_ninja')
      })

      // AC-5: After debounce or explicit flush, server save occurs and draft becomes synced
      await waitFor(
        () => {
          expect(datasetApi.updateProject).toHaveBeenCalledWith(
            10,
            expect.objectContaining({
              name: 'Auto Restored LoRA',
              character_trigger: 'restored_ninja',
            })
          )
        },
        { timeout: 3000 }
      )
    })
  })

  // =========================================================================
  // Test 4 (Red Team 1, 2): Quota Exceeded & Network Failure Resilience
  // =========================================================================
  describe('Test 4 (Red Team 1, 2): Quota Exceeded & Network Failure Resilience', () => {
    it('gracefully handles QuotaExceededError in sessionStorage without crashing (Red Team 1)', async () => {
      const originalSetItem = window.sessionStorage.setItem
      // Simulate QuotaExceededError
      window.sessionStorage.setItem = vi.fn().mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      })

      try {
        render(<DatasetStudioPage />)

        await waitFor(() => {
          expect(screen.getByTestId('character-trigger-input')).toBeInTheDocument()
        })

        // Editing input should not throw unhandled exception or crash UI
        expect(() => {
          fireEvent.change(screen.getByTestId('character-trigger-input'), {
            target: { value: 'overflow_character' },
          })
        }).not.toThrow()

        // Page remains interactive
        expect(screen.getByTestId('character-trigger-input')).toHaveValue('overflow_character')
      } finally {
        window.sessionStorage.setItem = originalSetItem
      }
    })

    it('transitions to error status and preserves draft when updateProject returns 500 (Red Team 2)', async () => {
      vi.mocked(datasetApi.updateProject).mockRejectedValue(
        new Error('500 Internal Server Error: Storage disk full')
      )

      render(<DatasetStudioPage />)

      await waitFor(() => {
        expect(screen.getByTestId('character-trigger-input')).toBeInTheDocument()
        expect(screen.getByTestId('autosave-status')).toHaveTextContent('未保存（下書き保持）')
      })

      // Modify form
      fireEvent.change(screen.getByTestId('character-trigger-input'), {
        target: { value: 'unsaved_after_server_error' },
      })

      // Autosave attempt fails -> status transitions to 保存失敗
      await waitFor(
        () => {
          expect(screen.getByTestId('autosave-status')).toHaveTextContent('保存失敗')
        },
        { timeout: 3000 }
      )

      // Draft must be preserved in sessionStorage
      const draft = loadStudioDraft(10)
      expect(draft).not.toBeNull()
      expect(draft?.character_trigger).toBe('unsaved_after_server_error')
    })
  })

  // =========================================================================
  // Test 5 (Red Team 5): Multi-Session Conflict Detection & Resolution
  // =========================================================================
  describe('Test 5 (Red Team 5): Multi-Session Conflict Detection & Manual Resolution', () => {
    it('detects conflict when base_server_updated_at mismatches, pauses autosave, and resolves by overwriting with draft', async () => {
      // Setup draft based on an older server version (2026-01-01)
      saveStudioDraft({
        projectId: 10,
        name: 'Draft Winning Name',
        character_trigger: 'draft_winning_chara',
        outfit_trigger: 'draft_winning_outfit',
        workflow_id: 1,
        prompt_meta: 'draft meta',
        prompt_physical: 'draft physical',
        prompt_exclusive_outfit: 'draft outfit',
        prompt_negative: 'draft neg',
        selected_alt_outfits: '[]',
        updated_at: '2026-02-01T00:00:00.000Z',
        base_server_updated_at: '2026-01-01T00:00:00.000Z',
        is_synced: false,
      })
      saveActiveProjectId(10)

      // Server project has been modified in another session (2026-01-15 > 2026-01-01)
      const serverProject: DatasetProject = {
        ...mockProject,
        name: 'Conflicting Server Project',
        updated_at: '2026-01-15T00:00:00.000Z',
      }
      vi.mocked(datasetApi.getProjects).mockResolvedValue([serverProject])

      render(<DatasetStudioPage />)

      // Conflict alert must appear
      await waitFor(() => {
        expect(screen.getByTestId('draft-conflict-alert')).toBeInTheDocument()
      })
      expect(screen.getByTestId('resolve-conflict-draft-btn')).toBeInTheDocument()
      expect(screen.getByTestId('resolve-conflict-server-btn')).toBeInTheDocument()

      // Click "下書きで上書き"
      fireEvent.click(screen.getByTestId('resolve-conflict-draft-btn'))

      // Server update called with draft contents
      await waitFor(() => {
        expect(datasetApi.updateProject).toHaveBeenCalledWith(
          10,
          expect.objectContaining({ name: 'Draft Winning Name' })
        )
        expect(screen.queryByTestId('draft-conflict-alert')).not.toBeInTheDocument()
      })
    })

    it('detects conflict and resolves by reloading latest server data', async () => {
      // Setup draft based on older server version
      saveStudioDraft({
        projectId: 10,
        name: 'Draft Local Name',
        character_trigger: 'draft_chara',
        outfit_trigger: 'draft_outfit',
        workflow_id: 1,
        prompt_meta: 'draft meta',
        prompt_physical: 'draft physical',
        prompt_exclusive_outfit: 'draft outfit',
        prompt_negative: 'draft neg',
        selected_alt_outfits: '[]',
        updated_at: '2026-02-01T00:00:00.000Z',
        base_server_updated_at: '2026-01-01T00:00:00.000Z',
        is_synced: false,
      })
      saveActiveProjectId(10)

      const serverProject: DatasetProject = {
        ...mockProject,
        name: 'Authoritative Server Name',
        character_trigger: 'server_chara',
        updated_at: '2026-01-15T00:00:00.000Z',
      }
      vi.mocked(datasetApi.getProjects).mockResolvedValue([serverProject])

      render(<DatasetStudioPage />)

      await waitFor(() => {
        expect(screen.getByTestId('draft-conflict-alert')).toBeInTheDocument()
      })

      // Click "サーバーの最新を読込"
      fireEvent.click(screen.getByTestId('resolve-conflict-server-btn'))

      await waitFor(() => {
        expect(screen.queryByTestId('draft-conflict-alert')).not.toBeInTheDocument()
        expect(screen.getByTestId('project-name-input')).toHaveValue('Authoritative Server Name')
        expect(screen.getByTestId('character-trigger-input')).toHaveValue('server_chara')
      })
    })
  })
})
