import React from 'react'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HistoryModalPreview } from '../../HistoryModalPreview'
import { PreviewHeader } from '../PreviewHeader'
import { PreviewImageViewer } from '../PreviewImageViewer'
import { SnapshotMetadataTab } from '../SnapshotMetadataTab'

describe('PreviewHeader', () => {
  it('renders download links when activeSnapshotId is provided', () => {
    const handleClose = vi.fn()
    render(
      <PreviewHeader
        showControls={true}
        viewMode="full"
        isFullscreen={false}
        activeSnapshotId={42}
        activeImage="/preview/42.png"
        onClose={handleClose}
        isSaving={false}
        isEditing={false}
      />
    )

    const webpLink = screen.getByRole('link', { name: 'WebP' })
    expect(webpLink).toHaveAttribute('href', '/api/snapshots/42/download?format=webp')

    const pngLink = screen.getByRole('link', { name: 'PNG' })
    expect(pngLink).toHaveAttribute('href', '/api/snapshots/42/download?format=png')

    const jpegLink = screen.getByRole('link', { name: 'JPEG' })
    expect(jpegLink).toHaveAttribute('href', '/api/snapshots/42/download?format=jpeg')

    const closeBtn = screen.getByRole('button', { name: 'Close preview' })
    fireEvent.click(closeBtn)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('renders direct download link when activeSnapshotId is null', () => {
    render(
      <PreviewHeader
        showControls={true}
        viewMode="full"
        isFullscreen={false}
        activeSnapshotId={null}
        activeImage="/images/temp.png"
        onClose={vi.fn()}
        isSaving={false}
        isEditing={false}
      />
    )

    const dlLink = screen.getByRole('link', { name: /Download/i })
    expect(dlLink).toHaveAttribute('href', '/images/temp.png')
  })

  it('triggers autofollow toggle when clicked', () => {
    const handleToggle = vi.fn()
    render(
      <PreviewHeader
        showControls={true}
        viewMode="full"
        isFullscreen={false}
        activeSnapshotId={null}
        activeImage="/images/temp.png"
        onClose={vi.fn()}
        isSaving={false}
        isEditing={false}
        previewAutoFollow={true}
        onToggleAutoFollow={handleToggle}
      />
    )

    const autoFollowBtn = screen.getByRole('button', { name: /最新画像を自動追従中/ })
    fireEvent.click(autoFollowBtn)
    expect(handleToggle).toHaveBeenCalledTimes(1)
  })
})

describe('PreviewImageViewer', () => {
  it('renders image, navigation buttons and indicator', () => {
    const handleChangeIndex = vi.fn()
    const handleImageClick = vi.fn()
    const handleSetViewMode = vi.fn()

    render(
      <PreviewImageViewer
        activeImage="/img/test.jpg"
        images={['/img/first.jpg', '/img/test.jpg', '/img/last.jpg']}
        currentIndex={1}
        totalImages={3}
        showControls={true}
        isFullscreen={false}
        viewMode="full"
        isEditing={false}
        isSaving={false}
        onChangeIndex={handleChangeIndex}
        onImageClick={handleImageClick}
        onSetViewMode={handleSetViewMode}
        onTouchStart={vi.fn()}
        onTouchEnd={vi.fn()}
        onContainerClick={vi.fn()}
      />
    )

    expect(screen.getByAltText('Preview 2')).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()

    const prevBtn = screen.getByRole('button', { name: '前の画像' })
    fireEvent.click(prevBtn)
    expect(handleChangeIndex).toHaveBeenCalledWith(0)

    const nextBtn = screen.getByRole('button', { name: '次の画像' })
    fireEvent.click(nextBtn)
    expect(handleChangeIndex).toHaveBeenCalledWith(2)

    const infoBtn = screen.getByRole('button', { name: 'Show info' })
    fireEvent.click(infoBtn)
    expect(handleSetViewMode).toHaveBeenCalledWith('info')
  })

  it('keeps comparison images in a sized layout viewport across fit and zoom modes', () => {
    render(
      <PreviewImageViewer
        activeImage="/img/square.jpg"
        images={['/img/square.jpg', '/img/portrait.jpg']}
        currentIndex={0}
        totalImages={2}
        showControls={true}
        isFullscreen={false}
        viewMode="full"
        isEditing={false}
        isSaving={false}
        onChangeIndex={vi.fn()}
        onImageClick={vi.fn()}
        onSetViewMode={vi.fn()}
        onTouchStart={vi.fn()}
        onTouchEnd={vi.fn()}
        onContainerClick={vi.fn()}
      />,
    )

    const preview = screen.getByAltText('Preview 1')
    expect(preview).toHaveClass('max-w-full', 'max-h-full')
    fireEvent.click(screen.getByRole('button', { name: '100%' }))
    expect(preview).toHaveClass('max-w-none', 'max-h-none')
    expect(preview).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' })
    fireEvent.click(screen.getByRole('button', { name: '200%' }))
    expect(preview).toHaveStyle({ transform: 'translate(0px, 0px) scale(2)' })
    fireEvent.click(screen.getByRole('button', { name: 'Fit' }))
    expect(preview).toHaveClass('max-w-full', 'max-h-full')

    fireEvent.click(screen.getByRole('button', { name: '画像比較' }))

    const viewport = screen.getByTestId('image-comparison')
    expect(viewport).not.toHaveClass('absolute')
    expect(viewport).toHaveClass('relative', 'w-full', 'h-full')
    expect(viewport).toHaveStyle({ width: '100%', height: '100%' })
    for (const alt of ['Comparison A', 'Comparison B']) {
      expect(screen.getByAltText(alt)).toHaveClass('object-contain', 'max-w-full', 'max-h-full')
    }

    fireEvent.click(screen.getByRole('button', { name: '100%' }))
    expect(screen.getByAltText('Comparison A')).toHaveClass('max-w-none', 'max-h-none')
    expect(screen.getByAltText('Comparison A')).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' })
    fireEvent.click(screen.getByRole('button', { name: '200%' }))
    expect(screen.getByAltText('Comparison A')).toHaveStyle({ transform: 'translate(0px, 0px) scale(2)' })
  })

  it('consumes the click retargeted after a zoomed image pan and preserves normal image clicks', () => {
    const handleContainerClick = vi.fn()
    const handleImageClick = vi.fn()
    render(
      <PreviewImageViewer
        activeImage="/img/test.jpg"
        images={['/img/test.jpg']}
        currentIndex={0}
        totalImages={1}
        showControls={true}
        isFullscreen={false}
        viewMode="full"
        isEditing={false}
        isSaving={false}
        onChangeIndex={vi.fn()}
        onImageClick={handleImageClick}
        onSetViewMode={vi.fn()}
        onTouchStart={vi.fn()}
        onTouchEnd={vi.fn()}
        onContainerClick={handleContainerClick}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '200%' }))
    const image = screen.getByAltText('Preview 1')
    const viewerContainer = image.parentElement!
    const dispatchPointer = (target: HTMLElement, type: string, clientX: number, clientY: number) => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        clientX: { value: clientX },
        clientY: { value: clientY },
      })
      fireEvent(target, event)
    }
    dispatchPointer(image, 'pointerdown', 10, 10)
    dispatchPointer(viewerContainer, 'pointermove', 40, 30)
    dispatchPointer(viewerContainer, 'pointerup', 40, 30)
    expect(image).toHaveStyle({ transform: 'translate(30px, 20px) scale(2)' })

    fireEvent.click(viewerContainer)
    expect(handleContainerClick).not.toHaveBeenCalled()
    expect(handleImageClick).not.toHaveBeenCalled()

    fireEvent.click(image)
    expect(handleImageClick).toHaveBeenCalledTimes(1)
  })
})

describe('HistoryModalPreview control retention', () => {
  it('keeps comparison controls visible while its keyboard comparison operation is active', async () => {
    vi.useFakeTimers()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    try {
      render(
        <QueryClientProvider client={queryClient}>
          <HistoryModalPreview
            isOpen
            onClose={vi.fn()}
            images={['/img/first.jpg', '/img/second.jpg']}
            currentIndex={0}
            onChangeIndex={vi.fn()}
            snapshotIds={[null, null]}
          />
        </QueryClientProvider>,
      )

      const comparisonButton = screen.getByRole('button', { name: '画像比較' })
      fireEvent.click(comparisonButton)
      expect(comparisonButton).toHaveAttribute('aria-pressed', 'true')
      comparisonButton.blur()
      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      await act(async () => { await vi.advanceTimersByTimeAsync(4000) })

      expect(screen.getByRole('button', { name: '200%' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '画像比較' })).toBeInTheDocument()
      expect(screen.getByTestId('comparison-b-layer')).toHaveStyle({ clipPath: 'inset(0 0% 0 0)' })
    } finally {
      queryClient.clear()
      vi.useRealTimers()
    }
  })
})

describe('SnapshotMetadataTab', () => {
  const dummyView = {
    record: null,
    workflowId: null,
    workflowName: null,
    queuedAt: null,
    source: null,
    extraData: {},
    isDirty: false,
    effectiveMeta: null,
    actualSeed: null,
    warning: null,
    fields: [],
    parameters: [],
    extras: [],
    assets: [],
    loraRows: [],
  } as any

  it('renders loading state when isLoading is true', () => {
    render(
      <SnapshotMetadataTab
        activeImage="/img/1.png"
        activeSnapshotId={1}
        promptId="test-prompt"
        isLoading={true}
        isServerMetaLoading={false}
        view={dummyView}
        recordedMetadata={undefined}
        snapshot={undefined}
        albums={[]}
        albumsError={false}
        onPersisted={vi.fn()}
        onEditingChange={vi.fn()}
      />
    )

    expect(screen.getByText('Loading metadata...')).toBeInTheDocument()
  })

  it('renders albums error alert when albumsError is true', () => {
    render(
      <SnapshotMetadataTab
        activeImage="/img/1.png"
        activeSnapshotId={1}
        promptId="test-prompt"
        isLoading={false}
        isServerMetaLoading={false}
        view={dummyView}
        recordedMetadata={undefined}
        snapshot={undefined}
        albums={[]}
        albumsError={true}
        onPersisted={vi.fn()}
        onEditingChange={vi.fn()}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('現在のアルバムを取得できませんでした。')
  })
})
