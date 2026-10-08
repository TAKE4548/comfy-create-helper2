import React from 'react'
import { Loader2 } from 'lucide-react'
import type { Snapshot, Album } from '../../api/types'
import type { getMetadataView, resolveRecordedMetadata } from '../../utils/promptRecord'
import { GenerationMetadataPanel } from '../GenerationMetadataPanel'
import { SnapshotTagAssociationsPanel } from '../SnapshotTagAssociationsPanel'

export interface SnapshotMetadataTabProps {
  activeImage: string
  activeSnapshotId: number | null
  promptId: string | null
  isLoading: boolean
  isServerMetaLoading: boolean
  view: ReturnType<typeof getMetadataView>
  recordedMetadata: Awaited<ReturnType<typeof resolveRecordedMetadata>> | undefined
  snapshot: Snapshot | undefined
  albums: Album[] | undefined
  albumsError: boolean
  onPersisted: (saved: Snapshot) => void
  onEditingChange: (editing: boolean, saving: boolean) => void
}

export const SnapshotMetadataTab: React.FC<SnapshotMetadataTabProps> = React.memo(({
  activeImage,
  activeSnapshotId,
  promptId,
  isLoading,
  isServerMetaLoading,
  view,
  recordedMetadata,
  snapshot,
  albums,
  albumsError,
  onPersisted,
  onEditingChange,
}) => {
  return (
    <div
      className="w-full md:w-[min(48%,640px)] shrink-0 overflow-y-auto p-5 bg-surface border-t md:border-l border-white/10"
      onClick={(e) => e.stopPropagation()}
    >
      {(activeSnapshotId && isLoading) || isServerMetaLoading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-zinc-400 text-xs">
          <Loader2 size={16} className="animate-spin text-accent-green" />
          <span>Loading metadata...</span>
        </div>
      ) : (
        <div className="space-y-4 text-xs text-zinc-300">
          <GenerationMetadataPanel
            key={activeImage}
            imageUrl={activeImage}
            promptId={promptId ?? view.record?.prompt_id ?? null}
            {...view}
            header={{
              workflowId: view.workflowId,
              workflowName: view.workflowName,
              queuedAt: view.queuedAt,
              metadataSavedAt: activeSnapshotId ? null : recordedMetadata?.metadataSavedAt ?? null,
              imageSavedAt: snapshot?.created_at ?? null,
              albums: albums?.filter((a) => a.items?.some((i) => i.snapshot_id === activeSnapshotId)).map((a) => a.name) ?? [],
            }}
            associationPanel={
              snapshot ? (
                <SnapshotTagAssociationsPanel
                  key={snapshot.id}
                  snapshot={snapshot}
                  onPersisted={onPersisted}
                  onEditingChange={onEditingChange}
                />
              ) : (
                <p>保存済み画像でタグ関連を編集できます。現在は読み取り専用です。</p>
              )
            }
          />
          {snapshot && !view.record && <p>保存時の関連Workflow ID: {snapshot.workflow_id}</p>}
          {albumsError && <p role="alert">現在のアルバムを取得できませんでした。</p>}
        </div>
      )}
    </div>
  )
})

SnapshotMetadataTab.displayName = 'SnapshotMetadataTab'
