import { describe, it, expect } from 'vitest';
import { createTestQueryClient, clearTestQueryClient } from './queryHelpers';

describe('queryHelpers (AC-6)', () => {
  it('createTestQueryClient provides zero gcTime and retry false by default', () => {
    const client = createTestQueryClient();
    const defaultQueryOptions = client.getDefaultOptions().queries;

    expect(defaultQueryOptions?.gcTime).toBe(0);
    expect(defaultQueryOptions?.retry).toBe(false);
  });

  it('createTestQueryClient accepts custom options', () => {
    const client = createTestQueryClient({ gcTime: 5000, retry: true });
    const defaultQueryOptions = client.getDefaultOptions().queries;

    expect(defaultQueryOptions?.gcTime).toBe(5000);
    expect(defaultQueryOptions?.retry).toBe(true);
  });

  it('clearTestQueryClient purges queries from the client cache', () => {
    const client = createTestQueryClient();
    client.setQueryData(['cached-key'], { value: 42 });
    expect(client.getQueryData(['cached-key'])).toEqual({ value: 42 });

    clearTestQueryClient(client);
    expect(client.getQueryData(['cached-key'])).toBeUndefined();
  });
});
