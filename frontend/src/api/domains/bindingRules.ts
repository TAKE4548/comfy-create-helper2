import { request } from '../core/base'
import type {
  BindingRuleSet,
  BindingRuleSetCreate,
  BindingRuleSetUpdate,
  BindingRuleEntry,
  BindingRuleEntryCreate,
} from '../types'

export const bindingRulesApi = {
  list: (): Promise<BindingRuleSet[]> =>
    request<BindingRuleSet[]>('/binding-rules'),

  get: (id: number): Promise<BindingRuleSet> =>
    request<BindingRuleSet>(`/binding-rules/${id}`),

  create: (data: BindingRuleSetCreate): Promise<BindingRuleSet> =>
    request<BindingRuleSet>('/binding-rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: BindingRuleSetUpdate): Promise<BindingRuleSet> =>
    request<BindingRuleSet>(`/binding-rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number): Promise<void> =>
    request<void>(`/binding-rules/${id}`, {
      method: 'DELETE',
    }),

  addEntry: (ruleSetId: number, data: BindingRuleEntryCreate): Promise<BindingRuleEntry> =>
    request<BindingRuleEntry>(`/binding-rules/${ruleSetId}/entries`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteEntry: (ruleSetId: number, entryId: number): Promise<void> =>
    request<void>(`/binding-rules/${ruleSetId}/entries/${entryId}`, {
      method: 'DELETE',
    }),
}
