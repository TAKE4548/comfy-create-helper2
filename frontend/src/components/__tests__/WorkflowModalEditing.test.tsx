import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { UploadWorkflowModal } from '../UploadWorkflowModal'
import { server } from '../../test/mocks/server'

const masters = [
  {
    id: 1, base_key: 'steps', name: 'Steps Master', role: 'steps', display_name: 'Steps',
    param_name: 'steps', input_type: 'int', expected_class_types: ['KSampler'],
    base_title_patterns: ['steps'], sort_order: 1, group_id: null,
    variants: [{ id: 101, master_id: 1, stage_id: 1, stage_name: 'Main', stage_key: 'main', stage_suffix: '', custom_role_override: null, computed_role: 'steps', extra_title_patterns: ['main'], is_enabled: true }],
  },
  {
    id: 2, base_key: 'cfg', name: 'CFG Master', role: 'cfg', display_name: 'CFG',
    param_name: 'cfg', input_type: 'float', expected_class_types: ['KSampler'],
    base_title_patterns: ['cfg'], sort_order: 2, group_id: null,
    variants: [{ id: 201, master_id: 2, stage_id: 1, stage_name: 'Main', stage_key: 'main', stage_suffix: '', custom_role_override: null, computed_role: 'cfg', extra_title_patterns: ['main'], is_enabled: true }],
  },
]

let queryClient: QueryClient
const getMasters = vi.fn()
const scanWorkflow = vi.fn()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  getMasters.mockReset()
  scanWorkflow.mockReset()
  server.use(
    http.get('/api/mapping-masters', () => {
      getMasters()
      return HttpResponse.json(masters)
    }),
    http.post('/api/workflows/scan', async ({ request }) => {
      scanWorkflow(await request.json())
      return HttpResponse.json({ matched: [], warnings: [] })
    }),
  )
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
})
afterEach(() => {
  cleanup()
  queryClient.clear()
  server.resetHandlers()
})
afterAll(() => server.close())

describe('REQ-358/UPLOAD_CLEAN', () => {
  it('REQ-358/UPLOAD_CLEAN [REQ-358/AC-16] [REQ-358/AC-17] [REQ-358/AC-18] keeps the same input while typing, clearing and retyping', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <UploadWorkflowModal initialName="Mapping edit" workflowJson={{}} onClose={vi.fn()} onSaved={vi.fn()} />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(getMasters).toHaveBeenCalledTimes(1)
      expect(scanWorkflow).toHaveBeenCalledTimes(1)
      expect(scanWorkflow).toHaveBeenCalledWith({ json_body: {} })
      expect(screen.getAllByRole('textbox', { name: 'ノードID' })).toHaveLength(2)
    })

    const input = screen.getAllByRole('textbox', { name: 'ノードID' })[0] as HTMLInputElement
    const row = screen.getByTestId('mapping-slot-v_101')
    const rowOrder = () => Array.from(document.querySelectorAll('[data-testid^="mapping-slot-"]')).map((node) => node.getAttribute('data-testid'))
    const expectedOrder = ['mapping-slot-v_101', 'mapping-slot-v_201']

    expect(screen.getAllByRole('textbox', { name: 'ノードID' })[0]).toBe(input)
    expect(row).toHaveTextContent('未割当')
    expect(row).not.toHaveClass('opacity-50')
    expect(input.readOnly).toBe(false)

    act(() => input.focus())
    const changeValue = async (value: string) => {
      await act(async () => {
        fireEvent.change(input, { target: { value } })
        await Promise.resolve()
      })
    }
    for (const value of ['a', 'ab', 'abc']) {
      await changeValue(value)
      expect(screen.getAllByRole('textbox', { name: 'ノードID' })[0]).toBe(input)
      expect(screen.getByTestId('mapping-slot-v_101')).toBe(row)
      expect(input.isConnected).toBe(true)
      expect(document.activeElement).toBe(input)
      expect(input.value).toBe(value)
      expect(rowOrder()).toEqual(expectedOrder)
    }

    await changeValue('')
    expect(screen.getAllByRole('textbox', { name: 'ノードID' })[0]).toBe(input)
    expect(screen.getByTestId('mapping-slot-v_101')).toBe(row)
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('')
    expect(row).toHaveTextContent('未割当')
    expect(row).not.toHaveClass('opacity-50')
    expect(input.readOnly).toBe(false)

    await changeValue('xyz')
    expect(screen.getAllByRole('textbox', { name: 'ノードID' })[0]).toBe(input)
    expect(screen.getByTestId('mapping-slot-v_101')).toBe(row)
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('xyz')
    expect(row).not.toHaveClass('opacity-50')
    expect(rowOrder()).toEqual(expectedOrder)
    expect(getMasters).toHaveBeenCalledTimes(1)
    expect(scanWorkflow).toHaveBeenCalledTimes(1)
  })
})
