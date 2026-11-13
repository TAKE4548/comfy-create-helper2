import { request } from '../core/base'
import type { RefImageRead } from '../types'

export const refImagesApi = {
  upload: (file: Blob, filename?: string) => {
    const formData = new FormData()
    formData.append('file', file, filename ?? 'image')
    return request<RefImageRead>('/ref-images/upload', { method: 'POST', body: formData })
  },
  importFromHistory: (src: { filename: string; subfolder: string; type: 'output' | 'temp' }) =>
    request<RefImageRead>('/ref-images/import', {
      method: 'POST',
      body: JSON.stringify({ source: 'history', ...src }),
    }),
  importFromSnapshot: (snapshotId: number) =>
    request<RefImageRead>('/ref-images/import', {
      method: 'POST',
      body: JSON.stringify({ source: 'snapshot', snapshot_id: snapshotId }),
    }),
}
