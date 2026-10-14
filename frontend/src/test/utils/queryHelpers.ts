import { QueryClient } from '@tanstack/react-query';

export interface TestQueryClientOptions {
  gcTime?: number;
  retry?: boolean;
}

export function createTestQueryClient(options?: TestQueryClientOptions): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: options?.gcTime ?? 0,
        retry: options?.retry ?? false,
      },
      mutations: {
        retry: options?.retry ?? false,
      },
    },
  });
}

export function clearTestQueryClient(client: QueryClient): void {
  client.clear();
  client.getQueryCache().clear();
  client.getMutationCache().clear();
}
