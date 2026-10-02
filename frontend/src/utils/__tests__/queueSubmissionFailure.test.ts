import { describe, expect, it } from 'vitest'
import { parseQueueSubmissionFailure } from '../queueSubmissionFailure'

describe('parseQueueSubmissionFailure', () => {
  it('extracts a ComfyUI node explanation from an API error', () => {
    const error = new Error('API error 400: {"error":{"message":"Prompt execution failed","details":"Node 12 has invalid input"},"node_errors":{}}')

    expect(parseQueueSubmissionFailure(error)).toEqual({
      reason: 'Prompt execution failed\nNode 12 has invalid input',
      outcome: 'failed',
    })
  })

  it('includes actionable node errors alongside a generic top-level message', () => {
    const error = new Error('API error 400: {"error":{"message":"Prompt execution failed","details":"Prompt execution failed"},"node_errors":{"12":{"errors":[{"message":"Node 12: input image is required"}]},"18":{"errors":[{"message":"Node 18: model is incompatible"}]}}}')

    expect(parseQueueSubmissionFailure(error)).toEqual({
      reason: 'Prompt execution failed\nNode 12: input image is required\nNode 18: model is incompatible',
      outcome: 'failed',
    })
  })

  it('uses node_errors explanations when the top-level error has no explanation', () => {
    const error = new Error('API error 400: {"error":{"message":"","details":" "},"node_errors":{"12":{"errors":[{"message":"Node 12 is missing required input"}]}}}')

    expect(parseQueueSubmissionFailure(error)).toEqual({
      reason: 'Node 12 is missing required input',
      outcome: 'failed',
    })
  })

  it('extracts proxy details and keeps an explicit HTML-like explanation as text', () => {
    expect(parseQueueSubmissionFailure(new Error('API error 400: {"detail":"Workflow node X is invalid"}'))).toEqual({
      reason: 'Workflow node X is invalid',
      outcome: 'failed',
    })
    expect(parseQueueSubmissionFailure('<html>ComfyUI is unavailable</html>')).toEqual({
      reason: '<html>ComfyUI is unavailable</html>',
      outcome: 'failed',
    })
  })

  it.each([
    '',
    '   ',
    'API error 400:',
    'API error 400: 400',
    'API error 400: {"detail":',
  ])('uses the unknown-reason fallback for non-explanations (%s)', (value) => {
    expect(parseQueueSubmissionFailure(value).reason).toBe('理由を特定できませんでした')
  })

  it('does not stringify arbitrary objects', () => {
    expect(parseQueueSubmissionFailure({ message: 'Do not trust arbitrary object fields' })).toEqual({
      reason: '理由を特定できませんでした',
      outcome: 'failed',
    })
  })

  it('preserves complete long plain-text explanations', () => {
    const explanation = `Workflow validation failed: ${'node output is incompatible; '.repeat(250).trimEnd()}`
    expect(parseQueueSubmissionFailure(explanation).reason).toBe(explanation)
  })

  it.each([
    new Error('Request timed out'),
    new TypeError('Failed to fetch'),
    new Error('API error 502: {"detail":"ComfyUI connection refused"}'),
  ])('marks response-unknown communication errors as unconfirmed (%s)', (error) => {
    expect(parseQueueSubmissionFailure(error).outcome).toBe('unconfirmed')
  })

  it('classifies explicit HTTP rejection as failed', () => {
    expect(parseQueueSubmissionFailure(new Error('API error 422: {"detail":"Workflow node X is invalid"}'))).toEqual({
      reason: 'Workflow node X is invalid',
      outcome: 'failed',
    })
  })
})
