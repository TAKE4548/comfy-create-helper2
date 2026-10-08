import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
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

    const prevBtn = screen.getByText('<')
    fireEvent.click(prevBtn)
    expect(handleChangeIndex).toHaveBeenCalledWith(0)

    const nextBtn = screen.getByText('>')
    fireEvent.click(nextBtn)
    expect(handleChangeIndex).toHaveBeenCalledWith(2)

    const infoBtn = screen.getByRole('button', { name: 'Show info' })
    fireEvent.click(infoBtn)
    expect(handleSetViewMode).toHaveBeenCalledWith('info')
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
