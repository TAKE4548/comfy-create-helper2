import { request } from '../core/base'
import type {
  NodeSelector,
  NodeSelectorCreate,
  NodeSelectorUpdate,
  NodeSelectorPattern,
  NodeSelectorPatternCreate,
} from '../types'

export const nodeSelectorsApi = {
  list: (): Promise<NodeSelector[]> =>
    request<NodeSelector[]>('/node-selectors'),

  get: (id: number): Promise<NodeSelector> =>
    request<NodeSelector>(`/node-selectors/${id}`),

  create: (data: NodeSelectorCreate): Promise<NodeSelector> =>
    request<NodeSelector>('/node-selectors', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: NodeSelectorUpdate): Promise<NodeSelector> =>
    request<NodeSelector>(`/node-selectors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number): Promise<void> =>
    request<void>(`/node-selectors/${id}`, {
      method: 'DELETE',
    }),

  addPattern: (selectorId: number, data: NodeSelectorPatternCreate): Promise<NodeSelectorPattern> =>
    request<NodeSelectorPattern>(`/node-selectors/${selectorId}/patterns`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deletePattern: (selectorId: number, patternId: number): Promise<void> =>
    request<void>(`/node-selectors/${selectorId}/patterns/${patternId}`, {
      method: 'DELETE',
    }),
}
