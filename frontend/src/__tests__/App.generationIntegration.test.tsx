import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerationApiError } from '../api/domains/generation'
import { systemManagerApi } from '../api/domains/systemManager'
import { configApi, datasetApi, generationApi, workflowsApi, workflowPresetsApi } from '../api/client'
import { useConfig } from '../hooks/useConfig'
import { useManagerStatus } from '../hooks/useManagerStatus'
import { useGenerationStore } from '../store/useGenerationStore'
import { useStudioStore } from '../pages/DatasetStudioPage/useStudioStore'
import { GenerationGallerySection } from '../pages/GeneratePage/sections/GenerationGallerySection'
import { useGenerateDisplayState } from '../pages/GeneratePage/hooks/useGenerateDisplayState'
import { SettingsPopover } from '../pages/GeneratePage/components/SettingsPopover'
import { ServiceConnectionCard } from '../pages/SettingsPage/components/ServiceConnectionCard'
import { MatrixGenerationStep } from '../pages/DatasetStudioPage/components/MatrixGenerationStep'
import { useStudioGeneration } from '../pages/DatasetStudioPage/hooks/useStudioGeneration'

vi.mock('../api/domains/generation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/domains/generation')>()
  return {
    ...actual,
    generationApi: {
      ...actual.generationApi,
      imageAvailability: vi.fn(),
      submitBatch: vi.fn(),
      getRequest: vi.fn(),
      getState: vi.fn(),
      getUpstreamQueue: vi.fn(),
    },
  }
})
vi.mock('../api/domains/systemManager', () => ({ systemManagerApi: { status: vi.fn(), action: vi.fn(), logs: vi.fn() } }))
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  const domainGeneration = await import('../api/domains/generation')
  return {
    ...actual,
    generationApi: domainGeneration.generationApi,
    configApi: { ...actual.configApi, get: vi.fn() },
    datasetApi: { ...actual.datasetApi, getProjects: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(), calculateMatrix: vi.fn() },
    workflowsApi: { ...actual.workflowsApi, list: vi.fn(), get: vi.fn(), update: vi.fn() },
    workflowPresetsApi: { ...actual.workflowPresetsApi, list: vi.fn() },
    mappingMastersApi: { ...actual.mappingMastersApi, list: vi.fn() },
    snapshotsApi: { ...actual.snapshotsApi, list: vi.fn() },
    comfyApi: { ...actual.comfyApi, getHistory: vi.fn().mockResolvedValue({}) },
  }
})
vi.mock('../hooks/useConfig', () => ({ useConfig: vi.fn() }))
vi.mock('../hooks/useManagerStatus', () => ({ useManagerStatus: vi.fn() }))
vi.mock('../components/LazyThumbnail', () => ({
  LazyThumbnail: ({ src, alt, onError, containerRef: _containerRef, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { containerRef?: unknown }) => <img src={src} alt={alt} onError={onError} {...props} />,
}))

const managedUrl = '/api/comfy/view?filename=trial.png&subfolder=tests&type=temp&t=prompt-1'
const studioProject = {
  id: 10, name: 'Integration Project', character_trigger: 'alice', outfit_trigger: 'uniform',
  workflow_id: 1, prompt_meta: 'portrait', prompt_physical: '', prompt_exclusive_outfit: '',
  selected_alt_outfits: '[]', created_at: '2026-01-01', updated_at: '2026-01-01',
}
const studioWorkflow = {
  id: 1, name: 'Studio workflow', description: '', is_default: true,
  json_body: { '3': { class_type: 'KSampler', inputs: { seed: 0 } } }, mappings: [],
  created_at: '2026-01-01', updated_at: '2026-01-01',
}

function StudioProgressProbe(): React.JSX.Element {
  const studio = useStudioGeneration(studioProject.id)
  return <ul aria-label="Project Studio batches">{studio.batches.map((batch) => {
    const progress = studio.progress(batch.batch_id)
    return <li key={batch.batch_id} data-testid={`studio-progress-${batch.batch_id}`}>{progress.finished}/{progress.total}</li>
  })}</ul>
}

function DisplayCacheListener({ children }: { children: (state: ReturnType<typeof useGenerateDisplayState>) => React.ReactNode }): React.ReactNode {
  const state = useGenerateDisplayState({ selectedWorkflowId: null })
  return children(state)
}

function renderGenerationAndSettings(client: QueryClient) {
  const state = {
    thumbnailTab: 'history', setThumbnailTab: vi.fn(), sortOrder: 'desc', setSortOrder: vi.fn(),
    previewAutoFollow: false, handleToggleAutoFollow: vi.fn(), filterOwnSession: false,
    setFilterOwnSession: vi.fn(), sortedDisplayImages: [managedUrl], otherSessionCount: 0,
    isMultiSelectMode: false, selectedIds: new Set<string>(), selectAll: vi.fn(), clearSelection: vi.fn(),
    setIsSaveModalOpen: vi.fn(), exitMultiSelectMode: vi.fn(), isSelected: vi.fn(() => false),
    selectedImg: managedUrl, getSetNameForImage: vi.fn(() => null), sortedSnapshots: [],
  }
  const settingsProps = {
    setIsSettingsOpen: vi.fn(), localComfyUrl: 'http://legacy-local:8188',
    setLocalComfyUrl: vi.fn(), setComfyUrl: vi.fn(), selectedWorkflowId: null, workflow: null,
    handleSaveDefaultParams: vi.fn(), isSavePending: false, handleResetDefaultParams: vi.fn(),
  }
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <DisplayCacheListener>
          {(displayState) => <GenerationGallerySection
            state={{ ...displayState, ...state, sortedDisplayImages: displayState.sortedDisplayImages, trialAvailability: displayState.trialAvailability } as any}
            gallery={{
              scrollContainerRef: { current: null }, handleWheelScroll: vi.fn(),
              getThumbnailItemProps: () => ({}), handleSnapshotClick: vi.fn(),
            } as any}
          />}
        </DisplayCacheListener>
        <SettingsPopover {...settingsProps} />
        <ServiceConnectionCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App generation integration', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    useGenerationStore.setState({
      clientId: 'session-a',
      generationSnapshot: null,
      batchImages: [managedUrl],
      comfyHistoryImages: [managedUrl],
      selectedImg: managedUrl,
      filterOwnSession: false,
      isGenerating: false,
      activeBatch: null,
      queueRunning: [],
      queuePending: [],
    })
    useStudioStore.getState().resetStudio()
    vi.mocked(datasetApi.getProjects).mockResolvedValue([studioProject] as any)
    vi.mocked(datasetApi.createProject).mockResolvedValue(studioProject as any)
    vi.mocked(datasetApi.updateProject).mockResolvedValue(studioProject as any)
    vi.mocked(datasetApi.calculateMatrix).mockResolvedValue([] as any)
    vi.mocked(workflowsApi.list).mockResolvedValue([studioWorkflow] as any)
    vi.mocked(workflowsApi.get).mockResolvedValue(studioWorkflow as any)
    vi.mocked(workflowsApi.update).mockResolvedValue(studioWorkflow as any)
    vi.mocked(workflowPresetsApi.list).mockResolvedValue([] as any)
    vi.mocked(useConfig).mockReturnValue({ data: { comfy_url: 'http://comfy-from-backend:8188' }, isLoading: false, isError: false } as ReturnType<typeof useConfig>)
    vi.mocked(useManagerStatus).mockReturnValue({ status: null, available: false, refetch: vi.fn().mockResolvedValue(undefined) })
    vi.mocked(configApi.get).mockResolvedValue({ comfy_url: 'http://comfy-from-backend:8188' } as Awaited<ReturnType<typeof configApi.get>>)
    vi.mocked(systemManagerApi.action).mockResolvedValue({ status: 'ok', action: 'restart' })
    vi.mocked(systemManagerApi.logs).mockResolvedValue({ service: 'backend', filename: 'backend.log', exists: true, lines: [], content: '' })
    vi.mocked(generationApi.imageAvailability).mockResolvedValue({ availability: 'missing' })
    queryClient.setQueryData(['generateDisplayImages', { filterOwnSession: false }], [managedUrl])
    queryClient.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [managedUrl])
  })

  afterEach(() => queryClient.clear())

  it('propagates a confirmed missing trial image through the gallery, store, and both cached filters', async () => {
    renderGenerationAndSettings(queryClient)
    fireEvent.error(screen.getByAltText('Generated 1'))

    await waitFor(() => {
      expect(queryClient.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([])
      expect(queryClient.getQueryData(['generateDisplayImages', { filterOwnSession: true }])).toEqual([])
    })
    expect(generationApi.imageAvailability).toHaveBeenCalledWith({ filename: 'trial.png', subfolder: 'tests', type: 'temp' })
    expect(useGenerationStore.getState().comfyHistoryImages).toEqual([])
    expect(useGenerationStore.getState().batchImages).toEqual([])
    expect(useGenerationStore.getState().selectedImg).toBeNull()
  })

  it('keeps the Comfy URL read-only and the Manager recovery controls honest when Manager is unavailable', async () => {
    const view = renderGenerationAndSettings(queryClient)
    const url = screen.getByRole('textbox', { name: 'ComfyUI URL（本体設定）' }) as HTMLInputElement
    expect(url).toHaveValue('http://comfy-from-backend:8188')
    expect(url).toHaveAttribute('readonly')
    expect(screen.getByRole('link', { name: 'サービス管理設定へ' })).toHaveAttribute('href', '/settings#system')
    expect(screen.getByText(/8899が復旧すると操作とログを利用できます/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /緊急画面/ })).toHaveAttribute('href', `http://${window.location.hostname}:8899`)
    expect(screen.getByRole('button', { name: 'Backendを再起動' })).toBeDisabled()
    fireEvent.change(url, { target: { value: 'http://changed:8188' } })
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(url).toHaveValue('http://comfy-from-backend:8188')
    view.unmount()
  })

  it('keeps two accepted Studio requests in one project as distinct batch progress in the real hook and UI', async () => {
    const items = [{
      id: 1, project_id: studioProject.id, slot_index: 0, factors_json: '{}', raw_prompt: 'alice portrait',
      caption_text: 'alice portrait', image_path: null, seed: 101, status: 'APPROVED',
    }]
    useStudioStore.getState().setActiveProject(studioProject as any)
    useStudioStore.getState().setItems(items as any)
    useStudioStore.getState().setParamValues({ steps: '42' })
    const submit = vi.spyOn(useGenerationStore.getState(), 'submitGenerationBatch')
      .mockResolvedValueOnce({ batch_id: 'studio-batch-1', job_ids: ['studio-job-1'] })
      .mockResolvedValueOnce({ batch_id: 'studio-batch-2', job_ids: ['studio-job-2'] })
    render(
      <>
        <StudioProgressProbe />
        <MatrixGenerationStep />
      </>,
    )

    const submitButton = await screen.findByTestId('submit-batch-button')
    fireEvent.click(submitButton)
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(submit.mock.calls[0][0]).toMatchObject({ scope: 'studio', project_id: studioProject.id, items: [{ graph: { '6': { inputs: { text: 'alice portrait' } } } }] })
    expect(useStudioStore.getState().currentStep).toBe(1)
    expect(useStudioStore.getState().paramValues.steps).toBe('42')

    const makeJob = (jobId: string, batchId: string, status: string) => ({
      job_id: jobId, request_id: `request-${jobId}`, prompt_id: `prompt-${jobId}`,
      session_id: useGenerationStore.getState().clientId, scope: 'studio', batch_id: batchId,
      normal_group_id: null, project_id: studioProject.id, status, started_at: null,
      finished_at: null, node: null, outputs: [], failure: null,
    })
    const publish = (revision: number, secondStatus?: string) => useGenerationStore.setState({
      generationSnapshot: {
        version: 1, epoch: 'studio-integration', revision, normal_group_id: null,
        jobs: [makeJob('studio-job-1', 'studio-batch-1', 'succeeded'), ...(secondStatus ? [makeJob('studio-job-2', 'studio-batch-2', secondStatus)] : [])],
        batches: [
          { batch_id: 'studio-batch-1', scope: 'studio', project_id: studioProject.id },
          ...(secondStatus ? [{ batch_id: 'studio-batch-2', scope: 'studio' as const, project_id: studioProject.id }] : []),
        ],
        upstream: { http_ready: true, ws_connected: true, failure_since: null },
      } as any,
    })
    act(() => publish(1))
    await waitFor(() => expect(screen.getByTestId('studio-progress-studio-batch-1')).toHaveTextContent('1/1'))
    expect(screen.getByTestId('batch-progress-text')).toHaveTextContent('100%')

    fireEvent.click(submitButton)
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
    expect(submit.mock.calls[1][0]).toMatchObject({ scope: 'studio', project_id: studioProject.id, items: [{ graph: { '6': { inputs: { text: 'alice portrait' } } } }] })
    act(() => publish(2, 'running'))
    await waitFor(() => {
      expect(screen.getByTestId('studio-progress-studio-batch-1')).toHaveTextContent('1/1')
      expect(screen.getByTestId('studio-progress-studio-batch-2')).toHaveTextContent('0/1')
    })
    expect(screen.getByTestId('batch-progress-text')).toHaveTextContent('0%')
    expect(useStudioStore.getState().currentStep).toBe(1)
    expect(useStudioStore.getState().paramValues.steps).toBe('42')
  })

  it('resolves a lost 202 through request lookup without retrying the batch POST', async () => {
    const payload = {
      request_id: '80e1221d-5a95-4d35-9a29-9a57a1b89cb1',
      session_id: 'session-a', scope: 'normal' as const,
      items: [{ graph: { '3': { class_type: 'KSampler' } }, param_values: { seed: 0 } }],
    }
    const uncertain = new GenerationApiError(0, {
      code: 'network_error', message: 'response lost after acceptance', outcome: 'unconfirmed',
      request_id: null, job_id: null,
    })
    vi.mocked(generationApi.submitBatch).mockRejectedValueOnce(uncertain)
    vi.mocked(generationApi.getRequest).mockResolvedValueOnce({ batch_id: 'accepted-batch', job_ids: ['accepted-job'] })
    vi.mocked(generationApi.getState).mockResolvedValue({
      version: 1, epoch: 'lookup-epoch', revision: 1, normal_group_id: null,
      jobs: [], batches: [], upstream: { http_ready: true, ws_connected: false, failure_since: null },
    })
    vi.mocked(generationApi.getUpstreamQueue).mockResolvedValue({ running: [], pending: [] })

    const accepted = await useGenerationStore.getState().submitGenerationBatch(payload)

    expect(generationApi.submitBatch).toHaveBeenCalledTimes(1)
    expect(generationApi.submitBatch).toHaveBeenCalledWith(payload, undefined)
    expect(generationApi.getRequest).toHaveBeenCalledTimes(1)
    expect(generationApi.getRequest).toHaveBeenCalledWith(payload.request_id)
    expect(accepted).toEqual({ batch_id: 'accepted-batch', job_ids: ['accepted-job'] })
  })
})
